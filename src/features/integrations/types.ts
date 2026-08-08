import { z } from 'zod';

export const IntegrationCapability = z.enum([
  'account',
  'content',
  'audience',
  'orders',
  'listings',
  'revenue',
  'traffic',
  'conversions',
  'metrics',
  'webhooks',
  'sync',
]);

export const IntegrationCategory = z.enum([
  'social',
  'video',
  'commerce',
  'website',
  'payments',
  'analytics',
]);

export const IntegrationAuthType = z.enum(['oauth', 'api_key', 'none']);

export const IntegrationProviderKey = z.union([
  z.literal('ebay'),
  z.literal('instagram'),
  z.literal('youtube'),
  z.literal('website'),
  z.literal('stripe'),
  z.literal('google_analytics'),
  z.literal('google_search_console'),
  z.literal('tiktok'),
  z.literal('facebook'),
  z.literal('linkedin'),
  z.literal('github'),
  z.literal('microsoft'),
  z.literal('gmail'),
]);

export const IntegrationProviderSchema = z.object({
  key: IntegrationProviderKey,
  name: z.string(),
  description: z.string().optional(),
  category: IntegrationCategory,
  authType: IntegrationAuthType,
  capabilities: z.array(IntegrationCapability),
  supportsSync: z.boolean().optional(),
  supportsWebhooks: z.boolean().optional(),
  supportsMetrics: z.boolean().optional(),
  supportsContent: z.boolean().optional(),
  supportsCommerce: z.boolean().optional(),
  enabled: z.boolean().optional(),
  iconKey: z.string().optional(),
});

export type IntegrationProvider = z.infer<typeof IntegrationProviderSchema>;

export const IntegrationConnectionRowSchema = z.object({
  id: z.string().nullable(),
  channel_id: z.string().nullable(),
  provider: z.string().nullable(),
  environment: z.string().nullable(),
  authentication_type: z.string().nullable(),
  connection_status: z.string().nullable(),
  provider_external_account_id: z.string().nullable(),
  granted_scopes: z.array(z.string()).nullable(),
  access_token_expires_at: z.string().nullable(),
  refresh_token_expires_at: z.string().nullable(),
  sync_enabled: z.boolean().nullable(),
  last_sync_attempt_at: z.string().nullable(),
  last_successful_sync_at: z.string().nullable(),
  next_scheduled_sync_at: z.string().nullable(),
  last_error_code: z.string().nullable(),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
  archived_at: z.string().nullable(),
});

export type IntegrationConnectionRow = z.infer<typeof IntegrationConnectionRowSchema>;

export const IntegrationConnectionSchema = z.object({
  id: z.string(),
  channelId: z.string().nullable(),
  provider: z.string().nullable(),
  environment: z.string().nullable(),
  authenticationType: z.string().nullable(),
  connectionStatus: z.string().nullable(),
  providerExternalAccountId: z.string().nullable(),
  grantedScopes: z.array(z.string()).nullable(),
  accessTokenExpiresAt: z.string().nullable(),
  refreshTokenExpiresAt: z.string().nullable(),
  syncEnabled: z.boolean().nullable(),
  lastSyncAttemptAt: z.string().nullable(),
  lastSuccessfulSyncAt: z.string().nullable(),
  nextScheduledSyncAt: z.string().nullable(),
  lastErrorCode: z.string().nullable(),
  createdAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
  archivedAt: z.string().nullable(),
});

export type IntegrationConnection = z.infer<typeof IntegrationConnectionSchema>;

export const IntegrationSyncRunRowSchema = z.object({
  id: z.string().nullable(),
  integration_connection_id: z.string().nullable(),
  sync_type: z.string().nullable(),
  status: z.string().nullable(),
  requested_at: z.string().nullable(),
  started_at: z.string().nullable(),
  completed_at: z.string().nullable(),
  records_read: z.string().nullable(),
  records_written: z.string().nullable(),
  records_skipped: z.string().nullable(),
  retry_count: z.number().nullable(),
  error_code: z.string().nullable(),
  created_at: z.string().nullable(),
});

