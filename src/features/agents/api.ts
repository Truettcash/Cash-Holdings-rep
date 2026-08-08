// Agent API abstraction (frontend-only). No network calls are performed here.
// Future server-side gateway should implement these operations.

import { z } from 'zod';
import { AgentRunSchema, AgentRun } from './types';
import { AgentApprovalSchema } from './schemas';

export type AgentApproval = z.infer<typeof AgentApprovalSchema>;

export class AgentGatewayNotConfiguredError extends Error {
  constructor() {
    super('Agent gateway not configured');
    this.name = 'AgentGatewayNotConfiguredError';
  }
}

export interface CreateAgentRunInput {
  simulate?: 'queued' | 'running' | 'completed' | 'failed' | 'approval_required';
  objective?: string;
  definitionId?: string;
  mode?: string;
  context?: unknown;
}

export interface AgentApi {
  createRun: (payload: CreateAgentRunInput) => Promise<AgentRun>;
  getRun: (id: string) => Promise<AgentRun>;
  getRunHistory: () => Promise<AgentRun[]>;
  cancelRun: (id: string) => Promise<AgentRun>;
  approveAction: (runId: string, approvalId: string) => Promise<AgentApproval>;
  rejectAction: (runId: string, approvalId: string) => Promise<AgentApproval>;
}

export const defaultAgentApi: AgentApi = {
  createRun: async () => {
    throw new AgentGatewayNotConfiguredError();
  },
  getRun: async () => {
    throw new AgentGatewayNotConfiguredError();
  },
  getRunHistory: async () => {
    throw new AgentGatewayNotConfiguredError();
  },
  cancelRun: async () => {
    throw new AgentGatewayNotConfiguredError();
  },
  approveAction: async () => {
    throw new AgentGatewayNotConfiguredError();
  },
  rejectAction: async () => {
    throw new AgentGatewayNotConfiguredError();
  },
};

export let AgentApiImpl: AgentApi = defaultAgentApi;

export function configureAgentApi(impl: AgentApi) {
  AgentApiImpl = impl;
}

export function resetAgentApi() {
  AgentApiImpl = defaultAgentApi;
}
