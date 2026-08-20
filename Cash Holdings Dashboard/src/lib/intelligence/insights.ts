import { brandLabel, isQualified } from "@/lib/engagements/domain";
import { PROVIDER_LABELS } from "@/lib/integrations/types";
import { formatCurrency } from "@/lib/domain";
import { isOpenTask, isOverdue, ms, within, type IntelInput, type IntelLink } from "./types";

export type InsightType =
  | "engagement_volume"
  | "qualification_trend"
  | "booking_conversion"
  | "pipeline_movement"
  | "project_throughput"
  | "overdue_work"
  | "integration_health"
  | "revenue"
  | "completion_rate";

/** Deterministic insight: every field is computed from real rows. */
export type Insight = {
  type: InsightType;
  title: string;
  /** Primary value for the current period. */
  value: number;
  /** Same measure for the preceding period, when comparable. */
  previous: number | null;
  /** Percentage-point / percentage change vs previous, null when incomparable. */
  change: number | null;
  unit: "count" | "percent" | "score" | "currency";
  /** Rows the value was computed from. */
  records: number;
  affectedBrands: string[];
  periodLabel: string;
  /** 1.0 = fully supported; below 1 = thin sample, shown as "low confidence". */
  confidence: number;
  supporting: string;
  recommendedAction: string;
  link: IntelLink;
};

export type NarratedInsight = Insight & {
  headline?: string;
  narrative?: string;
  narrated: boolean;
};

const pct = (n: number, d: number) => (d === 0 ? 0 : (n / d) * 100);
const changePct = (cur: number, prev: number) =>
  prev === 0 ? null : Number((((cur - prev) / prev) * 100).toFixed(1));

function confidenceFor(records: number) {
  if (records >= 10) return 1;
  if (records >= 4) return 0.7;
  if (records >= 1) return 0.4;
  return 0;
}

export function formatInsightValue(i: Insight) {
  if (i.unit === "percent") return `${i.value.toFixed(1)}%`;
  if (i.unit === "score") return i.value.toFixed(1);
  if (i.unit === "currency") return formatCurrency(i.value);
  return i.value.toLocaleString();
}

/**
 * Computes every insight from production rows over a rolling window.
 * Nothing is estimated; an insight is omitted when its supporting rows are absent.
 */
