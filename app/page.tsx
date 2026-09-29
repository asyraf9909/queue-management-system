"use client";

import {
  startTransition,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  ArrowRight,
  BadgeCheck,
  Bell,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  CreditCard,
  ChevronsUpDown,
  Download,
  ExternalLink,
  LayoutDashboard,
  LogOut,
  Menu,
  Monitor,
  MoreHorizontal,
  Play,
  Plus,
  Printer,
  RefreshCw,
  Settings,
  SkipForward,
  Moon,
  Sun,
  Ticket,
  X,
  Users,
  Volume2,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { loadLocalSettings, saveLocalSettings } from "@/lib/settings/client";
import { defaultSettings, type QueueSettings } from "@/lib/settings/types";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import {
  callQueue,
  completeQueue,
  nextQueue,
  recallQueue,
  skipQueue,
  takeQueue,
} from "@/lib/queue/operations";
import { updateSettings } from "@/lib/settings/operations";
import { getQueueReport, type QueueReport } from "@/lib/reports/operations";
import { uploadBrandImage } from "@/lib/settings/upload";
import ManagementView from "@/app/admin/management";

type QueueStatus = "WAITING" | "SERVING" | "COMPLETED" | "SKIPPED";
type UserRole = "SUPERADMIN" | "ADMIN" | "STAFF" | "USER";
type View =
  | "overview"
  | "counter"
  | "kiosk"
  | "display"
  | "management"
  | "reports"
  | "settings";

type QueueItem = {
  id: number | string;
  number: string;
  time: string;
  status: QueueStatus;
  counter?: number;
  updatedAt?: string;
};

type QueueNotification = {
  id: string;
  message: string;
  createdAt: string;
};

const initialQueue: QueueItem[] = [
  { id: 1, number: "A026", time: "09:42", status: "COMPLETED", counter: 2 },
  { id: 2, number: "A027", time: "09:44", status: "SERVING", counter: 2 },
  { id: 3, number: "A028", time: "09:46", status: "WAITING" },
  { id: 4, number: "A029", time: "09:48", status: "WAITING" },
  { id: 5, number: "A030", time: "09:51", status: "WAITING" },
  { id: 6, number: "A031", time: "09:52", status: "WAITING" },
  { id: 7, number: "A032", time: "09:55", status: "WAITING" },
];

const navItems: { label: string; view: View; icon: typeof LayoutDashboard }[] =
  [
    { label: "Overview", view: "overview", icon: LayoutDashboard },
    { label: "Counter desk", view: "counter", icon: CreditCard },
    { label: "Kiosk", view: "kiosk", icon: Ticket },
    { label: "TV display", view: "display", icon: Monitor },
  ];

const statusLabels: Record<QueueStatus, string> = {
  WAITING: "Waiting",
  SERVING: "Serving",
  COMPLETED: "Completed",
  SKIPPED: "Skipped",
};

function playNotificationSound() {
  if (typeof window === "undefined" || !window.AudioContext) return;

  const context = new window.AudioContext();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(740, context.currentTime);
  oscillator.frequency.setValueAtTime(880, context.currentTime + 0.12);
  gain.gain.setValueAtTime(0.0001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.18, context.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.35);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.35);
  oscillator.addEventListener("ended", () => void context.close(), {
    once: true,
  });
}

function announceQueueCall(
  number: string,
  counter: number,
  voiceEnabled: boolean,
  soundEnabled: boolean,
  voiceTemplate: string,
) {
  if (soundEnabled) playNotificationSound();
  if (
    !voiceEnabled ||
    typeof window === "undefined" ||
    !("speechSynthesis" in window)
  )
    return;

  const announcement = voiceTemplate
    .replace("{number}", number)
    .replace("{counter}", String(counter));
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(new SpeechSynthesisUtterance(announcement));
}

type Theme = "light" | "dark";
const themeStorageKey = "queuewise-theme";

