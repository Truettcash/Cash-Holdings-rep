import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { createSupabaseIntegrationApi, configureIntegrationApi } from './features/integrations/api';
import { cashHoldingsSupabase } from './integrations/cash-holdings/client';

// Configure the read-only IntegrationApi once at app bootstrap using the
// authoritative external Cash Holdings browser client. This wires safe reads
// (v_integration_connections_safe, v_integration_sync_runs_safe) for the UI.
configureIntegrationApi(createSupabaseIntegrationApi(cashHoldingsSupabase));

const root = createRoot(document.getElementById('root')!);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
