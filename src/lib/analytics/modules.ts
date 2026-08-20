/**
 * Module registry — the single mapping between application surfaces and the
 * modular analytics RPCs. No calculation lives here and none lives in the UI;
 * Supabase is the analytics source of truth.
 */
export const ANALYTICS_MODULES = {
  "morning-brief": "dashboard_morning_brief",
  "dashboard-summary": "dashboard_summary",
  "dashboard-activity": "dashboard_activity",
  "dashboard-notifications": "dashboard_notifications",
  "dashboard-insights": "dashboard_insights",
  "crm-pipeline": "crm_pipeline",
  "crm-engagements": "crm_engagements",
  "crm-qualification": "crm_qualification",
  "projects-overview": "projects_overview",
  "projects-workload": "projects_workload",
  "projects-progress": "projects_progress",
  "brands-performance": "brands_performance",
  "brands-metrics": "brands_metrics",
  "brands-health": "brands_health",
} as const;

export type AnalyticsModule = keyof typeof ANALYTICS_MODULES;

/** RPC argument names, kept in one place so signatures are never guessed twice. */
export type AnalyticsParams = {
  p_brand_key?: string | null;
  p_start_at?: string | null;
  p_end_at?: string | null;
  p_granularity?: string | null;
  p_limit?: number | null;
};

/**
 * Exact live signatures, resolved against the production Data API. PostgREST
 * matches functions by argument NAME SET, so sending an argument a function
 * does not declare fails with PGRST202. Never widen these by guesswork.
 */
export type AnalyticsArg = "p_brand_key" | "p_start_at" | "p_end_at" | "p_granularity" | "p_limit";

const RANGE: AnalyticsArg[] = ["p_start_at", "p_end_at"];
const BRAND_RANGE: AnalyticsArg[] = ["p_brand_key", ...RANGE];

export const ANALYTICS_SIGNATURES: Record<AnalyticsModule, AnalyticsArg[]> = {
  "morning-brief": BRAND_RANGE,
  "dashboard-summary": BRAND_RANGE,
  "dashboard-activity": [...BRAND_RANGE, "p_limit"],
  "dashboard-notifications": BRAND_RANGE,
  "dashboard-insights": BRAND_RANGE,
  "crm-pipeline": BRAND_RANGE,
  "crm-engagements": [...BRAND_RANGE, "p_limit"],
  "crm-qualification": BRAND_RANGE,
  "projects-overview": BRAND_RANGE,
  "projects-workload": BRAND_RANGE,
  "projects-progress": [...BRAND_RANGE, "p_granularity"],
  // brands_performance / brands_health take the period only — no brand argument.
  "brands-performance": RANGE,
  "brands-metrics": [...BRAND_RANGE, "p_granularity"],
  "brands-health": RANGE,
};