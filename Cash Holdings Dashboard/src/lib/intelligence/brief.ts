import { PROVIDER_LABELS } from "@/lib/integrations/types";
import { brandLabel, isQualified } from "@/lib/engagements/domain";
import { formatCurrency, titleCase } from "@/lib/domain";
import { isOpenTask, isOverdue, ms, within, type IntelInput, type IntelLink } from "./types";

export type BriefLine = {
  key: string;
  text: string;
  ts?: string;
  link?: IntelLink;
};

export type BriefSection = {
  id: "new" | "progress" | "attention" | "wins";
  label: string;
  tone: "neutral" | "teal" | "warn" | "success";
  lines: BriefLine[];
};

export type MorningBrief = {
  since: number;
  windowLabel: string;
  sections: BriefSection[];
  total: number;
  attentionCount: number;
  openWork: number;
};

function windowLabel(since: number, now: number) {
  const hours = Math.max(1, Math.round((now - since) / ms.hour));
  if (hours <= 26) return "Since yesterday";
  const days = Math.round(hours / 24);
  return `Last ${days} days`;
}

/** Every line is backed by real rows; empty sections are dropped by the UI. */
export function buildMorningBrief(
  input: IntelInput,
  since: number,
  now = Date.now()
): MorningBrief {
  const brandById = new Map(input.brands.map((b) => [b.id, b]));
  const projectById = new Map(input.projects.map((p) => [p.id, p]));

  const New: BriefLine[] = [];
  const Progress: BriefLine[] = [];
  const Attention: BriefLine[] = [];
  const Wins: BriefLine[] = [];

  // ---- New -----------------------------------------------------------------
  const newEngagements = input.engagements.filter((e) => within(e.created_at, since, now));
  if (newEngagements.length) {
    New.push({
      key: "new-engagements",
      text: `+${newEngagements.length} new engagement${newEngagements.length === 1 ? "" : "s"}`,
      link: { to: "/engagements" },
    });
    for (const e of newEngagements.slice(0, 3)) {
      New.push({
        key: `new-engagement-${e.id}`,
        text: `${e.company_name || e.contact_name || "New enquiry"} · ${brandLabel(e.brand_key)}${
          e.qualification_score != null ? ` · scored ${e.qualification_score}` : ""
        }`,
        ts: e.created_at,
        link: { to: "/engagements", search: { id: e.id } },
      });
    }
  }

  const newBookings = input.bookingEvents.filter((b) => within(b.created_at, since, now));
  if (newBookings.length) {
    New.push({
      key: "new-bookings",
      text: `+${newBookings.length} discovery call${newBookings.length === 1 ? "" : "s"} booked`,
      link: { to: "/engagements" },
    });
  }

  const newProjects = input.projects.filter((p) => within(p.created_at, since, now));
  for (const p of newProjects.slice(0, 3)) {
    New.push({
      key: `new-project-${p.id}`,
      text: `New project — ${p.name}${brandById.get(p.brand_id) ? ` · ${brandById.get(p.brand_id)!.name}` : ""}`,
      ts: p.created_at,
      link: { to: "/projects" },
    });
  }

  const newDeals = input.deals.filter((d) => within(d.created_at, since, now));
  for (const d of newDeals.slice(0, 3)) {
    New.push({
      key: `new-deal-${d.id}`,
      text: `New deal — ${d.name}${d.value ? ` · ${formatCurrency(Number(d.value))}` : ""}`,
      ts: d.created_at,
      link: { to: "/crm" },
    });
  }

  // ---- Progress ------------------------------------------------------------
  const completedTasks = input.tasks.filter((t) => within(t.completed_at, since, now));
  if (completedTasks.length) {
    Progress.push({
      key: "tasks-completed",
      text: `${completedTasks.length} task${completedTasks.length === 1 ? "" : "s"} completed`,
      link: { to: "/tasks" },
    });
  }

  const movedEngagements = input.engagementEvents.filter(
    (e) =>
      within(e.created_at, since, now) &&
      (e.event_type === "pipeline_stage_changed" || e.event_type === "status_changed")
  );
  if (movedEngagements.length) {
    Progress.push({
      key: "pipeline-movement",
      text: `${movedEngagements.length} pipeline movement${movedEngagements.length === 1 ? "" : "s"} recorded`,
      link: { to: "/engagements" },
    });
  }

  const briefsGenerated = input.engagementEvents.filter(
    (e) =>
      within(e.created_at, since, now) &&
      (e.event_type === "operational_brief_generated" || e.event_type === "project_brief_generated")
  );
  if (briefsGenerated.length) {
    Progress.push({
      key: "briefs-generated",
      text: `${briefsGenerated.length} brief${briefsGenerated.length === 1 ? "" : "s"} generated`,
      link: { to: "/engagements" },
    });
  }

  // Per-brand average qualification for engagements inside the window.
  const byBrand = new Map<string, number[]>();
  for (const e of newEngagements) {
    if (e.qualification_score == null) continue;
    const list = byBrand.get(e.brand_key) ?? [];
    list.push(Number(e.qualification_score));
    byBrand.set(e.brand_key, list);
  }
  for (const [key, scores] of byBrand) {
    const avg = scores.reduce((s, v) => s + v, 0) / scores.length;
    Progress.push({
      key: `avg-score-${key}`,
      text: `${brandLabel(key)} averaged ${avg.toFixed(0)} qualification across ${scores.length} enquir${
        scores.length === 1 ? "y" : "ies"
      }`,
      link: { to: "/analytics" },
    });
  }

  const succeededSyncs = input.syncRuns.filter(
    (r) => r.status === "succeeded" && within(r.completed_at ?? r.started_at, since, now)
  );
  for (const run of succeededSyncs.slice(0, 3)) {
    Progress.push({
      key: `sync-${run.id}`,
      text: `${PROVIDER_LABELS[run.provider] ?? run.provider} sync completed${
        run.records_written ? ` · ${run.records_written.toLocaleString()} records written` : ""
      }`,
      ts: run.completed_at ?? run.started_at,
      link: { to: "/integrations" },
    });
  }

  // ---- Attention -----------------------------------------------------------
  const overdue = input.tasks.filter((t) => isOverdue(t, now));
  const overdueByBrand = new Map<string, number>();
  for (const t of overdue) {
    const project = projectById.get(t.project_id);
    const name = project ? brandById.get(project.brand_id)?.name ?? "Unassigned" : "Unassigned";
    overdueByBrand.set(name, (overdueByBrand.get(name) ?? 0) + 1);
  }
  for (const [name, count] of overdueByBrand) {
    Attention.push({
      key: `overdue-${name}`,
      text: `${name} has ${count} overdue task${count === 1 ? "" : "s"}`,
      link: { to: "/tasks" },
    });
  }

  const blocked = input.tasks.filter((t) => t.status === "blocked");
  if (blocked.length) {
    Attention.push({
      key: "blocked",
      text: `${blocked.length} task${blocked.length === 1 ? " is" : "s are"} blocked`,
      link: { to: "/tasks" },
    });
  }

  const failedSyncs = input.syncRuns.filter((r) => r.status === "failed");
  if (failedSyncs.length) {
    Attention.push({
      key: "sync-failed",
      text: `${failedSyncs.length === 1 ? "One integration requires" : `${failedSyncs.length} integrations require`} attention`,
      link: { to: "/integrations" },
    });
  }

  const unassigned = input.engagements.filter((e) => !e.status);
  if (unassigned.length) {
    Attention.push({
      key: "unassigned",
      text: `${unassigned.length} engagement${unassigned.length === 1 ? "" : "s"} still unassigned`,
      link: { to: "/engagements" },
    });
  }

  const staleDeals = input.deals.filter(
    (d) =>
      d.next_action_due &&
      d.stage !== "won" &&
      d.stage !== "lost" &&
      new Date(d.next_action_due).getTime() < now
  );
  if (staleDeals.length) {
    Attention.push({
      key: "stale-deals",
      text: `${staleDeals.length} deal${staleDeals.length === 1 ? "" : "s"} past the planned next action`,
      link: { to: "/crm" },
    });
  }

  const silentProjects = input.projects.filter((p) => {
    if (p.status !== "active") return false;
    const tasks = input.tasks.filter((t) => t.project_id === p.id);
    if (!tasks.length) return true;
    const latest = tasks
      .map((t) => new Date(t.completed_at ?? t.created_at).getTime())
      .sort((a, b) => b - a)[0];
    return now - latest > 14 * ms.day;
  });
  if (silentProjects.length) {
    Attention.push({
      key: "silent-projects",
      text: `${silentProjects.length} active project${silentProjects.length === 1 ? " has" : "s have"} had no task movement in two weeks`,
      link: { to: "/projects" },
    });
  }

  // ---- Wins ----------------------------------------------------------------
  const completedProjects = input.projects.filter((p) => p.status === "completed");
  const recentlyCompletedProjects = completedProjects.filter((p) => {
    const tasks = input.tasks.filter((t) => t.project_id === p.id && t.completed_at);
    return tasks.some((t) => within(t.completed_at, since, now));
  });
  for (const p of recentlyCompletedProjects.slice(0, 3)) {
    Wins.push({
      key: `won-project-${p.id}`,
      text: `${brandById.get(p.brand_id)?.name ?? "Portfolio"} completed ${p.name}`,
      link: { to: "/projects" },
    });
  }

  if (newBookings.length) {
    Wins.push({
      key: "wins-bookings",
      text: `${newBookings.length} discovery call${newBookings.length === 1 ? "" : "s"} on the calendar`,
      link: { to: "/engagements" },
    });
  }

  const wonDeals = input.deals.filter((d) => d.stage === "won" && within(d.created_at, since, now));
  const wonValue = wonDeals.reduce((s, d) => s + Number(d.value ?? 0), 0);
  if (wonDeals.length) {
    Wins.push({
      key: "wins-deals",
      text: `${wonDeals.length} deal${wonDeals.length === 1 ? "" : "s"} won${
        wonValue ? ` · ${formatCurrency(wonValue)}` : ""
      }`,
      link: { to: "/crm" },
    });
  }

  const topScored = [...newEngagements]
    .filter((e) => e.qualification_score != null && isQualified(e))
    .sort((a, b) => Number(b.qualification_score) - Number(a.qualification_score))[0];
  if (topScored) {
    Wins.push({
      key: `wins-top-${topScored.id}`,
      text: `Highest qualification: ${topScored.company_name || topScored.contact_name || "enquiry"} at ${topScored.qualification_score}`,
      link: { to: "/engagements", search: { id: topScored.id } },
    });
  }

  const newActivities = input.activities.filter((a) => within(a.activity_at, since, now));
  for (const a of newActivities.slice(0, 2)) {
    Progress.push({
      key: `activity-${a.id}`,
      text: `${titleCase(a.activity_type)} logged — ${a.subject}`,
      ts: a.activity_at,
      link: { to: "/crm" },
    });
  }

  const allSections: BriefSection[] = [
    { id: "new", label: "New", tone: "teal", lines: New },
    { id: "progress", label: "Progress", tone: "neutral", lines: Progress },
    { id: "attention", label: "Attention required", tone: "warn", lines: Attention },
    { id: "wins", label: "Wins", tone: "success", lines: Wins },
  ];
  const sections = allSections.filter((s) => s.lines.length > 0);

  return {
    since,
    windowLabel: windowLabel(since, now),
    sections,
    total: sections.reduce((s, sec) => s + sec.lines.length, 0),
    attentionCount: Attention.length,
    openWork: input.tasks.filter(isOpenTask).length,
  };
}