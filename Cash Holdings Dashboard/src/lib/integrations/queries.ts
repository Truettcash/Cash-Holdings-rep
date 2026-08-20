import { queryOptions } from "@tanstack/react-query";
import { cashHoldingsSupabase } from "@/integrations/cash-holdings/client";
import { integrationConnector } from "./connector";
import type {
  IntegrationAccountSafe,
  IntegrationEvent,
  IntegrationProvider,
  IntegrationSyncRun,
} from "./types";

const ACCOUNT_COLUMNS =
  "id, provider, brand_key, external_account_id, account_name, account_username, account_type, status, scopes, token_expires_at, last_synced_at, last_error, metadata, created_at, updated_at";

/** Owner-only, token-free account list (reads the safe view, never the base table). */
export const integrationAccountsQuery = (brandKey?: string | null) =>
  queryOptions({
    queryKey: ["integration-accounts", brandKey ?? "all"] as const,
    queryFn: async (): Promise<IntegrationAccountSafe[]> => {
      let query = cashHoldingsSupabase
        .from("integration_accounts_safe")
        .select(ACCOUNT_COLUMNS)
        .order("provider", { ascending: true });
      if (brandKey) query = query.eq("brand_key", brandKey);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as IntegrationAccountSafe[];
    },
  });

export const integrationStatusQuery = (
  provider: IntegrationProvider,
  brandKey: string | null = null,
) =>
  queryOptions({
    queryKey: ["integration-status", provider, brandKey ?? "all"] as const,
    queryFn: () => integrationConnector.status(provider, brandKey),
  });

export const integrationSyncRunsQuery = (accountId?: string, limit = 25) =>
  queryOptions({
    queryKey: ["integration-sync-runs", accountId ?? "all", limit] as const,
    queryFn: async (): Promise<IntegrationSyncRun[]> => {
      let query = cashHoldingsSupabase
        .from("integration_sync_runs")
        .select(
          "id, integration_account_id, provider, sync_type, status, started_at, completed_at, records_received, records_written, error_code, error_message, metadata",
        )
        .order("started_at", { ascending: false })
        .limit(limit);
      if (accountId) query = query.eq("integration_account_id", accountId);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as IntegrationSyncRun[];
    },
  });

export const integrationEventsQuery = (accountId?: string, limit = 50) =>
  queryOptions({
    queryKey: ["integration-events", accountId ?? "all", limit] as const,
    queryFn: async (): Promise<IntegrationEvent[]> => {
      let query = cashHoldingsSupabase
        .from("integration_events")
        .select("id, integration_account_id, provider, event_type, created_at, metadata")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (accountId) query = query.eq("integration_account_id", accountId);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as IntegrationEvent[];
    },
  });