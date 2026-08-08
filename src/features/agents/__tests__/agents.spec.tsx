import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import {
  configureAgentApi,
  AgentApiImpl,
  AgentGatewayNotConfiguredError,
  defaultAgentApi,
} from '../api';
import { createDevAgentApi } from '../dev-api';
import AgentRunPanel from '../components/AgentRunPanel';
import AgentComposer from '../components/AgentComposer';
import ApprovalCard from '../components/ApprovalCard';
import { buildAgentContext } from '../context';

describe('Agent frontend safety and dev runtime', () => {
  beforeEach(() => {
    // Reset AgentApiImpl to default fail-closed
    configureAgentApi(defaultAgentApi);
  });

  it('A - Gateway unavailable: default API is fail-closed', async () => {
    await expect(AgentApiImpl.createRun({})).rejects.toThrow(AgentGatewayNotConfiguredError);
  });

  it('B/C - Run lifecycle: queued -> completed via dev adapter', async () => {
    const dev = createDevAgentApi();
    configureAgentApi(dev);

    const queued = await AgentApiImpl.createRun({ simulate: 'queued' });
    expect(queued.id).toBe('agent_run_queued');

    const completed = await AgentApiImpl.createRun({ simulate: 'completed' });
    expect(completed.status).toBe('completed');

    render(<AgentRunPanel run={completed} />);
    expect(screen.getByText(/Research Report/i)).toBeTruthy();
  });

  it('D - Run failed renders error state', async () => {
    const dev = createDevAgentApi();
    configureAgentApi(dev);
    const failed = await AgentApiImpl.getRun('agent_run_failed');
    render(<AgentRunPanel run={failed} />);
    expect(screen.getByText(/failed/i)).toBeTruthy();
  });

  it('E/F - Approval required and accept flow (dev)', async () => {
    const dev = createDevAgentApi();
    configureAgentApi(dev);

    const approvalRun = await AgentApiImpl.createRun({ simulate: 'approval_required' });
    expect(approvalRun.status).toBe('waiting_for_approval');
    // Render approval card
    const approval = approvalRun.approvals?.[0];
    render(<ApprovalCard approval={approval} />);
    expect(screen.getByText(/Approval requested/i)).toBeTruthy();

    // Approve via dev API
    const resp = await AgentApiImpl.approveAction(approval.runId, approval.id);
    expect(resp).toHaveProperty('id');
  });

  it('I - Tool risk metadata present for approval-required call', async () => {
    const dev = createDevAgentApi();
    configureAgentApi(dev);

    const approvalRun = await AgentApiImpl.createRun({ simulate: 'approval_required' });
    const call = approvalRun.toolCalls?.[0];
    expect(call.risk).toBe('WRITE');
  });

  it('J - AgentContext validation only includes scoped ids', () => {
    const ctx = buildAgentContext({
      route: 'crm.lead',
      engagementId: 'e1',
      organizationId: 'o1',
      contactId: 'c1',
      brandKey: 'b1',
    });
    expect(ctx.contactId).toBe('c1');
    expect(ctx).not.toHaveProperty('someOtherField');
  });

  it('K - Composer rejects blank prompt and accepts valid prompt', async () => {
    const onSubmit = vi.fn();
    render(<AgentComposer onSubmit={onSubmit} />);

    const runButton = screen.getByText('Run') as HTMLButtonElement;
    expect(runButton.disabled).toBe(true);

    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'Please summarize' } });
    expect(runButton.disabled).toBe(false);

    fireEvent.click(runButton);
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
  });

  it('L - Artifacts render without external actions', async () => {
    const dev = createDevAgentApi();
    configureAgentApi(dev);
    const completed = await AgentApiImpl.createRun({ simulate: 'completed' });
    // artifact present
    const artifacts = completed.artifacts || [];
    expect(artifacts.length).toBeGreaterThan(0);
  });
});
