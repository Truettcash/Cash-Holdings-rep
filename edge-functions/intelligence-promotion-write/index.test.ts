import { assertEquals, assertExists } from "jsr:@std/assert";

import { handleIntelligencePromotionWrite, validatePromotionPayload } from "./index.ts";

function createQueryMock(rows: Record<string, unknown>[]) {
  const findByField = (field: string, value: unknown) =>
    rows.find((row) => String((row as Record<string, unknown>)[field]) === String(value)) ?? null;

  const matchByIn = (field: string, values: unknown[]) =>
    rows.filter((row) => values.some((value) => String((row as Record<string, unknown>)[field]) === String(value)));

  const query = {
    eq: (field: string, value: unknown) => ({
      maybeSingle: async () => ({ data: findByField(field, value), error: null }),
      single: async () => ({ data: findByField(field, value), error: null }),
    }),
    in: (field: string, values: unknown[]) => Promise.resolve({ data: matchByIn(field, values), error: null }),
    maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
    single: async () => ({ data: rows[0] ?? null, error: null }),
    order: () => ({
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      single: async () => ({ data: rows[0] ?? null, error: null }),
      limit: () => Promise.resolve({ data: rows, error: null }),
    }),
  };

  return query;
}

function buildDeps({
  userId = "00000000-0000-4000-8000-000000000001",
  evidenceRows = [
    { id: "11111111-1111-4111-8111-111111111111", owner_user_id: userId },
    { id: "22222222-2222-4222-8222-222222222222", owner_user_id: userId },
  ],
  tables = {
    intelligence_review_events: [],
    pattern_observations: [],
    accepted_constraints: [],
    evidence_requests: [],
    intelligence_evidence_refs: evidenceRows,
  },
}: {
  userId?: string;
  evidenceRows?: Array<Record<string, unknown>>;
  tables?: Record<string, Array<Record<string, unknown>>>;
} = {}) {
  const state: Record<string, Array<Record<string, unknown>>> = {
    ...tables,
    intelligence_evidence_refs: evidenceRows,
  };

  return {
    state,
    createClient: () => ({
      auth: {
        getUser: async () => ({ data: { user: { id: userId } }, error: null }),
      },
      from: (tableName: string) => {
        const rows = state[tableName] ?? [];
        const query = createQueryMock(rows);

        return {
          ...query,
          select: () => query,
          insert: (items: Record<string, unknown>[]) => {
            state[tableName] = [...(state[tableName] ?? []), ...items];
            return {
              select: () => ({
                single: async () => ({ data: items[0] ?? null, error: null }),
              }),
            };
          },
        };
      },
    }),
  };
}

Deno.test("valid authenticated approval request", async () => {
  const req = new Request("https://example.com", {
    method: "POST",
    headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "ACCEPT_PATTERN_MATCH",
      trace_id: "trace-1",
      target_type: "pattern",
      target_ref: "pattern:invisible_to_visible",
      reason: "Good evidence and clear owner scope",
      evidence_refs: ["11111111-1111-4111-8111-111111111111"],
    }),
  });

  const res = await handleIntelligencePromotionWrite(req, buildDeps());
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.ok, true);
  assertEquals(body.action, "ACCEPT_PATTERN_MATCH");
});

