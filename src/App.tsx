import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "./utils/cn";

type Platform = "Google Meet" | "Zoom" | "Teams";
type MeetingStatus = "upcoming" | "live" | "completed";

type Meeting = {
  id: string;
  title: string;
  dateLabel: string;
  timeLabel: string;
  platform: Platform;
  status: MeetingStatus;
  durationLabel: string;
  participants: number;
  autoJoin: boolean;
  /** Generic join link for any platform */
  joinUrl?: string;
  /** Kept for Google Meet metadata/validation */
  meetUrl?: string;
  recordingUrl?: string;
};

type View = "dashboard" | "add" | "integrations" | "automations" | "compliance" | "support";

type Toast = { message: string; type: "success" | "info" | "error" };

type User = { name: string; email: string; avatar: string };

type ParsedMeet =
  | { kind: "code"; url: string; code: string }
  | { kind: "lookup"; url: string; token: string }
  | { kind: "url"; url: string; path: string };

type AddMeetingForm = {
  title: string;
  platform: Platform;
  link: string;
  date: string; // yyyy-mm-dd
  time: string; // hh:mm
  durationMins: number;
  participants: number;
  autoJoin: boolean;
};

const initialMeetings: Meeting[] = [
  {
    id: "m_001",
    title: "GDG Campus Weekly Brief",
    dateLabel: "Today",
    timeLabel: "10:00 AM",
    platform: "Google Meet",
    status: "upcoming",
    durationLabel: "1 hr",
    participants: 45,
    autoJoin: true,
    joinUrl: "https://meet.google.com/abc-defg-hij",
    meetUrl: "https://meet.google.com/abc-defg-hij",
  },
  {
    id: "m_002",
    title: "Startup Pitch Practice",
    dateLabel: "Today",
    timeLabel: "2:00 PM",
    platform: "Google Meet",
    status: "upcoming",
    durationLabel: "30 min",
    participants: 12,
    autoJoin: false,
    joinUrl: "https://meet.google.com/kln-mnop-qrs",
    meetUrl: "https://meet.google.com/kln-mnop-qrs",
  },
  {
    id: "m_003",
    title: "DevArc Workshop: Intro to AI",
    dateLabel: "Tomorrow",
    timeLabel: "4:00 PM",
    platform: "Zoom",
    status: "upcoming",
    durationLabel: "2 hrs",
    participants: 120,
    autoJoin: true,
    joinUrl: "https://zoom.us/j/1234567890",
  },
  {
    id: "m_004",
    title: "Product Team Sync",
    dateLabel: "Yesterday",
    timeLabel: "9:00 AM",
    platform: "Google Meet",
    status: "completed",
    durationLabel: "45 min",
    participants: 8,
    autoJoin: true,
    joinUrl: "https://meet.google.com/tuv-wxyz-aaa",
    meetUrl: "https://meet.google.com/tuv-wxyz-aaa",
    recordingUrl: "#",
  },
  {
    id: "m_005",
    title: "Marketing Review",
    dateLabel: "Yesterday",
    timeLabel: "11:00 AM",
    platform: "Teams",
    status: "completed",
    durationLabel: "1 hr",
    participants: 15,
    autoJoin: false,
    joinUrl: "https://teams.microsoft.com/l/meetup-join/EXAMPLE",
    recordingUrl: "#",
  },
];

const auditLogs = [
  { id: 1, action: "Meeting Joined", meeting: "GDG Campus Weekly Brief", at: "Today, 10:00 AM", status: "Success" },
  { id: 2, action: "Recording Started", meeting: "GDG Campus Weekly Brief", at: "Today, 10:01 AM", status: "Success" },
  { id: 3, action: "Auto-join Disabled", meeting: "Startup Pitch Practice", at: "Today, 1:55 PM", status: "User Action" },
];

function nowMinus(ms: number) {
  return new Date(Date.now() - ms);
}

