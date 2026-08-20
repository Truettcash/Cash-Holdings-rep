import { strict as assert } from "node:assert";
import { test } from "node:test";

import { handleIntelligenceMcpRead, validatePayload, sanitizeConstruct, sanitizeSignal, sanitizeEvidenceRef } from "./index.ts";

function makeQuery(rows: Record<string, any>[], apply: (row: Record<string, any>) => boolean = () => true) {
  const filtered = rows.filter(apply);
  const builder: any = {
    then: (resolve: (value: { data: Record<string, any>[] | Record<string, any> | null; error: null }) => void) => resolve({ data: filtered, error: null }),
    select: () => builder,
    eq: (field: string, value: unknown) => makeQuery(rows, (row) => String(row[field]) === String(value)),
    in: (field: string, values: unknown[]) => makeQuery(rows, (row) => values.includes(row[field])),
    ilike: (field: string, value: string) => {
      const needle = value.replace(/%/gi, "").toLowerCase();
      return makeQuery(rows, (row) => String(row[field]).toLowerCase().includes(needle));
    },
    order: () => builder,
    limit: (count: number) => makeQuery(filtered.slice(0, count)),
    maybeSingle: async () => ({ data: filtered[0] ?? null, error: null }),
  };
  return builder;
}

function makeUserClient() {
  const rows: Record<string, any[]> = {
    active_constructs: [
      {
        id: "11111111-1111-4111-8111-111111111111",
        construct_type: "operating_model",
        title: "ATHRTY CRM Foundation Stage",
        summary: "Current CRM foundation is established.",
        state: "active",
        status: "active",
        confidence_level: "high",
        first_observed_at: "2025-01-01T00:00:00Z",
        last_observed_at: "2025-01-16T00:00:00Z",
        resolved_at: null,
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-16T00:00:00Z",
      },
    ],
    intelligence_signals: [
      {
        id: "22222222-2222-4222-8222-222222222222",
        signal_type: "status",
        summary: "ATHRTY CRM foundation is established.",
        status: "accepted",
        confidence_level: "medium",
        scope: "crm",
        reason: "source-backed evidence",
        observed_at: "2025-01-16T00:00:00Z",
        created_at: "2025-01-16T00:00:00Z",
        updated_at: "2025-01-16T00:00:00Z",
      },
    ],
    construct_signals: [
      {
        id: "33333333-3333-4333-8333-333333333333",
        construct_id: "11111111-1111-4111-8111-111111111111",
        signal_id: "22222222-2222-4222-8222-222222222222",
        relationship_type: "supports",
        is_supporting: true,
        created_at: "2025-01-16T00:00:00Z",
      },
    ],
    signal_evidence: [
      {
        id: "44444444-4444-4444-8444-444444444444",
        signal_id: "22222222-2222-4222-8222-222222222222",
        evidence_ref_id: "55555555-5555-4555-8555-555555555555",
        created_at: "2025-01-16T00:00:00Z",
      },
    ],
    intelligence_evidence_refs: [
      {
        id: "55555555-5555-4555-8555-555555555555",
        evidence_kind: "knowledge",
        source_id: "66666666-6666-4666-8666-666666666666",
        document_id: "77777777-7777-4777-8777-777777777777",
        content_id: "88888888-8888-4888-8888-888888888888",
        citation_id: "99999999-9999-4999-8999-999999999999",
        observed_at: "2025-01-16T00:00:00Z",
        evidence_summary: "ATHRTY foundation exists",
        created_at: "2025-01-16T00:00:00Z",
        updated_at: "2025-01-16T00:00:00Z",
        source: {
          id: "66666666-6666-4666-8666-666666666666",
          title: "ATHRTY source",
          source_type: "document",
          authority_level: "canonical",
          origin_url: "https://example.com/source",
          source_created_at: "2025-01-01T00:00:00Z",
          source_updated_at: "2025-01-16T00:00:00Z",
          ingested_at: "2025-01-16T00:00:00Z",
        },
        document: {
          id: "77777777-7777-4777-8777-777777777777",
          title: "ATHRTY CRM overview",
          content_type: "document",
          brand_scope_type: "global",
          version: 2,
          is_current: true,
          created_at: "2025-01-01T00:00:00Z",
          updated_at: "2025-01-16T00:00:00Z",
        },
        content: {
          id: "88888888-8888-4888-8888-888888888888",
          document_id: "77777777-7777-4777-8777-777777777777",
          chunk_index: 0,
          content: "CRM foundation established.",
        },
        citation: {
          id: "99999999-9999-4999-8999-999999999999",
          content_id: "88888888-8888-4888-8888-888888888888",
          document_id: "77777777-7777-4777-8777-777777777777",
          source_id: "66666666-6666-4666-8666-666666666666",
          source_locator: { page: 1 },
        },
      },
    ],
  };

  return {
    auth: {
      getUser: async () => ({ data: { user: { id: "actor-1" } }, error: null }),
    },
    from: (table: string) => {
      const tableRows = rows[table] ?? [];
      const builder: any = {
        select: () => builder,
        eq: (field: string, value: unknown) => makeQuery(tableRows, (row) => String(row[field]) === String(value)),
        in: (field: string, values: unknown[]) => makeQuery(tableRows, (row) => values.includes(row[field])),
        ilike: (field: string, value: string) => {
          const needle = value.replace(/%/gi, "").toLowerCase();
          return makeQuery(tableRows, (row) => String(row[field]).toLowerCase().includes(needle));
        },
        order: () => builder,
        limit: (count: number) => makeQuery(tableRows.slice(0, count)),
        maybeSingle: async () => ({ data: tableRows[0] ?? null, error: null }),
      };
      return builder;
    },
  };
}

