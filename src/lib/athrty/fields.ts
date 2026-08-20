/**
 * Tolerant field access for the ATHRTY Outbound surface.
 *
 * The normalized rows and the SharePoint `source_payload` use different naming
 * conventions ("Account ID", "account_id", "accountId"). Rather than hardcode
 * one spelling, every read goes through a normalized-key lookup so the UI
 * displays whatever the live production row actually contains.
 */

export type Row = Record<string, unknown>;

const norm = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Index a row by normalized key once, then look aliases up cheaply. */
function indexed(row: Row | null | undefined): Map<string, unknown> {
  const map = new Map<string, unknown>();
  if (!row) return map;
  for (const [k, v] of Object.entries(row)) map.set(norm(k), v);
  return map;
}

const cache = new WeakMap<object, Map<string, unknown>>();

function keyed(row: Row | null | undefined): Map<string, unknown> {
  if (!row || typeof row !== "object") return new Map();
  const hit = cache.get(row as object);
  if (hit) return hit;
  const built = indexed(row);
  cache.set(row as object, built);
  return built;
}

const empty = (v: unknown) =>
  v === null || v === undefined || (typeof v === "string" && v.trim() === "");

/** First non-empty value across the given rows for any of the aliases. */
export function pick(rows: (Row | null | undefined)[], aliases: string[]): unknown {
  for (const row of rows) {
    const map = keyed(row);
    for (const alias of aliases) {
      const v = map.get(norm(alias));
      if (!empty(v)) return v;
    }
  }
  return null;
}

export function str(rows: (Row | null | undefined)[], aliases: string[]): string | null {
  const v = pick(rows, aliases);
  if (empty(v)) return null;
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return null;
}

export function num(rows: (Row | null | undefined)[], aliases: string[]): number | null {
  const v = pick(rows, aliases);
  if (empty(v)) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const parsed = Number(v.replace(/[$,%\s,]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function bool(rows: (Row | null | undefined)[], aliases: string[]): boolean | null {
  const v = pick(rows, aliases);
  if (empty(v)) return null;
  if (typeof v === "boolean") return v;
  const s = String(v).trim().toLowerCase();
  if (["true", "yes", "y", "1", "confirmed"].includes(s)) return true;
  if (["false", "no", "n", "0"].includes(s)) return false;
  return null;
}

/** ISO date string when parseable, else null. Never throws on source junk. */
export function date(rows: (Row | null | undefined)[], aliases: string[]): string | null {
  const v = pick(rows, aliases);
  if (empty(v)) return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Nested object under a payload, tolerant of naming. */
export function obj(rows: (Row | null | undefined)[], aliases: string[]): Row | null {
  const v = pick(rows, aliases);
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Row) : null;
}

export function urls(rows: (Row | null | undefined)[], aliases: string[]): string[] {
  const out = new Set<string>();
  for (const row of rows) {
    const map = keyed(row);
    for (const alias of aliases) {
      const v = map.get(norm(alias));
      if (typeof v === "string" && /^https?:\/\//i.test(v.trim())) out.add(v.trim());
      if (Array.isArray(v))
        for (const item of v)
          if (typeof item === "string" && /^https?:\/\//i.test(item.trim())) out.add(item.trim());
    }
  }
  return [...out];
}