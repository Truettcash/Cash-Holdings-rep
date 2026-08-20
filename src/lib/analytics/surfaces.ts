/**
 * Surface hooks — the only way a route reads analytics.
 *
 * Each hook returns the adapter model for its RPC plus the active source. When
 * `source` is `"rpc"` the module is fully cut over and the route must not run
 * its raw-table aggregation; any other source means the existing raw-table path
 * stays in charge for that module.
 */
import { useQuery } from "@tanstack/react-query";
import { analyticsKey, type AnalyticsScope } from "./keys";
import { loadAnalyticsSurface, type AnalyticsSource } from "./service";
import type { AnalyticsModule } from "./modules";
import type { AnalyticsModel } from "./adapters";
import { isDev } from "./client";

export type SurfaceState<M extends AnalyticsModule> = {
  model: AnalyticsModel<M> | null;
  source: AnalyticsSource | null;
  /** True once the live RPC payload mapped cleanly — the cutover condition. */
  live: boolean;
  malformed: string | null;
  failureKind: string | null;
  isLoading: boolean;
  isFetching: boolean;
  refetch: () => void;
  /** Dev-only diagnostic label; never rendered in production. */
  diagnostic: string | null;
};

export function useAnalyticsSurface<M extends AnalyticsModule>(
  module: M,
  scope: AnalyticsScope = {},
  options?: { enabled?: boolean; staleTime?: number },
): SurfaceState<M> {
  const query = useQuery({
    queryKey: analyticsKey(module, scope),
    queryFn: () => loadAnalyticsSurface(module, scope),
    enabled: options?.enabled ?? true,
    staleTime: options?.staleTime ?? 30_000,
    placeholderData: (prev) => prev,
  });

  const source = query.data?.source ?? null;
  const live = source === "rpc" && query.data?.data != null;

  return {
    model: (query.data?.data ?? null) as AnalyticsModel<M> | null,
    source,
    live,
    malformed: query.data?.malformed ?? null,
    failureKind: query.data?.failure?.kind ?? null,
    isLoading: query.isPending,
    isFetching: query.isFetching,
    refetch: () => void query.refetch(),
    diagnostic: isDev && source ? `${module} → ${source}` : null,
  };
}

/** Prefers the live RPC value and never fabricates one; `null` stays `null`. */
export function preferLive<T>(live: boolean, rpcValue: T | null | undefined, fallbackValue: T): T | null {
  if (!live) return fallbackValue;
  return rpcValue === undefined ? null : (rpcValue as T | null);
}