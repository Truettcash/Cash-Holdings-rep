import { IntegrationProvider } from '../types';

export const ebayProvider: IntegrationProvider = {
  key: 'ebay',
  name: 'eBay',
  description: 'eBay marketplace connector',
  category: 'commerce',
  authType: 'oauth',
  capabilities: ['account', 'listings', 'orders', 'revenue', 'metrics', 'sync'],
  supportsSync: true,
  supportsWebhooks: true,
  supportsCommerce: true,
  enabled: true,
  iconKey: 'ebay',
};
