import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Bell, Check, Archive, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { relativeTime } from "@/lib/domain";
import { useApp } from "@/lib/app-context";
import { useIntel } from "@/lib/intelligence/use-intel";
import {
  CATEGORY_LABELS,
  NOTIF_CATEGORIES,
  deriveNotifications,
  type DerivedNotification,
  type NotifCategory,
  type NotifPriority,
} from "@/lib/intelligence/notifications";
import {
  notificationMutations,
  notificationStateQuery,
} from "@/lib/intelligence/notification-state";
import { useAnalyticsSurface } from "@/lib/analytics/surfaces";
import { useAnalyticsScope } from "@/lib/analytics/scope";
import type { NotificationItem } from "@/lib/analytics/adapters";
import type { IntelLink } from "@/lib/intelligence/types";
import { EmptyState } from "@/components/ui-bits";

type Filter = { unreadOnly: boolean; priority: NotifPriority | "all"; category: NotifCategory | "all" };

const SEVERITY_PRIORITY: Record<NotificationItem["severity"], NotifPriority> = {
  critical: "critical",
  warn: "high",
  success: "normal",
  info: "normal",
};

const GROUP_ROUTE: Record<NotifCategory, IntelLink["to"]> = {
  business: "/analytics",
  operations: "/command",
  integrations: "/integrations",
  crm: "/crm",
  projects: "/projects",
  security: "/data-health",
};

function toCategory(group: string | null): NotifCategory {
  const key = (group ?? "").toLowerCase();
  return (NOTIF_CATEGORIES as readonly string[]).includes(key)
    ? (key as NotifCategory)
    : "operations";
}

/** Maps a live notification row onto the existing render contract. */
function fromRpc(item: NotificationItem, index: number): DerivedNotification {
  const category = toCategory(item.group);
  return {
    key: item.id || `rpc-${index}`,
    category,
    priority: SEVERITY_PRIORITY[item.severity],
    title: item.title,
    ...(item.body ? { detail: item.body } : {}),
    source: "analytics.dashboard_notifications",
    ts: item.at ?? new Date().toISOString(),
    link: { to: GROUP_ROUTE[category] },
    actionLabel: "Open",
  };
}

export function useNotifications() {
  const scope = useAnalyticsScope();
  const rpc = useAnalyticsSurface("dashboard-notifications", scope);
  const live = rpc.live ? rpc.model : null;
  const { input } = useIntel({ enabled: live === null });
  const state = useQuery(notificationStateQuery());
  const derived = useMemo(
    () => (live ? live.items.map(fromRpc) : deriveNotifications(input)),
    [live, input]
  );
  const byKey = state.data?.byKey ?? {};
  const visible = derived.filter((n) => !byKey[n.key]?.archived);
  const unread = visible.filter((n) => !byKey[n.key]?.read);
  return {
    derived,
    visible,
    unread,
    byKey,
    persistent: state.data?.available ?? false,
    ready: !state.isLoading && !rpc.isLoading,
  };
}

const priorityDot: Record<NotifPriority, string> = {
  critical: "bg-danger",
  high: "bg-warn",
  normal: "bg-teal/70",
};

export function NotificationBell() {
  const { notificationsOpen, setNotificationsOpen } = useApp();
  const { unread } = useNotifications();
  return (
    <button
      onClick={() => setNotificationsOpen(!notificationsOpen)}
      className="relative h-8 w-8 grid place-items-center rounded-[9px] bg-[var(--surface-2)] text-muted-foreground hover:text-foreground motion-micro"
      aria-label={`Notifications${unread.length ? `, ${unread.length} unread` : ""}`}
    >
      <Bell className="h-3.5 w-3.5" />
      {unread.length > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[15px] h-[15px] px-[3px] grid place-items-center rounded-full bg-teal text-canvas font-sans text-[9px] leading-none">
          {unread.length > 99 ? "99+" : unread.length}
        </span>
      )}
    </button>
  );
}

/** Slide-out panel. Read/archive state persists per operator when the table exists. */
export function NotificationsPanel() {
  const { notificationsOpen, setNotificationsOpen } = useApp();
  if (!notificationsOpen) return null;
  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-canvas/60 backdrop-blur-[2px]"
        onClick={() => setNotificationsOpen(false)}
        aria-hidden
      />
      <aside className="fixed right-0 top-0 z-50 h-full w-full sm:w-[420px] bg-[var(--surface-1)] edge-l flex flex-col ch-page-in">
        <div className="flex items-center justify-between h-14 px-5 edge-b">
          <div className="text-[14px] font-medium">Notifications</div>
          <button
            onClick={() => setNotificationsOpen(false)}
            className="h-7 w-7 grid place-items-center rounded text-muted-foreground hover:text-foreground motion-micro"
            aria-label="Close notifications"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <NotificationList onNavigate={() => setNotificationsOpen(false)} />
      </aside>
    </>
  );
}