Deno.test("pattern acceptance creates audit event and replay-safe durable pair", async () => {
  const deps = buildDeps();
  const req = new Request("https://example.com", {
    method: "POST",
    headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "ACCEPT_PATTERN_MATCH",
      trace_id: "trace-pattern",
      target_type: "pattern",
      target_ref: "pattern:invisible_to_visible",
      reason: "Good evidence and clear owner scope",
      scope: "current operating context",
      evidence_refs: ["11111111-1111-4111-8111-111111111111"],
    }),
  });

  const first = await handleIntelligencePromotionWrite(req, deps);
  assertEquals(first.status, 200);
  const firstBody = await first.json();
  assertEquals(firstBody.status, "created");
  assertEquals(firstBody.action, "ACCEPT_PATTERN_MATCH");
  assertEquals(firstBody.trace_id, "trace-pattern");
  assertEquals(firstBody.target_ref, "pattern:invisible_to_visible");
  assertEquals(firstBody.scope, "current operating context");
  assertEquals(deps.state.intelligence_review_events.length, 1);
  assertEquals(deps.state.pattern_observations.length, 1);

  const auditRow = deps.state.intelligence_review_events[0];
  const domainRow = deps.state.pattern_observations[0];
  assertEquals(auditRow.owner_user_id, "00000000-0000-4000-8000-000000000001");
  assertEquals(auditRow.trace_id, "trace-pattern");
  assertEquals(auditRow.action_type, "ACCEPT_PATTERN_MATCH");
  assertEquals(auditRow.target_type, "pattern");
  assertEquals(auditRow.target_ref, "pattern:invisible_to_visible");
  assertEquals(auditRow.scope, "current operating context");
  assertEquals(auditRow.reason, "Good evidence and clear owner scope");
  assertEquals(auditRow.evidence_ref_ids, ["11111111-1111-4111-8111-111111111111"]);
  assertEquals(auditRow.status, "ACCEPTED");
  assertEquals(domainRow.owner_user_id, "00000000-0000-4000-8000-000000000001");
  assertEquals(domainRow.trace_id, "trace-pattern");
  assertEquals(domainRow.decision, "accepted");
  assertEquals(domainRow.target_ref, "pattern:invisible_to_visible");
  assertEquals(auditRow.idempotency_key, domainRow.idempotency_key);
  assertEquals(auditRow.payload_hash, domainRow.payload_hash);

  const replayReq = new Request("https://example.com", {
    method: "POST",
    headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "ACCEPT_PATTERN_MATCH",
      trace_id: "trace-pattern",
      target_type: "pattern",
      target_ref: "pattern:invisible_to_visible",
      reason: "Good evidence and clear owner scope",
      scope: "current operating context",
      evidence_refs: ["11111111-1111-4111-8111-111111111111"],
    }),
  });
  const replay = await handleIntelligencePromotionWrite(replayReq, deps);
  assertEquals(replay.status, 200);
  const replayBody = await replay.json();
  assertEquals(replayBody.status, "replayed");
  assertEquals(deps.state.intelligence_review_events.length, 1);
  assertEquals(deps.state.pattern_observations.length, 1);
});

Deno.test("constraint acceptance creates audit event and durable accepted constraint", async () => {
  const deps = buildDeps();
  const req = new Request("https://example.com", {
    method: "POST",
    headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "ACCEPT_CONSTRAINT",
      trace_id: "trace-constraint",
      target_type: "constraint",
      target_ref: "constraint:invisible_to_visible",
      reason: "Constraint remains valid under scope",
      scope: "current operating context",
      evidence_refs: ["11111111-1111-4111-8111-111111111111"],
    }),
  });

  const res = await handleIntelligencePromotionWrite(req, deps);
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.status, "created");
  assertEquals(deps.state.intelligence_review_events.length, 1);
  assertEquals(deps.state.accepted_constraints.length, 1);
  assertEquals(deps.state.intelligence_review_events[0].status, "ACCEPTED");
  assertEquals(deps.state.accepted_constraints[0].constraint_id, "constraint:invisible_to_visible");

  const replayReq = new Request("https://example.com", {
    method: "POST",
    headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "ACCEPT_CONSTRAINT",
      trace_id: "trace-constraint",
      target_type: "constraint",
      target_ref: "constraint:invisible_to_visible",
      reason: "Constraint remains valid under scope",
      scope: "current operating context",
      evidence_refs: ["11111111-1111-4111-8111-111111111111"],
    }),
  });
  const replay = await handleIntelligencePromotionWrite(replayReq, deps);
  assertEquals(replay.status, 200);
  assertEquals((await replay.json()).status, "replayed");
  assertEquals(deps.state.intelligence_review_events.length, 1);
  assertEquals(deps.state.accepted_constraints.length, 1);
});

