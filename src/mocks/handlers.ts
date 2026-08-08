import { http, HttpResponse } from 'msw';

export const handlers = [
  http.post('/api/website-outbound/dry-run', async ({ request }) => {
    // echo OK for dry-run
    return HttpResponse.json({ ok: true }, { status: 200 });
  }),

  http.post('/api/agent/runs', async ({ request }) => {
    const raw = await request.json().catch(() => ({}) as unknown);
    const body = typeof raw === 'string' ? JSON.parse(raw) : (raw as Record<string, unknown>);
    const simulate = typeof body['simulate'] === 'string' ? String(body['simulate']) : undefined;
    if (simulate === 'queued')
      return HttpResponse.json({ id: 'agent_run_queued', status: 'queued' }, { status: 201 });
    if (simulate === 'running')
      return HttpResponse.json({ id: 'agent_run_running', status: 'running' }, { status: 201 });
    if (simulate === 'completed')
      return HttpResponse.json({ id: 'agent_run_completed', status: 'completed' }, { status: 201 });
    if (simulate === 'approval_required')
      return HttpResponse.json(
        { id: 'agent_run_approval', status: 'waiting_for_approval' },
        { status: 201 }
      );
    return HttpResponse.json({ id: 'agent_run_queued', status: 'queued' }, { status: 201 });
  }),

  http.get('/api/agent/runs', async () => {
    return HttpResponse.json([], { status: 200 });
  }),

  http.get('/api/agent/runs/:id', async ({ params }) => {
    const id = String(params.id);
    if (id === 'agent_run_failed')
      return HttpResponse.json(
        { id: 'agent_run_failed', status: 'failed', error: { message: 'Model error' } },
        { status: 200 }
      );
    if (id === 'agent_run_completed')
      return HttpResponse.json(
        {
          id: 'agent_run_completed',
          status: 'completed',
          artifacts: [
            {
              id: 'artifact_1',
              type: 'research_report',
              title: 'Research Report',
              content: 'Synthetic research summary.',
            },
          ],
          steps: [{ id: 'step_1', title: 'Fetch profile', status: 'completed' }],
        },
        { status: 200 }
      );
    if (id === 'agent_run_approval')
      return HttpResponse.json(
        {
          id: 'agent_run_approval',
          status: 'waiting_for_approval',
          approvals: [{ id: 'approval_1', runId: 'agent_run_approval', status: 'pending' }],
          toolCalls: [{ id: 'call_1', toolKey: 'crm.schedule_follow_up', risk: 'WRITE' }],
        },
        { status: 200 }
      );
    return new HttpResponse({ status: 404 });
  }),

  http.post('/api/agent/runs/:id/cancel', async () =>
    HttpResponse.json({ ok: true }, { status: 200 })
  ),

  http.post('/api/agent/approvals/:id/approve', async ({ params }) => {
    const id = String(params.id);
    return HttpResponse.json(
      { id, runId: 'agent_run_approval', approved: true, decidedAt: new Date().toISOString() },
      { status: 200 }
    );
  }),

  http.post('/api/agent/approvals/:id/reject', async ({ params }) => {
    const id = String(params.id);
    return HttpResponse.json(
      { id, runId: 'agent_run_approval', approved: false, decidedAt: new Date().toISOString() },
      { status: 200 }
    );
  }),
];
