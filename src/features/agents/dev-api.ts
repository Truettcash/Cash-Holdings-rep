import { AgentApi } from './api';
import { AgentRunSchema, AgentRun } from './types';
import { AgentApprovalSchema } from './schemas';
import { features } from '../../config/features';

async function parseJson<T>(res: Response, parser: (v: unknown) => T) {
  if (!res.ok) throw new Error(`DevAgentApi network error: ${res.status}`);
  const json = await res.json();
  return parser(json);
}

export function createDevAgentApi(base = ''): AgentApi {
  const api: AgentApi = {
    async createRun(payload) {
      const res = await fetch(`${base}/api/agent/runs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return parseJson(res, (j) => AgentRunSchema.parse(j));
    },
    async getRun(id: string) {
      const res = await fetch(`${base}/api/agent/runs/${encodeURIComponent(id)}`);
      return parseJson(res, (j) => AgentRunSchema.parse(j));
    },
    async getRunHistory() {
      const res = await fetch(`${base}/api/agent/runs`);
      return parseJson(res, (j) => {
        if (!Array.isArray(j)) throw new Error('expected array');
        return j.map((it) => AgentRunSchema.parse(it));
      });
    },
    async cancelRun(id: string) {
      const res = await fetch(`${base}/api/agent/runs/${encodeURIComponent(id)}/cancel`, {
        method: 'POST',
      });
      return parseJson(res, (j) => AgentRunSchema.parse(j));
    },
    async approveAction(runId: string, approvalId: string) {
      const res = await fetch(
        `${base}/api/agent/approvals/${encodeURIComponent(approvalId)}/approve`,
        { method: 'POST' }
      );
      return parseJson(res, (j) => AgentApprovalSchema.parse(j));
    },
    async rejectAction(runId: string, approvalId: string) {
      const res = await fetch(
        `${base}/api/agent/approvals/${encodeURIComponent(approvalId)}/reject`,
        { method: 'POST' }
      );
      return parseJson(res, (j) => AgentApprovalSchema.parse(j));
    },
  };

  return api;
}

export function isDevAgentAvailable() {
  try {
    // require explicit Vite dev + feature flag
    // @ts-ignore
    const dev = Boolean(import.meta.env && import.meta.env.DEV);
    // explicit feature toggle must be true AND runtime must be dev
    return dev && Boolean(features.devAgentRuntime);
  } catch (e) {
    return false;
  }
}
