import { IntegrationProvider } from '../types';

export const stripeProvider: IntegrationProvider = {
  key: 'stripe',
  name: 'Stripe',
  description: 'Stripe payments and financials',
  category: 'payments',
  authType: 'oauth',
  capabilities: ['account', 'revenue', 'orders', 'metrics', 'webhooks'],
  supportsWebhooks: true,
  supportsMetrics: true,
  enabled: true,
  iconKey: 'stripe',
};
