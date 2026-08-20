import { queryOptions } from "@tanstack/react-query";
import { cashHoldingsSupabase } from "@/integrations/cash-holdings/client";
import { buildRecord, type AthrtyRecord } from "./model";
import { date, num, str, type Row } from "./fields";

/** Production Microsoft 365 connection backing the ATHRTY Outbound list. */
export const ATHRTY_CONNECTION_ID = "f304a30c-b8c4-4d94-9860-e8634efe6b1f";

export const ATHRTY_ROOT = ["athrty"] as const;

const db = cashHoldingsSupabase as unknown as {
  from(table: string): {
    select(cols: string): {
      limit(n: number): PromiseLike<{ data: Row[] | null; error: { message: string } | null }>;
      in(
        col: string,
        values: string[],
      ): PromiseLike<{ data: Row[] | null; error: { message: string } | null }>;
    };
  };
};

async function rows(table: string, limit = 2000): Promise<Row[]> {
  const { data, error } = await db.from(table).select("*").limit(limit);
  if (error) throw new Error(`${table}: ${error.message}`);
  return data ?? [];
}

async function rowsIn(table: string, ids: string[]): Promise<Row[]> {
  if (ids.length === 0) return [];
  const { data, error } = await db.from(table).select("*").in("id", ids);
  if (error) throw new Error(`${table}: ${error.message}`);
  return data ?? [];
}

const byId = (list: Row[]) => {
  const map = new Map<string, Row>();
  for (const r of list) {
    const id = str([r], ["id"]);
    if (id) map.set(id, r);
  }
  return map;
};

/**
 * The single read the whole ATHRTY surface is built on: every source record
 * joined in memory to its normalized organization / contact / engagement row.
 * Nothing is duplicated into new tables and nothing is written.
 */
export const athrtyRecordsQuery = () =>
  queryOptions({
    queryKey: [...ATHRTY_ROOT, "records"] as const,
    staleTime: 60_000,
    queryFn: async (): Promise<AthrtyRecord[]> => {
      const source = await rows("integration_source_records");
      const orgIds = [
        ...new Set(source.map((r) => str([r], ["organization_id"])).filter(Boolean) as string[]),
      ];
      const contactIds = [
        ...new Set(source.map((r) => str([r], ["contact_id"])).filter(Boolean) as string[]),
      ];
      const engagementIds = [
        ...new Set(source.map((r) => str([r], ["engagement_id"])).filter(Boolean) as string[]),
      ];
      const [orgs, contacts, engagements] = await Promise.all([
        rowsIn("organizations", orgIds),
        rowsIn("contacts", contactIds),
        rowsIn("engagements", engagementIds),
      ]);
      const orgMap = byId(orgs);
      const contactMap = byId(contacts);
      const engMap = byId(engagements);

      return source.map((s) =>
        buildRecord({
          source: s,
          organization: orgMap.get(str([s], ["organization_id"]) ?? "") ?? null,
          contact: contactMap.get(str([s], ["contact_id"]) ?? "") ?? null,
          engagement: engMap.get(str([s], ["engagement_id"]) ?? "") ?? null,
        }),
      );
    },
  });

export type SyncRun = {
  id: string;
  status: string | null;
  startedAt: string | null;
  completedAt: string | null;
  recordsRead: number | null;
  recordsMapped: number | null;
  errorMessage: string | null;
  syncType: string | null;
  raw: Row;
};

export type SyncConnection = {
  id: string;
  provider: string | null;
  status: string | null;
  displayName: string | null;
  sourceList: string | null;
  lastSyncedAt: string | null;
  lastError: string | null;
  raw: Row;
};

export const athrtySyncQuery = () =>
  queryOptions({
    queryKey: [...ATHRTY_ROOT, "sync"] as const,
    staleTime: 30_000,
    queryFn: async (): Promise<{
      connection: SyncConnection | null;
      connections: SyncConnection[];
      runs: SyncRun[];
      mappedRecords: number;
    }> => {
      const [connectionRows, runRows, sourceRows] = await Promise.all([
        rows("integration_connections", 200),
        rows("integration_sync_runs", 200),
        rows("integration_source_records"),
      ]);

      const connections: SyncConnection[] = connectionRows.map((c) => ({
        id: str([c], ["id"]) ?? "",
        provider: str([c], ["provider", "integration", "kind", "source"]),
        status: str([c], ["status", "state", "connection_status", "health"]),
        displayName: str([c], ["display_name", "name", "account_name", "label"]),
        sourceList: str([c], ["source_list", "list_name", "list", "resource"]),
        lastSyncedAt: date([c], ["last_synced_at", "last_sync_at", "synced_at", "updated_at"]),
        lastError: str([c], ["last_error", "error_message", "error"]),
        raw: c,
      }));

      const runs: SyncRun[] = runRows
        .map((r) => ({
          id: str([r], ["id"]) ?? "",
          status: str([r], ["status", "result", "state"]),
          startedAt: date([r], ["started_at", "created_at", "start_time"]),
          completedAt: date([r], ["completed_at", "finished_at", "ended_at"]),
          recordsRead: num([r], ["records_read", "records_received", "read_count", "source_rows"]),
          recordsMapped: num([r], [
            "records_mapped",
            "records_written",
            "mapped_count",
            "written_count",
          ]),
          errorMessage: str([r], ["error_message", "error", "failure_reason"]),
          syncType: str([r], ["sync_type", "type", "mode"]),
          raw: r,
        }))
        .sort((a, b) => (b.startedAt ?? "").localeCompare(a.startedAt ?? ""));

      const connection =
        connections.find((c) => c.id === ATHRTY_CONNECTION_ID) ??
        connections.find((c) => (c.provider ?? "").toLowerCase().includes("microsoft")) ??
        connections[0] ??
        null;

      return { connection, connections, runs, mappedRecords: sourceRows.length };
    },
  });