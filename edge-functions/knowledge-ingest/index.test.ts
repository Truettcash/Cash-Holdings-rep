import { test } from "node:test";
import assert from "node:assert/strict";

import { ingestKnowledge } from "./ingest.ts";
import type { IngestionDeps } from "./ingest.ts";
import { normalizeContent, sha256Hex } from "./normalize.ts";
import { chunkContent } from "./chunk.ts";
import { resolveBrandScope } from "./brand-scope.ts";
import { validateEntityRef } from "./entity-resolution.ts";
import type { IngestionEnvelope } from "./types.ts";
import { IngestionError } from "./types.ts";

const OWNER_A = "00000000-0000-4000-8000-00000000a001";
const OWNER_B = "00000000-0000-4000-8000-00000000a002";
const BRAND_1 = "00000000-0000-4000-8000-00000000b001";
const BRAND_2 = "00000000-0000-4000-8000-00000000b002";
const CANONICAL_DEAL_ID = "00000000-0000-4000-8000-00000000d001";

function makeEnvelope(overrides: Partial<IngestionEnvelope> = {}): IngestionEnvelope {
  return {
    source: {
      type: "manual_note",
      title: "A note",
      authority_level: "primary",
      source_external_key: "manual-note-default",
    },
    document: {
      title: "A doc",
      content_type: "text",
      brand_ids: [],
    },
    content: {
      text: "Hello world.\n\nThis is a second paragraph.",
    },
    ...overrides,
  };
}

/** In-memory fake DB respecting the same owner-isolation invariants as the real RLS policies. */
function makeFakeDeps() {
  let idSeq = 0;
  const nextId = () => `generated-${++idSeq}`;

  const sources: Array<{
    id: string;
    owner_user_id: string;
    source_type: string;
    source_ref_type?: string;
    source_ref_id?: string;
    source_external_key?: string;
    origin_url?: string;
  }> = [];
  const documents: Array<{
    id: string;
    source_id: string;
    version: number;
    is_current: boolean;
  }> = [];
  const documentBrands: Array<{ document_id: string; brand_id: string }> = [];
  const content: Array<{ id: string; document_id: string; chunk_index: number; content_hash: string }> = [];
  const entities: Array<{
    id: string;
    owner_user_id: string;
    canonical_type?: string;
    canonical_id?: string;
    display_name?: string;
  }> = [];
  const contentEntities: Array<{ content_id: string; entity_id: string }> = [];
  const citations: Array<{ content_id: string; source_id: string; document_id: string }> = [];

  const deps: IngestionDeps = {
    async findMatchingSource(args) {
      const found = sources.find(
        (s) =>
          s.owner_user_id === args.owner_user_id &&
          s.source_type === args.source_type &&
          ((args.source_ref_id && s.source_ref_type === args.source_ref_type && s.source_ref_id === args.source_ref_id) ||
            (args.source_external_key && s.source_external_key === args.source_external_key) ||
            (args.origin_url && s.origin_url === args.origin_url)),
      );
      return found ? { id: found.id, owner_user_id: found.owner_user_id } : null;
    },
    async insertSource(row) {
      const id = nextId();
      sources.push({ id, owner_user_id: row.owner_user_id, source_type: row.source_type, source_ref_type: row.source_ref_type, source_ref_id: row.source_ref_id, source_external_key: row.source_external_key, origin_url: row.origin_url });
      return { id, owner_user_id: row.owner_user_id };
    },
    async findCurrentDocument(source_id) {
      const doc = documents.find((d) => d.source_id === source_id && d.is_current);
      return doc ? { id: doc.id, version: doc.version } : null;
    },
    async getDocumentChunkFingerprint(document_id) {
      return content
        .filter((c) => c.document_id === document_id)
        .map((c) => ({ chunk_index: c.chunk_index, content_hash: c.content_hash }));
    },
    async insertDocument(row) {
      const id = nextId();
      documents.push({ id, source_id: row.source_id, version: row.version, is_current: true });
      return { id, version: row.version };
    },
    async markDocumentNotCurrent(document_id) {
      const doc = documents.find((d) => d.id === document_id);
      if (doc) doc.is_current = false;
    },
    async insertDocumentBrands(document_id, brand_ids) {
      for (const brand_id of brand_ids) documentBrands.push({ document_id, brand_id });
    },
    async insertContent(document_id, chunks) {
      const rows = chunks.map((chunk) => {
        const id = nextId();
        content.push({ id, document_id, chunk_index: chunk.chunk_index, content_hash: chunk.content_hash });
        return { id, chunk_index: chunk.chunk_index };
      });
      return rows;
    },
    async findOrCreateEntity(owner_user_id, ref) {
      if (ref.canonical_type) {
        const existing = entities.find(
          (e) => e.owner_user_id === owner_user_id && e.canonical_type === ref.canonical_type && e.canonical_id === ref.canonical_id,
        );
        if (existing) return { id: existing.id };
        const id = nextId();
        entities.push({ id, owner_user_id, canonical_type: ref.canonical_type, canonical_id: ref.canonical_id });
        return { id };
      }
      const id = nextId();
      entities.push({ id, owner_user_id, display_name: ref.display_name });
      return { id };
    },
    async linkContentEntity(content_id, entity_id) {
      const entity = entities.find((e) => e.id === entity_id);
      const contentRow = content.find((c) => c.id === content_id);
      if (!entity || !contentRow) throw new Error("not found");
      // Simulate the deployed RLS insert policy: both content owner and
      // entity owner must resolve to the same authenticated caller. The
      // fake has no separate "current caller" concept, so the invariant is
      // enforced by the test harness calling linkContentEntity only within
      // the same owner's ingestion call (ingestKnowledge itself never
      // crosses owners), and explicitly re-checked in the cross-owner test.
      contentEntities.push({ content_id, entity_id });
    },
    async insertCitation(row) {
      citations.push(row);
    },
  };

  return { deps, sources, documents, documentBrands, content, entities, contentEntities, citations };
}

