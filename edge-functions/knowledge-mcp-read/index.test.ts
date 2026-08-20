import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  handleKnowledgeMcpRead,
  matchesBrandScope,
  matchesEntityScope,
  normalizeEvidence,
  dedupeSources,
  dedupeEntities,
  type NormalizedEvidence,
} from "./index.ts";

test("brand scope semantics: global/brand/multi-brand/unrelated", () => {
  const evidence = {
    content_id: "c1",
    document_id: "d1",
    source_id: "s1",
    chunk_index: 0,
    content: "Alpha beta",
    excerpt: "Alpha beta",
    rank: 1,
    document: {
      id: "d1",
      title: "Doc",
      content_type: "document",
      brand_scope_type: "brand",
      version: 1,
      is_current: true,
      created_at: "2025-01-01",
      updated_at: "2025-01-02",
      brand_ids: ["b1"],
    },
    source: {
      id: "s1",
      title: "Source",
      source_type: "document",
      authority_level: "canonical",
      origin_url: "https://example.com",
      source_created_at: "2025-01-01",
      source_updated_at: "2025-01-02",
      ingested_at: "2025-01-03",
    },
    brand_ids: ["b1"],
    entities: [],
    citation: { content_id: "c1", document_id: "d1", source_id: "s1", source_locator: {} },
  } as Partial<NormalizedEvidence> as NormalizedEvidence;

  assert.equal(matchesBrandScope(evidence, undefined), true);
  assert.equal(matchesBrandScope(evidence, "b1"), true);
  assert.equal(matchesBrandScope({ ...evidence, document: { ...evidence.document, brand_scope_type: "multi_brand", brand_ids: ["b2", "b3"] } }, "b1"), false);
  assert.equal(matchesBrandScope({ ...evidence, document: { ...evidence.document, brand_scope_type: "multi_brand", brand_ids: ["b1", "b3"] } }, "b1"), true);
});

test("entity semantics: exact and OR matching", () => {
  const evidence = {
    entities: [{ id: "e1" }, { id: "e2" }],
  } as Partial<NormalizedEvidence> as NormalizedEvidence;

  assert.equal(matchesEntityScope(evidence, ["e1"]), true);
  assert.equal(matchesEntityScope(evidence, ["e2", "e9"]), true);
  assert.equal(matchesEntityScope(evidence, ["e9"]), false);
});

test("normalizeEvidence strips prohibited internals", () => {
  const normalized = normalizeEvidence({
    content_id: "c1",
    document_id: "d1",
    source_id: "s1",
    chunk_index: 0,
    content: "Alpha beta",
    excerpt: "Alpha beta",
    rank: 12,
    document: { id: "d1", title: "Doc", brand_scope_type: "global", brand_ids: [], created_at: "2025-01-01", updated_at: "2025-01-02" },
    source: { id: "s1", title: "Source", source_type: "document", authority_level: "canonical", origin_url: "https://example.com", source_created_at: "2025-01-01", source_updated_at: "2025-01-02", ingested_at: "2025-01-03" },
    brand_ids: ["b1"],
    entities: [{ id: "e1", entity_type: "Person", canonical_type: null, canonical_id: null, display_name: "Jane" }],
    citation: { content_id: "c1", document_id: "d1", source_id: "s1", source_locator: { page: 2 } },
    owner_user_id: "u1",
    search_vector: "ignored",
    content_hash: "hash",
    embedding: [1, 2, 3],
  } as any);

  assert.equal(normalized.document.id, "d1");
  assert.equal(normalized.source.title, "Source");
  assert.equal((normalized as any).owner_user_id, undefined);
  assert.equal((normalized as any).embedding, undefined);
  assert.equal((normalized as any).search_vector, undefined);
});

test("dedupe helpers collapse repeated sources and entities", () => {
  const sources = [
    { id: "s1", title: "A" },
    { id: "s1", title: "A" },
    { id: "s2", title: "B" },
  ];
  const entities = [
    { id: "e1", entity_type: "Person", display_name: "Jane" },
    { id: "e1", entity_type: "Person", display_name: "Jane" },
    { id: "e2", entity_type: "Company", display_name: "Cash" },
  ];

  assert.equal(dedupeSources(sources).length, 2);
  assert.equal(dedupeEntities(entities).length, 2);
});

