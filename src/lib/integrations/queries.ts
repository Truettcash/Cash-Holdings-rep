import { queryOptions } from "@tanstack/react-query";
import { cashHoldingsSupabase } from "@/integrations/cash-holdings/client";
import { integrationConnector } from "./connector";
import type {
  IntegrationConnectionSafe,
  IntegrationAccountSafe,
  IntegrationProvider,
  IntegrationConnectionSyncRun,
  IntegrationSyncRun,
} from "./types";

const CONNECTION_COLUMNS =
  "id, provider, channel_id, connection_status, provider_external_account_id, granted_scopes, access_token_expires_at, last_successful_sync_at, last_sync_attempt_at, next_scheduled_sync_at, last_error_code, sync_enabled, authentication_type, environment, archived_at, created_at, updated_at";

const SYNC_RUN_COLUMNS =
  "id, integration_connection_id, sync_type, status, requested_at, started_at, completed_at, retry_count, records_read, records_skipped, records_written, error_code, created_at";

const PROVIDERS: IntegrationProvider[] = ["instagram", "youtube", "google-analytics", "ebay"];

function isIntegrationProvider(value: string | null): value is IntegrationProvider {
  return value !== null && PROVIDERS.includes(value as IntegrationProvider);
}

async function resolveBrandChannelIds(brandKey: string): Promise<Set<string>> {
  const { data: slugMatch, error: slugError } = await cashHoldingsSupabase
    .from("brands")
    .select("id")
    .eq("slug", brandKey)
    .maybeSingle();
  if (slugError) throw slugError;

  let brandId = slugMatch?.id ?? null;
  if (!brandId) {
    const { data: keyMatch, error: keyError } = await cashHoldingsSupabase
      .from("brands")
      .select("id")
      .eq("key", brandKey)
      .maybeSingle();
    if (keyError) throw keyError;
    brandId = keyMatch?.id ?? null;
  }

  if (!brandId) return new Set();

  const { data: channels, error: channelsError } = await cashHoldingsSupabase
    .from("channels")
    .select("id")
    .eq("brand_id", brandId);
  if (channelsError) throw channelsError;

  return new Set((channels ?? []).map((row) => row.id));
}

async function loadBrandSlugByChannel(channelIds: string[]): Promise<Map<string, string | null>> {
  if (channelIds.length === 0) return new Map();

  const { data: channels, error: channelsError } = await cashHoldingsSupabase
    .from("channels")
    .select("id,brand_id")
    .in("id", channelIds);
  if (channelsError) throw channelsError;

  const brandIds = Array.from(new Set((channels ?? []).map((row) => row.brand_id)));
  if (brandIds.length === 0) return new Map();

  const { data: brands, error: brandsError } = await cashHoldingsSupabase
    .from("brands")
    .select("id,slug,key")
    .in("id", brandIds);
  if (brandsError) throw brandsError;

  const brandById = new Map((brands ?? []).map((brand) => [brand.id, brand.slug ?? brand.key ?? null]));
  return new Map((channels ?? []).map((channel) => [channel.id, brandById.get(channel.brand_id) ?? null]));
}

async function fetchIntegrationConnections(
  brandKey?: string | null,
): Promise<IntegrationConnectionSafe[]> {
  const channelScope = brandKey ? await resolveBrandChannelIds(brandKey) : null;
  if (channelScope && channelScope.size === 0) return [];

  let query = cashHoldingsSupabase
    .from("v_integration_connections_safe")
    .select(CONNECTION_COLUMNS)
    .order("provider", { ascending: true });

  if (channelScope) {
    query = query.in("channel_id", Array.from(channelScope));
  }

  const { data, error } = await query;
  if (error) throw error;

  const rows = data ?? [];
  const validRows = rows.filter(
    (row): row is typeof row & { id: string; provider: IntegrationProvider } =>
      row.id !== null && isIntegrationProvider(row.provider)
  );
  const channelIds = Array.from(
    new Set(validRows.map((row) => row.channel_id).filter((id): id is string => id !== null))
  );
  const brandByChannel = await loadBrandSlugByChannel(channelIds);

  return validRows.map((row) => {
    const createdAt = row.created_at ?? row.updated_at ?? new Date(0).toISOString();
    const updatedAt = row.updated_at ?? row.created_at ?? new Date(0).toISOString();
    return {
      ...row,
      created_at: createdAt,
      updated_at: updatedAt,
      brand_key: row.channel_id ? brandByChannel.get(row.channel_id) ?? null : null,
    };
  });
}

