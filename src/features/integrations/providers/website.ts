import { IntegrationProvider } from '../types';

export const websiteProvider: IntegrationProvider = {
  key: 'website',
  name: 'Website',
  description: 'First-party website events and analytics',
  category: 'website',
  authType: 'none',
  capabilities: ['traffic', 'conversions', 'metrics', 'webhooks', 'sync'],
  supportsSync: true,
  supportsWebhooks: true,
  supportsMetrics: true,
  enabled: true,
  iconKey: 'website',
};