export function computeInsights(
  input: IntelInput,
  windowDays = 7,
  now = Date.now()
): Insight[] {
  const span = windowDays * ms.day;
  const curFrom = now - span;
  const prevFrom = now - 2 * span;
  const periodLabel = `last ${windowDays} days`;
  const out: Insight[] = [];

  const inCur = (iso: string | null | undefined) => within(iso, curFrom, now);
  const inPrev = (iso: string | null | undefined) =>
    Boolean(iso) &&
    new Date(iso as string).getTime() >= prevFrom &&
    new Date(iso as string).getTime() < curFrom;

  const curEng = input.engagements.filter((e) => inCur(e.created_at));
  const prevEng = input.engagements.filter((e) => inPrev(e.created_at));
  const brandsOf = (rows: { brand_key: string }[]) =>
    Array.from(new Set(rows.map((r) => brandLabel(r.brand_key))));

  // 1. Engagement volume
  if (curEng.length || prevEng.length) {
    out.push({
      type: "engagement_volume",
      title: "Engagement demand",
      value: curEng.length,
      previous: prevEng.length,
      change: changePct(curEng.length, prevEng.length),
      unit: "count",
      records: curEng.length + prevEng.length,
      affectedBrands: brandsOf(curEng),
      periodLabel,
      confidence: confidenceFor(curEng.length + prevEng.length),
      supporting: `${curEng.length} enquiries this period vs ${prevEng.length} in the prior period.`,
      recommendedAction:
        curEng.length >= prevEng.length
          ? "Keep intake response times short while volume holds."
          : "Review lead sources — inbound volume fell against the prior period.",
      link: { to: "/engagements" },
    });
  }

  // 2. Qualification trend (average score)
  const scored = curEng.filter((e) => e.qualification_score != null);
  const scoredPrev = prevEng.filter((e) => e.qualification_score != null);
  if (scored.length) {
    const avg = scored.reduce((s, e) => s + Number(e.qualification_score), 0) / scored.length;
    const avgPrev = scoredPrev.length
      ? scoredPrev.reduce((s, e) => s + Number(e.qualification_score), 0) / scoredPrev.length
      : null;
    out.push({
      type: "qualification_trend",
      title: "Average qualification score",
      value: Number(avg.toFixed(1)),
      previous: avgPrev === null ? null : Number(avgPrev.toFixed(1)),
      change: avgPrev === null ? null : changePct(avg, avgPrev),
      unit: "score",
      records: scored.length + scoredPrev.length,
      affectedBrands: brandsOf(scored),
      periodLabel,
      confidence: confidenceFor(scored.length),
      supporting: `${scored.length} scored enquiries this period${
        scoredPrev.length ? `, ${scoredPrev.length} in the prior period` : ""
      }.`,
      recommendedAction:
        avgPrev !== null && avg >= avgPrev
          ? "Lead quality is holding — prioritise fast follow-up on the top tier."
          : "Revisit intake questions; incoming lead quality slipped.",
      link: { to: "/analytics" },
    });
  }

  // 3. Qualification rate + booking conversion
  if (curEng.length) {
    const qualified = curEng.filter(isQualified).length;
    const qualifiedPrev = prevEng.filter(isQualified).length;
    const rate = pct(qualified, curEng.length);
    const ratePrev = prevEng.length ? pct(qualifiedPrev, prevEng.length) : null;
    out.push({
      type: "completion_rate",
      title: "Qualification rate",
      value: Number(rate.toFixed(1)),
      previous: ratePrev === null ? null : Number(ratePrev.toFixed(1)),
      change: ratePrev === null ? null : Number((rate - ratePrev).toFixed(1)),
      unit: "percent",
      records: curEng.length,
      affectedBrands: brandsOf(curEng),
      periodLabel,
      confidence: confidenceFor(curEng.length),
      supporting: `${qualified} of ${curEng.length} enquiries reached qualified or priority tier.`,
      recommendedAction:
        rate >= 50
          ? "Push qualified enquiries straight to a discovery booking."
          : "Tighten targeting — most enquiries are landing below the qualified threshold.",
      link: { to: "/engagements" },
    });

    const bookedIds = new Set(input.bookingEvents.map((b) => b.engagement_id));
    const bookedCur = curEng.filter((e) => bookedIds.has(e.id)).length;
    const bookedPrev = prevEng.filter((e) => bookedIds.has(e.id)).length;
    const conv = pct(bookedCur, curEng.length);
    const convPrev = prevEng.length ? pct(bookedPrev, prevEng.length) : null;
    out.push({
      type: "booking_conversion",
      title: "Discovery booking conversion",
      value: Number(conv.toFixed(1)),
      previous: convPrev === null ? null : Number(convPrev.toFixed(1)),
      change: convPrev === null ? null : Number((conv - convPrev).toFixed(1)),
      unit: "percent",
      records: curEng.length,
      affectedBrands: brandsOf(curEng),
      periodLabel,
      confidence: confidenceFor(curEng.length),
      supporting: `${bookedCur} of ${curEng.length} enquiries have a confirmed booking event.`,
      recommendedAction:
        bookedCur === 0
          ? "No enquiry converted to a call this period — send booking links to qualified leads."
          : "Hold the booking cadence; conversion is being recorded in history.",
      link: { to: "/engagements" },
    });
  }

  // 4. Pipeline movement
  const moves = input.engagementEvents.filter(
    (e) =>
      inCur(e.created_at) &&
      (e.event_type === "pipeline_stage_changed" || e.event_type === "status_changed")
  );
  const movesPrev = input.engagementEvents.filter(
    (e) =>
      inPrev(e.created_at) &&
      (e.event_type === "pipeline_stage_changed" || e.event_type === "status_changed")
  );
  if (moves.length || movesPrev.length) {
    out.push({
      type: "pipeline_movement",
      title: "Pipeline movement",
      value: moves.length,
      previous: movesPrev.length,
      change: changePct(moves.length, movesPrev.length),
      unit: "count",
      records: moves.length + movesPrev.length,
      affectedBrands: [],
      periodLabel,
      confidence: confidenceFor(moves.length + movesPrev.length),
      supporting: `${moves.length} stage or status changes recorded in engagement history.`,
      recommendedAction:
        moves.length === 0
          ? "Nothing moved this period — work the oldest open engagements first."
          : "Keep advancing stages so the pipeline reflects reality.",
      link: { to: "/engagements" },
    });
  }

  // 5. Project throughput + task execution
  const doneTasks = input.tasks.filter((t) => inCur(t.completed_at));
  const doneTasksPrev = input.tasks.filter((t) => inPrev(t.completed_at));
  if (doneTasks.length || doneTasksPrev.length) {
    const brandNames = new Set<string>();
    const projectById = new Map(input.projects.map((p) => [p.id, p]));
    const brandById = new Map(input.brands.map((b) => [b.id, b]));
    for (const t of doneTasks) {
      const p = projectById.get(t.project_id);
      const b = p ? brandById.get(p.brand_id) : null;
      if (b) brandNames.add(b.name);
    }
    out.push({
      type: "project_throughput",
      title: "Execution pace",
      value: doneTasks.length,
      previous: doneTasksPrev.length,
      change: changePct(doneTasks.length, doneTasksPrev.length),
      unit: "count",
      records: doneTasks.length + doneTasksPrev.length,
      affectedBrands: Array.from(brandNames),
      periodLabel,
      confidence: confidenceFor(doneTasks.length + doneTasksPrev.length),
      supporting: `${doneTasks.length} tasks closed this period vs ${doneTasksPrev.length} previously.`,
      recommendedAction:
        doneTasks.length >= doneTasksPrev.length
          ? "Throughput is stable — protect the current work-in-progress limit."
          : "Delivery slowed; clear blockers before taking on new scope.",
      link: { to: "/tasks" },
    });
  }

  // 6. Overdue work
  const open = input.tasks.filter(isOpenTask);
  const overdue = input.tasks.filter((t) => isOverdue(t, now));
  if (open.length) {
    const rate = pct(overdue.length, open.length);
    out.push({
      type: "overdue_work",
      title: "Overdue work",
      value: overdue.length,
      previous: null,
      change: null,
      unit: "count",
      records: open.length,
      affectedBrands: [],
      periodLabel: "current",
      confidence: 1,
      supporting: `${overdue.length} of ${open.length} open tasks are past their due date (${rate.toFixed(0)}%).`,
      recommendedAction:
        overdue.length === 0
          ? "Nothing is overdue — keep due dates on new work."
          : "Reschedule or close the overdue set before adding new tasks.",
      link: { to: "/tasks" },
    });
  }

  // 7. Integration health
  if (input.syncRuns.length) {
    const cur = input.syncRuns.filter((r) => inCur(r.completed_at ?? r.started_at));
    const base = cur.length ? cur : input.syncRuns;
    const failed = base.filter((r) => r.status === "failed");
    const rate = pct(base.length - failed.length, base.length);
    out.push({
      type: "integration_health",
      title: "Integration reliability",
      value: Number(rate.toFixed(1)),
      previous: null,
      change: null,
      unit: "percent",
      records: base.length,
      affectedBrands: Array.from(
        new Set(base.map((r) => PROVIDER_LABELS[r.provider] ?? r.provider))
      ),
      periodLabel: cur.length ? periodLabel : "all recorded runs",
      confidence: confidenceFor(base.length),
      supporting: `${base.length - failed.length} of ${base.length} sync runs succeeded.`,
      recommendedAction:
        failed.length === 0
          ? "All recorded syncs succeeded — no action needed."
          : `Reconnect or re-run the ${failed.length} failed sync${failed.length === 1 ? "" : "s"}.`,
      link: { to: "/integrations" },
    });
  }

  // 8. Revenue (won deals) + open pipeline
  const wonAll = input.deals.filter((d) => d.stage === "won");
  const wonCur = wonAll.filter((d) => inCur(d.created_at));
  const wonPrev = wonAll.filter((d) => inPrev(d.created_at));
  const sum = (rows: typeof wonAll) => rows.reduce((s, d) => s + Number(d.value ?? 0), 0);
  if (wonAll.length) {
    const curValue = sum(wonCur);
    const prevValue = sum(wonPrev);
    out.push({
      type: "revenue",
      title: "Closed revenue",
      value: curValue || sum(wonAll),
      previous: prevValue || null,
      change: prevValue ? changePct(curValue, prevValue) : null,
      unit: "currency",
      records: wonCur.length || wonAll.length,
      affectedBrands: [],
      periodLabel: wonCur.length ? periodLabel : "all won deals",
      confidence: confidenceFor(wonCur.length || wonAll.length),
      supporting: wonCur.length
        ? `${wonCur.length} deal${wonCur.length === 1 ? "" : "s"} closed this period.`
        : `${wonAll.length} won deal${wonAll.length === 1 ? "" : "s"} recorded in total; none closed this period.`,
      recommendedAction: wonCur.length
        ? "Convert closed work into a delivery project immediately."
        : "No revenue closed this period — advance the deals with an overdue next action.",
      link: { to: "/crm" },
    });
  }

  return out.filter((i) => i.confidence > 0);
}

/** Deterministic fallback narrative — used whenever AI wording is unavailable. */
export function deterministicNarrative(i: Insight) {
  const dir =
    i.change === null ? "" : i.change > 0 ? ` up ${Math.abs(i.change)}%` : i.change < 0 ? ` down ${Math.abs(i.change)}%` : " flat";
  return `${i.title}: ${formatInsightValue(i)}${dir} over the ${i.periodLabel}. ${i.supporting}`;
}