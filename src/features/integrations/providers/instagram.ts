import { IntegrationProvider } from '../types';

export const instagramProvider: IntegrationProvider = {
  key: 'instagram',
  name: 'Instagram',
  description: 'Instagram / Meta connector (business accounts)',
  category: 'social',
  authType: 'oauth',
  capabilities: ['account', 'content', 'audience', 'metrics', 'sync'],
  supportsSync: true,
  supportsMetrics: true,
  supportsContent: true,
  enabled: true,
  iconKey: 'instagram',
};