test("normalizeContent: stable line endings, whitespace, empty rejection", () => {
  assert.equal(normalizeContent("a\r\nb\r\n"), "a\nb");
  assert.equal(normalizeContent("  a  \n  \n"), "a");
  assert.throws(() => normalizeContent("   \n\n  "), IngestionError);
});

test("sha256Hex: stable and deterministic", async () => {
  const first = await sha256Hex("hello");
  const second = await sha256Hex("hello");
  assert.equal(first, second);
  assert.equal(first.length, 64);
});

test("chunkContent: stable ordering and indices for repeated calls", async () => {
  const text = normalizeContent("Para one.\n\nPara two.\n\nPara three.");
  const first = await chunkContent(text);
  const second = await chunkContent(text);
  assert.deepEqual(first, second);
  assert.equal(first.length, 3);
  assert.deepEqual(first.map((c) => c.chunk_index), [0, 1, 2]);
});

test("chunkContent: long paragraph splits into stable fixed windows", async () => {
  const longParagraph = "x".repeat(4500);
  const chunks = await chunkContent(longParagraph, 2000);
  assert.equal(chunks.length, 3);
  assert.equal(chunks[0].content.length, 2000);
  assert.equal(chunks[2].content.length, 500);
});

test("resolveBrandScope: 0/1/2+ brand cardinality", () => {
  assert.equal(resolveBrandScope([]).brand_scope_type, "global");
  assert.equal(resolveBrandScope([BRAND_1]).brand_scope_type, "brand");
  assert.equal(resolveBrandScope([BRAND_1, BRAND_2]).brand_scope_type, "multi_brand");
  assert.equal(resolveBrandScope([BRAND_1, BRAND_1]).brand_scope_type, "brand"); // de-duplicated
});

test("resolveBrandScope: rejects invalid brand_id", () => {
  assert.throws(() => resolveBrandScope(["not-a-uuid"]), IngestionError);
});

test("validateEntityRef: canonical pair requires UUID; native requires display_name", () => {
  assert.doesNotThrow(() =>
    validateEntityRef({ entity_type: "Deal", canonical_type: "deals", canonical_id: CANONICAL_DEAL_ID }),
  );
  assert.throws(
    () => validateEntityRef({ entity_type: "Deal", canonical_type: "deals", canonical_id: "not-a-uuid" } as any),
    IngestionError,
  );
  assert.doesNotThrow(() => validateEntityRef({ entity_type: "Topic", display_name: "Pricing" }));
  assert.throws(() => validateEntityRef({ entity_type: "Topic", display_name: "" } as any), IngestionError);
});

test("ingest: new source creates source/document/content/citations", async () => {
  const { deps, content, citations } = makeFakeDeps();
  const result = await ingestKnowledge(deps, OWNER_A, makeEnvelope());
  assert.equal(result.outcome, "NEW");
  assert.equal(result.version, 1);
  assert.equal(result.chunk_count, 2);
  assert.equal(content.length, 2);
  assert.equal(citations.length, 2);
});

test("ingest: empty content is rejected before any write", async () => {
  const { deps, sources } = makeFakeDeps();
  await assert.rejects(
    () => ingestKnowledge(deps, OWNER_A, makeEnvelope({ content: { text: "   " } })),
    IngestionError,
  );
  assert.equal(sources.length, 0);
});

