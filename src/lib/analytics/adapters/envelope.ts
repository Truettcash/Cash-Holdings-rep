/**
 * Shared adapter primitives.
 *
 * The live modular RPCs return their own envelope; these helpers unwrap the
 * common shapes (`{ data, summary, meta }`, a bare object, or a bare array) and
 * resolve fields by candidate key so camelCase / snake_case naming variance in
 * the SQL layer cannot break a surface. Nothing here calculates: values are
 * read, coerced to a type, or preserved as `null`.
 */

export type AdapterOk<T> = { ok: true; model: T; reason: null };
export type AdapterFail = { ok: false; model: null; reason: string };
export type AdapterResult<T> = AdapterOk<T> | AdapterFail;

export const ok = <T>(model: T): AdapterOk<T> => ({ ok: true, model, reason: null });
export const fail = (reason: string): AdapterFail => ({ ok: false, model: null, reason });

export type Adapter<T> = (payload: unknown) => AdapterResult<T>;

export type Dict = Record<string, unknown>;

export function isObject(value: unknown): value is Dict {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Containers searched, in order, when resolving a field. */
const CONTAINERS = ["", "data", "result", "summary", "totals", "meta", "metadata", "payload"];

function variants(key: string): string[] {
  const snake = key.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
  const camel = key.replace(/_([a-z0-9])/g, (_m, c: string) => c.toUpperCase());
  return Array.from(new Set([key, snake, camel, key.toLowerCase()]));
}

/**
 * Reads the first present candidate key from the root or any known container.
 * Returns `undefined` when the payload does not carry the field at all, which
 * callers distinguish from an explicit `null` (an unsupported metric).
 */
export function field(root: unknown, candidates: string[]): unknown {
  if (!isObject(root)) return undefined;
  for (const container of CONTAINERS) {
    const scope = container ? root[container] : root;
    if (!isObject(scope)) continue;
    for (const candidate of candidates) {
      for (const key of variants(candidate)) {
        if (key in scope) return scope[key];
      }
    }
  }
  return undefined;
}

/** Number, or `null` when absent/unsupported/non-numeric. Never fabricates 0. */
export function num(root: unknown, candidates: string[]): number | null {
  const value = field(root, candidates);
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function str(root: unknown, candidates: string[]): string | null {
  const value = field(root, candidates);
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

export function bool(root: unknown, candidates: string[]): boolean | null {
  const value = field(root, candidates);
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

/** Array of records. Missing arrays default to `[]`; a bare array root is used as-is. */
export function rows(root: unknown, candidates: string[]): Dict[] {
  if (Array.isArray(root)) return root.filter(isObject);
  const value = field(root, candidates);
  if (Array.isArray(value)) return value.filter(isObject);
  return [];
}

/** Nested object. Missing objects default to `{}`. */
export function obj(root: unknown, candidates: string[]): Dict {
  const value = field(root, candidates);
  return isObject(value) ? value : {};
}

/** Row-level readers (same tolerance, scoped to a single record). */
export const rowNum = (row: Dict, candidates: string[]) => num(row, candidates);
export const rowStr = (row: Dict, candidates: string[]) => str(row, candidates);
export const rowBool = (row: Dict, candidates: string[]) => bool(row, candidates);

/** Rejects payloads that are not usable at all. */
export function requireEnvelope(payload: unknown, fn: string): AdapterFail | null {
  if (payload === null || payload === undefined) return fail(`${fn}: empty response`);
  if (Array.isArray(payload)) return null;
  if (!isObject(payload)) return fail(`${fn}: expected object or array, received ${typeof payload}`);
  return null;
}

/** Metadata every adapter surfaces, so a route can label the payload it rendered. */
export type AdapterMeta = {
  brandKey: string | null;
  recordCount: number | null;
  generatedAt: string | null;
  /** Metric keys the backend explicitly marked unsupported. */
  unsupported: string[];
};

export function meta(root: unknown): AdapterMeta {
  const flagged = field(root, ["unsupported", "unsupportedMetrics", "unsupported_fields"]);
  return {
    brandKey: str(root, ["brandKey", "brand_key", "brand"]),
    recordCount: num(root, ["recordCount", "record_count", "count", "total", "rowCount"]),
    generatedAt: str(root, ["generatedAt", "generated_at", "asOf", "as_of", "computedAt"]),
    unsupported: Array.isArray(flagged) ? flagged.filter((v): v is string => typeof v === "string") : [],
  };
}