import type {
  BookingStatus,
  EngagementBrandKey,
  EngagementEventRow,
  EngagementListRow,
  Json,
  QualificationTier,
} from "./types";

export const ENGAGEMENT_BRANDS: Record<
  EngagementBrandKey,
  { key: EngagementBrandKey; label: string; short: string; briefLabel: string }
> = {
  "authority-systems": {
    key: "authority-systems",
    label: "Authority Systems",
    short: "AS",
    briefLabel: "Operational Brief",
  },
  "truett-cash": {
    key: "truett-cash",
    label: "Truett Cash",
    short: "TC",
    briefLabel: "Project Brief",
  },
};

export function brandLabel(brandKey: string | null | undefined) {
  if (!brandKey) return "Unassigned";
  return ENGAGEMENT_BRANDS[brandKey as EngagementBrandKey]?.label ?? brandKey;
}

/** Authority Systems → "Operational Brief"; Truett Cash → "Project Brief". */
export function briefLabel(brandKey: string | null | undefined) {
  if (!brandKey) return "Brief";
  return ENGAGEMENT_BRANDS[brandKey as EngagementBrandKey]?.briefLabel ?? "Brief";
}

/** Brief-generated event type that belongs to a brand. */
export function briefEventType(brandKey: string | null | undefined) {
  return brandKey === "truett-cash" ? "project_brief_generated" : "operational_brief_generated";
}

export const TIER_THRESHOLDS = { priority: 80, qualified: 60, nurture: 0 } as const;

export function qualificationTier(score: number | null | undefined): QualificationTier {
  if (score === null || score === undefined || Number.isNaN(Number(score))) return "unscored";
  const s = Number(score);
  if (s >= TIER_THRESHOLDS.priority) return "priority";
  if (s >= TIER_THRESHOLDS.qualified) return "qualified";
  return "nurture";
}

export function tierScoreRange(tier: QualificationTier): { gte?: number; lt?: number } {
  if (tier === "priority") return { gte: TIER_THRESHOLDS.priority };
  if (tier === "qualified") return { gte: TIER_THRESHOLDS.qualified, lt: TIER_THRESHOLDS.priority };
  if (tier === "nurture") return { gte: 0, lt: TIER_THRESHOLDS.qualified };
  return {};
}

export function isQualified(row: Pick<EngagementListRow, "qualification_score">) {
  const t = qualificationTier(row.qualification_score);
  return t === "priority" || t === "qualified";
}

/**
 * Booking status is derived from history (booking_confirmed events), never from
 * the engagement row — the intake schema has no booking column.
 */
export function bookingStatusFromEvents(events: EngagementEventRow[]): BookingStatus {
  return events.some((e) => e.event_type === "booking_confirmed") ? "confirmed" : "unbooked";
}

/** Stages that mean a review/call is on the calendar. */
export const SCHEDULED_STAGES = ["scheduled", "review_scheduled", "call_scheduled", "booked"];

export const EVENT_LABEL: Record<string, string> = {
  engagement_created: "Engagement created",
  qualification_completed: "Qualification completed",
  operational_brief_generated: "Operational brief generated",
  project_brief_generated: "Project brief generated",
  booking_confirmed: "Booking confirmed",
  status_changed: "Status changed",
  pipeline_stage_changed: "Pipeline stage changed",
  note_added: "Internal note added",
  next_action_set: "Next action set",
  follow_up_scheduled: "Follow-up scheduled",
  assignment_changed: "Assignment changed",
};

export function eventLabel(type: string) {
  return EVENT_LABEL[type] ?? type.replace(/_/g, " ");
}

/**
 * Chronological ordering + de-duplication of booking events so the timeline
 * never shows the same confirmed booking twice.
 */
export function timelineEvents(events: EngagementEventRow[]): EngagementEventRow[] {
  const sorted = [...events].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  let bookingSeen = false;
  return sorted.filter((e) => {
    if (e.event_type !== "booking_confirmed") return true;
    if (bookingSeen) return false;
    bookingSeen = true;
    return true;
  });
}

export function displayName(row: Pick<EngagementListRow, "company_name" | "contact_name" | "email">) {
  return row.company_name || row.contact_name || row.email || "Untitled engagement";
}

/** Safe reader for provider-defined jsonb values. */
export function jsonText(value: Json | undefined): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value.trim() ? value : null;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

export function jsonList(value: Json | undefined): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((v) => jsonText(v) ?? (typeof v === "object" ? JSON.stringify(v) : "")).filter(Boolean);
  }
  if (typeof value === "object") {
    return Object.entries(value)
      .map(([k, v]) => {
        const t = jsonText(v);
        return t ? `${k.replace(/_/g, " ")}: ${t}` : null;
      })
      .filter((x): x is string => Boolean(x));
  }
  const single = jsonText(value);
  return single ? [single] : [];
}

export function secondaryPriority(raw: { secondary_priority?: string | null; secondary_priorities?: Json } | null) {
  if (!raw) return null;
  const direct = jsonText(raw.secondary_priority ?? null);
  if (direct) return direct;
  const list = jsonList(raw.secondary_priorities);
  return list.length ? list.join(", ") : null;
}