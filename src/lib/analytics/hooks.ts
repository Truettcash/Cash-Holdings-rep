import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { analyticsKey, type AnalyticsScope } from "./keys";
import { loadAnalyticsModule, type AnalyticsFallback, type AnalyticsResult } from "./service";
import type { AnalyticsModule } from "./modules";

/** Perceived-speed tiers — summaries first, deep analytics last. */
const PRIORITY: Record<AnalyticsModule, number> = {
  "morning-brief": 0,
  "dashboard-summary": 0,
  "dashboard-notifications": 1,
  "dashboard-activity": 2,
  "dashboard-insights": 3,
  "crm-pipeline": 3,
  "crm-engagements": 3,
  "crm-qualification": 4,
  "projects-overview": 3,
  "projects-workload": 4,
  "projects-progress": 4,
  "brands-performance": 3,
  "brands-metrics": 4,
  "brands-health": 4,
};

/**
 * One analytics module, loaded independently. Keeps the previous response
 * visible during filter transitions so panels never flash empty.
 */
export function useAnalyticsModule<T>(
  module: AnalyticsModule,
  scope: AnalyticsScope = {},
  options?: {
    fallback?: AnalyticsFallback<T>;
    enabled?: boolean;
    staleTime?: number;
  },
) {
  const query = useQuery({
    queryKey: analyticsKey(module, scope),
    queryFn: () => loadAnalyticsModule<T>(module, scope, options?.fallback),
    enabled: options?.enabled ?? true,
    staleTime: options?.staleTime ?? (PRIORITY[module] <= 1 ? 15_000 : 60_000),
    placeholderData: (prev) => prev,
  } satisfies UseQueryOptions<AnalyticsResult<T>>);

  return {
    data: query.data?.data ?? null,
    source: query.data?.source ?? null,
    failure: query.data?.failure ?? null,
    isLoading: query.isPending,
    isFetching: query.isFetching,
    refetch: query.refetch,
  };
}