Deno.test("evidence request action creates audit event and durable request", async () => {
  const deps = buildDeps();
  const req = new Request("https://example.com", {
    method: "POST",
    headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "REQUEST_MORE_EVIDENCE",
      trace_id: "trace-evidence",
      target_type: "candidate",
      target_ref: "candidate:alpha",
      reason: "Evidence needs direct confirmation",
      scope: "current operating context",
      missing_state: ["state:missing_keys"],
      evidence_refs: ["11111111-1111-4111-8111-111111111111"],
    }),
  });

  const res = await handleIntelligencePromotionWrite(req, deps);
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.status, "created");
  assertEquals(deps.state.intelligence_review_events.length, 1);
  assertEquals(deps.state.evidence_requests.length, 1);
  assertEquals(deps.state.intelligence_review_events[0].status, "MORE_EVIDENCE_REQUESTED");
  assertEquals(deps.state.evidence_requests[0].reason, "Evidence needs direct confirmation");

  const replayReq = new Request("https://example.com", {
    method: "POST",
    headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "REQUEST_MORE_EVIDENCE",
      trace_id: "trace-evidence",
      target_type: "candidate",
      target_ref: "candidate:alpha",
      reason: "Evidence needs direct confirmation",
      scope: "current operating context",
      missing_state: ["state:missing_keys"],
      evidence_refs: ["11111111-1111-4111-8111-111111111111"],
    }),
  });
  const replay = await handleIntelligencePromotionWrite(replayReq, deps);
  assertEquals(replay.status, 200);
  assertEquals((await replay.json()).status, "replayed");
  assertEquals(deps.state.intelligence_review_events.length, 1);
  assertEquals(deps.state.evidence_requests.length, 1);
});

Deno.test("candidate rejection creates audit event only", async () => {
  const deps = buildDeps();
  const req = new Request("https://example.com", {
    method: "POST",
    headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "REJECT_CANDIDATE",
      trace_id: "trace-reject",
      target_type: "candidate",
      target_ref: "candidate:beta",
      reason: "Candidate fails current constraint set",
      scope: "current operating context",
      evidence_refs: ["11111111-1111-4111-8111-111111111111"],
    }),
  });

  const res = await handleIntelligencePromotionWrite(req, deps);
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.status, "created");
  assertEquals(deps.state.intelligence_review_events.length, 1);
  assertEquals(deps.state.intelligence_review_events[0].status, "REJECTED");
  assertEquals(deps.state.pattern_observations.length, 0);
  assertEquals(deps.state.accepted_constraints.length, 0);
  assertEquals(deps.state.evidence_requests.length, 0);
});

Deno.test("uncertain mark creates audit event only", async () => {
  const deps = buildDeps();
  const req = new Request("https://example.com", {
    method: "POST",
    headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "MARK_UNCERTAIN",
      trace_id: "trace-uncertain",
      target_type: "candidate",
      target_ref: "candidate:gamma",
      reason: "Insufficient evidence to confirm outcome",
      scope: "current operating context",
      evidence_refs: ["11111111-1111-4111-8111-111111111111"],
    }),
  });

  const res = await handleIntelligencePromotionWrite(req, deps);
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.status, "created");
  assertEquals(deps.state.intelligence_review_events.length, 1);
  assertEquals(deps.state.intelligence_review_events[0].status, "UNCERTAIN");
  assertEquals(deps.state.pattern_observations.length, 0);
  assertEquals(deps.state.accepted_constraints.length, 0);
  assertEquals(deps.state.evidence_requests.length, 0);
});

Deno.test("signal accept creates audit event without speculative data table", async () => {
  const deps = buildDeps();
  const req = new Request("https://example.com", {
    method: "POST",
    headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "ACCEPT_SIGNAL",
      trace_id: "trace-signal",
      target_type: "signal",
      target_ref: "signal:alpha",
      reason: "Signal passes the existing policy gate",
      scope: "current operating context",
      evidence_refs: ["11111111-1111-4111-8111-111111111111"],
    }),
  });

  const res = await handleIntelligencePromotionWrite(req, deps);
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.status, "created");
  assertEquals(deps.state.intelligence_review_events.length, 1);
  assertEquals(deps.state.intelligence_review_events[0].action_type, "ACCEPT_SIGNAL");
  assertEquals(deps.state.intelligence_review_events[0].status, "ACCEPTED");
  assertEquals(deps.state.pattern_observations.length, 0);
  assertEquals(deps.state.accepted_constraints.length, 0);
  assertEquals(deps.state.evidence_requests.length, 0);
});

Deno.test("missing auth rejected", async () => {
  const req = new Request("https://example.com", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "ACCEPT_PATTERN_MATCH",
      trace_id: "trace-1",
      target_type: "pattern",
      target_ref: "pattern:invisible_to_visible",
      reason: "needs auth",
      evidence_refs: ["11111111-1111-4111-8111-111111111111"],
    }),
  });

  const res = await handleIntelligencePromotionWrite(req, buildDeps());
  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body.error.code, "AUTH_REQUIRED");
});

