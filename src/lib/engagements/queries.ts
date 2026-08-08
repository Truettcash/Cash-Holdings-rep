import { queryOptions } from "@tanstack/react-query";
import { cashHoldingsSupabase } from "@/integrations/cash-holdings/client";
import { SCHEDULED_STAGES, tierScoreRange } from "./domain";
import type { Database } from "@/integrations/cash-holdings/database.types";
import type {
  EngagementDetailRow,
  EngagementEventRow,
  EngagementFilters,
  EngagementListRow,
  QualificationTier,
} from "./types";

const TABLE_ENGAGEMENTS = "engagements";
const TABLE_EVENTS = "engagement_events";
type EngagementRelation = keyof Pick<
  Database["public"]["Tables"],
  typeof TABLE_ENGAGEMENTS | typeof TABLE_EVENTS
>;

/** Only the columns each interface needs — raw_submission stays out of list views. */
export const LIST_COLUMNS =
  "id,created_at,updated_at,brand_key,status,pipeline_stage,qualification_score,company_name,contact_name,email,phone,project_type,source,secondary_priority:raw_submission->>secondary_priority";

export const DETAIL_COLUMNS = `${LIST_COLUMNS},qualification_details,operational_brief_json,raw_submission`;

export const EVENT_COLUMNS = "id,engagement_id,event_type,created_at,source,metadata";

type QueryResult = { data: unknown; error: { message: string } | null };

async function rows<T>(builder: PromiseLike<QueryResult>): Promise<T[]> {
  const { data, error } = await builder;
  if (error) throw new Error(error.message);
  return (data ?? []) as T[];
}

async function single<T>(builder: PromiseLike<QueryResult>): Promise<T | null> {
  const { data, error } = await builder;
  if (error) throw new Error(error.message);
  return (data ?? null) as T | null;
}

const select = <Relation extends EngagementRelation>(relation: Relation, columns: string) =>
  cashHoldingsSupabase.from(relation).select(columns);

const selectEngagements = (columns: string) => select(TABLE_ENGAGEMENTS, columns);
type EngagementBuilder = ReturnType<typeof selectEngagements>;

export function engagementFilterKey(f: EngagementFilters = {}) {
  return {
    brand: f.brand ?? "all",
    from: f.from ?? null,
    to: f.to ?? null,
    status: f.status ?? null,
    pipelineStage: f.pipelineStage ?? null,
    tier: f.tier ?? null,
  };
}

function applyFilters(query: EngagementBuilder, f: EngagementFilters): EngagementBuilder {
  let q = query;
  if (f.brand && f.brand !== "all") q = q.eq("brand_key", f.brand);
  if (f.status) q = q.eq("status", f.status);
  if (f.pipelineStage) q = q.eq("pipeline_stage", f.pipelineStage);
  if (f.from) q = q.gte("created_at", `${f.from}T00:00:00.000Z`);
  if (f.to) q = q.lte("created_at", `${f.to}T23:59:59.999Z`);
  if (f.tier) {
    const range = tierScoreRange(f.tier);
    if (f.tier === "unscored") q = q.is("qualification_score", null);
    else {
      if (range.gte !== undefined) q = q.gte("qualification_score", range.gte);
      if (range.lt !== undefined) q = q.lt("qualification_score", range.lt);
    }
  }
  return q;
}

/** All engagements (optionally filtered by brand / date range / status / stage / tier). */
export function engagementsQuery(filters: EngagementFilters = {}) {
  return queryOptions({
    queryKey: ["engagements", "list", engagementFilterKey(filters)],
    queryFn: () =>
      rows<EngagementListRow>(
        applyFilters(select(TABLE_ENGAGEMENTS, LIST_COLUMNS), filters).order("created_at", {
          ascending: false,
        })
      ),
  });
}

/** Single engagement with full jsonb payloads. */
export function engagementQuery(id: string) {
  return queryOptions({
    queryKey: ["engagements", "detail", id],
    queryFn: () =>
      single<EngagementDetailRow>(
        select(TABLE_ENGAGEMENTS, DETAIL_COLUMNS).eq("id", id).maybeSingle()
      ),
    enabled: Boolean(id),
  });
}