function timeAgo(d: Date) {
  const s = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toDateInputValue(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function toTimeInputValue(d: Date) {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function formatDateLabel(d: Date) {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const startOfThat = new Date(d);
  startOfThat.setHours(0, 0, 0, 0);

  const diffDays = Math.round((startOfThat.getTime() - startOfToday.getTime()) / (24 * 60 * 60 * 1000));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays === -1) return "Yesterday";

  const sameYear = d.getFullYear() === startOfToday.getFullYear();
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

function formatTimeLabel(d: Date) {
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function formatDurationLabel(durationMins: number) {
  const mins = Math.max(0, Math.floor(durationMins));
  if (mins === 60) return "1 hr";
  if (mins > 60) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m ? `${h} hr ${m} min` : `${h} hr`;
  }
  return `${mins} min`;
}

function normalizeExternalUrl(raw: string) {
  const v = raw.trim();
  if (!v) return v;
  if (v.startsWith("http://") || v.startsWith("https://")) return v;
  return `https://${v}`;
}

function defaultAddMeetingForm(autoJoinDefault: boolean): AddMeetingForm {
  const d = new Date();
  // default to the next hour
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return {
    title: "",
    platform: "Google Meet",
    link: "",
    date: toDateInputValue(d),
    time: toTimeInputValue(d),
    durationMins: 60,
    participants: 10,
    autoJoin: autoJoinDefault,
  };
}

function parseGoogleMeet(input: string): ParsedMeet | null {
  const raw0 = input.trim();
  if (!raw0) return null;

  // 1) Accept meeting code only: abc-defg-hij
  const codeOnly = raw0.match(/^([a-z]{3}-[a-z]{4}-[a-z]{3})$/i);
  if (codeOnly) {
    const code = codeOnly[1].toLowerCase();
    return { kind: "code", code, url: `https://meet.google.com/${code}` };
  }

  // Normalize common inputs without scheme.
  const raw =
    raw0.startsWith("http://") || raw0.startsWith("https://")
      ? raw0
      : raw0.startsWith("meet.google.com/") || raw0.startsWith("g.co/meet/")
        ? `https://${raw0}`
        : raw0;

  // 2) Accept Meet URLs (including /lookup/<token>).
  try {
    const u = new URL(raw);

    // g.co/meet/<code> redirect links
    if (u.hostname === "g.co" && u.pathname.toLowerCase().startsWith("/meet/")) {
      const rest = u.pathname.slice("/meet/".length).replace(/\/+$/, "");
      const maybeCode = rest.match(/^([a-z]{3}-[a-z]{4}-[a-z]{3})$/i);
      if (maybeCode) {
        const code = maybeCode[1].toLowerCase();
        return { kind: "code", code, url: `https://meet.google.com/${code}` };
      }
      if (rest) return { kind: "url", path: `/meet/${rest}`, url: u.toString() };
      return null;
    }

    // Primary host
    if (u.hostname !== "meet.google.com") return null;

    const path = u.pathname.replace(/\/+$/, "");

    // /lookup/<token>
    const lookup = path.match(/^\/lookup\/([^/]+)$/i);
    if (lookup) {
      const token = lookup[1];
      return { kind: "lookup", token, url: `https://meet.google.com/lookup/${token}` };
    }

    // /abc-defg-hij
    const code = path.match(/^\/([a-z]{3}-[a-z]{4}-[a-z]{3})$/i);
    if (code) {
      const c = code[1].toLowerCase();
      return { kind: "code", code: c, url: `https://meet.google.com/${c}` };
    }

    // Any other valid meet.google.com path (kept as-is)
    if (path && path !== "/") {
      return { kind: "url", path, url: `https://meet.google.com${path}` };
    }

    return null;
  } catch {
    // If it isn't a URL and isn't a meeting code, reject.
    return null;
  }
}

function parseWhatsAppGroupLink(input: string): string | null {
  const raw0 = input.trim();
  if (!raw0) return null;

  const raw =
    raw0.startsWith("http://") || raw0.startsWith("https://")
      ? raw0
      : raw0.startsWith("chat.whatsapp.com/")
        ? `https://${raw0}`
        : raw0;

  try {
    const u = new URL(raw);
    // Official group invite links use chat.whatsapp.com/<inviteCode>
    if (u.hostname !== "chat.whatsapp.com") return null;

    const code = u.pathname.split("/").filter(Boolean)[0];
    if (!code) return null;

    // Keep validation intentionally permissive (WhatsApp invite tokens vary).
    if (!/^[A-Za-z0-9_-]{10,}$/.test(code)) return null;

    return `https://chat.whatsapp.com/${code}`;
  } catch {
    return null;
  }
}

function platformBadge(platform: Platform) {
  switch (platform) {
    case "Google Meet":
      return "bg-blue-50 text-blue-700 border-blue-100";
    case "Zoom":
      return "bg-indigo-50 text-indigo-700 border-indigo-100";
    case "Teams":
      return "bg-teal-50 text-teal-700 border-teal-100";
  }
}

function statusDot(status: MeetingStatus) {
  switch (status) {
    case "live":
      return "bg-red-500";
    case "upcoming":
      return "bg-green-500";
    case "completed":
      return "bg-gray-300";
  }
}

function Icon({
  name,
  className,
}: {
  name:
    | "google"
    | "meet"
    | "whatsapp"
    | "sync"
    | "shield"
    | "bolt"
    | "help"
    | "home"
    | "logout"
    | "copy"
    | "external"
    | "play"
    | "plus"
    | "x";
  className?: string;
}) {
  const cls = cn("w-5 h-5", className);
  switch (name) {
    case "google":
      return (
        <svg viewBox="0 0 24 24" className={cls} aria-hidden>
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
        </svg>
      );
    case "meet":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
          <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      );
    case "whatsapp":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            fill="currentColor"
            d="M12.04 2C6.52 2 2.04 6.477 2.04 12c0 1.77.465 3.496 1.35 5.02L2 22l5.13-1.35A9.93 9.93 0 0012.04 22C17.56 22 22.04 17.523 22.04 12S17.56 2 12.04 2zm0 18.2c-1.48 0-2.93-.4-4.19-1.16l-.3-.18-3.04.8.81-2.97-.2-.31a8.185 8.185 0 01-1.26-4.38c0-4.54 3.7-8.24 8.24-8.24 4.55 0 8.24 3.7 8.24 8.24 0 4.55-3.69 8.24-8.24 8.24zm4.76-6.17c-.26-.13-1.52-.75-1.76-.83-.24-.09-.41-.13-.58.13-.17.26-.67.83-.82 1-.15.17-.3.2-.56.07-.26-.13-1.1-.4-2.1-1.28-.78-.69-1.31-1.54-1.46-1.8-.15-.26-.02-.4.11-.53.12-.12.26-.3.39-.45.13-.15.17-.26.26-.43.09-.17.04-.32-.02-.45-.06-.13-.58-1.4-.8-1.92-.21-.51-.43-.44-.58-.44h-.5c-.17 0-.45.07-.69.32-.24.26-.9.88-.9 2.14s.92 2.48 1.04 2.65c.13.17 1.8 2.74 4.36 3.84.61.26 1.08.42 1.45.54.61.19 1.17.16 1.61.1.49-.07 1.52-.62 1.73-1.22.21-.6.21-1.11.15-1.22-.06-.11-.24-.17-.5-.3z"
          />
        </svg>
      );
    case "sync":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
          <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      );
    case "shield":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
          <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      );
    case "bolt":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
          <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      );
    case "help":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
          <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case "home":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
          <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      );
    case "logout":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
          <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
        </svg>
      );
    case "copy":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
          <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-2M16 3H10a2 2 0 00-2 2v10a2 2 0 002 2h6a2 2 0 002-2V5a2 2 0 00-2-2z" />
        </svg>
      );
    case "external":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
          <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
        </svg>
      );
    case "play":
      return (
        <svg className={cls} viewBox="0 0 20 20" fill="currentColor" aria-hidden>
          <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
        </svg>
      );
    case "plus":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
          <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
        </svg>
      );
    case "x":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
          <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      );
  }
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (next: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2",
        checked ? "bg-indigo-600" : "bg-gray-200"
      )}
      aria-pressed={checked}
    >
      <span
        className={cn(
          "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
          checked ? "translate-x-6" : "translate-x-1"
        )}
      />
    </button>
  );
}