test("auth required", async () => {
  const req = new Request("https://example.com", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "list_constructs" }),
  });

  const res = await handleIntelligenceMcpRead(req, { createClient: () => ({ auth: { getUser: async () => ({ data: { user: null }, error: null }) } }) as any });
  assert.equal(res.status, 401);
  const body = await res.json();
  assert.equal(body.error.code, "AUTH_REQUIRED");
});

test("validation rejects unsupported action and owner_user_id", async () => {
  const req = new Request("https://example.com", {
    method: "POST",
    headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
    body: JSON.stringify({ action: "list_constructs", owner_user_id: "bad" }),
  });

  const res = await handleIntelligenceMcpRead(req, { createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: "actor-1" } }, error: null }) } }) as any });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.error.code, "INVALID_INPUT");
});

test("exactly four actions are supported", () => {
  assert.deepEqual(["list_constructs", "get_construct", "get_signal", "get_context"], ["list_constructs", "get_construct", "get_signal", "get_context"]);
  const validated = validatePayload({ action: "list_constructs" });
  assert.equal(validated.action, "list_constructs");
  assert.throws(() => validatePayload({ action: "delete_construct" as any }), /INVALID_ACTION/);
});

test("construct retrieval returns linked signals and evidence refs", async () => {
  const client = makeUserClient();
  const req = new Request("https://example.com", {
    method: "POST",
    headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
    body: JSON.stringify({ action: "get_construct", construct_id: "11111111-1111-4111-8111-111111111111" }),
  });

  const res = await handleIntelligenceMcpRead(req, { createClient: () => client });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.action, "get_construct");
  assert.equal(body.data.construct.title, "ATHRTY CRM Foundation Stage");
  assert.equal(body.data.linked_signals.length, 1);
  assert.equal(body.data.evidence_refs[0].evidence_kind, "knowledge");
});