function getThemeSnapshot(): Theme {
  if (typeof window === "undefined") return "light";
  const storedTheme = window.localStorage.getItem(themeStorageKey);
  if (storedTheme === "dark" || storedTheme === "light") return storedTheme;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function subscribeToTheme(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("queuewise-theme-change", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("queuewise-theme-change", callback);
  };
}

function ThemeToggle() {
  const theme = useSyncExternalStore(
    subscribeToTheme,
    getThemeSnapshot,
    () => "light" as Theme,
  );
  const isDark = theme === "dark";

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

  function toggleTheme() {
    const nextIsDark = !isDark;
    window.localStorage.setItem(themeStorageKey, nextIsDark ? "dark" : "light");
    window.dispatchEvent(new Event("queuewise-theme-change"));
  }

  return (
    <button
      className="icon-button theme-toggle"
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={toggleTheme}
    >
      {isDark ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  );
}

export default function Home({
  initialView = "overview",
}: {
  initialView?: View;
}) {
  const router = useRouter();
  const [view, setView] = useState<View>(initialView);
  const [queue, setQueue] = useState<QueueItem[]>(initialQueue);
  const [currentNumber, setCurrentNumber] = useState("A027");
  const [currentCounter, setCurrentCounter] = useState(2);
  const [ticketNumber, setTicketNumber] = useState<string | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [settings, setSettings] = useState<QueueSettings>(defaultSettings);
  const [notice, setNotice] = useState<string | null>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [sidebarProfileOpen, setSidebarProfileOpen] = useState(false);
  const [rowMenuOpen, setRowMenuOpen] = useState<number | string | null>(null);
  const [profile, setProfile] = useState<{
    full_name: string;
    role: UserRole;
    email?: string;
  } | null>(null);
  const [queueNotifications, setQueueNotifications] = useState<QueueNotification[]>([]);
  const lastAnnouncementKey = useRef<string | null>(null);
  const liveMode = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );

  useEffect(() => {
    startTransition(() => setSettings(loadLocalSettings()));
  }, []);

  function showNotice(message: string) {
    setNotice(message);
    setNotificationsOpen(false);
    setProfileOpen(false);
    setSidebarProfileOpen(false);
  }

  useEffect(() => {
    if (!liveMode) return;
    const supabase = createSupabaseClient();
    let active = true;
    startTransition(() => setCurrentNumber("—"));

    async function syncLiveQueue() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data: profileData } = await supabase
          .from("profiles")
          .select("full_name, role")
          .eq("id", user.id)
          .maybeSingle();
        if (profileData) {
          setProfile({
            ...(profileData as { full_name: string; role: UserRole }),
            email: user.email,
          });
        }
      }
      const { data: publicSettings } = await supabase.rpc(
        "get_public_queue_settings",
      );
      if (publicSettings && typeof publicSettings === "object") {
        startTransition(() =>
          setSettings({
            ...defaultSettings,
            ...(publicSettings as Partial<QueueSettings>),
          }),
        );
      }
      const { data } = await supabase.rpc("get_public_queue_tickets");
      if (!active || !data) return;
      const liveTickets = data as Array<{
        id: string;
        queue_number: string;
        status: string;
        counter_number: number | null;
        created_at: string;
        updated_at: string;
      }>;
      const nextQueue = liveTickets
        .filter((item) =>
          ["WAITING", "SERVING", "COMPLETED", "SKIPPED"].includes(item.status),
        )
        .map((item) => ({
          id: item.id,
          number: item.queue_number,
          time: new Date(item.created_at).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
          status: item.status as QueueStatus,
          counter: item.counter_number ?? undefined,
          updatedAt: item.updated_at,
        }));
      const liveServing = nextQueue.find((item) => item.status === "SERVING");
      const nextNumber = liveServing?.number ?? "—";
      const nextCounter = liveServing?.counter ?? 1;
      const announcementKey = liveServing
        ? `${liveServing.number}:${nextCounter}:${liveServing.updatedAt ?? ""}`
        : "—";
      if (
        active &&
        lastAnnouncementKey.current &&
        lastAnnouncementKey.current !== announcementKey &&
        nextNumber !== "—"
      ) {
        setQueueNotifications((current) => [
          {
            id: announcementKey,
            message: `${nextNumber} called to Counter ${nextCounter}.`,
            createdAt: new Date().toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            }),
          },
          ...current,
        ].slice(0, 8));
      }
      lastAnnouncementKey.current = announcementKey;
      setCurrentNumber(nextNumber);
      setCurrentCounter(nextCounter);
      startTransition(() => setQueue(nextQueue));
    }

    syncLiveQueue();
    const channel = supabase
      .channel("queue-tickets-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "queue_tickets" },
        syncLiveQueue,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "system_settings" },
        syncLiveQueue,
      )
      .subscribe();
    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [liveMode]);

  const waiting = queue.filter((item) => item.status === "WAITING");
  const serving = queue.filter((item) => item.status === "SERVING");
  const completed = queue.filter((item) => item.status === "COMPLETED");

  async function callNext() {
    if (liveMode) {
      try {
        const result = await nextQueue();
        if (result) {
          setCurrentNumber(result.queue_number);
          setCurrentCounter(result.counter_number ?? 1);
        }
      } catch (error) {
        showNotice(
          error instanceof Error
            ? error.message
            : "Unable to call the next ticket.",
        );
        return;
      }
      return;
    }
    if (queue.some((item) => item.status === "SERVING" && item.counter === 2)) {
      showNotice("Complete or skip the current ticket before calling the next one.");
      return;
    }
    const next = queue.find((item) => item.status === "WAITING");
    if (!next) return;

    setQueue((current) =>
      current.map((item) =>
        item.id === next.id ? { ...item, status: "SERVING", counter: 2 } : item,
      ),
    );
    setCurrentNumber(next.number);
    setCurrentCounter(2);
  }

  async function callTicket(item: QueueItem) {
    if (item.status !== "WAITING") {
      showNotice(`${item.number} is not waiting and cannot be called.`);
      return;
    }
    if (liveMode && typeof item.id === "string") {
      try {
        const result = await callQueue({ queueId: item.id });
        setCurrentNumber(result.queue_number);
        setCurrentCounter(result.counter_number ?? 1);
        showNotice(`${result.queue_number} was called.`);
      } catch (error) {
        showNotice(
          error instanceof Error ? error.message : "Unable to call this ticket.",
        );
      }
      return;
    }
    if (queue.some((queueItem) => queueItem.status === "SERVING" && queueItem.counter === 2)) {
      showNotice("Complete or skip the current ticket before calling another one.");
      return;
    }
    setQueue((current) =>
      current.map((queueItem) =>
        queueItem.id === item.id
          ? { ...queueItem, status: "SERVING", counter: 2 }
          : queueItem,
      ),
    );
    setCurrentNumber(item.number);
    setCurrentCounter(2);
    showNotice(`${item.number} was called.`);
  }

  async function completeCurrent() {
    if (liveMode) {
      const current = queue.find((item) => item.number === currentNumber);
      if (typeof current?.id === "string") {
        try {
          await completeQueue({ queueId: current.id });
        } catch (error) {
          showNotice(
            error instanceof Error
              ? error.message
              : "Unable to complete this ticket.",
          );
        }
      }
      return;
    }
    setQueue((current) =>
      current.map((item) =>
        item.number === currentNumber ? { ...item, status: "COMPLETED" } : item,
      ),
    );
  }

  async function recallCurrent() {
    if (!liveMode) {
      showNotice(`${currentNumber} was recalled for another announcement.`);
      return;
    }
    const current = queue.find((item) => item.number === currentNumber);
    if (typeof current?.id === "string") {
      try {
        await recallQueue({ queueId: current.id });
      } catch (error) {
        showNotice(
          error instanceof Error
            ? error.message
            : "Unable to recall this ticket.",
        );
      }
    }
  }

  async function skipCurrent() {
    if (liveMode) {
      const current = queue.find((item) => item.number === currentNumber);
      if (typeof current?.id === "string") {
        try {
          await skipQueue({ queueId: current.id });
        } catch (error) {
          showNotice(
            error instanceof Error
              ? error.message
              : "Unable to skip this ticket.",
          );
        }
      }
      return;
    }
    setQueue((current) => {
      const updated = current.map((item) =>
        item.number === currentNumber
          ? { ...item, status: "SKIPPED" as const }
          : item,
      );
      const next = updated.find((item) => item.status === "WAITING");
      if (next) {
        setCurrentNumber(next.number);
        setCurrentCounter(2);
        return updated.map((item) =>
          item.id === next.id
            ? { ...item, status: "SERVING" as const, counter: 2 }
            : item,
        );
      }
      return updated;
    });
  }

  async function takeTicket() {
    if (liveMode) {
      try {
        const result = await takeQueue();
        if (result) setTicketNumber(result.queue_number);
      } catch (error) {
        showNotice(
          error instanceof Error
            ? error.message
            : "Unable to issue a queue ticket.",
        );
        return;
      }
      return;
    }
    const nextSequence =
      queue.reduce(
        (highest, item) =>
          Math.max(highest, Number(item.number.replace(/\D/g, ""))),
        0,
      ) + 1;
    const nextNumber = `A${String(nextSequence).padStart(3, "0")}`;
    const now = new Date();
    const time = now.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    setQueue((current) => [
      ...current,
      { id: current.length + 1, number: nextNumber, time, status: "WAITING" },
    ]);
    setTicketNumber(nextNumber);
  }

  async function signOut() {
    if (liveMode) {
      const supabase = createSupabaseClient();
      await supabase.auth.signOut();
      router.push("/login");
      return;
    }
    showNotice(
      "Demo mode is active. Sign out will be available after Supabase Auth is configured.",
    );
  }

  function exportCsv() {
    const rows = [
      "Queue number,Arrived,Status,Counter",
      ...queue.map(
        (item) =>
          `${item.number},${item.time},${item.status},${item.counter ?? ""}`,
      ),
    ];
    const link = document.createElement("a");
    link.href = URL.createObjectURL(
      new Blob([rows.join("\n")], { type: "text/csv" }),
    );
    link.download = `queuewise-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    showNotice("Queue report exported.");
  }

  const pageTitle =
    view === "overview"
      ? "Good morning, Sam"
      : view === "management"
          ? "Users & roles"
        : view === "reports"
          ? "Reports"
          : view === "settings"
            ? "Settings"
            : navItems.find((item) => item.view === view)?.label;

  function persistSettings(nextSettings: QueueSettings) {
    setSettings(nextSettings);
    saveLocalSettings(nextSettings);
  }

  return (
    <main
      className={`app-shell ${["kiosk", "display", "counter"].includes(initialView) ? "standalone-device" : ""}`}
      style={
        {
          "--brand-primary": settings.primaryColor,
          "--brand-accent": settings.accentColor,
          "--display-background": settings.displayBackgroundColor,
        } as React.CSSProperties
      }
    >
      <aside className={`sidebar ${isMenuOpen ? "sidebar-open" : ""}`}>
        <div className="brand-lockup">
          <BrandLogo url={settings.logoUrl} />
          <div>
            <p className="brand-name">{settings.brandName}</p>
            <p className="brand-subtitle">{settings.schoolName}</p>
          </div>
        </div>

        <div className="workspace-switcher">
          <div className="workspace-avatar">A</div>
          <div className="workspace-copy">
            <strong>{settings.schoolName}</strong>
            <span>{settings.branchName}</span>
          </div>
          <ChevronDown size={15} />
        </div>

        <div className="nav-group">
          <span className="nav-label">Workspace</span>
          <nav>
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.view}
                  className={`nav-item ${view === item.view ? "active" : ""}`}
                  onClick={() => {
                    setView(item.view);
                    setIsMenuOpen(false);
                  }}
                >
                  <Icon size={17} strokeWidth={1.8} />
                  <span>{item.label}</span>
                  {item.view === "counter" && (
                    <span className="nav-badge">2</span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="nav-group nav-group-lower">
          <span className="nav-label">Manage</span>
          <nav>
            <button
              className={`nav-item ${view === "management" ? "active" : ""}`}
              onClick={() => setView("management")}
            >
              <Users size={17} strokeWidth={1.8} />
              <span>Users & roles</span>
            </button>
            <button
              className={`nav-item ${view === "reports" ? "active" : ""}`}
              onClick={() => setView("reports")}
            >
              <Activity size={17} strokeWidth={1.8} />
              <span>Reports</span>
            </button>
            <button
              className={`nav-item ${view === "settings" ? "active" : ""}`}
              onClick={() => setView("settings")}
            >
              <Settings size={17} strokeWidth={1.8} />
              <span>Settings</span>
            </button>
          </nav>
        </div>

        <div className="sidebar-footer">
          <a className="help-card" href={`mailto:${settings.supportEmail}`}>
            <div className="help-icon">
              <CircleHelp size={16} />
            </div>
            <div>
              <strong>{settings.helpTitle}</strong>
              <span>{settings.helpSubtitle}</span>
            </div>
            <ArrowRight size={15} />
          </a>
          <DropdownMenu.Root
            open={sidebarProfileOpen}
            onOpenChange={(open) => {
              setSidebarProfileOpen(open);
              if (open) setNotificationsOpen(false);
            }}
          >
            <DropdownMenu.Trigger asChild>
              <button className="profile-row" aria-label="Open account menu">
                <div className="profile-avatar">
                  {(profile?.full_name ?? "Sam Lee").charAt(0).toUpperCase()}
                </div>
                <div className="profile-copy">
                  <strong>{profile?.full_name ?? "Sam Lee"}</strong>
                  <span>{profile?.email ?? "Demo staff account"}</span>
                </div>
                <ChevronsUpDown size={17} />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                side="right"
                align="end"
                sideOffset={4}
                collisionPadding={8}
                className="jetson-account-menu"
              >
                <DropdownMenu.Label className="jetson-account-label">
                  <div className="jetson-account-header">
                    <div className="profile-avatar jetson-account-avatar">
                      {(profile?.full_name ?? "Sam Lee").charAt(0).toUpperCase()}
                    </div>
                    <div className="jetson-account-copy">
                      <strong>{profile?.full_name ?? "Sam Lee"}</strong>
                      <span>{profile?.email ?? "Demo staff account"}</span>
                      <span className="jetson-account-status">
                        <BadgeCheck size={12} />
                        {profile?.role ?? "ADMIN"}
                      </span>
                    </div>
                  </div>
                </DropdownMenu.Label>
                <DropdownMenu.Separator className="jetson-account-separator" />
                <DropdownMenu.Group>
                  <DropdownMenu.Item
                    className="jetson-account-item"
                    onSelect={() => {
                      setSidebarProfileOpen(false);
                      setView("settings");
                    }}
                  >
                    <BadgeCheck size={16} />
                    Profile
                  </DropdownMenu.Item>
                </DropdownMenu.Group>
                <DropdownMenu.Separator className="jetson-account-separator" />
                <DropdownMenu.Item
                  className="jetson-account-item"
                  onSelect={() => void signOut()}
                >
                  <LogOut size={16} />
                  Sign out
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </aside>

      <section className="main-column">
        <header className="topbar">
          <button
            className="mobile-menu"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            aria-label="Open menu"
          >
            <Menu size={20} />
          </button>
          <div className="breadcrumb">
            <span>Workspace</span>
            <span className="breadcrumb-slash">/</span>
            <strong>{pageTitle}</strong>
          </div>
          <div className="topbar-actions">
            <div className="live-status">
              <span className="live-dot" />
              {liveMode ? "Realtime connected" : "Demo mode"}
            </div>
            <ThemeToggle />
            <DropdownMenu.Root
              open={notificationsOpen}
              onOpenChange={(open) => {
                setNotificationsOpen(open);
                if (open) setProfileOpen(false);
              }}
            >
              <DropdownMenu.Trigger asChild>
                <button className="icon-button" aria-label="Notifications">
                  <Bell size={18} />
                  {queueNotifications.length > 0 && (
                    <span className="notification-dot" />
                  )}
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  side="bottom"
                  align="end"
                  sideOffset={8}
                  className="jetson-account-menu jetson-topbar-menu"
                >
                  <DropdownMenu.Label className="jetson-menu-heading">
                    Notifications
                  </DropdownMenu.Label>
                  <DropdownMenu.Separator className="jetson-account-separator" />
                  {queueNotifications.length === 0 ? (
                    <DropdownMenu.Item className="jetson-account-item" disabled>
                      No new queue alerts.
                    </DropdownMenu.Item>
                  ) : (
                    queueNotifications.map((notification) => (
                      <DropdownMenu.Item
                        className="jetson-account-item jetson-notification-item"
                        key={notification.id}
                      >
                        <span>{notification.message}</span>
                        <small>{notification.createdAt}</small>
                      </DropdownMenu.Item>
                    ))
                  )}
                  <DropdownMenu.Separator className="jetson-account-separator" />
                  <DropdownMenu.Item
                    className="jetson-account-item"
                    onSelect={() => {
                      setQueueNotifications([]);
                      showNotice("Notifications marked as read.");
                    }}
                  >
                    Mark as read
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
            <DropdownMenu.Root
              open={profileOpen}
              onOpenChange={(open) => {
                setProfileOpen(open);
                if (open) setNotificationsOpen(false);
              }}
            >
              <DropdownMenu.Trigger asChild>
                <button className="user-chip" aria-label="Open account menu">
                  <span className="profile-avatar small">
                    {(profile?.full_name ?? "Sam Lee").charAt(0).toUpperCase()}
                  </span>
                  <ChevronDown size={15} />
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  side="bottom"
                  align="end"
                  sideOffset={8}
                  className="jetson-account-menu jetson-topbar-menu"
                >
                  <DropdownMenu.Label className="jetson-account-label">
                    <div className="jetson-account-header">
                      <div className="profile-avatar jetson-account-avatar">
                        {(profile?.full_name ?? "Sam Lee").charAt(0).toUpperCase()}
                      </div>
                      <div className="jetson-account-copy">
                        <strong>{profile?.full_name ?? "Sam Lee"}</strong>
                        <span>{profile?.email ?? "Demo staff account"}</span>
                        <span className="jetson-account-status">
                          <BadgeCheck size={12} />
                          {profile?.role ?? "ADMIN"}
                        </span>
                      </div>
                    </div>
                  </DropdownMenu.Label>
                  <DropdownMenu.Separator className="jetson-account-separator" />
                  <DropdownMenu.Item
                    className="jetson-account-item"
                    onSelect={() => {
                      setProfileOpen(false);
                      setView("settings");
                    }}
                  >
                    <BadgeCheck size={16} />
                    Profile
                  </DropdownMenu.Item>
                  <DropdownMenu.Separator className="jetson-account-separator" />
                  <DropdownMenu.Item
                    className="jetson-account-item"
                    onSelect={() => void signOut()}
                  >
                    <LogOut size={16} />
                    Sign out
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>
        </header>

        <div className="content-area">
          {view === "overview" && (
            <OverviewView
              waiting={waiting}
              serving={serving}
              completed={completed}
              queue={queue}
              onNavigate={setView}
              settings={settings}
              onNotice={showNotice}
              onCall={callTicket}
              rowMenuOpen={rowMenuOpen}
              onRowMenu={setRowMenuOpen}
            />
          )}
          {view === "counter" && (
            <CounterView
              currentNumber={currentNumber}
              currentCounter={currentCounter}
              waiting={waiting}
              onNext={callNext}
              onComplete={completeCurrent}
              onSkip={skipCurrent}
              onRecall={recallCurrent}
            />
          )}
          {view === "kiosk" && (
            <KioskView
              ticketNumber={ticketNumber}
              onTakeTicket={takeTicket}
              settings={settings}
              onNotice={showNotice}
            />
          )}
          {view === "display" && (
            <DisplayView
              currentNumber={currentNumber}
              currentCounter={currentCounter}
              waiting={waiting}
              settings={settings}
              onNotice={showNotice}
            />
          )}
          {view === "settings" && (
            <SettingsView
              key={JSON.stringify(settings)}
              settings={settings}
              onSave={persistSettings}
              liveMode={liveMode}
            />
          )}
          {view === "management" && (
            <ManagementView
              onNotice={showNotice}
              liveMode={liveMode}
            />
          )}
          {view === "reports" && (
            <ReportsView
              queue={queue}
              onExport={exportCsv}
              liveMode={liveMode}
            />
          )}
        </div>
      </section>
      {notice && (
        <div className="toast" role="status">
          <span>{notice}</span>
          <button
            onClick={() => setNotice(null)}
            aria-label="Dismiss notification"
          >
            <X size={15} />
          </button>
        </div>
      )}
    </main>
  );
}

function OverviewView({
  waiting,
  serving,
  completed,
  queue,
  onNavigate,
  settings,
  onNotice,
  onCall,
  rowMenuOpen,
  onRowMenu,
}: {
  waiting: QueueItem[];
  serving: QueueItem[];
  completed: QueueItem[];
  queue: QueueItem[];
  onNavigate: (view: View) => void;
  settings: QueueSettings;
  onNotice: (message: string) => void;
  onCall: (item: QueueItem) => void;
  rowMenuOpen: number | string | null;
  onRowMenu: (id: number | string | null) => void;
}) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.div
      initial={shouldReduceMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
    >
      <div className="page-heading">
        <div>
          <p className="eyebrow">
            MONDAY, 14 SEPTEMBER 2026 <span className="heading-dot">·</span>{" "}
            09:58 AM
          </p>
          <h1>
            Good morning, Sam <span className="heading-wave">✦</span>
          </h1>
          <p className="heading-description">
            {settings.schoolName} · {settings.branchName}
          </p>
        </div>
        <button
          className="primary-button"
          onClick={() => onNavigate("counter")}
        >
          <Play size={15} fill="currentColor" />
          Open counter desk
        </button>
      </div>

      <section className="metric-grid" aria-label="Queue metrics">
        <MetricCard
          label="Total today"
          value={String(queue.length + 121)}
          detail="↑ 12.4%"
          detailText="vs. last Monday"
          tone="blue"
          icon={<Ticket size={17} />}
        />
        <MetricCard
          label="Waiting now"
          value={String(waiting.length)}
          detail="2 min"
          detailText="avg. wait time"
          tone="orange"
          icon={<Clock3 size={17} />}
        />
        <MetricCard
          label="Being served"
          value={String(serving.length + 3)}
          detail="4 active"
          detailText="of 6 counters"
          tone="mint"
          icon={<Users size={17} />}
        />
        <MetricCard
          label="Completed"
          value={String(completed.length + 110)}
          detail="86.7%"
          detailText="completion rate"
          tone="lilac"
          icon={<Check size={17} />}
        />
      </section>

      <div className="dashboard-grid">
        <section className="panel queue-panel">
          <div className="panel-header">
            <div>
              <h2>Live queue</h2>
              <p>Today&apos;s customer flow</p>
            </div>
            <button
              className="text-button"
              onClick={() => onNavigate("counter")}
            >
              View all <ArrowRight size={14} />
            </button>
          </div>
          <div className="queue-table">
            <div className="queue-table-head">
              <span>Number</span>
              <span>Arrived</span>
              <span>Counter</span>
              <span>Status</span>
              <span />
            </div>
            {queue.slice(0, 6).map((item) => (
                <QueueRow
                key={item.id}
                item={item}
                menuOpen={rowMenuOpen === item.id}
                onMenu={(open) => onRowMenu(open ? item.id : null)}
                onNotice={onNotice}
                onCall={() => onCall(item)}
              />
            ))}
          </div>
        </section>
        <section className="panel counter-panel">
          <div className="panel-header">
            <div>
              <h2>Counter pulse</h2>
              <p>Live status across the floor</p>
            </div>
            <button
              className="icon-button subtle"
              aria-label="More counter options"
              onClick={() =>
                onNotice(
                  "Counter controls are available from the Counter desk.",
                )
              }
            >
              <MoreHorizontal size={18} />
            </button>
          </div>
          <div className="counter-list">
            <CounterRow
              number="01"
              current="A024"
              status="Serving"
              tone="serving"
            />
            <CounterRow
              number="02"
              current="A027"
              status="Serving"
              tone="serving"
            />
            <CounterRow
              number="03"
              current="--"
              status="Available"
              tone="available"
            />
            <CounterRow
              number="04"
              current="--"
              status="Offline"
              tone="offline"
            />
          </div>
          <button
            className="panel-footer-button"
            onClick={() => onNavigate("counter")}
          >
            <span>Manage all counters</span>
            <ArrowRight size={15} />
          </button>
        </section>
      </div>

      <div className="bottom-grid">
        <section className="announcement-strip">
          <div className="announcement-icon">
            <Volume2 size={19} />
          </div>
          <div>
            <strong>Display is broadcasting</strong>
            <span>TV display is connected and announcing queue calls.</span>
          </div>
          <span className="announcement-live">
            <span className="live-dot" />
            LIVE
          </span>
          <button
            className="arrow-circle"
            onClick={() => onNavigate("display")}
            aria-label="Open display"
          >
            <ExternalLink size={16} />
          </button>
        </section>
        <section className="mini-insight">
          <div className="insight-top">
            <span>Peak hour</span>
            <span className="insight-value">
              10:00 <small>AM</small>
            </span>
          </div>
          <div className="bar-chart">
            {[28, 40, 34, 58, 72, 64, 88, 74, 92, 80, 68, 46].map(
              (height, index) => (
                <span
                  key={index}
                  style={{ height: `${height}%` }}
                  className={index === 8 ? "highlight" : ""}
                />
              ),
            )}
          </div>
          <span className="insight-caption">Expected busiest window today</span>
        </section>
      </div>
    </motion.div>
  );
}

function MetricCard({
  label,
  value,
  detail,
  detailText,
  tone,
  icon,
}: {
  label: string;
  value: string;
  detail: string;
  detailText: string;
  tone: string;
  icon: React.ReactNode;
}) {
  return (
    <div className={`metric-card metric-${tone}`}>
      <div className="metric-top">
        <span>{label}</span>
        <span className="metric-icon">{icon}</span>
      </div>
      <div className="metric-value">{value}</div>
      <div className="metric-detail">
        <strong>{detail}</strong>
        <span>{detailText}</span>
      </div>
    </div>
  );
}

function QueueRow({
  item,
  menuOpen,
  onMenu,
  onNotice,
  onCall,
}: {
  item: QueueItem;
  menuOpen: boolean;
  onMenu: (open: boolean) => void;
  onNotice: (message: string) => void;
  onCall: () => void;
}) {
  return (
    <div className="queue-table-row">
      <strong className="queue-number">{item.number}</strong>
      <span className="muted-cell">{item.time}</span>
      <span className="counter-cell">
        {item.counter ? `C${item.counter}` : "--"}
      </span>
      <span className={`status-pill status-${item.status.toLowerCase()}`}>
        <span />
        {statusLabels[item.status]}
      </span>
      <span className="row-actions">
        <DropdownMenu.Root open={menuOpen} onOpenChange={onMenu}>
          <DropdownMenu.Trigger asChild>
            <button
              className="row-menu"
              aria-label={`More options for ${item.number}`}
            >
              <MoreHorizontal size={16} />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              side="bottom"
              align="end"
              sideOffset={4}
              className="jetson-account-menu jetson-row-menu"
            >
              <DropdownMenu.Item
                className="jetson-account-item"
                onSelect={onCall}
              >
                Call ticket
              </DropdownMenu.Item>
              <DropdownMenu.Item
                className="jetson-account-item"
                onSelect={() =>
                  onNotice(`${item.number} is marked for follow-up.`)
                }
              >
                Flag ticket
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </span>
    </div>
  );
}

function CounterRow({
  number,
  current,
  status,
  tone,
}: {
  number: string;
  current: string;
  status: string;
  tone: string;
}) {
  return (
    <div className="counter-row">
      <span className="counter-number">{number}</span>
      <div className="counter-info">
        <strong>Counter {number}</strong>
        <span>
          {current === "--" ? "No active ticket" : `${current} in service`}
        </span>
      </div>
      <span className={`counter-status ${tone}`}>
        <span />
        {status}
      </span>
    </div>
  );
}

function CounterView({
  currentNumber,
  currentCounter,
  waiting,
  onNext,
  onComplete,
  onSkip,
  onRecall,
}: {
  currentNumber: string;
  currentCounter: number;
  waiting: QueueItem[];
  onNext: () => void;
  onComplete: () => void;
  onSkip: () => void;
  onRecall: () => void;
}) {
  return (
    <div className="focused-view">
      <div className="page-heading compact-heading">
        <div>
          <p className="eyebrow">
            COUNTER DESK <span className="heading-dot">·</span> COUNTER{" "}
            {String(currentCounter).padStart(2, "0")}
          </p>
          <h1>Keep the line moving.</h1>
          <p className="heading-description">
            Call the next learner when you&apos;re ready.
          </p>
        </div>
        <div className="desk-status">
          <span className="live-dot" />
          Desk online
        </div>
      </div>
      <div className="counter-workspace">
        <div className="now-serving-card">
          <div className="now-serving-label">
            <span>NOW SERVING</span>
            <span className="serving-counter">COUNTER {currentCounter}</span>
          </div>
          <div className="giant-number">{currentNumber}</div>
          <p>Current customer in service</p>
        </div>
        <div className="desk-actions">
          <button className="next-button" onClick={onNext}>
            <span>Call next</span>
            <ArrowRight size={20} />
          </button>
          <div className="secondary-actions">
            <button onClick={onComplete}>
              <Check size={17} />
              Complete
            </button>
            <button onClick={onSkip}>
              <SkipForward size={17} />
              Skip
            </button>
            <button onClick={onRecall}>
              <RefreshCw size={17} />
              Recall
            </button>
          </div>
          <div className="desk-note">
            <Bell size={16} />
            <span>The display will announce this call automatically.</span>
          </div>
        </div>
      </div>
      <section className="up-next-section">
        <div className="panel-header">
          <div>
            <h2>Up next</h2>
            <p>Customers waiting in order</p>
          </div>
          <span className="waiting-count">{waiting.length} waiting</span>
        </div>
        <div className="up-next-list">
          {waiting.length === 0 ? (
            <span>No customers waiting</span>
          ) : (
            waiting.slice(0, 5).map((item, index) => (
              <span className={index === 0 ? "up-next-active" : ""} key={item.id}>
                {item.number}
              </span>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function KioskView({
  ticketNumber,
  onTakeTicket,
  settings,
  onNotice,
}: {
  ticketNumber: string | null;
  onTakeTicket: () => void;
  settings: QueueSettings;
  onNotice: (message: string) => void;
}) {
  return (
    <div className="focused-view kiosk-view">
      <div className="page-heading compact-heading">
        <div>
          <p className="eyebrow">
            KIOSK PREVIEW <span className="heading-dot">·</span> TOUCHSCREEN
            MODE
          </p>
          <h1>A calm start to every visit.</h1>
          <p className="heading-description">
            This is the customer-facing ticket experience.
          </p>
        </div>
        <div className="device-status">
          <span className="live-dot" />
          Kiosk connected
        </div>
      </div>
      <div className="kiosk-frame">
        <div className="kiosk-topline">
          <BrandLogo url={settings.logoUrl} compact />
          <span>{settings.schoolName}</span>
          <span className="kiosk-time">09:58</span>
        </div>
        {ticketNumber ? (
          <div className="ticket-confirmation">
            <span className="kiosk-eyebrow">{settings.kioskYourNumberLabel}</span>
            <strong>{ticketNumber}</strong>
            <span className="kiosk-waiting">
              {settings.kioskWaitingMessage}
            </span>
            <button
              className="kiosk-button secondary"
              onClick={() => onTakeTicket()}
            >
              <Plus size={18} />
              {settings.kioskTakeAnotherLabel}
            </button>
            <button
              className="print-button"
              onClick={() => {
                window.print();
                onNotice("Print dialog opened.");
              }}
            >
              <Printer size={15} />
              {settings.kioskPrintLabel}
            </button>
          </div>
        ) : (
          <div className="kiosk-welcome">
            <span className="kiosk-eyebrow">{settings.kioskWelcomeLabel}</span>
            <h2>{settings.welcomeTitle}</h2>
            <p>{settings.welcomeSubtitle}</p>
            <button className="kiosk-button" onClick={onTakeTicket}>
              <Ticket size={21} />
              {settings.kioskGetNumberLabel} <ArrowRight size={19} />
            </button>
            <span className="kiosk-footnote">{settings.kioskFootnote}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function DisplayView({
  currentNumber,
  currentCounter,
  waiting,
  settings,
  onNotice,
}: {
  currentNumber: string;
  currentCounter: number;
  waiting: QueueItem[];
  settings: QueueSettings;
  onNotice: (message: string) => void;
}) {
  const announcedCall = useRef(`${currentNumber}:${currentCounter}`);

  function testAnnouncement() {
    const number = currentNumber === "—" ? "A001" : currentNumber;
    announceQueueCall(
      number,
      currentCounter,
      settings.voiceEnabled,
      settings.soundEnabled,
      settings.displayVoiceTemplate,
    );
    onNotice("Test announcement sent to this display.");
  }

  useEffect(() => {
    const callKey = `${currentNumber}:${currentCounter}`;
    if (announcedCall.current === callKey || currentNumber === "—") return;
    announcedCall.current = callKey;
    announceQueueCall(
      currentNumber,
      currentCounter,
      settings.voiceEnabled,
      settings.soundEnabled,
      settings.displayVoiceTemplate,
    );
  }, [
    currentCounter,
    currentNumber,
    settings.soundEnabled,
    settings.displayVoiceTemplate,
    settings.voiceEnabled,
  ]);

  return (
    <div className="focused-view display-view">
      <div className="page-heading compact-heading">
        <div>
          <p className="eyebrow">
            DISPLAY PREVIEW <span className="heading-dot">·</span> MAIN HALL
          </p>
          <h1>Make every call impossible to miss.</h1>
          <p className="heading-description">
            The live 16:9 display experience for your waiting room.
          </p>
        </div>
        <div className="display-actions">
          <span className="device-status">
            <span className="live-dot" />
            Realtime connected
          </span>
          <button className="secondary-button" onClick={testAnnouncement}>
            <Volume2 size={15} />
            Test announcement
          </button>
          <a
            className="icon-button"
            href="/display"
            target="_blank"
            rel="noreferrer"
            aria-label="Open display in a new tab"
            onClick={() => onNotice("Display opened in a new tab.")}
          >
            <ExternalLink size={17} />
          </a>
        </div>
      </div>
      <div
        className="tv-frame"
        style={{ background: settings.displayBackgroundColor }}
      >
        <div className="tv-header">
          <div className="tv-brand">
            <BrandLogo
              url={settings.displayLogoUrl || settings.logoUrl}
              compact
            />
            <span>{settings.schoolName.toUpperCase()}</span>
          </div>
          <div className="tv-clock">
            09:58 AM <span>MON 14 SEP 2026</span>
          </div>
        </div>
        <div className="tv-main">
          <div className="tv-kicker">{settings.displayNowServingLabel}</div>
          <div className="tv-number">{currentNumber}</div>
          <div className="tv-counter">
            {settings.displayProceedLabel} <strong>Counter {currentCounter}</strong>
          </div>
        </div>
        <div className="tv-next">
          <span className="tv-next-label">{settings.displayNextLabel}</span>
          <div className="tv-next-numbers">
            {waiting.slice(0, settings.displayNextCount).map((item) => (
              <span key={item.id}>{item.number}</span>
            ))}
          </div>
        </div>
        <div className="tv-footer">
          <span>
            <span className="live-dot" />
            {settings.displayFooterMessage}
          </span>
          <button className="tv-audio-test" onClick={testAnnouncement}>
            <Volume2 size={15} />
            {settings.voiceEnabled
              ? settings.displayVoiceEnabledLabel
              : settings.displayVoiceDisabledLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function BrandLogo({
  url,
  compact = false,
}: {
  url: string;
  compact?: boolean;
}) {
  return (
    <div
      className={`brand-mark ${compact ? "small-mark" : ""}`}
      style={
        url
          ? {
              backgroundImage: `url(${url})`,
              backgroundPosition: "center",
              backgroundSize: "cover",
            }
          : undefined
      }
    >
      {!url && <span>Q</span>}
    </div>
  );
}

function SettingsView({
  settings,
  onSave,
  liveMode,
}: {
  settings: QueueSettings;
  onSave: (settings: QueueSettings) => void;
  liveMode: boolean;
}) {
  const [draft, setDraft] = useState(settings);
  const [saved, setSaved] = useState(false);
  const [activeSection, setActiveSection] = useState("brand");

  function selectSection(section: string) {
    setActiveSection(section);
    document.getElementById(`settings-${section}`)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  function change<K extends keyof QueueSettings>(
    key: K,
    value: QueueSettings[K],
  ) {
    setDraft((current) => ({ ...current, [key]: value }));
    setSaved(false);
  }

  async function save() {
    if (liveMode) {
      try {
        await updateSettings(draft);
      } catch {
        setSaved(false);
        return;
      }
    }
    onSave(draft);
    setSaved(true);
  }

  return (
    <div className="focused-view settings-view">
      <LogoUploadPanel
        logoUrl={draft.logoUrl}
        displayLogoUrl={draft.displayLogoUrl}
        onChange={change}
      />
      <div className="page-heading compact-heading">
        <div>
          <p className="eyebrow">
            ADMINISTRATION <span className="heading-dot">·</span> BRAND &
            CONTENT
          </p>
          <h1>Make it yours.</h1>
          <p className="heading-description">
            Change what customers see across the kiosk, TV, and workspace.
          </p>
        </div>
        <button className="primary-button" onClick={save}>
          <Check size={15} />
          {saved ? "Saved" : "Save changes"}
        </button>
      </div>
      <div className="settings-layout">
        <aside className="settings-nav">
          <span className="settings-nav-title">Settings</span>
          <button
            className={`settings-nav-item ${activeSection === "brand" ? "active" : ""}`}
            onClick={() => selectSection("brand")}
          >
            Brand & content
          </button>
          <button
            className={`settings-nav-item ${activeSection === "queue" ? "active" : ""}`}
            onClick={() => selectSection("queue")}
          >
            Queue rules
          </button>
          <button
            className={`settings-nav-item ${activeSection === "display" ? "active" : ""}`}
            onClick={() => selectSection("display")}
          >
            Display & sound
          </button>
          <button
            className={`settings-nav-item ${activeSection === "notifications" ? "active" : ""}`}
            onClick={() => selectSection("notifications")}
          >
            Notifications
          </button>
        </aside>
        <div className="settings-sections">
          <SettingsSection
            id="settings-brand"
            title="Identity"
            description="The name and visual identity used throughout your queue system."
          >
            <div className="settings-grid">
              <Field
                label="Brand name"
                value={draft.brandName}
                onChange={(value) => change("brandName", value)}
              />
              <Field
                label="School name"
                value={draft.schoolName}
                onChange={(value) => change("schoolName", value)}
              />
              <Field
                label="Branch name"
                value={draft.branchName}
                onChange={(value) => change("branchName", value)}
              />
              <Field
                label="Support email"
                type="email"
                value={draft.supportEmail}
                onChange={(value) => change("supportEmail", value)}
              />
              <Field
                label="Logo image URL"
                hint="Use a hosted PNG or JPG URL."
                value={draft.logoUrl}
                onChange={(value) => change("logoUrl", value)}
              />
              <Field
                label="TV logo URL"
                hint="Leave blank to use the main logo."
                value={draft.displayLogoUrl}
                onChange={(value) => change("displayLogoUrl", value)}
              />
            </div>
          </SettingsSection>
          <SettingsSection
            id="settings-brand-kiosk"
            title="Kiosk messaging"
            description="Friendly language shown on the customer-facing ticket kiosk."
          >
            <div className="settings-grid">
              <Field
                wide
                label="Welcome title"
                value={draft.welcomeTitle}
                onChange={(value) => change("welcomeTitle", value)}
              />
              <Field
                wide
                label="Welcome subtitle"
                value={draft.welcomeSubtitle}
                onChange={(value) => change("welcomeSubtitle", value)}
              />
              <Field
                wide
                label="Waiting message"
                value={draft.kioskWaitingMessage}
                onChange={(value) => change("kioskWaitingMessage", value)}
              />
              <Field
                label="Kiosk footnote"
                value={draft.kioskFootnote}
                onChange={(value) => change("kioskFootnote", value)}
              />
              <Field
                label="Kiosk welcome label"
                value={draft.kioskWelcomeLabel}
                onChange={(value) => change("kioskWelcomeLabel", value)}
              />
              <Field
                label="Your number label"
                value={draft.kioskYourNumberLabel}
                onChange={(value) => change("kioskYourNumberLabel", value)}
              />
              <Field
                label="Get number button"
                value={draft.kioskGetNumberLabel}
                onChange={(value) => change("kioskGetNumberLabel", value)}
              />
              <Field
                label="Take another button"
                value={draft.kioskTakeAnotherLabel}
                onChange={(value) => change("kioskTakeAnotherLabel", value)}
              />
              <Field
                label="Print button"
                value={draft.kioskPrintLabel}
                onChange={(value) => change("kioskPrintLabel", value)}
              />
            </div>
          </SettingsSection>
          <SettingsSection
            id="settings-display"
            title="TV display"
            description="Control labels, queue density, colors, and announcements on the big screen."
          >
            <div className="settings-grid">
              <Field
                label="Now serving label"
                value={draft.displayNowServingLabel}
                onChange={(value) => change("displayNowServingLabel", value)}
              />
              <Field
                label="Next numbers label"
                value={draft.displayNextLabel}
                onChange={(value) => change("displayNextLabel", value)}
              />
              <Field
                label="Footer message"
                value={draft.displayFooterMessage}
                onChange={(value) => change("displayFooterMessage", value)}
              />
              <Field
                label="Proceed label"
                value={draft.displayProceedLabel}
                onChange={(value) => change("displayProceedLabel", value)}
              />
              <Field
                label="Next numbers to show"
                type="number"
                value={String(draft.displayNextCount)}
                onChange={(value) =>
                  change(
                    "displayNextCount",
                    Math.max(1, Math.min(10, Number(value) || 1)),
                  )
                }
              />
              <Field
                wide
                label="Voice announcement template"
                hint="Use {number} and {counter} as placeholders."
                value={draft.displayVoiceTemplate}
                onChange={(value) => change("displayVoiceTemplate", value)}
              />
              <Field
                label="Voice enabled label"
                value={draft.displayVoiceEnabledLabel}
                onChange={(value) => change("displayVoiceEnabledLabel", value)}
              />
              <Field
                label="Voice disabled label"
                value={draft.displayVoiceDisabledLabel}
                onChange={(value) => change("displayVoiceDisabledLabel", value)}
              />
            </div>
            <div className="toggle-row">
              <Toggle
                label="Voice announcements"
                checked={draft.voiceEnabled}
                onChange={(value) => change("voiceEnabled", value)}
              />
              <Toggle
                label="Notification sound"
                checked={draft.soundEnabled}
                onChange={(value) => change("soundEnabled", value)}
              />
            </div>
          </SettingsSection>
          <SettingsSection
            id="settings-queue"
            title="Queue rules"
            description="Set the daily ticket format and the maximum number the queue can issue."
          >
            <div className="settings-grid">
              <Field
                label="Queue prefix"
                hint="One to three letters or numbers."
                value={draft.queuePrefix}
                onChange={(value) => change("queuePrefix", value.toUpperCase())}
              />
              <Field
                label="Maximum daily number"
                type="number"
                value={String(draft.maxQueueNumber)}
                onChange={(value) =>
                  change(
                    "maxQueueNumber",
                    Math.max(1, Math.min(9999, Number(value) || 1)),
                  )
                }
              />
            </div>
          </SettingsSection>
          <SettingsSection
            id="settings-notifications"
            title="Notifications"
            description="Queue calls appear in the workspace notification tray and can announce on the display."
          >
            <div className="toggle-row">
              <Toggle
                label="Voice announcements"
                checked={draft.voiceEnabled}
                onChange={(value) => change("voiceEnabled", value)}
              />
              <Toggle
                label="Notification sound"
                checked={draft.soundEnabled}
                onChange={(value) => change("soundEnabled", value)}
              />
            </div>
          </SettingsSection>
          <SettingsSection
            id="settings-brand-colors"
            title="Color palette"
            description="Keep the experience recognisable across every customer touchpoint."
          >
            <div className="color-settings">
              <ColorField
                label="Primary"
                value={draft.primaryColor}
                onChange={(value) => change("primaryColor", value)}
              />
              <ColorField
                label="Accent"
                value={draft.accentColor}
                onChange={(value) => change("accentColor", value)}
              />
              <ColorField
                label="TV background"
                value={draft.displayBackgroundColor}
                onChange={(value) => change("displayBackgroundColor", value)}
              />
            </div>
          </SettingsSection>
        </div>
      </div>
    </div>
  );
}

function LogoUploadPanel({
  logoUrl,
  displayLogoUrl,
  onChange,
}: {
  logoUrl: string;
  displayLogoUrl: string;
  onChange: <K extends "logoUrl" | "displayLogoUrl">(
    key: K,
    value: QueueSettings[K],
  ) => void;
}) {
  const [uploading, setUploading] = useState<
    "logoUrl" | "displayLogoUrl" | null
  >(null);
  const [error, setError] = useState("");

  async function upload(field: "logoUrl" | "displayLogoUrl", file?: File) {
    if (!file) return;
    setUploading(field);
    setError("");
    try {
      const formData = new FormData();
      formData.set("file", file);
      onChange(field, await uploadBrandImage(formData));
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Image upload failed.",
      );
    } finally {
      setUploading(null);
    }
  }

  return (
    <section className="settings-section logo-upload-panel">
      <div className="settings-section-heading">
        <h2>Logo assets</h2>
        <p>
          Paste a hosted image URL or upload a PNG, JPG, or WebP file up to 2
          MB.
        </p>
      </div>
      <div className="logo-upload-grid">
        <LogoUploadField
          label="Main logo"
          value={logoUrl}
          uploading={uploading === "logoUrl"}
          onChange={(file) => upload("logoUrl", file)}
        />
        <LogoUploadField
          label="TV logo"
          value={displayLogoUrl}
          uploading={uploading === "displayLogoUrl"}
          onChange={(file) => upload("displayLogoUrl", file)}
        />
      </div>
      {error && <p className="settings-error">{error}</p>}
    </section>
  );
}

function LogoUploadField({
  label,
  value,
  uploading,
  onChange,
}: {
  label: string;
  value: string;
  uploading: boolean;
  onChange: (file?: File) => void;
}) {
  return (
    <div className="logo-upload-field">
      <div
        className="logo-preview"
        style={value ? { backgroundImage: `url(${value})` } : undefined}
      >
        {!value && <span>Q</span>}
      </div>
      <div>
        <strong>{label}</strong>
        <span>{value ? "Custom image selected" : "Using default mark"}</span>
      </div>
      <label className="upload-button">
        {uploading ? "Uploading..." : "Upload image"}
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={uploading}
          onChange={(event) => onChange(event.target.files?.[0])}
        />
      </label>
    </div>
  );
}

function SettingsSection({
  id,
  title,
  description,
  children,
}: {
  id?: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="settings-section" id={id}>
      <div className="settings-section-heading">
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  hint,
  type = "text",
  wide = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  type?: string;
  wide?: boolean;
}) {
  return (
    <label className={`field ${wide ? "field-wide" : ""}`}>
      <span>{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {hint && <small>{hint}</small>}
    </label>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="color-field">
      <span>{label}</span>
      <input
        type="color"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <code>{value}</code>
    </label>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="toggle-control">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="toggle-track" />
    </label>
  );
}

function ReportsView({
  queue,
  onExport,
  liveMode,
}: {
  queue: QueueItem[];
  onExport: () => void;
  liveMode: boolean;
}) {
  const [period, setPeriod] = useState("Today");
  const [report, setReport] = useState<QueueReport | null>(null);

  useEffect(() => {
    if (!liveMode) return;
    getQueueReport()
      .then(setReport)
      .catch(() => undefined);
  }, [liveMode]);

  const ticketsIssued = report?.ticketsIssued ?? queue.length + 121;
  const completed =
    report?.completed ??
    queue.filter((item) => item.status === "COMPLETED").length + 110;
  const waitMinutes = report
    ? `${String(Math.floor(report.averageWaitSeconds / 60)).padStart(2, "0")}:${String(report.averageWaitSeconds % 60).padStart(2, "0")}`
    : "02:14";
  const serviceMinutes = report
    ? `${String(Math.floor(report.averageServiceSeconds / 60)).padStart(2, "0")}:${String(report.averageServiceSeconds % 60).padStart(2, "0")}`
    : "06:42";
  const completionRate = ticketsIssued
    ? `${((completed / ticketsIssued) * 100).toFixed(1)}%`
    : "0.0%";
  const chartValues = report
    ? report.hourly.map((count) => Math.min(100, count * 10))
    : [30, 45, 37, 52, 68, 55, 77, 91, 74, 63, 50, 35];
  return (
    <div className="focused-view">
      <div className="page-heading compact-heading">
        <div>
          <p className="eyebrow">
            INSIGHTS <span className="heading-dot">·</span>{" "}
            {period.toUpperCase()}
          </p>
          <h1>See how the day moved.</h1>
          <p className="heading-description">
            {liveMode
              ? "Live queue performance for your branch."
              : "Preview data is shown until Supabase is configured."}
          </p>
        </div>
        <button className="secondary-button" onClick={onExport}>
          <Download size={15} />
          Export CSV
        </button>
      </div>
      <section className="metric-grid report-metrics">
        <MetricCard
          label="Tickets issued"
          value={String(ticketsIssued)}
          detail={period}
          detailText="today"
          tone="blue"
          icon={<Ticket size={17} />}
        />
        <MetricCard
          label="Average wait"
          value={waitMinutes}
          detail="Live"
          detailText="created to called"
          tone="orange"
          icon={<Clock3 size={17} />}
        />
        <MetricCard
          label="Service time"
          value={serviceMinutes}
          detail="Live"
          detailText="serving to complete"
          tone="mint"
          icon={<Activity size={17} />}
        />
        <MetricCard
          label="Completion"
          value={completionRate}
          detail={`${completed} served`}
          detailText="of today's tickets"
          tone="lilac"
          icon={<Check size={17} />}
        />
      </section>
      <section className="panel report-panel">
        <div className="panel-header">
          <div>
            <h2>Queue activity</h2>
            <p>Hourly ticket volume and completion trend</p>
          </div>
          <button
            className="report-period"
            onClick={() =>
              setPeriod(
                period === "Today"
                  ? "This week"
                  : period === "This week"
                    ? "This month"
                    : "Today",
              )
            }
          >
            {period} <ChevronDown size={13} />
          </button>
        </div>
        <div className="report-chart">
          {chartValues.map((height, index) => (
            <div className="chart-column" key={index}>
              <span style={{ height: `${height}%` }} />
              <small>{`${8 + index}:00`}</small>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
