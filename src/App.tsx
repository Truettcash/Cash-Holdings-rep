import React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { queryClient } from './lib/query-client';
import ErrorBoundary from './components/ErrorBoundary';
import { AgentUIProvider } from './features/agents/components/AgentUIProvider';
import AgentDock from './features/agents/components/AgentDock';
import { features } from './config/features';
import RegisterDevCommands from './features/agents/RegisterDevCommands';

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AgentUIProvider>
        <ErrorBoundary>
          <RegisterDevCommands />
          <div>
            <h1>Hello from App</h1>
            <Toaster position="top-right" />
            {features.agentDock ? <AgentDock /> : null}
          </div>
        </ErrorBoundary>
      </AgentUIProvider>
    </QueryClientProvider>
  );
}

export default App;
