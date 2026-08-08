import { useMutation, useQuery } from '@tanstack/react-query';
import { AgentApiImpl } from './api';

export function useCreateAgentRun() {
  return useMutation({ mutationFn: (payload: unknown) => AgentApiImpl.createRun(payload) });
}

export function useAgentRun(id?: string) {
  return useQuery({
    queryKey: ['agent', 'run', id],
    queryFn: async () => {
      if (!id) throw new Error('run id required');
      return AgentApiImpl.getRun(id);
    },
    enabled: !!id,
  });
}

export function useAgentRunHistory() {
  return useQuery({ queryKey: ['agent', 'history'], queryFn: () => AgentApiImpl.getRunHistory() });
}

export function useCancelAgentRun() {
  return useMutation({ mutationFn: (id: string) => AgentApiImpl.cancelRun(id) });
}

export function useApproveAgentAction() {
  return useMutation({
    mutationFn: ({ runId, approvalId }: { runId: string; approvalId: string }) =>
      AgentApiImpl.approveAction(runId, approvalId),
  });
}

export function useRejectAgentAction() {
  return useMutation({
    mutationFn: ({ runId, approvalId }: { runId: string; approvalId: string }) =>
      AgentApiImpl.rejectAction(runId, approvalId),
  });
}
