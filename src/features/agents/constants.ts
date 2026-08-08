export const AGENT_MODES = {
  SUGGEST: 'suggest',
  DRAFT: 'draft',
  EXECUTE_WITH_APPROVAL: 'execute_with_approval',
} as const;

export const AGENT_RUN_STATUSES = {
  QUEUED: 'queued',
  RUNNING: 'running',
  WAITING_FOR_APPROVAL: 'waiting_for_approval',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
} as const;