export type IntegrationSyncRunRow = z.infer<typeof IntegrationSyncRunRowSchema>;

export const IntegrationSyncRunSchema = z.object({
  id: z.string(),
  integrationConnectionId: z.string(),
  syncType: z.string().nullable(),
  status: z.string().nullable(),
  requestedAt: z.string().nullable(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  recordsRead: z.string().nullable(),
  recordsWritten: z.string().nullable(),
  recordsSkipped: z.string().nullable(),
  retryCount: z.number().nullable(),
  errorCode: z.string().nullable(),
  createdAt: z.string().nullable(),
});

export type IntegrationSyncRun = z.infer<typeof IntegrationSyncRunSchema>;

export const MetricDefinitionRowSchema = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
  unit: z.string(),
  description: z.string().nullable(),
  created_at: z.string().nullable(),
});

export type MetricDefinitionRow = z.infer<typeof MetricDefinitionRowSchema>;

export const MetricObservationRowSchema = z.object({
  id: z.string(),
  channel_id: z.string().nullable(),
  metric_definition_id: z.string(),
  value: z.string(),
  observed_at: z.string(),
  period_start: z.string().nullable(),
  period_end: z.string().nullable(),
  source: z.string(),
  notes: z.string().nullable(),
  created_at: z.string().nullable(),
  strategic_move_id: z.string().nullable(),
});

export type MetricObservationRow = z.infer<typeof MetricObservationRowSchema>;

export const IntegrationMetricObservationSchema = z.object({
  id: z.string(),
  channelId: z.string().nullable(),
  metricDefinitionId: z.string(),
  value: string,
  observedAt: string,
  periodStart: z.string().nullable(),
  periodEnd: z.string().nullable(),
  source: string,
  notes: z.string().nullable(),
  createdAt: z.string().nullable(),
  strategicMoveId: z.string().nullable(),
});

export type IntegrationMetricObservation = z.infer<typeof IntegrationMetricObservationSchema>;

export function mapIntegrationConnectionRow(row: IntegrationConnectionRow): IntegrationConnection {
  return IntegrationConnectionSchema.parse({
    id: row.id ?? '',
    channelId: row.channel_id,
    provider: row.provider,
    environment: row.environment,
    authenticationType: row.authentication_type,
    connectionStatus: row.connection_status,
    providerExternalAccountId: row.provider_external_account_id,
    grantedScopes: row.granted_scopes,
    accessTokenExpiresAt: row.access_token_expires_at,
    refreshTokenExpiresAt: row.refresh_token_expires_at,
    syncEnabled: row.sync_enabled,
    lastSyncAttemptAt: row.last_sync_attempt_at,
    lastSuccessfulSyncAt: row.last_successful_sync_at,
    nextScheduledSyncAt: row.next_scheduled_sync_at,
    lastErrorCode: row.last_error_code,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
  });
}

export function mapIntegrationSyncRunRow(row: IntegrationSyncRunRow): IntegrationSyncRun {
  return IntegrationSyncRunSchema.parse({
    id: row.id ?? '',
    integrationConnectionId: row.integration_connection_id ?? '',
    syncType: row.sync_type,
    status: row.status,
    requestedAt: row.requested_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    recordsRead: row.records_read,
    recordsWritten: row.records_written,
    recordsSkipped: row.records_skipped,
    retryCount: row.retry_count,
    errorCode: row.error_code,
    createdAt: row.created_at,
  });
}

export function mapMetricObservationRow(row: MetricObservationRow): IntegrationMetricObservation {
  return IntegrationMetricObservationSchema.parse({
    id: row.id,
    channelId: row.channel_id,
    metricDefinitionId: row.metric_definition_id,
    value: row.value,
    observedAt: row.observed_at,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    source: row.source,
    notes: row.notes,
    createdAt: row.created_at,
    strategicMoveId: row.strategic_move_id,
  });
}