/** Engagements for a single brand_key. */
export function engagementsByBrandQuery(brandKey: string) {
  return queryOptions({
    queryKey: ["engagements", "by-brand", brandKey],
    queryFn: () =>
      rows<EngagementListRow>(
        select(TABLE_ENGAGEMENTS, LIST_COLUMNS)
          .eq("brand_key", brandKey)
          .order("created_at", { ascending: false })
      ),
  });
}

export function engagementsByStatusQuery(status: string, filters: EngagementFilters = {}) {
  return queryOptions({
    queryKey: ["engagements", "by-status", status, engagementFilterKey(filters)],
    queryFn: () =>
      rows<EngagementListRow>(
        applyFilters(select(TABLE_ENGAGEMENTS, LIST_COLUMNS), filters)
          .eq("status", status)
          .order("created_at", { ascending: false })
      ),
  });
}

export function engagementsByStageQuery(stage: string, filters: EngagementFilters = {}) {
  return queryOptions({
    queryKey: ["engagements", "by-stage", stage, engagementFilterKey(filters)],
    queryFn: () =>
      rows<EngagementListRow>(
        applyFilters(select(TABLE_ENGAGEMENTS, LIST_COLUMNS), filters)
          .eq("pipeline_stage", stage)
          .order("created_at", { ascending: false })
      ),
  });
}

/** Most recent engagements (newest first). */
export function recentEngagementsQuery(limit = 10, filters: EngagementFilters = {}) {
  return queryOptions({
    queryKey: ["engagements", "recent", limit, engagementFilterKey(filters)],
    queryFn: () =>
      rows<EngagementListRow>(
        applyFilters(select(TABLE_ENGAGEMENTS, LIST_COLUMNS), filters)
          .order("created_at", { ascending: false })
          .limit(limit)
      ),
  });
}

/**
 * Scheduled engagements: rows sitting in a scheduled pipeline stage OR carrying a
 * booking_confirmed event in engagement_events (booking lives in history only).
 */
export function scheduledEngagementsQuery(filters: EngagementFilters = {}) {
  return queryOptions({
    queryKey: ["engagements", "scheduled", engagementFilterKey(filters)],
    queryFn: async () => {
      const bookingEvents = await rows<Pick<EngagementEventRow, "engagement_id">>(
        select(TABLE_EVENTS, "engagement_id").eq("event_type", "booking_confirmed")
      );
      const bookedIds = Array.from(new Set(bookingEvents.map((e) => e.engagement_id)));
      const stageList = `(${SCHEDULED_STAGES.join(",")})`;
      const clauses = [`pipeline_stage.in.${stageList}`];
      if (bookedIds.length) clauses.push(`id.in.(${bookedIds.join(",")})`);
      return rows<EngagementListRow>(
        applyFilters(select(TABLE_ENGAGEMENTS, LIST_COLUMNS), filters)
          .or(clauses.join(","))
          .order("created_at", { ascending: false })
      );
    },
  });
}

/** Engagements in a derived qualification tier. */
export function engagementsByTierQuery(tier: QualificationTier, filters: EngagementFilters = {}) {
  return engagementsQuery({ ...filters, tier });
}

/** Engagement history for one engagement. */
export function engagementEventsQuery(engagementId: string) {
  return queryOptions({
    queryKey: ["engagement-events", engagementId],
    queryFn: () =>
      rows<EngagementEventRow>(
        select(TABLE_EVENTS, EVENT_COLUMNS)
          .eq("engagement_id", engagementId)
          .order("created_at", { ascending: true })
      ),
  });
}

/** All booking_confirmed events — used to derive booking status in list views. */
export function bookingEventsQuery() {
  return queryOptions({
    queryKey: ["engagement-events", "booking-confirmed"],
    queryFn: () =>
      rows<Pick<EngagementEventRow, "engagement_id" | "created_at">>(
        select(TABLE_EVENTS, "engagement_id,created_at")
          .eq("event_type", "booking_confirmed")
          .order("created_at", { ascending: false })
      ),
  });
}

export type { QueryResult };