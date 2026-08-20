export const PROJECT_STATUSES = ["planning", "active", "on_hold", "completed", "archived"] as const;
export const TASK_STATUSES = ["todo", "in_progress", "blocked", "completed", "archived"] as const;
export const PRIORITIES = ["low", "medium", "high", "critical"] as const;
export const DEAL_STAGES = [
  "new",
  "qualified",
  "discovery_scheduled",
  "proposal_sent",
  "negotiation",
  "won",
  "lost",
  "nurture",
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];
export type Priority = (typeof PRIORITIES)[number];
export type DealStage = (typeof DEAL_STAGES)[number];
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const STAGE_LABEL: Record<DealStage, string> = {
  new: "New",
  qualified: "Qualified",
  discovery_scheduled: "Discovery",
  proposal_sent: "Proposal",
  negotiation: "Negotiation",
  won: "Won",
  lost: "Lost",
  nurture: "Nurture",
};

export const STATUS_LABEL: Record<string, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  blocked: "Blocked",
  completed: "Completed",
  archived: "Archived",
  planning: "Planning",
  active: "Active",
  on_hold: "On Hold",
};

export function titleCase(s: string | null | undefined) {
  if (!s) return "—";
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatNumber(n: number | null | undefined, opts: Intl.NumberFormatOptions = {}) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0, ...opts }).format(Number(n));
}

export function formatCurrency(n: number | null | undefined, currency = "USD") {
  if (n === null || n === undefined) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number(n));
}

export function formatDate(d: string | null | undefined) {
  if (!d) return "—";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function formatDateTime(d: string | null | undefined) {
  if (!d) return "—";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function relativeTime(d: string | null | undefined) {
  if (!d) return "—";
  const date = new Date(d).getTime();
  const diff = Date.now() - date;
  const m = 60_000;
  const h = 60 * m;
  const dd = 24 * h;
  if (diff < m) return "just now";
  if (diff < h) return `${Math.floor(diff / m)}m ago`;
  if (diff < dd) return `${Math.floor(diff / h)}h ago`;
  if (diff < 7 * dd) return `${Math.floor(diff / dd)}d ago`;
  return formatDate(d);
}
