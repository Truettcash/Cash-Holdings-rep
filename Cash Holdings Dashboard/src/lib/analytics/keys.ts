/** Stable TanStack Query keys for every analytics module. */
export type AnalyticsScope = {
  brandKey?: string | null;
  startAt?: string | null;
  endAt?: string | null;
  granularity?: "day" | "week" | "month" | null;
  limit?: number | null;
};

export const analyticsKey = (module: string, scope: AnalyticsScope = {}) =>
  [
    "analytics",
    module,
    scope.brandKey ?? "all",
    scope.startAt ?? null,
    scope.endAt ?? null,
    scope.granularity ?? null,
    scope.limit ?? null,
  ] as const;

/** Root prefix — invalidating this refreshes every analytics module. */
export const ANALYTICS_ROOT = ["analytics"] as const;