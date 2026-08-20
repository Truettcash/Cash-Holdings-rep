import { bookingStatusFromEvents, isQualified, qualificationTier } from "./domain";
import type { EngagementEventRow, EngagementListRow } from "./types";

export type EngagementMetrics = {
  total: number;
  newEngagements: number;
  scheduledReviews: number;
  qualified: number;
  conversion: number;
  avgScore: number | null;
  byBrand: { key: string; label: string; count: number }[];
  byProjectType: { key: string; count: number }[];
  trend: { date: string; count: number }[];
};

const NEW_STATUSES = ["new", "intake", "received", "submitted", "open"];

export function computeEngagementMetrics(
  engagements: EngagementListRow[],
  bookedIds: Set<string>,
  brandLabelFor: (key: string) => string,
  trendDays = 30
): EngagementMetrics {
  const total = engagements.length;
  const newEngagements = engagements.filter(
    (e) => !e.status || NEW_STATUSES.includes(e.status.toLowerCase())
  ).length;
  const scheduledReviews = engagements.filter((e) => bookedIds.has(e.id)).length;
  const qualified = engagements.filter(isQualified).length;
  const conversion = total > 0 ? scheduledReviews / total : 0;

  const scored = engagements
    .map((e) => e.qualification_score)
    .filter((s): s is number => s !== null && s !== undefined && !Number.isNaN(Number(s)))
    .map(Number);
  const avgScore = scored.length ? scored.reduce((a, b) => a + b, 0) / scored.length : null;

  const brandCounts = new Map<string, number>();
  const typeCounts = new Map<string, number>();
  for (const e of engagements) {
    brandCounts.set(e.brand_key, (brandCounts.get(e.brand_key) ?? 0) + 1);
    const t = e.project_type?.trim() || "Unspecified";
    typeCounts.set(t, (typeCounts.get(t) ?? 0) + 1);
  }

  const dayCounts = new Map<string, number>();
  for (const e of engagements) {
    const d = e.created_at.slice(0, 10);
    dayCounts.set(d, (dayCounts.get(d) ?? 0) + 1);
  }
  const trend: { date: string; count: number }[] = [];
  const today = new Date();
  for (let i = trendDays - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    trend.push({ date: key, count: dayCounts.get(key) ?? 0 });
  }

  return {
    total,
    newEngagements,
    scheduledReviews,
    qualified,
    conversion,
    avgScore,
    byBrand: [...brandCounts.entries()]
      .map(([key, count]) => ({ key, label: brandLabelFor(key), count }))
      .sort((a, b) => b.count - a.count),
    byProjectType: [...typeCounts.entries()]
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count),
    trend,
  };
}

export function tierBreakdown(engagements: EngagementListRow[]) {
  const counts = { priority: 0, qualified: 0, nurture: 0, unscored: 0 };
  for (const e of engagements) counts[qualificationTier(e.qualification_score)] += 1;
  return counts;
}

export function bookedIdSet(events: Pick<EngagementEventRow, "engagement_id">[]) {
  return new Set(events.map((e) => e.engagement_id));
}

export { bookingStatusFromEvents };