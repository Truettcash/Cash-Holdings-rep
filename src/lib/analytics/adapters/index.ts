/**
 * Adapter registry — one typed adapter per modular RPC.
 *
 * Route components read adapter models only; no surface touches a raw RPC
 * field. An adapter that rejects a payload marks the module as malformed, and
 * the service falls back to the existing raw-table implementation.
 */
import type { AnalyticsModule } from "../modules";
import type { Adapter } from "./envelope";

import { adaptActivity } from "./activity";
import { adaptBrandsHealth } from "./brands-health";
import { adaptBrandsMetrics } from "./brands-metrics";
import { adaptBrandsPerformance } from "./brands-performance";
import { adaptCrmEngagements } from "./crm-engagements";
import { adaptCrmPipeline } from "./crm-pipeline";
import { adaptCrmQualification } from "./crm-qualification";
import { adaptDashboardSummary } from "./dashboard-summary";
import { adaptInsights } from "./insights";
import { adaptMorningBrief } from "./morning-brief";
import { adaptNotifications } from "./notifications";
import { adaptProjectsOverview } from "./projects-overview";
import { adaptProjectsProgress } from "./projects-progress";
import { adaptProjectsWorkload } from "./projects-workload";

export const ANALYTICS_ADAPTERS = {
  "morning-brief": adaptMorningBrief,
  "dashboard-summary": adaptDashboardSummary,
  "dashboard-activity": adaptActivity,
  "dashboard-notifications": adaptNotifications,
  "dashboard-insights": adaptInsights,
  "crm-pipeline": adaptCrmPipeline,
  "crm-engagements": adaptCrmEngagements,
  "crm-qualification": adaptCrmQualification,
  "projects-overview": adaptProjectsOverview,
  "projects-workload": adaptProjectsWorkload,
  "projects-progress": adaptProjectsProgress,
  "brands-performance": adaptBrandsPerformance,
  "brands-metrics": adaptBrandsMetrics,
  "brands-health": adaptBrandsHealth,
} as const satisfies Record<AnalyticsModule, Adapter<unknown>>;

/** Model type produced by the adapter registered for a module. */
export type AnalyticsModel<M extends AnalyticsModule> = Extract<
  ReturnType<(typeof ANALYTICS_ADAPTERS)[M]>,
  { ok: true }
>["model"];

export * from "./envelope";
export type { ActivityModel, ActivityItem } from "./activity";
export type { BrandsHealthModel, BrandHealthRow } from "./brands-health";
export type { BrandsMetricsModel, MetricSeries, MetricSeriesPoint } from "./brands-metrics";
export type { BrandsPerformanceModel, BrandPerformanceRow } from "./brands-performance";
export type { CrmEngagementsModel, EngagementSummary } from "./crm-engagements";
export type { CrmPipelineModel, PipelineStage } from "./crm-pipeline";
export type { CrmQualificationModel, QualificationBand } from "./crm-qualification";
export type { DashboardSummaryModel } from "./dashboard-summary";
export type { InsightsModel, InsightItem } from "./insights";
export type { MorningBriefModel, BriefLine } from "./morning-brief";
export type { NotificationsModel, NotificationItem } from "./notifications";
export type { ProjectsOverviewModel, ProjectSummary } from "./projects-overview";
export type { ProjectsProgressModel, ProgressPoint } from "./projects-progress";
export type { ProjectsWorkloadModel, WorkloadBucket } from "./projects-workload";