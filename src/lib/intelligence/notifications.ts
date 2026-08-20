import { PROVIDER_LABELS } from "@/lib/integrations/types";
import { brandLabel } from "@/lib/engagements/domain";
import { titleCase } from "@/lib/domain";
import { isOpenTask, isOverdue, ms, type IntelInput, type IntelLink } from "./types";

export const NOTIF_CATEGORIES = [
  "business",
  "operations",
  "integrations",
  "crm",
  "projects",
  "security",
] as const;
export type NotifCategory = (typeof NOTIF_CATEGORIES)[number];

export const NOTIF_PRIORITIES = ["critical", "high", "normal"] as const;
export type NotifPriority = (typeof NOTIF_PRIORITIES)[number];

export type DerivedNotification = {
  /** Stable, replayable key. State only — no payload is persisted. */
  key: string;
  category: NotifCategory;
  priority: NotifPriority;
  title: string;
  detail?: string;
  /** Source table the notification was derived from. */
  source: string;
  ts: string;
  link: IntelLink;
  actionLabel: string;
};

export const CATEGORY_LABELS: Record<NotifCategory, string> = {
  business: "Business",
  operations: "Operations",
  integrations: "Integrations",
  crm: "CRM",
  projects: "Projects",
  security: "Security",
};

/**
 * Derives the notification feed from real production rows.
 * Keys follow: engagement:<id>:new · engagement:<id>:booked · task:<id>:overdue ·
 * integration:<sync_run_id>:failed · project:<id>:status:<status> ·
 * contact:<id>:new · deal:<id>:stage:<stage>
 */
