import { z } from 'zod';
import {
  IntegrationProviderSchema,
  IntegrationConnectionSchema,
  IntegrationSyncRunSchema,
} from './types';

export const ProviderZ = IntegrationProviderSchema;
export const ConnectionZ = IntegrationConnectionSchema;
export const SyncRunZ = IntegrationSyncRunSchema;
