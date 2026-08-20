/**
 * Live refresh map. Operational mutations call one of these after success so
 * the analytics modules affected by that event refresh — and nothing else does.
 */
import type { QueryClient } from "@tanstack/react-query";
import { analyticsKey } from "./keys";
import type { AnalyticsModule } from "./modules";

function invalidateModules(qc: QueryClient, modules: AnalyticsModule[]) {
  for (const m of modules) {
    // Prefix match — every brand / period / granularity variant of the module.
    qc.invalidateQueries({ queryKey: analyticsKey(m).slice(0, 2) });
  }
}

export const analyticsRefresh = {
  engagementCreated(qc: QueryClient) {
    invalidateModules(qc, [
      "dashboard-summary",
      "morning-brief",
      "dashboard-notifications",
      "dashboard-activity",
      "crm-engagements",
      "crm-qualification",
      "brands-performance",
    ]);
  },
  bookingConfirmed(qc: QueryClient) {
    invalidateModules(qc, [
      "dashboard-summary",
      "morning-brief",
      "dashboard-notifications",
      "crm-pipeline",
      "crm-engagements",
      "crm-qualification",
      "brands-performance",
    ]);
  },
  projectOrTaskChanged(qc: QueryClient) {
    invalidateModules(qc, [
      "projects-overview",
      "projects-workload",
      "projects-progress",
      "dashboard-summary",
      "dashboard-activity",
      "dashboard-notifications",
    ]);
  },
  integrationSynced(qc: QueryClient) {
    invalidateModules(qc, [
      "dashboard-notifications",
      "brands-metrics",
      "brands-health",
      "dashboard-summary",
    ]);
    qc.invalidateQueries({ queryKey: ["integration-status"] });
    qc.invalidateQueries({ queryKey: ["integration-accounts"] });
    qc.invalidateQueries({ queryKey: ["integration-sync-runs"] });
  },
};