export function deriveNotifications(input: IntelInput, now = Date.now()): DerivedNotification[] {
  const out: DerivedNotification[] = [];
  const horizon = now - 30 * ms.day;
  const recent = (iso: string | null | undefined) =>
    Boolean(iso) && new Date(iso as string).getTime() >= horizon;

  const bookedIds = new Set(input.bookingEvents.map((e) => e.engagement_id));
  const bookedAt = new Map(input.bookingEvents.map((e) => [e.engagement_id, e.created_at]));

  // --- Business: new engagements + confirmed bookings ------------------------
  for (const e of input.engagements) {
    const who = e.company_name || e.contact_name || "New enquiry";
    if (recent(e.created_at)) {
      out.push({
        key: `engagement:${e.id}:new`,
        category: "business",
        priority: (e.qualification_score ?? 0) >= 80 ? "high" : "normal",
        title: `New engagement — ${who}`,
        detail: [brandLabel(e.brand_key), e.project_type ?? null, e.qualification_score != null ? `score ${e.qualification_score}` : null]
          .filter(Boolean)
          .join(" · "),
        source: "engagements",
        ts: e.created_at,
        link: { to: "/engagements", search: { id: e.id } },
        actionLabel: "Open engagement",
      });
    }
    const booking = bookedIds.has(e.id) ? bookedAt.get(e.id) ?? null : null;
    if (booking && recent(booking)) {
      out.push({
        key: `engagement:${e.id}:booked`,
        category: "business",
        priority: "high",
        title: `Discovery call booked — ${who}`,
        detail: brandLabel(e.brand_key),
        source: "engagement_events",
        ts: booking,
        link: { to: "/engagements", search: { id: e.id } },
        actionLabel: "Open engagement",
      });
    }
  }

  // --- Operations: overdue work --------------------------------------------
  const projectById = new Map(input.projects.map((p) => [p.id, p]));
  const brandById = new Map(input.brands.map((b) => [b.id, b]));
  for (const t of input.tasks) {
    if (!isOverdue(t, now)) continue;
    const project = projectById.get(t.project_id);
    const brand = project ? brandById.get(project.brand_id) : null;
    out.push({
      key: `task:${t.id}:overdue`,
      category: "operations",
      priority: t.priority === "critical" || t.status === "blocked" ? "critical" : "high",
      title: `Overdue — ${t.title}`,
      detail: [brand?.name, project?.name, t.status === "blocked" ? "blocked" : null]
        .filter(Boolean)
        .join(" · "),
      source: "project_tasks",
      ts: t.due_date as string,
      link: { to: "/tasks" },
      actionLabel: "Open tasks",
    });
  }

  // --- Integrations: failed syncs ------------------------------------------
  for (const run of input.syncRuns) {
    if (run.status !== "failed") continue;
    out.push({
      key: `integration:${run.id}:failed`,
      category: "integrations",
      priority: "critical",
      title: `${PROVIDER_LABELS[run.provider] ?? run.provider} sync failed`,
      detail: run.error_message ?? run.error_code ?? "No error detail recorded",
      source: "integration_sync_runs",
      ts: run.completed_at ?? run.started_at,
      link: { to: "/integrations" },
      actionLabel: "Open integrations",
    });
  }

  // --- Security: expiring or revoked credentials ---------------------------
  for (const acc of input.accounts) {
    if (acc.status === "revoked" || acc.status === "error") {
      out.push({
        key: `integration:${acc.id}:status:${acc.status}`,
        category: "security",
        priority: "critical",
        title: `${PROVIDER_LABELS[acc.provider] ?? acc.provider} access ${acc.status}`,
        detail: acc.last_error ?? "Reconnect required before the next sync.",
        source: "integration_accounts",
        ts: acc.updated_at,
        link: { to: "/integrations" },
        actionLabel: "Reconnect",
      });
    }
    const exp = acc.token_expires_at ? new Date(acc.token_expires_at).getTime() : null;
    if (exp && exp > now && exp - now < 7 * ms.day) {
      out.push({
        key: `integration:${acc.id}:token_expiring`,
        category: "security",
        priority: "high",
        title: `${PROVIDER_LABELS[acc.provider] ?? acc.provider} credentials expire soon`,
        detail: `Expires ${new Date(exp).toLocaleDateString()}`,
        source: "integration_accounts",
        ts: acc.updated_at,
        link: { to: "/integrations" },
        actionLabel: "Review access",
      });
    }
  }

  // --- Projects: status movement -------------------------------------------
  for (const p of input.projects) {
    if (!recent(p.created_at)) continue;
    out.push({
      key: `project:${p.id}:status:${p.status}`,
      category: "projects",
      priority: p.priority === "critical" ? "high" : "normal",
      title: `${p.name} — ${titleCase(p.status)}`,
      detail: brandById.get(p.brand_id)?.name ?? undefined,
      source: "projects",
      ts: p.created_at,
      link: { to: "/projects" },
      actionLabel: "Open project",
    });
  }

  // --- CRM: deals needing action + new deals -------------------------------
  for (const d of input.deals) {
    if (recent(d.created_at)) {
      out.push({
        key: `deal:${d.id}:stage:${d.stage}`,
        category: "crm",
        priority: d.stage === "won" ? "high" : "normal",
        title: `${d.name} — ${titleCase(d.stage)}`,
        detail: [d.brand_id ? brandById.get(d.brand_id)?.name : null, d.next_action]
          .filter(Boolean)
          .join(" · "),
        source: "deals",
        ts: d.created_at,
        link: { to: "/crm" },
        actionLabel: "Open deal",
      });
    }
    if (
      d.next_action_due &&
      d.stage !== "won" &&
      d.stage !== "lost" &&
      new Date(d.next_action_due).getTime() < now
    ) {
      out.push({
        key: `deal:${d.id}:next_action_overdue`,
        category: "crm",
        priority: "high",
        title: `Next action overdue — ${d.name}`,
        detail: d.next_action ?? undefined,
        source: "deals",
        ts: d.next_action_due,
        link: { to: "/crm" },
        actionLabel: "Open deal",
      });
    }
  }

  // Unassigned intake never sits silently.
  for (const e of input.engagements) {
    if (e.status || !recent(e.created_at)) continue;
    out.push({
      key: `engagement:${e.id}:unassigned`,
      category: "business",
      priority: "high",
      title: `Unassigned engagement — ${e.company_name || e.contact_name || "New enquiry"}`,
      detail: brandLabel(e.brand_key),
      source: "engagements",
      ts: e.created_at,
      link: { to: "/engagements", search: { id: e.id } },
      actionLabel: "Assign",
    });
  }

  const seen = new Set<string>();
  return out
    .filter((n) => (seen.has(n.key) ? false : (seen.add(n.key), true)))
    .sort((a, b) => (b.ts ?? "").localeCompare(a.ts ?? ""));
}

const openTaskCount = (input: IntelInput) => input.tasks.filter(isOpenTask).length;
export { openTaskCount };