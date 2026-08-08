import { IntegrationProvider } from '../types';

export const youtubeProvider: IntegrationProvider = {
  key: 'youtube',
  name: 'YouTube',
  description: 'YouTube channel and video metrics',
  category: 'video',
  authType: 'oauth',
  capabilities: ['account', 'content', 'audience', 'metrics', 'sync'],
  supportsSync: true,
  supportsMetrics: true,
  supportsContent: true,
  enabled: true,
  iconKey: 'youtube',
};
