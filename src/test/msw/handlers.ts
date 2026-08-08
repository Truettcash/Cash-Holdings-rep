import { http, HttpResponse } from 'msw';
import {
  queuedRun,
  runningRun,
  completedRun,
  failedRun,
  approvalRequiredRun,
  approvalAcceptedRun,
  approvalRejectedRun,
} from './fixtures/agents';

const apiBase = '/api/agent';

export const handlers = [
  http.post(`${apiBase}/runs`, async ({ request }) => {
    const raw = await request.json().catch(() => ({}) as unknown);
    const body = typeof raw === 'string' ? JSON.parse(raw) : (raw as Record<string, unknown>);
    const objective = typeof body['objective'] === 'string' ? String(body['objective']) : '';
    if (objective.includes('fail')) return HttpResponse.json(failedRun, { status: 201 });
    if (objective.includes('approval'))
      return HttpResponse.json(approvalRequiredRun, { status: 201 });
    return HttpResponse.json(queuedRun, { status: 201 });
  }),

  http.get(`${apiBase}/runs`, async () =>
    HttpResponse.json([queuedRun, runningRun, completedRun], { status: 200 })
  ),

  http.get(`${apiBase}/runs/:id`, async ({ params }) => {
    const id = String(params.id);
    if (id === queuedRun.id) return HttpResponse.json(queuedRun, { status: 200 });
    if (id === runningRun.id) return HttpResponse.json(runningRun, { status: 200 });
    if (id === completedRun.id) return HttpResponse.json(completedRun, { status: 200 });
    if (id === failedRun.id) return HttpResponse.json(failedRun, { status: 200 });
    if (id === approvalRequiredRun.id)
      return HttpResponse.json(approvalRequiredRun, { status: 200 });
    if (id === approvalAcceptedRun.id)
      return HttpResponse.json(approvalAcceptedRun, { status: 200 });
    if (id === approvalRejectedRun.id)
      return HttpResponse.json(approvalRejectedRun, { status: 200 });
    return new HttpResponse({ status: 404 });
  }),

  http.post(`${apiBase}/runs/:id/cancel`, async () =>
    HttpResponse.json({ ok: true }, { status: 200 })
  ),

  http.post(`${apiBase}/approvals/:id/approve`, async ({ params }) => {
    const id = String(params.id);
    return HttpResponse.json(
      { id, runId: 'agent_run_approval', approved: true, decidedAt: new Date().toISOString() },
      { status: 200 }
    );
  }),

  http.post(`${apiBase}/approvals/:id/reject`, async ({ params }) => {
    const id = String(params.id);
    return HttpResponse.json(
      { id, runId: 'agent_run_approval', approved: false, decidedAt: new Date().toISOString() },
      { status: 200 }
    );
  }),
];