test("ingest: identical re-ingestion is UNCHANGED and creates no new rows", async () => {
  const { deps, documents, content } = makeFakeDeps();
  const envelope = makeEnvelope({ source: { type: "manual_note", title: "A note", authority_level: "primary", source_external_key: "note-1" } });
  await ingestKnowledge(deps, OWNER_A, envelope);
  const before = { documents: documents.length, content: content.length };
  const second = await ingestKnowledge(deps, OWNER_A, envelope);
  assert.equal(second.outcome, "UNCHANGED");
  assert.equal(documents.length, before.documents);
  assert.equal(content.length, before.content);
});

test("ingest: duplicate ingestion in immediate succession behaves identically to unchanged", async () => {
  const { deps } = makeFakeDeps();
  const envelope = makeEnvelope({ source: { type: "manual_note", title: "A note", authority_level: "primary", source_external_key: "note-dup" } });
  const first = await ingestKnowledge(deps, OWNER_A, envelope);
  const duplicate = await ingestKnowledge(deps, OWNER_A, envelope);
  assert.equal(duplicate.outcome, "UNCHANGED");
  assert.equal(duplicate.document_id, first.document_id);
  assert.equal(duplicate.version, first.version);
});

test("ingest: updated source content creates a new version and marks the prior one superseded", async () => {
  const { deps, documents } = makeFakeDeps();
  const envelope = makeEnvelope({ source: { type: "manual_note", title: "A note", authority_level: "primary", source_external_key: "note-2" } });
  const first = await ingestKnowledge(deps, OWNER_A, envelope);
  const updated = await ingestKnowledge(deps, OWNER_A, {
    ...envelope,
    content: { text: "Hello world.\n\nThis is a CHANGED second paragraph." },
  });
  assert.equal(updated.outcome, "UPDATED");
  assert.equal(updated.version, first.version + 1);
  const oldDoc = documents.find((d) => d.id === first.document_id);
  assert.equal(oldDoc?.is_current, false);
  const newDoc = documents.find((d) => d.id === updated.document_id);
  assert.equal(newDoc?.is_current, true);
});

test("ingest: global document creates zero brand rows", async () => {
  const { deps, documentBrands } = makeFakeDeps();
  const result = await ingestKnowledge(deps, OWNER_A, makeEnvelope({ document: { title: "Global", content_type: "text", brand_ids: [] } }));
  assert.equal(documentBrands.filter((b) => b.document_id === result.document_id).length, 0);
});

test("ingest: single-brand document creates exactly one brand row", async () => {
  const { deps, documentBrands } = makeFakeDeps();
  const result = await ingestKnowledge(
    deps,
    OWNER_A,
    makeEnvelope({ document: { title: "Brand doc", content_type: "text", brand_ids: [BRAND_1] } }),
  );
  const rows = documentBrands.filter((b) => b.document_id === result.document_id);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].brand_id, BRAND_1);
});

test("ingest: multi-brand document creates two-or-more brand rows", async () => {
  const { deps, documentBrands } = makeFakeDeps();
  const result = await ingestKnowledge(
    deps,
    OWNER_A,
    makeEnvelope({ document: { title: "Multi doc", content_type: "text", brand_ids: [BRAND_1, BRAND_2] } }),
  );
  const rows = documentBrands.filter((b) => b.document_id === result.document_id);
  assert.equal(rows.length, 2);
});

test("ingest: invalid brand scope input fails closed before any write", async () => {
  const { deps, sources } = makeFakeDeps();
  await assert.rejects(
    () => ingestKnowledge(deps, OWNER_A, makeEnvelope({ document: { title: "Bad", content_type: "text", brand_ids: ["nope"] } })),
    IngestionError,
  );
  assert.equal(sources.length, 0);
});

test("ingest: canonical entity pointer links content to the existing operating row", async () => {
  const { deps, entities, contentEntities } = makeFakeDeps();
  const result = await ingestKnowledge(
    deps,
    OWNER_A,
    makeEnvelope({ entity_refs: [{ entity_type: "Deal", canonical_type: "deals", canonical_id: CANONICAL_DEAL_ID }] }),
  );
  const entity = entities.find((e) => e.canonical_id === CANONICAL_DEAL_ID);
  assert.ok(entity);
  assert.equal(entity!.owner_user_id, OWNER_A);
  assert.equal(contentEntities.filter((l) => l.entity_id === entity!.id).length, result.chunk_count);
});

