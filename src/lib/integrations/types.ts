export const INTEGRATION_PROVIDERS = [
  "instagram",
  "youtube",
  "google-analytics",
  "ebay",
] as const;

export type IntegrationProvider = (typeof INTEGRATION_PROVIDERS)[number];

export type IntegrationConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error"
  | "revoked"
  | string;

/** Token-free projection from public.v_integration_connections_safe. */
export type IntegrationConnectionSafe = {
  id: string;
  provider: IntegrationProvider;
  channel_id: string | null;
  connection_status: IntegrationConnectionStatus | null;
  provider_external_account_id: string | null;
  granted_scopes: string[] | null;
  access_token_expires_at: string | null;
  last_successful_sync_at: string | null;
  last_sync_attempt_at: string | null;
  next_scheduled_sync_at: string | null;
  last_error_code: string | null;
  sync_enabled: boolean | null;
  authentication_type: string | null;
  environment: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  brand_key: string | null;
};

/**
 * Compatibility alias while migrating account wording to connection wording.
 * Backed by connection-safe data; no direct integration_accounts dependency.
 */
export type IntegrationAccountSafe = IntegrationConnectionSafe & {
  status: IntegrationConnectionStatus | null;
  external_account_id: string | null;
  account_name: string | null;
  account_username: string | null;
  account_type: string | null;
  scopes: string[] | null;
  token_expires_at: string | null;
  last_synced_at: string | null;
  last_error: string | null;
  metadata: Record<string, unknown>;
};

export type IntegrationSyncRunStatus = "running" | "succeeded" | "failed";

/** Production run model from public.v_integration_sync_runs_safe plus provider lookup. */
export type IntegrationConnectionSyncRun = {
  id: string;
  integration_connection_id: string | null;
  provider: IntegrationProvider;
  sync_type: string;
  status: IntegrationSyncRunStatus;
  requested_at: string | null;
  started_at: string;
  completed_at: string | null;
  retry_count: number;
  records_read: number;
  records_skipped: number;
  records_written: number;
  error_code: string | null;
  /** Not exposed on the safe view. */
  error_message: string | null;
};

/** Compatibility alias that preserves existing UI references during migration. */
export type IntegrationSyncRun = {
  records_received: number;
} & IntegrationConnectionSyncRun;

/** The only shape the browser ever receives from a connector call. */
export type IntegrationStatus = {
  provider: IntegrationProvider;
  connected: boolean;
  accountName: string | null;
  accountUsername: string | null;
  lastSyncedAt: string | null;
  syncStatus: string;
  lastError: string | null;
};

export type IntegrationSyncResult = IntegrationStatus & {
  received?: number;
  written?: number;
};

export const PROVIDER_LABELS: Record<IntegrationProvider, string> = {
  instagram: "Instagram",
  youtube: "YouTube",
  "google-analytics": "Google Analytics",
  ebay: "eBay",
};