Deno.test("invalid action rejected", async () => {
  const req = new Request("https://example.com", {
    method: "POST",
    headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "EXECUTE_NOW",
      trace_id: "trace-1",
      target_ref: "pattern:invisible_to_visible",
      reason: "bad action",
    }),
  });

  const res = await handleIntelligencePromotionWrite(req, buildDeps());
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error.code, "INVALID_ACTION");
});

Deno.test("extra fields rejected", async () => {
  const req = new Request("https://example.com", {
    method: "POST",
    headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "ACCEPT_PATTERN_MATCH",
      trace_id: "trace-1",
      target_type: "pattern",
      target_ref: "pattern:invisible_to_visible",
      reason: "good",
      evidence_refs: ["11111111-1111-4111-8111-111111111111"],
      table: "intelligence_review_events",
      rpc: "run_write",
    }),
  });

  const res = await handleIntelligencePromotionWrite(req, buildDeps());
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error.code, "INVALID_INPUT");
});

Deno.test("owner identity injection rejected", async () => {
  const req = new Request("https://example.com", {
    method: "POST",
    headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "ACCEPT_PATTERN_MATCH",
      trace_id: "trace-1",
      target_type: "pattern",
      target_ref: "pattern:invisible_to_visible",
      reason: "good",
      evidence_refs: ["11111111-1111-4111-8111-111111111111"],
      owner_user_id: "00000000-0000-4000-8000-000000000999",
    }),
  });

  const res = await handleIntelligencePromotionWrite(req, buildDeps());
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error.code, "INVALID_INPUT");
});

Deno.test("actor identity injection rejected", async () => {
  const req = new Request("https://example.com", {
    method: "POST",
    headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "ACCEPT_PATTERN_MATCH",
      trace_id: "trace-1",
      target_type: "pattern",
      target_ref: "pattern:invisible_to_visible",
      reason: "good",
      evidence_refs: ["11111111-1111-4111-8111-111111111111"],
      actor_user_id: "00000000-0000-4000-8000-000000000999",
    }),
  });

  const res = await handleIntelligencePromotionWrite(req, buildDeps());
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error.code, "INVALID_INPUT");
});

Deno.test("approved_by injection rejected", async () => {
  const req = new Request("https://example.com", {
    method: "POST",
    headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "ACCEPT_PATTERN_MATCH",
      trace_id: "trace-1",
      target_type: "pattern",
      target_ref: "pattern:invisible_to_visible",
      reason: "good",
      evidence_refs: ["11111111-1111-4111-8111-111111111111"],
      approved_by: "00000000-0000-4000-8000-000000000999",
    }),
  });

  const res = await handleIntelligencePromotionWrite(req, buildDeps());
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error.code, "INVALID_INPUT");
});

Deno.test("missing trace rejected", async () => {
  const req = new Request("https://example.com", {
    method: "POST",
    headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "ACCEPT_PATTERN_MATCH",
      target_type: "pattern",
      target_ref: "pattern:invisible_to_visible",
      reason: "good",
      evidence_refs: ["11111111-1111-4111-8111-111111111111"],
    }),
  });

  const res = await handleIntelligencePromotionWrite(req, buildDeps());
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error.code, "INVALID_INPUT");
});

Deno.test("missing evidence rejected where required", async () => {
  const req = new Request("https://example.com", {
    method: "POST",
    headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "ACCEPT_PATTERN_MATCH",
      trace_id: "trace-1",
      target_type: "pattern",
      target_ref: "pattern:invisible_to_visible",
      reason: "good",
      evidence_refs: [],
    }),
  });

  const res = await handleIntelligencePromotionWrite(req, buildDeps());
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error.code, "INVALID_INPUT");
});

Deno.test("cross-owner evidence rejected", async () => {
  const req = new Request("https://example.com", {
    method: "POST",
    headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "ACCEPT_PATTERN_MATCH",
      trace_id: "trace-1",
      target_type: "pattern",
      target_ref: "pattern:invisible_to_visible",
      reason: "good",
      evidence_refs: ["33333333-3333-4333-8333-333333333333"],
    }),
  });

  const res = await handleIntelligencePromotionWrite(
    req,
    buildDeps({
      evidenceRows: [{ id: "33333333-3333-4333-8333-333333333333", owner_user_id: "00000000-0000-4000-8000-000000000999" }],
    }),
  );
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error.code, "INVALID_INPUT");
});