function Modal({ open, title, children, onClose }: { open: boolean; title: string; children: React.ReactNode; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onMouseDown={onClose}>
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden" onMouseDown={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-gray-900">{title}</h3>
          </div>
          <button className="p-2 hover:bg-gray-100 rounded-lg" onClick={onClose} aria-label="Close">
            <Icon name="x" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function ToastView({ toast, onClose }: { toast: Toast | null; onClose: () => void }) {
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(onClose, 3200);
    return () => clearTimeout(t);
  }, [toast, onClose]);

  if (!toast) return null;

  const styles =
    toast.type === "success"
      ? "bg-green-50 text-green-900 border-green-200"
      : toast.type === "error"
        ? "bg-red-50 text-red-900 border-red-200"
        : "bg-blue-50 text-blue-900 border-blue-200";

  return (
    <div className={cn("fixed top-4 right-4 z-50 border shadow-lg rounded-xl px-4 py-3 flex items-center gap-3", styles)}>
      <span className="text-sm font-medium">{toast.message}</span>
      <button className="ml-2 opacity-70 hover:opacity-100" onClick={onClose} aria-label="Close toast">
        <Icon name="x" className="w-4 h-4" />
      </button>
    </div>
  );
}

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [view, setView] = useState<View>("dashboard");

  const [toast, setToast] = useState<Toast | null>(null);
  const showToast = (message: string, type: Toast["type"] = "info") => setToast({ message, type });

  const [meetings, setMeetings] = useState<Meeting[]>(initialMeetings);
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");

  // automations
  const [autoJoinAllNew, setAutoJoinAllNew] = useState(true);
  const [autoRecord, setAutoRecord] = useState(true);
  const [notify, setNotify] = useState(true);

  // integrations
  const [googleConnected, setGoogleConnected] = useState(true);
  const [oauthModalOpen, setOauthModalOpen] = useState(false);
  const [calendarSyncEnabled, setCalendarSyncEnabled] = useState(true);
  const [syncFrequency, setSyncFrequency] = useState<"5" | "15" | "30" | "60">("15");
  const [syncing, setSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date>(() => nowMinus(2 * 60 * 1000));

  // WhatsApp group integration (invite link)
  const [whatsAppConnected, setWhatsAppConnected] = useState(false);
  const [whatsAppGroupUrl, setWhatsAppGroupUrl] = useState("");
  const [whatsAppGroupName, setWhatsAppGroupName] = useState("AutoAttend Notifications");
  const [whatsAppNotifyOnJoin, setWhatsAppNotifyOnJoin] = useState(true);
  const [whatsAppNotifyOnRecording, setWhatsAppNotifyOnRecording] = useState(true);
  const [whatsAppError, setWhatsAppError] = useState<string | null>(null);

  // add meeting (manual)
  const [addMeetingOpen, setAddMeetingOpen] = useState(false);
  const [addMeetingForm, setAddMeetingForm] = useState<AddMeetingForm>(() => defaultAddMeetingForm(autoJoinAllNew));

  useEffect(() => {
    if (!addMeetingOpen) return;
    setAddMeetingForm(defaultAddMeetingForm(autoJoinAllNew));
  }, [addMeetingOpen, autoJoinAllNew]);

  const [joinOffsetMins, setJoinOffsetMins] = useState(0);
  const [attendanceMode, setAttendanceMode] = useState<"presence" | "chat">("presence");
  const [recordToDrive, setRecordToDrive] = useState(true);

  const [meetLink, setMeetLink] = useState("");
  const [meetParsed, setMeetParsed] = useState<ParsedMeet | null>(null);
  const [meetLinkError, setMeetLinkError] = useState<string | null>(null);

  // modals
  const [meetingModalOpen, setMeetingModalOpen] = useState(false);
  const [recordingModalOpen, setRecordingModalOpen] = useState(false);
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);

  const syncingRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (syncingRef.current) window.clearTimeout(syncingRef.current);
    };
  }, []);

  const filteredMeetings = useMemo(() => {
    if (tab === "upcoming") return meetings.filter((m) => m.status !== "completed");
    return meetings.filter((m) => m.status === "completed");
  }, [meetings, tab]);

  const upcoming = useMemo(() => meetings.filter((m) => m.status !== "completed"), [meetings]);
  const completed = useMemo(() => meetings.filter((m) => m.status === "completed"), [meetings]);

  const toggleMeetingAutoJoin = (id: string) => {
    setMeetings((prev) => prev.map((m) => (m.id === id ? { ...m, autoJoin: !m.autoJoin } : m)));
    const m = meetings.find((x) => x.id === id);
    if (m) showToast(`${m.title}: auto-join ${m.autoJoin ? "disabled" : "enabled"}`, "success");
  };

  const joinMeeting = (m: Meeting) => {
    const url =
      m.joinUrl ||
      m.meetUrl ||
      (m.platform === "Google Meet" ? "https://meet.google.com" : "https://calendar.google.com");

    window.open(url, "_blank");
    showToast(`Opening ${m.platform}…`, "info");

    if (whatsAppConnected && whatsAppNotifyOnJoin) {
      showToast(`WhatsApp: notified group about joining “${m.title}” (demo)`, "success");
    }
  };

  const openMeetingDetails = (m: Meeting) => {
    setSelectedMeeting(m);
    setMeetingModalOpen(true);
  };

  const openRecording = (m: Meeting) => {
    setSelectedMeeting(m);
    setRecordingModalOpen(true);
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast("Copied to clipboard", "success");
    } catch {
      // fallback
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      showToast("Copied to clipboard", "success");
    }
  };

  const signInWithGoogle = () => {
    showToast("Signing in…", "info");
    window.setTimeout(() => {
      setUser({
        name: "Harsh",
        email: "harsh@example.com",
        avatar: "https://ui-avatars.com/api/?name=Harsh&background=6366f1&color=fff",
      });
      showToast("Signed in successfully", "success");
    }, 900);
  };

  const logout = () => {
    setUser(null);
    showToast("Signed out", "info");
  };

  const openConnectFlow = () => {
    setOauthModalOpen(true);
  };

  const confirmConnect = () => {
    setOauthModalOpen(false);
    setGoogleConnected(true);
    setLastSyncedAt(new Date());
    showToast("Google account connected", "success");
  };

  const disconnectGoogle = () => {
    setGoogleConnected(false);
    setMeetParsed(null);
    setMeetLink("");
    setMeetLinkError(null);
    showToast("Google account disconnected", "info");
  };

  const connectWhatsAppGroup = () => {
    const normalized = parseWhatsAppGroupLink(whatsAppGroupUrl);
    if (!normalized) {
      setWhatsAppError("Enter a valid WhatsApp group invite link (chat.whatsapp.com/<inviteCode>)." );
      showToast("Invalid WhatsApp group link", "error");
      return;
    }
    setWhatsAppGroupUrl(normalized);
    setWhatsAppError(null);
    setWhatsAppConnected(true);
    showToast("WhatsApp group connected (demo)", "success");
  };

  const disconnectWhatsAppGroup = () => {
    setWhatsAppConnected(false);
    setWhatsAppError(null);
    showToast("WhatsApp group disconnected", "info");
  };

  const testWhatsAppMessage = () => {
    if (!whatsAppConnected) {
      showToast("Connect a WhatsApp group first", "error");
      return;
    }
    showToast("WhatsApp: test message sent to group (demo)", "success");
  };

  const validateMeetLink = () => {
    const p = parseGoogleMeet(meetLink);
    if (!p) {
      setMeetParsed(null);
      setMeetLinkError(
        "Please enter a valid Google Meet link or code (e.g., abc-defg-hij, meet.google.com/abc-defg-hij, or meet.google.com/lookup/<token>)."
      );
      return;
    }
    setMeetLinkError(null);
    setMeetParsed(p);

    const label =
      p.kind === "code" ? p.code : p.kind === "lookup" ? `lookup/${p.token}` : p.path;
    showToast(`Meet link validated: ${label}`, "success");
  };

  const syncNow = () => {
    if (!googleConnected) {
      showToast("Connect your Google account to sync meetings", "error");
      return;
    }
    if (!calendarSyncEnabled) {
      showToast("Calendar sync is disabled", "error");
      return;
    }

    setSyncing(true);
    syncingRef.current = window.setTimeout(() => {
      const inbound: Meeting[] = [
        {
          id: "gcal_101",
          title: "Google Meet: AI Study Group",
          dateLabel: "Tomorrow",
          timeLabel: "6:00 PM",
          platform: "Google Meet",
          status: "upcoming",
          durationLabel: "1 hr",
          participants: 28,
          autoJoin: autoJoinAllNew,
          joinUrl: "https://meet.google.com/xyz-abcd-efg",
          meetUrl: "https://meet.google.com/xyz-abcd-efg",
        },
        {
          id: "gcal_102",
          title: "Google Meet: Office Hours",
          dateLabel: "Next Week",
          timeLabel: "11:30 AM",
          platform: "Google Meet",
          status: "upcoming",
          durationLabel: "30 min",
          participants: 9,
          autoJoin: autoJoinAllNew,
          joinUrl: "https://meet.google.com/pqr-stuv-wxy",
          meetUrl: "https://meet.google.com/pqr-stuv-wxy",
        },
      ];

      setMeetings((prev) => {
        const existing = new Set(prev.map((m) => m.id));
        const add = inbound.filter((m) => !existing.has(m.id));
        return [...add, ...prev];
      });

      setLastSyncedAt(new Date());
      setSyncing(false);
      showToast("Sync complete: imported Google Meet events", "success");
    }, 900);
  };

  const submitManualMeeting = () => {
    const title = addMeetingForm.title.trim();
    if (!title) {
      showToast("Please enter a meeting title", "error");
      return;
    }

    const dt = new Date(`${addMeetingForm.date}T${addMeetingForm.time}`);
    if (Number.isNaN(dt.getTime())) {
      showToast("Please enter a valid date and time", "error");
      return;
    }

    const rawLink = addMeetingForm.link.trim();
    let joinUrl: string | undefined;
    let meetUrl: string | undefined;

    if (rawLink) {
      if (addMeetingForm.platform === "Google Meet") {
        const parsed = parseGoogleMeet(rawLink);
        if (!parsed) {
          showToast("Invalid Google Meet link/code", "error");
          return;
        }
        meetUrl = parsed.url;
        joinUrl = parsed.url;
      } else {
        joinUrl = normalizeExternalUrl(rawLink);
      }
    } else {
      showToast("Please paste a meeting link", "error");
      return;
    }

    const status: MeetingStatus = dt.getTime() < Date.now() ? "completed" : "upcoming";

    const newMeeting: Meeting = {
      id: `manual_${dt.getTime()}_${Math.random().toString(16).slice(2)}`,
      title,
      platform: addMeetingForm.platform,
      status,
      dateLabel: formatDateLabel(dt),
      timeLabel: formatTimeLabel(dt),
      durationLabel: formatDurationLabel(addMeetingForm.durationMins),
      participants: Math.max(0, Math.floor(addMeetingForm.participants || 0)),
      autoJoin: addMeetingForm.autoJoin,
      joinUrl,
      meetUrl,
    };

    setMeetings((prev) => [newMeeting, ...prev]);
    setAddMeetingOpen(false);
    showToast("Meeting added to dashboard", "success");
  };

  const renderHeaderNav = () => (
    <nav className="hidden md:flex items-center gap-1">
      {(
        [
          { id: "dashboard", label: "Dashboard", icon: "home" },
          { id: "integrations", label: "Integrations", icon: "meet" },
          { id: "automations", label: "Automations", icon: "bolt" },
          { id: "compliance", label: "Compliance", icon: "shield" },
          { id: "support", label: "Support", icon: "help" },
        ] as const
      ).map((item) => (
        <button
          key={item.id}
          onClick={() => setView(item.id)}
          className={cn(
            "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
            view === item.id ? "bg-indigo-50 text-indigo-700" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
          )}
        >
          <Icon name={item.icon} className="w-4 h-4" />
          {item.label}
        </button>
      ))}
    </nav>
  );

  const renderDashboard = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Upcoming", value: String(upcoming.length), hint: "Next 7 days" },
          { label: "Completed", value: String(completed.length), hint: "Recorded sessions" },
          { label: "Attendance", value: "98%", hint: "Bot presence logs" },
          { label: "Time Saved", value: "18h", hint: "This month" },
        ].map((m) => (
          <div key={m.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <p className="text-sm font-medium text-gray-500">{m.label}</p>
            <div className="mt-2 flex items-end justify-between">
              <p className="text-2xl font-bold text-gray-900">{m.value}</p>
              <p className="text-xs text-gray-400">{m.hint}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-gray-100 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h2 className="font-bold text-gray-900">Meetings</h2>
            <p className="text-sm text-gray-500">Manage auto-join and view recordings</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setAddMeetingOpen(true)}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-semibold"
            >
              + Add Meeting
            </button>

            <div className="w-px h-6 bg-gray-200 mx-1 hidden sm:block" />

            <button
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-medium",
                tab === "upcoming" ? "bg-indigo-50 text-indigo-700" : "text-gray-600 hover:bg-gray-50"
              )}
              onClick={() => setTab("upcoming")}
            >
              Upcoming ({upcoming.length})
            </button>
            <button
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-medium",
                tab === "past" ? "bg-indigo-50 text-indigo-700" : "text-gray-600 hover:bg-gray-50"
              )}
              onClick={() => setTab("past")}
            >
              Past ({completed.length})
            </button>
          </div>
        </div>

        <div className="divide-y divide-gray-100">
          {filteredMeetings.map((m) => (
            <div key={m.id} className="p-5 hover:bg-gray-50 transition-colors">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div className="flex items-start gap-4">
                  <span className={cn("mt-2 w-2.5 h-2.5 rounded-full", statusDot(m.status), m.status === "live" ? "animate-pulse" : "")} />
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-gray-900">{m.title}</p>
                      <span className={cn("text-xs font-medium px-2 py-1 rounded-full border", platformBadge(m.platform))}>{m.platform}</span>
                      {m.meetUrl && m.platform === "Google Meet" && (
                        <span className="text-xs font-medium px-2 py-1 rounded-full border bg-indigo-50 text-indigo-700 border-indigo-100">Meet link attached</span>
                      )}
                    </div>
                    <div className="mt-1 text-sm text-gray-500">
                      {m.dateLabel} • {m.timeLabel} • {m.durationLabel} • {m.participants} attendees
                    </div>
                    <div className="mt-3 flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <span className={cn("w-2 h-2 rounded-full", m.autoJoin ? "bg-green-500" : "bg-gray-300")} />
                        <span className={cn("text-xs font-medium", m.autoJoin ? "text-green-700" : "text-gray-500")}>{m.autoJoin ? "Auto-join Active" : "Auto-join Paused"}</span>
                      </div>
                      <Toggle checked={m.autoJoin} onChange={() => toggleMeetingAutoJoin(m.id)} />
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 justify-start md:justify-end">
                  <button
                    onClick={() => openMeetingDetails(m)}
                    className="px-4 py-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-sm font-medium text-gray-700"
                  >
                    Details
                  </button>
                  {m.status !== "completed" && (
                    <button
                      onClick={() => joinMeeting(m)}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-semibold flex items-center gap-2"
                    >
                      <Icon name="external" className="w-4 h-4" />
                      Join
                    </button>
                  )}
                  {m.status === "completed" && m.recordingUrl && (
                    <button
                      onClick={() => openRecording(m)}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-semibold flex items-center gap-2"
                    >
                      <Icon name="play" className="w-4 h-4" />
                      Watch
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {!googleConnected && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
          <p className="font-semibold text-amber-900">Google Meet integration is disconnected</p>
          <p className="text-sm text-amber-800 mt-1">Reconnect to sync Google Meet sessions and attach meet links automatically.</p>
          <button onClick={() => setView("integrations")} className="mt-3 px-4 py-2 bg-white border border-amber-200 rounded-lg hover:bg-amber-100 text-sm font-semibold text-amber-900">
            Open Integrations
          </button>
        </div>
      )}
    </div>
  );

  const renderIntegrations = () => (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className={cn("p-2 rounded-lg", googleConnected ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-600")}>
              <Icon name="meet" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Google Meet Integration</h2>
              <p className="text-sm text-gray-500">Connect Google Calendar + Meet to enable auto-join and recording workflows.</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className={cn("text-xs font-medium px-2 py-1 rounded-full border", googleConnected ? "bg-green-50 text-green-700 border-green-100" : "bg-gray-50 text-gray-600 border-gray-200")}>
                  {googleConnected ? "Connected" : "Not connected"}
                </span>
                <span className="text-xs font-medium px-2 py-1 rounded-full border bg-indigo-50 text-indigo-700 border-indigo-100">OAuth (Simulated)</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {googleConnected ? (
              <button onClick={disconnectGoogle} className="px-4 py-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-sm font-semibold text-gray-700">
                Disconnect
              </button>
            ) : (
              <button onClick={openConnectFlow} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-semibold flex items-center gap-2">
                <Icon name="google" className="w-4 h-4" />
                Connect Google
              </button>
            )}
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl border border-gray-200 bg-gray-50">
            <p className="text-xs font-semibold text-gray-500 uppercase">Scopes</p>
            <ul className="mt-3 space-y-2 text-sm text-gray-700">
              <li className="flex items-center justify-between">
                <span>Calendar read</span>
                <span className={cn("text-xs font-medium px-2 py-1 rounded-full border", googleConnected ? "bg-green-50 text-green-700 border-green-100" : "bg-gray-100 text-gray-500 border-gray-200")}>
                  {googleConnected ? "Granted" : "—"}
                </span>
              </li>
              <li className="flex items-center justify-between">
                <span>Meet link access</span>
                <span className={cn("text-xs font-medium px-2 py-1 rounded-full border", googleConnected ? "bg-green-50 text-green-700 border-green-100" : "bg-gray-100 text-gray-500 border-gray-200")}>
                  {googleConnected ? "Granted" : "—"}
                </span>
              </li>
              <li className="flex items-center justify-between">
                <span>Drive (recordings)</span>
                <span className={cn("text-xs font-medium px-2 py-1 rounded-full border", googleConnected ? "bg-green-50 text-green-700 border-green-100" : "bg-gray-100 text-gray-500 border-gray-200")}>
                  {googleConnected ? "Granted" : "—"}
                </span>
              </li>
            </ul>
          </div>

          <div className="p-4 rounded-xl border border-gray-200">
            <p className="text-xs font-semibold text-gray-500 uppercase">Bot behavior</p>
            <div className="mt-3 space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-medium text-gray-900">Join offset</p>
                  <p className="text-sm text-gray-500">Join {joinOffsetMins >= 0 ? `${joinOffsetMins} min after` : `${Math.abs(joinOffsetMins)} min before`} start</p>
                </div>
                <select
                  className="p-2 border border-gray-200 rounded-lg text-sm bg-white"
                  value={String(joinOffsetMins)}
                  onChange={(e) => setJoinOffsetMins(Number(e.target.value))}
                >
                  <option value={"-1"}>1 min before</option>
                  <option value={"0"}>On time</option>
                  <option value={"1"}>1 min after</option>
                  <option value={"2"}>2 min after</option>
                </select>
              </div>

              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-medium text-gray-900">Attendance mode</p>
                  <p className="text-sm text-gray-500">How attendance is marked</p>
                </div>
                <select
                  className="p-2 border border-gray-200 rounded-lg text-sm bg-white"
                  value={attendanceMode}
                  onChange={(e) => setAttendanceMode(e.target.value as "presence" | "chat")}
                >
                  <option value="presence">Presence only</option>
                  <option value="chat">Presence + chat ping</option>
                </select>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900">Record to Google Drive</p>
                  <p className="text-sm text-gray-500">Store recordings in Drive</p>
                </div>
                <Toggle
                  checked={recordToDrive}
                  onChange={(next) => {
                    setRecordToDrive(next);
                    showToast(`Record to Drive ${next ? "enabled" : "disabled"}`, "success");
                  }}
                />
              </div>
            </div>
          </div>

          <div className="p-4 rounded-xl border border-gray-200">
            <p className="text-xs font-semibold text-gray-500 uppercase">Sync</p>
            <div className="mt-3 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900">Auto-sync Calendar</p>
                  <p className="text-sm text-gray-500">Import upcoming events</p>
                </div>
                <Toggle
                  checked={calendarSyncEnabled}
                  onChange={(next) => {
                    setCalendarSyncEnabled(next);
                    showToast(`Calendar sync ${next ? "enabled" : "disabled"}`, "success");
                  }}
                />
              </div>

              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-medium text-gray-900">Sync frequency</p>
                  <p className="text-sm text-gray-500">Polling interval</p>
                </div>
                <select
                  className="p-2 border border-gray-200 rounded-lg text-sm bg-white"
                  value={syncFrequency}
                  onChange={(e) => setSyncFrequency(e.target.value as typeof syncFrequency)}
                >
                  <option value="5">Every 5 min</option>
                  <option value="15">Every 15 min</option>
                  <option value="30">Every 30 min</option>
                  <option value="60">Every 60 min</option>
                </select>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900">Last synced</p>
                  <p className="text-sm text-gray-500">{timeAgo(lastSyncedAt)}</p>
                </div>
                <button
                  onClick={syncNow}
                  disabled={syncing}
                  className={cn(
                    "px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2",
                    syncing ? "bg-gray-100 text-gray-400 cursor-not-allowed" : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
                  )}
                >
                  <Icon name="sync" className={cn("w-4 h-4", syncing ? "animate-spin" : "")} />
                  {syncing ? "Syncing…" : "Sync Now"}
                </button>
              </div>

              <div className="rounded-lg bg-indigo-50 border border-indigo-100 p-3">
                <p className="text-sm font-medium text-indigo-900">What happens during sync?</p>
                <p className="text-sm text-indigo-800 mt-1">
                  Upcoming Google Calendar events with Meet links are imported and meet URLs are attached to your dashboard. Auto-join defaults to: <span className="font-semibold">{autoJoinAllNew ? "ON" : "OFF"}</span>.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="font-bold text-gray-900">Meet Link Tester</h3>
            <p className="text-sm text-gray-500">Validate a Google Meet link/code and test opening it.</p>
          </div>
          {meetParsed && (
            <button
              className="px-4 py-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-sm font-semibold text-gray-700 flex items-center gap-2"
              onClick={() => copyToClipboard(meetParsed.url)}
            >
              <Icon name="copy" className="w-4 h-4" />
              Copy URL
            </button>
          )}
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-3 items-start">
          <div>
            <input
              value={meetLink}
              onChange={(e) => setMeetLink(e.target.value)}
              placeholder="Paste a Meet link or code (abc-defg-hij)"
              className={cn(
                "w-full px-4 py-3 border rounded-lg outline-none focus:ring-2 focus:ring-indigo-500",
                meetLinkError ? "border-red-300" : "border-gray-200"
              )}
            />
            {meetLinkError && <p className="mt-2 text-sm text-red-600">{meetLinkError}</p>}
            {meetParsed && (
              <div className="mt-3 text-sm text-gray-700">
                {meetParsed.kind === "code" ? (
                  <p>
                    Parsed meeting code: <span className="font-mono font-semibold">{meetParsed.code}</span>
                  </p>
                ) : meetParsed.kind === "lookup" ? (
                  <p>
                    Parsed lookup token: <span className="font-mono font-semibold">{meetParsed.token}</span>
                  </p>
                ) : (
                  <p>
                    Parsed path: <span className="font-mono font-semibold">{meetParsed.path}</span>
                  </p>
                )}
                <p className="text-gray-500 break-all">{meetParsed.url}</p>
                <p className="mt-2 text-xs text-gray-500">
                  Note: Only standard Meet codes (abc-defg-hij) are guaranteed to map 1:1. Lookup links resolve server-side.
                </p>
              </div>
            )}
          </div>

          <button onClick={validateMeetLink} className="px-4 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-semibold">
            Validate
          </button>

          <button
            onClick={() => {
              if (!meetParsed) {
                showToast("Validate a Meet link first", "error");
                return;
              }
              window.open(meetParsed.url, "_blank");
              showToast("Opening Meet link…", "info");
            }}
            className="px-4 py-3 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-sm font-semibold text-gray-700 flex items-center justify-center gap-2"
          >
            <Icon name="external" className="w-4 h-4" />
            Test Join
          </button>
        </div>
      </div>

      <Modal open={oauthModalOpen} title="Connect Google (Simulated OAuth)" onClose={() => setOauthModalOpen(false)}>
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            This demo simulates the Google OAuth consent screen. In production, you would use Google Identity Services + Calendar API.
          </p>
          <div className="p-4 rounded-xl bg-gray-50 border border-gray-200">
            <p className="text-xs font-semibold text-gray-500 uppercase">Requested access</p>
            <ul className="mt-3 space-y-2 text-sm text-gray-700">
              <li>• Read your Google Calendar events</li>
              <li>• Detect Meet conference links</li>
              <li>• Store recordings to Drive (optional)</li>
            </ul>
          </div>
          <div className="flex items-center justify-end gap-2">
            <button onClick={() => setOauthModalOpen(false)} className="px-4 py-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-sm font-semibold text-gray-700">
              Cancel
            </button>
            <button onClick={confirmConnect} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-semibold flex items-center gap-2">
              <Icon name="google" className="w-4 h-4" />
              Allow
            </button>
          </div>
        </div>
      </Modal>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className={cn("p-2 rounded-lg", whatsAppConnected ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-600")}>
              <Icon name="whatsapp" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900">WhatsApp Group Integration</h3>
              <p className="text-sm text-gray-500 mt-1">
                Connect a WhatsApp group invite link to post meeting join + recording-ready notifications (demo).
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    "text-xs font-medium px-2 py-1 rounded-full border",
                    whatsAppConnected ? "bg-green-50 text-green-700 border-green-100" : "bg-gray-50 text-gray-600 border-gray-200"
                  )}
                >
                  {whatsAppConnected ? "Connected" : "Not connected"}
                </span>
                <span className="text-xs font-medium px-2 py-1 rounded-full border bg-gray-50 text-gray-600 border-gray-200">Invite-link based</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {whatsAppConnected ? (
              <>
                <button
                  onClick={() => window.open(whatsAppGroupUrl, "_blank")}
                  className="px-4 py-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-sm font-semibold text-gray-700"
                >
                  Open Group
                </button>
                <button
                  onClick={disconnectWhatsAppGroup}
                  className="px-4 py-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-sm font-semibold text-gray-700"
                >
                  Disconnect
                </button>
              </>
            ) : (
              <button
                onClick={connectWhatsAppGroup}
                className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm font-semibold"
              >
                Connect
              </button>
            )}
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <label className="block text-sm font-medium text-gray-700">WhatsApp group invite link</label>
            <input
              value={whatsAppGroupUrl}
              onChange={(e) => setWhatsAppGroupUrl(e.target.value)}
              placeholder="https://chat.whatsapp.com/XXXXXXXXXXXXXXX"
              className={cn(
                "mt-1 w-full px-4 py-3 border rounded-lg outline-none focus:ring-2 focus:ring-indigo-500",
                whatsAppError ? "border-red-300" : "border-gray-200"
              )}
              disabled={whatsAppConnected}
            />
            {whatsAppError && <p className="mt-2 text-sm text-red-600">{whatsAppError}</p>}
            <p className="mt-2 text-xs text-gray-500">
              Note: WhatsApp doesn’t provide a public API for bots in groups by default. This demo uses the invite link as a “connection” placeholder.
            </p>
          </div>

          <div className="p-4 rounded-xl border border-gray-200 bg-gray-50">
            <label className="block text-sm font-medium text-gray-700">Display name</label>
            <input
              value={whatsAppGroupName}
              onChange={(e) => setWhatsAppGroupName(e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg bg-white"
              disabled={!whatsAppConnected}
            />
            <button
              type="button"
              onClick={testWhatsAppMessage}
              className={cn(
                "mt-3 w-full px-4 py-2 rounded-lg text-sm font-semibold",
                whatsAppConnected ? "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50" : "bg-gray-100 text-gray-400 cursor-not-allowed"
              )}
              disabled={!whatsAppConnected}
            >
              Test Message
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-center justify-between p-4 rounded-xl border border-gray-200 bg-white">
            <div>
              <p className="font-semibold text-gray-900">Notify when bot joins</p>
              <p className="text-sm text-gray-500">Posts “Joined meeting” to the group</p>
            </div>
            <Toggle
              checked={whatsAppNotifyOnJoin}
              onChange={(next) => {
                setWhatsAppNotifyOnJoin(next);
                showToast(`WhatsApp join notifications ${next ? "enabled" : "disabled"}`, "success");
              }}
            />
          </div>
          <div className="flex items-center justify-between p-4 rounded-xl border border-gray-200 bg-white">
            <div>
              <p className="font-semibold text-gray-900">Notify when recording is ready</p>
              <p className="text-sm text-gray-500">Posts a recording link (demo)</p>
            </div>
            <Toggle
              checked={whatsAppNotifyOnRecording}
              onChange={(next) => {
                setWhatsAppNotifyOnRecording(next);
                showToast(`WhatsApp recording notifications ${next ? "enabled" : "disabled"}`, "success");
              }}
            />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <h3 className="font-bold text-gray-900">Other platforms</h3>
        <p className="text-sm text-gray-500 mt-1">Zoom and Teams connectors are planned for Phase 2.</p>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            { name: "Zoom", badge: "Coming Soon" },
            { name: "Microsoft Teams", badge: "Coming Soon" },
          ].map((p) => (
            <div key={p.name} className="p-4 rounded-xl border border-gray-200 flex items-center justify-between">
              <div>
                <p className="font-semibold text-gray-900">{p.name}</p>
                <p className="text-sm text-gray-500">{p.badge}</p>
              </div>
              <button className="px-3 py-2 rounded-lg bg-gray-100 text-gray-400 text-sm font-semibold cursor-not-allowed" disabled>
                Disabled
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderAutomations = () => (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-indigo-50 text-indigo-700 rounded-lg">
            <Icon name="bolt" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">Automations</h2>
            <p className="text-sm text-gray-500">Configure default behavior for new meetings.</p>
          </div>
        </div>

        <div className="mt-6 space-y-4">
          <div className="flex items-center justify-between p-4 rounded-xl border border-gray-200 bg-gray-50">
            <div>
              <p className="font-semibold text-gray-900">Auto-join new meetings</p>
              <p className="text-sm text-gray-500">Applies to meetings imported during sync.</p>
            </div>
            <Toggle
              checked={autoJoinAllNew}
              onChange={(next) => {
                setAutoJoinAllNew(next);
                showToast(`Auto-join default ${next ? "enabled" : "disabled"}`, "success");
              }}
            />
          </div>

          <div className="flex items-center justify-between p-4 rounded-xl border border-gray-200 bg-gray-50">
            <div>
              <p className="font-semibold text-gray-900">Auto-record</p>
              <p className="text-sm text-gray-500">Start recording after joining (where allowed).</p>
            </div>
            <Toggle
              checked={autoRecord}
              onChange={(next) => {
                setAutoRecord(next);
                showToast(`Auto-record ${next ? "enabled" : "disabled"}`, "success");
              }}
            />
          </div>

          <div className="flex items-center justify-between p-4 rounded-xl border border-gray-200 bg-gray-50">
            <div>
              <p className="font-semibold text-gray-900">Notifications</p>
              <p className="text-sm text-gray-500">Meeting joined + recording ready alerts.</p>
            </div>
            <Toggle
              checked={notify}
              onChange={(next) => {
                setNotify(next);
                showToast(`Notifications ${next ? "enabled" : "disabled"}`, "success");
              }}
            />
          </div>

          <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-4">
            <p className="font-semibold text-indigo-900">Tip</p>
            <p className="text-sm text-indigo-800 mt-1">To import more Google Meet sessions, open Integrations → Sync Now.</p>
          </div>
        </div>
      </div>
    </div>
  );

  const renderCompliance = () => (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-green-50 text-green-700 rounded-lg">
            <Icon name="shield" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">Compliance & Security</h2>
            <p className="text-sm text-gray-500">Audit trails and security posture (demo).</p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { title: "Encrypted storage", desc: "AES-256 at rest" },
            { title: "Access control", desc: "OAuth + scoped permissions" },
            { title: "Audit logs", desc: "Timestamped actions" },
          ].map((x) => (
            <div key={x.title} className="p-4 rounded-xl border border-gray-200 bg-gray-50">
              <p className="font-semibold text-gray-900">{x.title}</p>
              <p className="text-sm text-gray-500 mt-1">{x.desc}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-gray-100">
          <h3 className="font-bold text-gray-900">Audit Logs</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-6 py-3 font-medium">Action</th>
                <th className="px-6 py-3 font-medium">Meeting</th>
                <th className="px-6 py-3 font-medium">Time</th>
                <th className="px-6 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {auditLogs.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm text-gray-900">{log.action}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{log.meeting}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{log.at}</td>
                  <td className="px-6 py-4">
                    <span className={cn("px-2 py-1 text-xs font-semibold rounded-full border", log.status === "Success" ? "bg-green-50 text-green-700 border-green-100" : "bg-blue-50 text-blue-700 border-blue-100")}>
                      {log.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  const renderSupport = () => (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-blue-50 text-blue-700 rounded-lg">
            <Icon name="help" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">Support</h2>
            <p className="text-sm text-gray-500">Send a message to the team (demo form).</p>
          </div>
        </div>

        <form
          className="mt-6 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            showToast("Message sent (demo)", "success");
          }}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Name</label>
              <input className="mt-1 w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" defaultValue={user?.name ?? ""} required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Email</label>
              <input type="email" className="mt-1 w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" defaultValue={user?.email ?? ""} required />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Message</label>
            <textarea className="mt-1 w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" rows={5} placeholder="Describe your issue…" required />
          </div>
          <button className="w-full md:w-auto px-5 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-semibold">Send</button>
        </form>
      </div>
    </div>
  );

  const renderMain = () => {
    switch (view) {
      case "dashboard":
        return renderDashboard();
      case "integrations":
        return renderIntegrations();
      case "automations":
        return renderAutomations();
      case "compliance":
        return renderCompliance();
      case "support":
        return renderSupport();
    }
  };

  // Auth page
  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50">
        <ToastView toast={toast} onClose={() => setToast(null)} />
        <header className="bg-white border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 bg-indigo-600 rounded-lg text-white font-bold flex items-center justify-center">AA</div>
              <div>
                <p className="font-bold text-gray-900">AutoAttend AI</p>
                <p className="text-xs text-gray-500">Google Meet automation</p>
              </div>
            </div>
            <span className="hidden md:inline text-sm text-gray-500">DevArc – GDG On Campus MM(DU)</span>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-stretch">
            <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100 text-sm font-semibold">
                <span className="w-2 h-2 bg-indigo-500 rounded-full" />
                Google Meet Ready
              </div>
              <h1 className="mt-4 text-4xl font-bold text-gray-900 leading-tight">
                Attendance compliance, <span className="text-indigo-600">automated</span>.
              </h1>
              <p className="mt-3 text-gray-600">
                AutoAttend AI joins scheduled meetings, keeps presence for attendance, and records sessions so you can watch later.
              </p>

              <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  { title: "Auto-join", desc: "Join within ±30 seconds" },
                  { title: "Recording", desc: "Cloud-ready storage" },
                  { title: "Security", desc: "OAuth scoped access" },
                  { title: "Dashboard", desc: "Meetings + playback" },
                ].map((x) => (
                  <div key={x.title} className="p-4 rounded-xl border border-gray-200 bg-gray-50">
                    <p className="font-semibold text-gray-900">{x.title}</p>
                    <p className="text-sm text-gray-500 mt-1">{x.desc}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8">
              <h2 className="text-xl font-bold text-gray-900">Sign in</h2>
              <p className="text-sm text-gray-500 mt-1">Use Google to connect Calendar + Google Meet.</p>

              <button
                onClick={signInWithGoogle}
                className="mt-6 w-full px-5 py-3 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 flex items-center justify-center gap-2"
              >
                <Icon name="google" className="w-5 h-5" />
                Sign in with Google
              </button>

              <div className="mt-6 p-4 rounded-xl border border-gray-200 bg-gray-50">
                <p className="text-sm font-semibold text-gray-900">Demo note</p>
                <p className="text-sm text-gray-600 mt-1">
                  This is a UI prototype. Real integration requires Google OAuth + Calendar API + a backend worker/bot.
                </p>
              </div>

              <div className="mt-6 text-xs text-gray-500">
                By continuing, you agree to the demo Terms and acknowledge the Privacy Policy.
              </div>
            </section>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-16 md:pb-0">
      <ToastView toast={toast} onClose={() => setToast(null)} />

      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <button className="flex items-center gap-2" onClick={() => setView("dashboard")}
            aria-label="Go to dashboard">
            <div className="w-9 h-9 bg-indigo-600 rounded-lg text-white font-bold flex items-center justify-center">AA</div>
            <div className="text-left">
              <p className="font-bold text-gray-900 leading-tight">AutoAttend AI</p>
              <p className="text-xs text-gray-500 leading-tight">v1.0</p>
            </div>
          </button>

          {renderHeaderNav()}

          <div className="flex items-center gap-3">
            <button
              onClick={() => setAddMeetingOpen(true)}
              className="hidden sm:inline-flex items-center gap-2 px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-semibold"
            >
              <span className="text-base leading-none">+</span>
              Add Meeting
            </button>

            <div className="hidden sm:flex items-center gap-3">
              <img src={user.avatar} alt={user.name} className="w-8 h-8 rounded-full" />
              <div className="hidden md:block">
                <p className="text-sm font-semibold text-gray-900">{user.name}</p>
                <p className="text-xs text-gray-500">{user.email}</p>
              </div>
            </div>
            <button onClick={logout} className="p-2 text-gray-500 hover:text-red-600 hover:bg-gray-50 rounded-lg" title="Sign out">
              <Icon name="logout" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">{renderMain()}</main>

      {/* mobile nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-40">
        <div className="grid grid-cols-5 h-16">
          {(
            [
              { id: "dashboard", label: "Home", icon: "home" },
              { id: "integrations", label: "Meet", icon: "meet" },
              { id: "automations", label: "Auto", icon: "bolt" },
              { id: "compliance", label: "Safe", icon: "shield" },
              { id: "support", label: "Help", icon: "help" },
            ] as const
          ).map((i) => (
            <button
              key={i.id}
              onClick={() => setView(i.id)}
              className={cn("flex flex-col items-center justify-center gap-1", view === i.id ? "text-indigo-600" : "text-gray-400")}
            >
              <Icon name={i.icon} className="w-5 h-5" />
              <span className="text-[10px] font-semibold">{i.label}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* Mobile Add Meeting FAB */}
      <button
        onClick={() => setAddMeetingOpen(true)}
        className="md:hidden fixed bottom-20 right-4 z-40 rounded-full bg-indigo-600 text-white shadow-lg hover:bg-indigo-700 px-4 py-3 text-sm font-semibold"
        aria-label="Add meeting"
      >
        + Add
      </button>

      {/* Add meeting modal */}
      <Modal open={addMeetingOpen} title="Add Meeting" onClose={() => setAddMeetingOpen(false)}>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            submitManualMeeting();
          }}
        >
          <div>
            <label className="block text-sm font-medium text-gray-700">Title</label>
            <input
              value={addMeetingForm.title}
              onChange={(e) => setAddMeetingForm((p) => ({ ...p, title: e.target.value }))}
              className="mt-1 w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              placeholder="e.g., Data Structures Lecture"
              required
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Platform</label>
              <select
                value={addMeetingForm.platform}
                onChange={(e) => setAddMeetingForm((p) => ({ ...p, platform: e.target.value as Platform }))}
                className="mt-1 w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
              >
                <option value="Google Meet">Google Meet</option>
                <option value="Zoom">Zoom</option>
                <option value="Teams">Teams</option>
              </select>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-gray-900">Auto-join</p>
                <p className="text-xs text-gray-500">Bot joins automatically</p>
              </div>
              <Toggle checked={addMeetingForm.autoJoin} onChange={(next) => setAddMeetingForm((p) => ({ ...p, autoJoin: next }))} />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Meeting link</label>
            <input
              value={addMeetingForm.link}
              onChange={(e) => setAddMeetingForm((p) => ({ ...p, link: e.target.value }))}
              className="mt-1 w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              placeholder={
                addMeetingForm.platform === "Google Meet"
                  ? "abc-defg-hij or meet.google.com/abc-defg-hij"
                  : "Paste the meeting URL"
              }
              required
            />
            {addMeetingForm.platform === "Google Meet" && (
              <p className="mt-2 text-xs text-gray-500">Tip: You can paste a Meet code (abc-defg-hij), a full Meet URL, or a lookup link.</p>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Date</label>
              <input
                type="date"
                value={addMeetingForm.date}
                onChange={(e) => setAddMeetingForm((p) => ({ ...p, date: e.target.value }))}
                className="mt-1 w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Time</label>
              <input
                type="time"
                value={addMeetingForm.time}
                onChange={(e) => setAddMeetingForm((p) => ({ ...p, time: e.target.value }))}
                className="mt-1 w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Duration (minutes)</label>
              <input
                type="number"
                min={5}
                step={5}
                value={addMeetingForm.durationMins}
                onChange={(e) => setAddMeetingForm((p) => ({ ...p, durationMins: Number(e.target.value) }))}
                className="mt-1 w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Participants (estimate)</label>
              <input
                type="number"
                min={0}
                value={addMeetingForm.participants}
                onChange={(e) => setAddMeetingForm((p) => ({ ...p, participants: Number(e.target.value) }))}
                className="mt-1 w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setAddMeetingOpen(false)}
              className="px-4 py-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-sm font-semibold text-gray-700"
            >
              Cancel
            </button>
            <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-semibold">
              Add to Dashboard
            </button>
          </div>
        </form>
      </Modal>

      {/* Meeting details modal */}
      <Modal
        open={meetingModalOpen}
        title={selectedMeeting ? `Meeting Details — ${selectedMeeting.title}` : "Meeting Details"}
        onClose={() => setMeetingModalOpen(false)}
      >
        {!selectedMeeting ? null : (
          <div className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="p-3 rounded-xl bg-gray-50 border border-gray-200">
                <p className="text-xs font-semibold text-gray-500 uppercase">When</p>
                <p className="mt-1 font-semibold text-gray-900">
                  {selectedMeeting.dateLabel} • {selectedMeeting.timeLabel}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-gray-50 border border-gray-200">
                <p className="text-xs font-semibold text-gray-500 uppercase">Platform</p>
                <p className="mt-1 font-semibold text-gray-900">{selectedMeeting.platform}</p>
              </div>
              <div className="p-3 rounded-xl bg-gray-50 border border-gray-200">
                <p className="text-xs font-semibold text-gray-500 uppercase">Attendance</p>
                <p className="mt-1 font-semibold text-gray-900">{selectedMeeting.participants} attendees</p>
              </div>
              <div className="p-3 rounded-xl bg-gray-50 border border-gray-200">
                <p className="text-xs font-semibold text-gray-500 uppercase">Duration</p>
                <p className="mt-1 font-semibold text-gray-900">{selectedMeeting.durationLabel}</p>
              </div>
            </div>

            <div className="p-4 rounded-xl border border-indigo-100 bg-indigo-50">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-indigo-900">Auto-join</p>
                  <p className="text-sm text-indigo-800">Toggle whether the bot should join this meeting automatically.</p>
                </div>
                <Toggle checked={selectedMeeting.autoJoin} onChange={() => toggleMeetingAutoJoin(selectedMeeting.id)} />
              </div>
            </div>

            {selectedMeeting.platform === "Google Meet" && selectedMeeting.meetUrl && (
              <div className="p-4 rounded-xl border border-gray-200 bg-white">
                <p className="text-xs font-semibold text-gray-500 uppercase">Meet link</p>
                <div className="mt-2 flex items-center gap-2 p-2 rounded-lg bg-gray-50 border border-gray-200">
                  <span className="text-sm text-gray-700 truncate flex-1">{selectedMeeting.meetUrl}</span>
                  <button
                    className="px-3 py-2 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 text-sm font-semibold text-gray-700 flex items-center gap-2"
                    onClick={() => copyToClipboard(selectedMeeting.meetUrl!)}
                  >
                    <Icon name="copy" className="w-4 h-4" />
                    Copy
                  </button>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2">
              {selectedMeeting.status !== "completed" && (
                <button onClick={() => joinMeeting(selectedMeeting)} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-semibold flex items-center gap-2">
                  <Icon name="external" className="w-4 h-4" />
                  Join
                </button>
              )}
              {selectedMeeting.status === "completed" && selectedMeeting.recordingUrl && (
                <button
                  onClick={() => {
                    setMeetingModalOpen(false);
                    openRecording(selectedMeeting);
                  }}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-semibold flex items-center gap-2"
                >
                  <Icon name="play" className="w-4 h-4" />
                  Watch
                </button>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Recording modal */}
      <Modal
        open={recordingModalOpen}
        title={selectedMeeting ? `Recording — ${selectedMeeting.title}` : "Recording"}
        onClose={() => setRecordingModalOpen(false)}
      >
        {!selectedMeeting ? null : (
          <div className="space-y-4">
            <div className="rounded-xl bg-gray-900 aspect-video flex items-center justify-center text-white">
              <div className="text-center">
                <div className="mx-auto w-14 h-14 rounded-full bg-white/10 flex items-center justify-center">
                  <Icon name="play" className="w-6 h-6" />
                </div>
                <p className="mt-3 font-semibold">Playback (demo)</p>
                <p className="mt-1 text-sm text-gray-300">{selectedMeeting.durationLabel} • {selectedMeeting.dateLabel}</p>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-600">This is a UI placeholder for video playback.</p>
                              <button
                  className="px-4 py-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-sm font-semibold text-gray-700"
                  onClick={() => {
                    showToast("Download started (demo)", "info");
                    if (whatsAppConnected && whatsAppNotifyOnRecording) {
                      showToast("WhatsApp: recording link shared to group (demo)", "success");
                    }
                  }}
                >
                  Download
                </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