export function NotificationList({
  compact = false,
  limit,
  onNavigate,
}: {
  compact?: boolean;
  limit?: number;
  onNavigate?: () => void;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { visible, byKey, persistent, ready } = useNotifications();
  const [filter, setFilter] = useState<Filter>({
    unreadOnly: false,
    priority: "all",
    category: "all",
  });

  const mutate = useMutation({
    mutationFn: async (input: { keys: string[]; action: "read" | "archive" }) =>
      input.action === "read"
        ? notificationMutations.markRead(input.keys)
        : notificationMutations.archive(input.keys),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notification-state"] }),
  });

  const rows = visible
    .filter((n) => (filter.unreadOnly ? !byKey[n.key]?.read : true))
    .filter((n) => (filter.priority === "all" ? true : n.priority === filter.priority))
    .filter((n) => (filter.category === "all" ? true : n.category === filter.category));

  const shown = limit ? rows.slice(0, limit) : rows;
  const unreadKeys = visible.filter((n) => !byKey[n.key]?.read).map((n) => n.key);

  const open = (n: DerivedNotification) => {
    mutate.mutate({ keys: [n.key], action: "read" });
    onNavigate?.();
    navigate({ to: n.link.to, search: n.link.search as never });
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="px-4 py-2.5 flex flex-wrap items-center gap-1.5 edge-b">
        <Chip
          active={filter.unreadOnly}
          onClick={() => setFilter((f) => ({ ...f, unreadOnly: !f.unreadOnly }))}
        >
          Unread
        </Chip>
        <select
          value={filter.priority}
          onChange={(e) => setFilter((f) => ({ ...f, priority: e.target.value as Filter["priority"] }))}
          className="h-6 px-1.5 rounded-[7px] bg-[var(--surface-2)] text-[11px] focus:outline-none"
          aria-label="Filter by priority"
        >
          <option value="all">All priorities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="normal">Normal</option>
        </select>
        <select
          value={filter.category}
          onChange={(e) => setFilter((f) => ({ ...f, category: e.target.value as Filter["category"] }))}
          className="h-6 px-1.5 rounded-[7px] bg-[var(--surface-2)] text-[11px] focus:outline-none"
          aria-label="Filter by category"
        >
          <option value="all">All categories</option>
          {NOTIF_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
        {unreadKeys.length > 0 && (
          <button
            onClick={() => mutate.mutate({ keys: unreadKeys, action: "read" })}
            className="ml-auto text-[11px] text-teal hover:underline"
          >
            Mark all read
          </button>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {!ready ? (
          <div className="p-5 text-[12px] text-muted-foreground">Reading production events…</div>
        ) : shown.length === 0 ? (
          <EmptyState
            title="Nothing waiting"
            hint="Notifications appear as engagements, work and syncs move."
          />
        ) : (
          <ul className="divide-y divide-edge/60">
            {shown.map((n) => {
              const read = Boolean(byKey[n.key]?.read);
              return (
                <li
                  key={n.key}
                  className={cn(
                    "px-4 py-3 flex gap-3 items-start surface-interactive motion-micro",
                    read && "opacity-60"
                  )}
                >
                  <span
                    className={cn("mt-[6px] h-1.5 w-1.5 rounded-full shrink-0", priorityDot[n.priority])}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <button
                      onClick={() => open(n)}
                      className="text-left text-[13px] leading-snug hover:text-teal motion-micro block w-full truncate"
                    >
                      {n.title}
                    </button>
                    {n.detail && (
                      <div className="text-[11.5px] text-muted-foreground truncate mt-0.5">
                        {n.detail}
                      </div>
                    )}
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="mono-label !text-[8.5px]">{CATEGORY_LABELS[n.category]}</span>
                      <span className="text-[10.5px] text-muted-foreground">{relativeTime(n.ts)}</span>
                      <button
                        onClick={() => open(n)}
                        className="text-[10.5px] text-teal hover:underline"
                      >
                        {n.actionLabel}
                      </button>
                    </div>
                  </div>
                  {!compact && (
                    <div className="flex flex-col gap-1 shrink-0">
                      {!read && (
                        <IconBtn
                          label="Mark read"
                          onClick={() => mutate.mutate({ keys: [n.key], action: "read" })}
                        >
                          <Check className="h-3 w-3" />
                        </IconBtn>
                      )}
                      <IconBtn
                        label="Archive"
                        onClick={() => mutate.mutate({ keys: [n.key], action: "archive" })}
                      >
                        <Archive className="h-3 w-3" />
                      </IconBtn>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {ready && !persistent && (
        <div className="px-4 py-2 edge-t text-[10.5px] text-muted-foreground">
          Read state is stored in this browser only until the notification state table is created.
        </div>
      )}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "h-6 px-2 rounded-[7px] text-[11px] motion-micro",
        active ? "bg-teal/15 text-teal" : "bg-[var(--surface-2)] text-muted-foreground"
      )}
    >
      {children}
    </button>
  );
}

function IconBtn({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="h-6 w-6 grid place-items-center rounded text-muted-foreground hover:text-foreground hover:bg-[var(--surface-3)] motion-micro"
    >
      {children}
    </button>
  );
}