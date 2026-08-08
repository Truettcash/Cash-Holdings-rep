/**
 * RPC-first analytics service.
 *
 * Every surface reads through here. When the modular `analytics` schema is
 * reachable, its response is used. When the RPC reports a schema-exposure,
 * permission or missing-function error, the module degrades to the existing
 * raw-table query that already ships in this app — isolated to this file so no
 * calculation is duplicated in a component.
 */
import { analyticsRpc, AnalyticsRpcError, isDev } from "./client";
import {
  ANALYTICS_MODULES,
  ANALYTICS_SIGNATURES,
  type AnalyticsModule,
  type AnalyticsParams,
} from "./modules";
import { ANALYTICS_ADAPTERS, type AnalyticsModel } from "./adapters";
import { describeShape, type PayloadShape } from "./shape";
import type { AnalyticsScope } from "./keys";

export type AnalyticsSource = "rpc" | "fallback" | "unsupported";

export type AnalyticsResult<T> = {
  data: T | null;
  source: AnalyticsSource;
  /** Present only when BOTH the RPC and the fallback failed. */
  failure: AnalyticsRpcError | null;
};

/** Optional raw-table fallback per module. */
export type AnalyticsFallback<T> = (scope: AnalyticsScope) => Promise<T>;

/**
 * Builds exactly the argument set the live function declares. PostgREST resolves
 * overloads by argument names, so extra keys 404 and missing keys change target.
 */
function toParams(module: AnalyticsModule, scope: AnalyticsScope): AnalyticsParams {
  const allowed = ANALYTICS_SIGNATURES[module];
  const p: AnalyticsParams = {};
  if (allowed.includes("p_brand_key")) p.p_brand_key = scope.brandKey ?? null;
  if (allowed.includes("p_start_at")) p.p_start_at = scope.startAt ?? null;
  if (allowed.includes("p_end_at")) p.p_end_at = scope.endAt ?? null;
  if (allowed.includes("p_granularity")) p.p_granularity = scope.granularity ?? "day";
  if (allowed.includes("p_limit")) p.p_limit = scope.limit ?? 50;
  return p;
}

/** Dev-only visibility into the active source per module. */
const sources = new Map<AnalyticsModule, AnalyticsSource>();
export const analyticsSources = () => Object.fromEntries(sources) as Record<string, AnalyticsSource>;
export const analyticsFallbacksInUse = () =>
  Array.from(sources.entries())
    .filter(([, s]) => s !== "rpc")
    .map(([m]) => m);

/** Structural fingerprints of the last successful RPC payload per module. */
const shapes = new Map<AnalyticsModule, PayloadShape>();
export const analyticsShapes = () => Object.fromEntries(shapes) as Record<string, PayloadShape>;

/** Modules whose live payload was rejected by its adapter. */
const malformed = new Map<AnalyticsModule, string>();
export const analyticsMalformed = () => Object.fromEntries(malformed) as Record<string, string>;

function record(module: AnalyticsModule, source: AnalyticsSource) {
  const previous = sources.get(module);
  sources.set(module, source);
  if (isDev && previous !== source) {
    // eslint-disable-next-line no-console
    console.info(`[analytics] ${module} → ${source}`);
  }
  if (isDev && typeof window !== "undefined") {
    (window as unknown as Record<string, unknown>)["__analyticsSources"] = analyticsSources();
    (window as unknown as Record<string, unknown>)["__analyticsShapes"] = analyticsShapes();
    (window as unknown as Record<string, unknown>)["__analyticsMalformed"] = analyticsMalformed();
  }
}

export type AnalyticsSurfaceResult<T> = AnalyticsResult<T> & {
  /** Adapter rejection reason, when the live payload could not be mapped. */
  malformed: string | null;
};

/**
 * Adapter-aware load. The RPC is used only when the call AND the adapter both
 * succeed; any other outcome degrades to the existing raw-table fallback. The
 * fallback never runs alongside a successful RPC.
 */
export async function loadAnalyticsSurface<M extends AnalyticsModule>(
  module: M,
  scope: AnalyticsScope = {},
  fallback?: AnalyticsFallback<AnalyticsModel<M>>,
): Promise<AnalyticsSurfaceResult<AnalyticsModel<M>>> {
  const fn = ANALYTICS_MODULES[module];
  const adapt = ANALYTICS_ADAPTERS[module] as (payload: unknown) => {
    ok: boolean;
    model: unknown;
    reason: string | null;
  };

  let failure: AnalyticsRpcError;
  let rejection: string | null = null;

  try {
    const payload = await analyticsRpc<unknown>(fn, toParams(module, scope));
    if (isDev) shapes.set(module, describeShape(payload));

    const result = adapt(payload);
    if (result.ok) {
      malformed.delete(module);
      record(module, "rpc");
      return {
        data: result.model as AnalyticsModel<M>,
        source: "rpc",
        failure: null,
        malformed: null,
      };
    }

    rejection = result.reason ?? `${fn}: payload rejected`;
    malformed.set(module, rejection);
    failure = new AnalyticsRpcError("runtime-error", "Analytics returned an unexpected payload.", rejection);
  } catch (err) {
    failure =
      err instanceof AnalyticsRpcError
        ? err
        : new AnalyticsRpcError("unavailable", "Analytics is temporarily unavailable.", String(err));
  }

  if (!fallback) {
    record(module, "unsupported");
    return { data: null, source: "unsupported", failure, malformed: rejection };
  }

  try {
    const data = await fallback(scope);
    record(module, "fallback");
    return { data, source: "fallback", failure: null, malformed: rejection };
  } catch {
    record(module, "unsupported");
    return { data: null, source: "unsupported", failure, malformed: rejection };
  }
}

export async function loadAnalyticsModule<T>(
  module: AnalyticsModule,
  scope: AnalyticsScope = {},
  fallback?: AnalyticsFallback<T>,
): Promise<AnalyticsResult<T>> {
  const fn = ANALYTICS_MODULES[module];
  try {
    const data = await analyticsRpc<T>(fn, toParams(module, scope));
    record(module, "rpc");
    // RPC succeeded — the raw-table aggregation is never executed for this module.
    return { data, source: "rpc", failure: null };
  } catch (err) {
    const failure =
      err instanceof AnalyticsRpcError
        ? err
        : new AnalyticsRpcError("unavailable", "Analytics is temporarily unavailable.", String(err));

    if (!fallback) {
      record(module, "unsupported");
      return { data: null, source: "unsupported", failure };
    }

    try {
      const data = await fallback(scope);
      record(module, "fallback");
      return { data, source: "fallback", failure: null };
    } catch {
      record(module, "unsupported");
      return { data: null, source: "fallback", failure };
    }
  }
}