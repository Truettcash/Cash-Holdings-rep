import {
  meta,
  num,
  obj,
  ok,
  requireEnvelope,
  rowStr,
  rows,
  type Adapter,
  type AdapterMeta,
} from "./envelope";

export type NotificationItem = {
  id: string;
  title: string;
  body: string | null;
  severity: "info" | "warn" | "critical" | "success";
  group: string | null;
  at: string | null;
  /** Present when the backend returns grouped counters rather than rows. */
  count: number | null;
};

export type NotificationsModel = {
  items: NotificationItem[];
  unread: number | null;
  total: number | null;
  attention: number | null;
  meta: AdapterMeta;
};

function severity(value: string | null): NotificationItem["severity"] {
  switch (value) {
    case "critical":
    case "error":
    case "blocker":
      return "critical";
    case "warn":
    case "warning":
    case "attention":
      return "warn";
    case "success":
    case "win":
      return "success";
    default:
      return "info";
  }
}

export const adaptNotifications: Adapter<NotificationsModel> = (payload) => {
  const invalid = requireEnvelope(payload, "dashboard_notifications");
  if (invalid) return invalid;

  const raw = rows(payload, ["notifications", "items", "alerts", "rows"]);
  const items: NotificationItem[] = raw.map((row, index) => ({
    id: rowStr(row, ["id", "key", "notificationId"]) ?? `notification-${index}`,
    title: rowStr(row, ["title", "label", "headline", "message"]) ?? "",
    body: rowStr(row, ["body", "detail", "description", "message"]),
    severity: severity(rowStr(row, ["severity", "tone", "level", "status"])),
    group: rowStr(row, ["group", "category", "type", "surface"]),
    at: rowStr(row, ["at", "createdAt", "occurredAt", "ts", "activityAt"]),
    count: num(row, ["count", "cnt", "total"]),
  }));

  // Live shape: `data.notifications` is a map of named counter objects
  // (`{ blockedTasks: { cnt } , ... }`), not an array of rows.
  const counters = items.length === 0 ? obj(payload, ["notifications", "alerts"]) : {};
  const grouped: NotificationItem[] = Object.entries(counters).flatMap(([key, value]) => {
    const descriptor = COUNTERS[key];
    if (!descriptor) return [];
    const count =
      typeof value === "number"
        ? value
        : num(value as Record<string, unknown>, ["cnt", "count", "total"]);
    if (count === null || count <= 0) return [];
    return [
      {
        id: key,
        title: `${descriptor.title} (${count})`,
        body: null,
        severity: descriptor.severity,
        group: descriptor.group,
        at: null,
        count,
      },
    ];
  });

  const resolved = items.length > 0 ? items.filter((item) => item.title.length > 0) : grouped;
  const countedTotal = grouped.reduce((sum, item) => sum + (item.count ?? 0), 0);

  return ok({
    items: resolved,
    unread: num(payload, ["unread", "unreadCount", "newCount"]),
    total:
      num(payload, ["total", "notificationCount"]) ??
      (grouped.length > 0 ? countedTotal : null),
    attention:
      num(payload, ["attention", "attentionCount", "criticalCount"]) ??
      (grouped.length > 0
        ? grouped
            .filter((item) => item.severity === "critical" || item.severity === "warn")
            .reduce((sum, item) => sum + (item.count ?? 0), 0)
        : null),
    meta: meta(payload),
  });
};

/** Counter keys the live function returns, mapped onto the render contract. */
const COUNTERS: Record<
  string,
  { title: string; severity: NotificationItem["severity"]; group: string }
> = {
  blockedTasks: { title: "Blocked tasks", severity: "critical", group: "projects" },
  overdueFollowUps: { title: "Overdue follow-ups", severity: "warn", group: "crm" },
  newEngagements: { title: "New engagements", severity: "info", group: "crm" },
  integrationFailures: { title: "Integration failures", severity: "critical", group: "integrations" },
};