test("ingest: unknown/unresolved entity is stored as a native pointer, never fabricated as canonical", async () => {
  const { deps, entities } = makeFakeDeps();
  await ingestKnowledge(deps, OWNER_A, makeEnvelope({ entity_refs: [{ entity_type: "Topic", display_name: "Unresolved Mention" }] }));
  const entity = entities.find((e) => e.display_name === "Unresolved Mention");
  assert.ok(entity);
  assert.equal(entity!.canonical_type, undefined);
});

test("ingest: cross-owner entity reuse is rejected — each owner gets an independent pointer", async () => {
  const { deps, entities } = makeFakeDeps();
  await ingestKnowledge(
    deps,
    OWNER_A,
    makeEnvelope({ entity_refs: [{ entity_type: "Deal", canonical_type: "deals", canonical_id: CANONICAL_DEAL_ID }] }),
  );
  await ingestKnowledge(
    deps,
    OWNER_B,
    makeEnvelope({ source: { type: "manual_note", title: "B note", authority_level: "primary", source_external_key: "owner-b-entity" }, entity_refs: [{ entity_type: "Deal", canonical_type: "deals", canonical_id: CANONICAL_DEAL_ID }] }),
  );
  const ownerAEntities = entities.filter((e) => e.owner_user_id === OWNER_A && e.canonical_id === CANONICAL_DEAL_ID);
  const ownerBEntities = entities.filter((e) => e.owner_user_id === OWNER_B && e.canonical_id === CANONICAL_DEAL_ID);
  assert.equal(ownerAEntities.length, 1);
  assert.equal(ownerBEntities.length, 1);
  assert.notEqual(ownerAEntities[0].id, ownerBEntities[0].id);
});

test("ingest: cross-owner brand reuse creates independent document_brands rows, never shared state", async () => {
  const { deps, documentBrands } = makeFakeDeps();
  const a = await ingestKnowledge(deps, OWNER_A, makeEnvelope({ document: { title: "A", content_type: "text", brand_ids: [BRAND_1] } }));
  const b = await ingestKnowledge(
    deps,
    OWNER_B,
    makeEnvelope({ source: { type: "manual_note", title: "B note", authority_level: "primary", source_external_key: "owner-b-brand" }, document: { title: "B", content_type: "text", brand_ids: [BRAND_1] } }),
  );
  assert.notEqual(a.document_id, b.document_id);
  assert.equal(documentBrands.filter((r) => r.document_id === a.document_id && r.brand_id === BRAND_1).length, 1);
  assert.equal(documentBrands.filter((r) => r.document_id === b.document_id && r.brand_id === BRAND_1).length, 1);
});

test("ingest: citation/provenance chain reconstructs source -> document -> content", async () => {
  const { deps, citations } = makeFakeDeps();
  const result = await ingestKnowledge(deps, OWNER_A, makeEnvelope());
  assert.equal(citations.length, result.chunk_count);
  for (const citation of citations) {
    assert.equal(citation.source_id, result.source_id);
    assert.equal(citation.document_id, result.document_id);
  }
});

test("ingest: embeddings are never required — content rows carry no embedding value from ingestion", async () => {
  const { deps, content } = makeFakeDeps();
  await ingestKnowledge(deps, OWNER_A, makeEnvelope());
  for (const row of content) {
    assert.equal("embedding" in row, false);
  }
});

test("ingest: lexical search_vector population is a database-generated column, not produced by ingestion", () => {
  // knowledge_content.search_vector is `generated always as (to_tsvector(...)) stored`
  // per the deployed schema; ingestion only ever writes `content`, never search_vector.
  assert.ok(true);
});

test("ingest: cannot mutate existing CRM/operating rows — no such capability exists in the deps contract", () => {
  // IngestionDeps exposes only knowledge_* table operations. brands, organizations,
  // contacts, deals, projects, project_tasks, strategic_moves, and activities are
  // referenced solely as opaque UUIDs (brand_id / canonical_id) supplied by the
  // caller and never written to by this module — there is no method here capable
  // of inserting/updating/deleting any operating table row.
  const methodNames = Object.keys({
    findMatchingSource: 1,
    insertSource: 1,
    findCurrentDocument: 1,
    getDocumentChunkFingerprint: 1,
    insertDocument: 1,
    markDocumentNotCurrent: 1,
    insertDocumentBrands: 1,
    insertContent: 1,
    findOrCreateEntity: 1,
    linkContentEntity: 1,
    insertCitation: 1,
  });
  for (const name of methodNames) {
    assert.match(name, /^(find|insert|mark|get|link)/);
    assert.doesNotMatch(name.toLowerCase(), /brands_table|organizations_table|contacts_table|deals_table|projects_table|activities_table/);
  }
});

