// Synthetic agent run fixtures for tests (JS to avoid tsc typechecking)

exports.queuedRun = {
  id: 'agent_run_queued',
  definitionId: 'research_agent',
  objective: 'Research the account',
  mode: 'suggest',
  status: 'queued',
  createdAt: new Date().toISOString(),
};

exports.runningRun = {
  ...exports.queuedRun,
  id: 'agent_run_running',
  status: 'running',
  startedAt: new Date().toISOString(),
};

exports.completedRun = {
  id: 'agent_run_completed',
  definitionId: 'research_agent',
  objective: 'Research the account',
  mode: 'suggest',
  status: 'completed',
  createdAt: new Date().toISOString(),
  steps: [{ id: 'step_1', title: 'Fetch profile', status: 'completed' }],
  artifacts: [
    {
      id: 'artifact_1',
      type: 'research_report',
      title: 'Research Report',
      content: 'Synthetic research summary.',
    },
  ],
};

exports.failedRun = {
  id: 'agent_run_failed',
  definitionId: 'research_agent',
  objective: 'Broken run',
  mode: 'suggest',
  status: 'failed',
  error: { message: 'Model error' },
};

exports.approvalRequiredRun = {
  id: 'agent_run_approval',
  definitionId: 'sales_agent',
  objective: 'Schedule follow up',
  mode: 'execute_with_approval',
  status: 'waiting_for_approval',
  toolCalls: [
    {
      id: 'call_1',
      toolKey: 'crm.schedule_follow_up',
      input: { leadId: 'lead_1', when: '2026-08-09' },
      risk: 'WRITE',
    },
  ],
  approvals: [
    { id: 'approval_1', runId: 'agent_run_approval', toolCallId: 'call_1', status: 'pending' },
  ],
};

exports.approvalAcceptedRun = {
  ...exports.approvalRequiredRun,
  id: 'agent_run_approval_accepted',
  status: 'completed',
};

exports.approvalRejectedRun = {
  ...exports.approvalRequiredRun,
  id: 'agent_run_approval_rejected',
  status: 'rejected',
};
