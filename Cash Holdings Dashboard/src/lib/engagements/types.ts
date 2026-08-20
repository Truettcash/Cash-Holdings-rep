/**
 * Types for the shared Supabase intake pipeline.
 * Source tables (existing, never created/modified here):
 *   public.engagements        — current engagement state
 *   public.engagement_events  — engagement history
 */

export const ENGAGEMENT_BRAND_KEYS = ["authority-systems", "truett-cash"] as const;
export type EngagementBrandKey = (typeof ENGAGEMENT_BRAND_KEYS)[number];

export type BrandFilterValue = "all" | EngagementBrandKey;

export const ENGAGEMENT_EVENT_TYPES = [
  "engagement_created",
  "qualification_completed",
  "operational_brief_generated",
  "project_brief_generated",
  "booking_confirmed",
  "status_changed",
  "pipeline_stage_changed",
] as const;
export type EngagementEventType = (typeof ENGAGEMENT_EVENT_TYPES)[number];

export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
export type JsonObject = { [key: string]: Json };

/** Shape of engagements.qualification_details (jsonb, provider-defined). */
export type QualificationDetails = JsonObject & {
  tier?: string | null;
  score?: number | null;
  budget?: string | null;
  budget_range?: string | null;
  timeline?: string | null;
  urgency?: string | null;
  authority?: string | null;
  fit?: string | null;
  reasons?: Json;
  signals?: Json;
  notes?: string | null;
};

/** Shape of engagements.operational_brief_json (jsonb, provider-defined). */
export type OperationalBriefJson = JsonObject & {
  title?: string | null;
  summary?: string | null;
  overview?: string | null;
  objectives?: Json;
  highlights?: Json;
  priorities?: Json;
  recommendations?: Json;
  scope?: Json;
  risks?: Json;
  next_steps?: Json;
  commercial?: Json;
  commercial_context?: Json;
  system?: Json;
  project?: Json;
};

/** Shape of engagements.raw_submission (jsonb — original intake payload). */
export type RawSubmission = JsonObject & {
  brand_key?: string | null;
  company?: string | null;
  company_name?: string | null;
  contact_name?: string | null;
  email?: string | null;
  phone?: string | null;
  project_type?: string | null;
  secondary_priority?: string | null;
  secondary_priorities?: Json;
  budget?: string | null;
  budget_range?: string | null;
  timeline?: string | null;
  website?: string | null;
  role?: string | null;
  notes?: string | null;
  message?: string | null;
  booking?: Json;
  booking_status?: string | null;
  scheduled_at?: string | null;
};

/** Columns selected for list / table interfaces (no heavy jsonb). */
export type EngagementListRow = {
  id: string;
  created_at: string;
  updated_at: string | null;
  brand_key: string;
  status: string | null;
  pipeline_stage: string | null;
  qualification_score: number | null;
  company_name: string | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  project_type: string | null;
  source: string | null;
  /** Projected from raw_submission->>secondary_priority (no extra payload). */
  secondary_priority: string | null;
};

/** Columns selected for the detail interface (includes jsonb payloads). */
export type EngagementDetailRow = EngagementListRow & {
  qualification_details: QualificationDetails | null;
  operational_brief_json: OperationalBriefJson | null;
  raw_submission: RawSubmission | null;
};

export type EngagementEventRow = {
  id: string;
  engagement_id: string;
  event_type: string;
  created_at: string;
  source: string | null;
  metadata: EngagementEventMetadata | null;
};

export type EngagementEventMetadata = JsonObject & {
  from?: Json;
  to?: Json;
  note?: string | null;
  next_action?: string | null;
  follow_up_date?: string | null;
  assigned_to?: string | null;
  actor?: string | null;
  field?: string | null;
};

/** Derived qualification tier — engagements has no tier column. */
export const QUALIFICATION_TIERS = ["priority", "qualified", "nurture", "unscored"] as const;
export type QualificationTier = (typeof QUALIFICATION_TIERS)[number];

export type BookingStatus = "confirmed" | "unbooked";

export type EngagementFilters = {
  brand?: BrandFilterValue;
  /** inclusive ISO date (yyyy-mm-dd) */
  from?: string | null;
  to?: string | null;
  status?: string | null;
  pipelineStage?: string | null;
  tier?: QualificationTier | null;
  search?: string | null;
};