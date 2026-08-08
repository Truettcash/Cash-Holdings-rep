import {
  IntegrationConnection,
  IntegrationSyncRun,
  IntegrationConnectionRowSchema,
  IntegrationSyncRunRowSchema,
  mapIntegrationConnectionRow,
  mapIntegrationSyncRunRow,
} from './types';

export class IntegrationGatewayNotConfiguredError extends Error {}

export interface IntegrationApi {
  listConnections(brandKey?: string): Promise<IntegrationConnection[]>;
  getConnection(id: string): Promise<IntegrationConnection>;
  listSyncRuns(connectionId: string): Promise<IntegrationSyncRun[]>;
  getHealth(connectionId: string): Promise<{ status: string }>;
  getMetrics(connectionId: string): Promise<unknown>;
}

let impl: IntegrationApi | null = null;

export const defaultIntegrationApi: IntegrationApi = {
  async listConnections() {
    throw new IntegrationGatewayNotConfiguredError('Integration gateway not configured');
  },
  async getConnection() {
    throw new IntegrationGatewayNotConfiguredError('Integration gateway not configured');
  },
  async listSyncRuns() {
    throw new IntegrationGatewayNotConfiguredError('Integration gateway not configured');
  },
  async getHealth() {
    throw new IntegrationGatewayNotConfiguredError('Integration gateway not configured');
  },
  async getMetrics() {
    throw new IntegrationGatewayNotConfiguredError('Integration gateway not configured');
  },
};

export function configureIntegrationApi(api: IntegrationApi) {
  impl = api;
}

export function resetIntegrationApi() {
  impl = null;
}

export function getIntegrationApi(): IntegrationApi {
  return impl ?? defaultIntegrationApi;
}

// Export a factory to create an IntegrationApi backed by a Supabase client.
// This file does not import or construct the client itself — callers must pass
// an authenticated browser-safe Supabase client (anon key) from their app
// initialization. The adapter will only perform safe reads against views.
export type SupabaseLike = {
  from: (table: string) => {
    select: (cols?: string) => Promise<{ data: any; error: any }>;
  };
};

export function createSupabaseIntegrationApi(supabase: SupabaseLike): IntegrationApi {
  if (!supabase) throw new IntegrationGatewayNotConfiguredError('Supabase client not provided');

  return {
    async listConnections() {
      try {
        const res = await supabase.from('v_integration_connections_safe').select('*');
        if (res.error) throw res.error;
        const parsed = IntegrationConnectionRowSchema.array().safeParse(res.data ?? []);
        if (!parsed.success) throw parsed.error;
        return parsed.data.map(mapIntegrationConnectionRow);
      } catch (err) {
        throw new IntegrationGatewayNotConfiguredError(String(err));
      }
    },
    async getConnection(id: string) {
      try {
        const res = await supabase.from('v_integration_connections_safe').select('*');
        if (res.error) throw res.error;
        const parsed = IntegrationConnectionRowSchema.array().safeParse(res.data ?? []);
        if (!parsed.success) throw parsed.error;
        const found = parsed.data.map(mapIntegrationConnectionRow).find((c) => c.id === id);
        if (!found) throw new Error('connection not found');
        return found;
      } catch (err) {
        throw new IntegrationGatewayNotConfiguredError(String(err));
      }
    },
    async listSyncRuns(connectionId: string) {
      try {
        const res = await supabase.from('v_integration_sync_runs_safe').select('*');
        if (res.error) throw res.error;
        const parsed = IntegrationSyncRunRowSchema.array().safeParse(res.data ?? []);
        if (!parsed.success) throw parsed.error;
        const runs = parsed.data.map(mapIntegrationSyncRunRow);
        if (connectionId) return runs.filter((r) => r.integrationConnectionId === connectionId);
        return runs;
      } catch (err) {
        throw new IntegrationGatewayNotConfiguredError(String(err));
      }
    },
    async getHealth(connectionId: string) {
      try {
        const res = await supabase.from('v_integration_sync_runs_safe').select('*');
        if (res.error) throw res.error;
        const parsed = IntegrationSyncRunRowSchema.array().safeParse(res.data ?? []);
        if (!parsed.success) throw parsed.error;
        const runs = parsed.data
          .map(mapIntegrationSyncRunRow)
          .filter((r) => r.integrationConnectionId === connectionId);
        const latest = runs.sort((a, b) => (b.startedAt || '').localeCompare(a.startedAt || ''))[0];
        return { status: latest?.status ?? 'idle' };
      } catch (err) {
        throw new IntegrationGatewayNotConfiguredError(String(err));
      }
    },
    async getMetrics(_connectionId: string) {
      // Metrics shape and views vary between deployments. We do a best-effort
      // read from a metrics table/view but do NOT swallow query errors — the
      // caller must be able to distinguish between "no data" and "query failed".
      try {
        const res = await supabase.from('metric_observations').select('*');
        if (res.error) {
          throw new MetricQueryError(String(res.error));
        }
        // On success, normalize to an array (zero rows => empty array).
        if (!res.data) return [];
        return Array.isArray(res.data) ? res.data : [res.data];
      } catch (err) {
        if (err instanceof MetricQueryError) throw err;
        throw new MetricQueryError(String(err));
      }
    },
  };
}

export class MetricQueryError extends Error {
  constructor(message?: string) {
    super(message ?? 'metric query failed');
    this.name = 'MetricQueryError';
  }
}