test("signal retrieval returns metadata and evidence refs with derived marking", async () => {
  const client = makeUserClient();
  const req = new Request("https://example.com", {
    method: "POST",
    headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
    body: JSON.stringify({ action: "get_signal", signal_id: "22222222-2222-4222-8222-222222222222" }),
  });

  const res = await handleIntelligenceMcpRead(req, { createClient: () => client });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.data.signal.classification, "DERIVED INTELLIGENCE");
  assert.equal(body.data.evidence_refs.length, 1);
});

test("context assembly returns only observed_evidence, derived_signals, active_constructs, sources, gaps", async () => {
  const client = makeUserClient();
  const req = new Request("https://example.com", {
    method: "POST",
    headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
    body: JSON.stringify({ action: "get_context", construct_id: "11111111-1111-4111-8111-111111111111" }),
  });

  const res = await handleIntelligenceMcpRead(req, { createClient: () => client });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body.data.observed_evidence));
  assert.ok(Array.isArray(body.data.derived_signals));
  assert.ok(Array.isArray(body.data.active_constructs));
  assert.ok(Array.isArray(body.data.sources));
  assert.ok(Array.isArray(body.data.gaps));
  assert.equal("recommendations" in body.data, false);
  assert.equal("strategy" in body.data, false);
});

test("missing provenance fails closed", async () => {
  const base = makeUserClient();
  const broken: any = {
    auth: base.auth,
    from: (table: string) => {
      if (table === "signal_evidence") {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                then: (resolve: (value: { data: any[]; error: null }) => void) => resolve({ data: [], error: null }),
              }),
            }),
          }),
        };
      }
      return base.from(table);
    },
  };

  const req = new Request("https://example.com", {
    method: "POST",
    headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
    body: JSON.stringify({ action: "get_signal", signal_id: "22222222-2222-4222-8222-222222222222" }),
  });

  const res = await handleIntelligenceMcpRead(req, { createClient: () => broken });
  assert.equal(res.status, 409);
  const body = await res.json();
  assert.equal(body.error.code, "INVALID_PROVENANCE");
});

test("sanitization strips owner_user_id and internal fields", () => {
  const sanitizedConstruct = sanitizeConstruct({
    id: "1",
    owner_user_id: "secret",
    title: "A",
    summary: "B",
    state: "active",
    status: "active",
    confidence_level: "high",
    created_at: "2025-01-01Z",
    updated_at: "2025-01-02Z",
    embedding: [1, 2, 3],
  } as any);
  assert.equal("owner_user_id" in sanitizedConstruct, false);
  assert.equal("embedding" in sanitizedConstruct, false);

  const sanitizedSignal = sanitizeSignal({
    id: "2",
    owner_user_id: "secret",
    summary: "X",
    status: "accepted",
    observed_at: "2025-01-01Z",
  } as any);
  assert.equal("owner_user_id" in sanitizedSignal, false);
  assert.equal(sanitizedSignal.classification, "DERIVED INTELLIGENCE");

  const sanitizedEvidence = sanitizeEvidenceRef({
    id: "3",
    owner_user_id: "secret",
    evidence_kind: "knowledge",
    source: { id: "s1", owner_user_id: "secret", title: "Source" },
    document: { id: "d1", owner_user_id: "secret", title: "Doc" },
    citation: { id: "c1", owner_user_id: "secret", source_locator: { page: 1 } },
  } as any);
  const evidenceSource = sanitizedEvidence.source as Record<string, unknown> | undefined;
  assert.equal("owner_user_id" in sanitizedEvidence, false);
  assert.equal(evidenceSource ? "owner_user_id" in evidenceSource : false, false);
});

test("no write path and no service-role dependency in the gateway contract", async () => {
  const client = makeUserClient();
  const req = new Request("https://example.com", {
    method: "POST",
    headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
    body: JSON.stringify({ action: "list_constructs" }),
  });
  const res = await handleIntelligenceMcpRead(req, {
    createClient: () => client,
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(Object.keys(body.data).includes("insert"), false);
  assert.equal("serviceRole" in client, false);
});
