import { cashHoldingsSupabase } from "@/integrations/cash-holdings/client";
import { num, str, type Row } from "./fields";
import { ATHRTY_CONNECTION_ID } from "./queries";

const DRYRUN_FN = "m365-sync-sharepoint-dryrun";
const SYNC_FN = "m365-sync-sharepoint";

export type PreviewResult = {
  recordsRead: number | null;
  newCount: number | null;
  changed: number | null;
  unchanged: number | null;
  invalid: number | null;
  ambiguous: number | null;
  duplicates: number | null;
  organizationsProposed: number | null;
  contactsProposed: number | null;
  engagementsProposed: number | null;
  errors: string[];
  raw: Row;
};

export type SyncResult = {
  ok: boolean;
  recordsRead: number | null;
  sourceInserted: number | null;
  sourceUpdated: number | null;
  sourceUnchanged: number | null;
  orgsInserted: number | null;
  orgsUpdated: number | null;
  orgsReused: number | null;
  contactsInserted: number | null;
  contactsUpdated: number | null;
  contactsReused: number | null;
  contactsSkipped: number | null;
  engagementsInserted: number | null;
  engagementsUpdated: number | null;
  engagementsReused: number | null;
  durationMs: number | null;
  raw: Row;
};

/** Strip anything infrastructure-shaped before a payload can reach the UI. */
const SENSITIVE = /(token|secret|key|credential|password|authorization|bearer|service_role)/i;

function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 6) return null;
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => sanitize(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Row = {};
    for (const [k, v] of Object.entries(value as Row)) {
      if (SENSITIVE.test(k)) continue;
      out[k] = sanitize(v, depth + 1);
    }
    return out;
  }
  return value;
}

async function invoke(fn: string): Promise<Row> {
  const { data: sessionData } = await cashHoldingsSupabase.auth.getSession();
  if (!sessionData.session) throw new Error("Session expired — sign in again to continue.");
  const { data, error } = await cashHoldingsSupabase.functions.invoke(fn, {
    body: { integration_connection_id: ATHRTY_CONNECTION_ID },
  });
  if (error) throw new Error(error.message || `${fn} failed`);
  return (sanitize(data) as Row) ?? {};
}

function block(raw: Row, aliases: string[]): Row | null {
  for (const a of aliases) {
    const v = raw[a];
    if (v && typeof v === "object" && !Array.isArray(v)) return v as Row;
  }
  return null;
}

function collectErrors(raw: Row): string[] {
  const out: string[] = [];
  const push = (v: unknown) => {
    if (typeof v === "string" && v.trim()) out.push(v.trim());
    if (Array.isArray(v))
      for (const i of v) {
        if (typeof i === "string" && i.trim()) out.push(i.trim());
        else if (i && typeof i === "object") {
          const m = str([i as Row], ["message", "error", "reason", "detail"]);
          if (m) out.push(m);
        }
      }
  };
  push(raw["errors"]);
  push(raw["error"]);
  push(raw["warnings"]);
  return [...new Set(out)].slice(0, 20);
}

export async function previewChanges(): Promise<PreviewResult> {
  const raw = await invoke(DRYRUN_FN);
  const result = block(raw, ["result", "results", "summary", "counts", "data"]) ?? raw;
  const counts = block(result, ["counts", "summary", "totals"]) ?? result;
  const proposed = block(result, ["proposed", "proposals", "writes", "plan"]) ?? result;
  const scope = [counts, result, raw];

  return {
    recordsRead: num(scope, ["records_read", "recordsRead", "read", "source_rows", "rows_read"]),
    newCount: num(scope, ["new", "new_count", "inserts", "to_insert", "created"]),
    changed: num(scope, ["changed", "updated", "to_update", "updates"]),
    unchanged: num(scope, ["unchanged", "same", "no_change"]),
    invalid: num(scope, ["invalid", "invalid_count", "errors_count", "rejected"]),
    ambiguous: num(scope, ["ambiguous", "ambiguous_count", "conflicts"]),
    duplicates: num(scope, ["duplicates", "duplicate_identities", "duplicate_count"]),
    organizationsProposed: num(
      [proposed, counts, result, raw],
      ["organizations", "organizations_proposed", "orgs", "organization_count"],
    ),
    contactsProposed: num(
      [proposed, counts, result, raw],
      ["contacts", "contacts_proposed", "contact_count"],
    ),
    engagementsProposed: num(
      [proposed, counts, result, raw],
      ["engagements", "engagements_proposed", "engagement_count"],
    ),
    errors: collectErrors(raw),
    raw,
  };
}

export async function runSync(): Promise<SyncResult> {
  const started = performance.now();
  const raw = await invoke(SYNC_FN);
  const result = block(raw, ["result", "results", "summary", "counts", "data"]) ?? raw;
  const source = block(result, ["source_records", "sourceRecords", "source"]) ?? result;
  const orgs = block(result, ["organizations", "orgs"]) ?? result;
  const contacts = block(result, ["contacts"]) ?? result;
  const engagements = block(result, ["engagements"]) ?? result;
  const scope = [result, raw];

  const ok =
    raw["ok"] === true ||
    raw["success"] === true ||
    result["ok"] === true ||
    result["success"] === true ||
    (String(str(scope, ["status", "state"]) ?? "").toLowerCase().includes("succe") &&
      collectErrors(raw).length === 0) ||
    collectErrors(raw).length === 0;

  return {
    ok,
    recordsRead: num(scope, ["records_read", "recordsRead", "rows_read", "read"]),
    sourceInserted: num([source, ...scope], ["inserted", "source_inserted", "insert_count"]),
    sourceUpdated: num([source, ...scope], ["updated", "source_updated", "update_count"]),
    sourceUnchanged: num([source, ...scope], ["unchanged", "source_unchanged"]),
    orgsInserted: num([orgs], ["inserted", "organizations_inserted"]),
    orgsUpdated: num([orgs], ["updated", "organizations_updated"]),
    orgsReused: num([orgs], ["reused", "matched", "organizations_reused"]),
    contactsInserted: num([contacts], ["inserted", "contacts_inserted"]),
    contactsUpdated: num([contacts], ["updated", "contacts_updated"]),
    contactsReused: num([contacts], ["reused", "matched", "contacts_reused"]),
    contactsSkipped: num([contacts], ["skipped", "contacts_skipped", "no_person"]),
    engagementsInserted: num([engagements], ["inserted", "engagements_inserted"]),
    engagementsUpdated: num([engagements], ["updated", "engagements_updated"]),
    engagementsReused: num([engagements], ["reused", "matched", "engagements_reused"]),
    durationMs: num(scope, ["duration_ms", "durationMs", "elapsed_ms"]) ?? Math.round(performance.now() - started),
    raw,
  };
}