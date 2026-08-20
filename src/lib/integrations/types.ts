export const INTEGRATION_PROVIDERS = [
  "instagram",
  "youtube",
  "google-analytics",
  "ebay",
] as const;

export type IntegrationProvider = (typeof INTEGRATION_PROVIDERS)[number];

export type IntegrationAccountStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error"
  | "revoked";

/** Token-free projection: mirrors public.integration_accounts_safe. */
export type IntegrationAccountSafe = {
  id: string;
  provider: IntegrationProvider;
  brand_key: string | null;
  external_account_id: string | null;
  account_name: string | null;
  account_username: string | null;
  account_type: string | null;
  status: IntegrationAccountStatus;
  scopes: string[] | null;
  token_expires_at: string | null;
  last_synced_at: string | null;
  last_error: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type IntegrationSyncRunStatus = "running" | "succeeded" | "failed";

export type IntegrationSyncRun = {
  id: string;
  integration_account_id: string | null;
  provider: IntegrationProvider;
  sync_type: string;
  status: IntegrationSyncRunStatus;
  started_at: string;
  completed_at: string | null;
  records_received: number;
  records_written: number;
  error_code: string | null;
  error_message: string | null;
  metadata: Record<string, unknown>;
};

export type IntegrationEventType =
  | "account_connected"
  | "account_disconnected"
  | "connect_failed"
  | "token_refreshed"
  | "sync_succeeded"
  | "sync_failed";

export type IntegrationEvent = {
  id: string;
  integration_account_id: string | null;
  provider: IntegrationProvider;
  event_type: IntegrationEventType | string;
  created_at: string;
  metadata: Record<string, unknown>;
};

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