test("gateway search returns sanitized evidence and actor envelope", async () => {
  const fakeClient = {
    auth: {
      getUser: async () => ({ data: { user: { id: "actor-1" } }, error: null }),
    },
    from: (table: string) => {
      const responses: Record<string, any> = {
        knowledge_content: [
          {
            id: "c1",
            document_id: "d1",
            source_id: "s1",
            chunk_index: 0,
            content: "Alpha beta",
            content_hash: "c1hash",
            knowledge_documents: { id: "d1", title: "Doc", brand_scope_type: "global", is_current: true, source_id: "s1" },
            knowledge_sources: { id: "s1", title: "Source", source_type: "document", authority_level: "canonical", source_created_at: "2025-01-01", source_updated_at: "2025-01-02", ingested_at: "2025-01-03" },
          },
        ],
        knowledge_document_brands: [{ brand_id: "b1" }],
        knowledge_content_entities: [{ content_id: "c1", entity_id: "e1" }],
        knowledge_entities: [{ id: "e1", entity_type: "Person", canonical_type: null, canonical_id: null, display_name: "Jane" }],
        knowledge_citations: [{ content_id: "c1", document_id: "d1", source_id: "s1", source_locator: { page: 1 } }],
        knowledge_sources: [{ id: "s1", title: "Source", source_type: "document", authority_level: "canonical", origin_url: "https://example.com", source_created_at: "2025-01-01", source_updated_at: "2025-01-02", ingested_at: "2025-01-03", current_document_id: "d1", current_version: 1, brand_ids: ["b1"] }],
      };
      const rows = responses[table] ?? [];
      const builder: any = {
        __rows: rows,
        select: () => builder,
        eq: () => builder,
        in: () => builder,
        order: () => builder,
        limit: () => builder,
        textSearch: () => builder,
        maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      };
      return builder;
    },
  } as any;

  const req = new Request("https://example.com", {
    method: "POST",
    headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
    body: JSON.stringify({ action: "search", query: "Alpha" }),
  });

  const res = await handleKnowledgeMcpRead(req, {
    createClient: () => fakeClient,
  });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.action, "search");
  assert.equal(body.actor, "actor-1");
  assert.equal(body.data.query, "Alpha");
  assert.ok(Array.isArray(body.data.hits));
  assert.ok(body.data.hits.length >= 1);

  const hit = body.data.hits[0];
  assert.equal(hit.content_id, "c1");
  assert.equal(hit.document_id, "d1");
  assert.equal(hit.source_id, "s1");
  assert.equal(hit.excerpt, "Alpha beta");
  assert.equal(hit.chunk_index, 0);
  assert.equal(hit.source_title, "Source");
  assert.equal(hit.source_type, "document");
  assert.equal(hit.authority_level, "canonical");
  assert.deepEqual(hit.brand_ids, ["b1"]);
  assert.ok(Array.isArray(hit.entities));
  assert.deepEqual(hit.entities.map((entity: any) => entity.id), ["e1"]);
  assert.equal(hit.citation.content_id, "c1");
  assert.equal(hit.citation.document_id, "d1");
  assert.equal(hit.citation.source_id, "s1");
  assert.deepEqual(hit.citation.source_locator, { page: 1 });
  assert.equal("owner_user_id" in hit, false);
  assert.equal("embedding" in hit, false);
  assert.equal("search_vector" in hit, false);
  assert.equal("content_hash" in hit, false);
});

test("gateway rejects invalid action and malformed UUID", async () => {
  const req = new Request("https://example.com", {
    method: "POST",
    headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
    body: JSON.stringify({ action: "bad_action" }),
  });

  const res = await handleKnowledgeMcpRead(req, {
    createClient: () => ({
      auth: { getUser: async () => ({ data: { user: { id: "actor-1" } }, error: null }) },
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
    }) as any,
  });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.error.code, "INVALID_ACTION");
});