/** Owner-only, token-free connection list from the safe view. */
export const integrationConnectionsQuery = (brandKey?: string | null) =>
  queryOptions({
    queryKey: ["integration-connections", brandKey ?? "all"] as const,
    queryFn: () => fetchIntegrationConnections(brandKey),
  });

async function loadIntegrationConnections(brandKey?: string | null): Promise<IntegrationConnectionSafe[]> {
  return fetchIntegrationConnections(brandKey);
}

/**
 * Compatibility alias while migrating account wording to connection wording.
 * Backed by connection-safe data, not integration_accounts.
 */
export const integrationAccountsQuery = (brandKey?: string | null) =>
  queryOptions({
    queryKey: ["integration-accounts", brandKey ?? "all"] as const,
    queryFn: async (): Promise<IntegrationAccountSafe[]> => {
      const rows = await loadIntegrationConnections(brandKey);
      return rows.map((row) => ({
        ...row,
        status: row.connection_status,
        external_account_id: row.provider_external_account_id,
        account_name: row.provider_external_account_id ?? row.provider,
        account_username: row.provider_external_account_id ?? row.provider,
        account_type: row.authentication_type,
        scopes: row.granted_scopes,
        token_expires_at: row.access_token_expires_at,
        last_synced_at: row.last_successful_sync_at,
        last_error: row.last_error_code,
        metadata: {},
      }));
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

export const integrationSyncRunsQuery = (connectionId?: string, limit = 25) =>
  queryOptions({
    queryKey: ["integration-sync-runs", connectionId ?? "all", limit] as const,
    queryFn: async (): Promise<IntegrationSyncRun[]> => {
      let query = cashHoldingsSupabase
        .from("v_integration_sync_runs_safe")
        .select(SYNC_RUN_COLUMNS)
        .order("started_at", { ascending: false })
        .limit(limit);
      if (connectionId) query = query.eq("integration_connection_id", connectionId);

      const { data, error } = await query;
      if (error) throw error;

      const rows = data ?? [];
      const connectionIds = Array.from(
        new Set(
          rows
            .map((row) => row.integration_connection_id)
            .filter((id): id is string => id !== null)
        )
      );

      const providerByConnection = new Map<string, IntegrationProvider>();
      if (connectionIds.length > 0) {
        const { data: connections, error: connectionsError } = await cashHoldingsSupabase
          .from("v_integration_connections_safe")
          .select("id,provider")
          .in("id", connectionIds);
        if (connectionsError) throw connectionsError;

        for (const row of connections ?? []) {
          if (row.id && isIntegrationProvider(row.provider)) {
            providerByConnection.set(row.id, row.provider);
          }
        }
      }

      const mapped: IntegrationConnectionSyncRun[] = [];
      for (const row of rows) {
        if (!row.id) continue;
        const provider = row.integration_connection_id
          ? providerByConnection.get(row.integration_connection_id) ?? null
          : null;
        if (!provider) continue;

        mapped.push({
          id: row.id,
          integration_connection_id: row.integration_connection_id,
          provider,
          sync_type: row.sync_type ?? "incremental",
          status: (row.status ?? "running") as IntegrationConnectionSyncRun["status"],
          requested_at: row.requested_at,
          started_at: row.started_at ?? row.requested_at ?? row.created_at ?? new Date(0).toISOString(),
          completed_at: row.completed_at,
          retry_count: row.retry_count ?? 0,
          records_read: row.records_read ?? 0,
          records_skipped: row.records_skipped ?? 0,
          records_written: row.records_written ?? 0,
          error_code: row.error_code,
          error_message: null,
        });
      }

      return mapped.map((run) => ({
        ...run,
        records_received: run.records_read,
      }));
    },
  });