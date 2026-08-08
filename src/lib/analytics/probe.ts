/**
 * Owner-side verification. Calls every modular analytics RPC directly through the
 * single existing session/client and reports a safe result per function.
 * Diagnostics only — no calculation happens here and nothing is cached as app data.
 */
import { analyticsRpc, AnalyticsRpcError } from "./client";
import { ANALYTICS_MODULES, ANALYTICS_SIGNATURES, type AnalyticsModule } from "./modules";

export type ProbeRow = {
  module: AnalyticsModule;
  fn: string;
  args: string[];
  ok: boolean;
  /** PostgREST code, when the call failed. */
  code: string | null;
  kind: string | null;
  message: string | null;
  detail: string | null;
  hint: string | null;
  /** Root keys of the response — never values, so no payload is exposed. */
  rootKeys: string[];
  count: number | null;
  ms: number;
};

export type ProbeScope = { brandKey?: string | null; startAt: string; endAt: string };

function describe(data: unknown): { rootKeys: string[]; count: number | null } {
  if (Array.isArray(data)) return { rootKeys: ["<array>"], count: data.length };
  if (data && typeof data === "object") {
    const keys = Object.keys(data as Record<string, unknown>);
    return { rootKeys: keys, count: keys.length };
  }
  return { rootKeys: data === null ? ["<null>"] : [typeof data], count: null };
}

export async function probeAnalyticsModule(
  module: AnalyticsModule,
  scope: ProbeScope,
): Promise<ProbeRow> {
  const fn = ANALYTICS_MODULES[module];
  const allowed = ANALYTICS_SIGNATURES[module];
  const params: Record<string, unknown> = {};
  if (allowed.includes("p_brand_key")) params["p_brand_key"] = scope.brandKey ?? null;
  if (allowed.includes("p_start_at")) params["p_start_at"] = scope.startAt;
  if (allowed.includes("p_end_at")) params["p_end_at"] = scope.endAt;
  if (allowed.includes("p_granularity")) params["p_granularity"] = "day";
  if (allowed.includes("p_limit")) params["p_limit"] = 50;

  const started = Date.now();
  try {
    const data = await analyticsRpc(fn, params);
    const { rootKeys, count } = describe(data);
    return {
      module,
      fn,
      args: allowed,
      ok: true,
      code: null,
      kind: null,
      message: null,
      detail: null,
      hint: null,
      rootKeys,
      count,
      ms: Date.now() - started,
    };
  } catch (err) {
    const e =
      err instanceof AnalyticsRpcError
        ? err
        : new AnalyticsRpcError("unavailable", String(err), String(err));
    return {
      module,
      fn,
      args: allowed,
      ok: false,
      code: e.code,
      kind: e.kind,
      message: e.message,
      detail: e.detail,
      hint: e.hint,
      rootKeys: [],
      count: null,
      ms: Date.now() - started,
    };
  }
}

export async function probeAllAnalytics(scope: ProbeScope): Promise<ProbeRow[]> {
  const modules = Object.keys(ANALYTICS_MODULES) as AnalyticsModule[];
  return Promise.all(modules.map((m) => probeAnalyticsModule(m, scope)));
}

export const defaultProbeScope = (): ProbeScope => {
  const end = new Date();
  const start = new Date(end.getTime() - 30 * 86_400_000);
  return { brandKey: null, startAt: start.toISOString(), endAt: end.toISOString() };
};