Deno.test("exact replay idempotent", async () => {
  const payload = {
    action: "ACCEPT_PATTERN_MATCH",
    trace_id: "trace-1",
    target_type: "pattern",
    target_ref: "pattern:invisible_to_visible",
    reason: "same reasons",
    evidence_refs: ["11111111-1111-4111-8111-111111111111"],
  };

  const deps = buildDeps();
  const req1 = new Request("https://example.com", {
    method: "POST",
    headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const res1 = await handleIntelligencePromotionWrite(req1, deps);
  assertEquals(res1.status, 200);

  const req2 = new Request("https://example.com", {
    method: "POST",
    headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const res2 = await handleIntelligencePromotionWrite(req2, deps);
  assertEquals(res2.status, 200);
  const body = await res2.json();
  assertEquals(body.data.status, "replayed");
});

Deno.test("conflicting replay rejected", async () => {
  const payload = {
    action: "ACCEPT_PATTERN_MATCH",
    trace_id: "trace-1",
    target_type: "pattern",
    target_ref: "pattern:invisible_to_visible",
    reason: "same reasons",
    evidence_refs: ["11111111-1111-4111-8111-111111111111"],
  };

  const deps = buildDeps();
  const req1 = new Request("https://example.com", {
    method: "POST",
    headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const first = await handleIntelligencePromotionWrite(req1, deps);
  assertEquals(first.status, 200);

  const req2 = new Request("https://example.com", {
    method: "POST",
    headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, reason: "different reason" }),
  });
  const second = await handleIntelligencePromotionWrite(req2, deps);
  assertEquals(second.status, 409);
  const body = await second.json();
  assertEquals(body.error.code, "IDEMPOTENCY_CONFLICT");
});

Deno.test("decision creation rejected", async () => {
  const req = new Request("https://example.com", {
    method: "POST",
    headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "REJECT_CANDIDATE",
      trace_id: "trace-1",
      target_type: "candidate",
      target_ref: "candidate:athrty-0001",
      reason: "reject",
      evidence_refs: ["11111111-1111-4111-8111-111111111111"],
      table: "decision_paths",
    }),
  });

  const res = await handleIntelligencePromotionWrite(req, buildDeps());
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error.code, "INVALID_INPUT");
});

Deno.test("outcome creation rejected", async () => {
  const req = new Request("https://example.com", {
    method: "POST",
    headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "MARK_UNCERTAIN",
      trace_id: "trace-1",
      target_type: "candidate",
      target_ref: "candidate:athrty-0001",
      reason: "uncertain",
      evidence_refs: ["11111111-1111-4111-8111-111111111111"],
      table: "outcomes",
    }),
  });

  const res = await handleIntelligencePromotionWrite(req, buildDeps());
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error.code, "INVALID_INPUT");
});

Deno.test("lesson creation rejected", async () => {
  const req = new Request("https://example.com", {
    method: "POST",
    headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "REQUEST_MORE_EVIDENCE",
      trace_id: "trace-1",
      target_type: "candidate",
      target_ref: "candidate:athrty-0001",
      reason: "need more evidence",
      missing_state: ["missing provenance"],
      evidence_refs: ["11111111-1111-4111-8111-111111111111"],
      table: "lessons",
    }),
  });

  const res = await handleIntelligencePromotionWrite(req, buildDeps());
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error.code, "INVALID_INPUT");
});

Deno.test("arbitrary write rejected", async () => {
  const req = new Request("https://example.com", {
    method: "POST",
    headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "ACCEPT_SIGNAL",
      trace_id: "trace-1",
      target_type: "signal",
      target_ref: "signal:portal-visibility",
      reason: "good",
      evidence_refs: ["11111111-1111-4111-8111-111111111111"],
      sql: "drop table public.active_constructs",
    }),
  });

  const res = await handleIntelligencePromotionWrite(req, buildDeps());
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error.code, "INVALID_INPUT");
});

Deno.test("validation accepts strict schema", () => {
  const valid = validatePromotionPayload({
    action: "ACCEPT_PATTERN_MATCH",
    trace_id: "trace-1",
    target_type: "pattern",
    target_ref: "pattern:invisible_to_visible",
    reason: "good",
    evidence_refs: ["11111111-1111-4111-8111-111111111111"],
  });
  assertExists(valid.trace_id);
  assertEquals(valid.action, "ACCEPT_PATTERN_MATCH");
});
