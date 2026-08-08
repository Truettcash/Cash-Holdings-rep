import { useQuery, useQueries, useQueryClient } from '@tanstack/react-query';
import { getIntegrationApi } from './api';
import { IntegrationConnection, IntegrationSyncRun } from './types';

export function useIntegrationConnections(brandKey?: string) {
  const api = getIntegrationApi();
  return useQuery<IntegrationConnection[], Error>({
    queryKey: ['integrations', 'connections', brandKey],
    queryFn: () => api.listConnections(brandKey),
  });
}

export function useIntegrationConnection(id: string) {
  const api = getIntegrationApi();
  return useQuery<IntegrationConnection, Error>({
    queryKey: ['integrations', 'connection', id],
    queryFn: () => api.getConnection(id),
    enabled: Boolean(id),
  });
}

export function useIntegrationSyncRuns(connectionId: string) {
  const api = getIntegrationApi();
  return useQuery<IntegrationSyncRun[], Error>({
    queryKey: ['integrations', 'syncs', connectionId],
    queryFn: () => api.listSyncRuns(connectionId),
    enabled: Boolean(connectionId),
  });
}

export function useIntegrationHealth(connectionId: string) {
  const api = getIntegrationApi();
  return useQuery<{ status: string }, Error>({
    queryKey: ['integrations', 'health', connectionId],
    queryFn: () => api.getHealth(connectionId),
    enabled: Boolean(connectionId),
  });
}

export function useIntegrationMetrics(connectionId: string) {
  const api = getIntegrationApi();
  return useQuery<unknown[], Error>({
    queryKey: ['integrations', 'metrics', connectionId],
    queryFn: () => api.getMetrics(connectionId),
    enabled: Boolean(connectionId),
  });
}
