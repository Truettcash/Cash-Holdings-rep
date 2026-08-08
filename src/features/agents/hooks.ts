import React from 'react';
import { agentToolRegistry } from './registry';
import { AgentContext } from './context';
import { AgentUIContext } from './components/AgentUIProvider';

export function useAgentRegistry() {
  return { getTool: (k: string) => (agentToolRegistry as any)[k] };
}

export function useAgentContext(initial?: AgentContext) {
  const [context, setContext] = React.useState<AgentContext>(initial || {});
  return { context, setContext };
}

export function useAgentUI() {
  const ctx = React.useContext(AgentUIContext);
  if (!ctx) throw new Error('useAgentUI must be used within AgentUIProvider');
  return ctx;
}
