/**
 * Ingestion core orchestrator.
 *
 * Owns persistence invariants only. Source-specific adapters (ChatGPT,
 * Gmail, CRM sync, file upload, ...) live outside this module and must
 * normalize their input into an IngestionEnvelope before calling here.
 *
 * Security: owner_user_id is NEVER taken from the envelope/caller payload.
 * It must come from the trusted authenticated context (auth.uid() via the
 * caller's own Supabase client), matching the R4A.1 RLS model exactly.
 */
import { normalizeContent } from "./normalize.ts";
import { chunkContent } from "./chunk.ts";
import type { ChunkRecord } from "./chunk.ts";
import { resolveBrandScope } from "./brand-scope.ts";
import { validateEntityRef } from "./entity-resolution.ts";
import type { IngestionEnvelope, IngestionOutcome, EntityRef } from "./types.ts";
import { IngestionError } from "./types.ts";

export interface SourceRow {
  id: string;
  owner_user_id: string;
}

export interface PreparedIngestionPayload {
  source: IngestionEnvelope["source"];
  document: IngestionEnvelope["document"] & {
    brand_scope_type: "global" | "brand" | "multi_brand";
    brand_ids: string[];
  };
  chunks: ChunkRecord[];
  entity_refs: EntityRef[];
}

export interface DocumentRow {
  id: string;
  version: number;
}

export interface ContentRow {
  id: string;
  chunk_index: number;
}

export interface IngestionDeps {
  findMatchingSource(args: {
    owner_user_id: string;
    source_type: string;
    source_ref_type?: string;
    source_ref_id?: string;
    source_external_key?: string;
    origin_url?: string;
  }): Promise<SourceRow | null>;

  insertSource(row: {
    owner_user_id: string;
    source_type: string;
    source_ref_type?: string;
    source_ref_id?: string;
    source_external_key?: string;
    title: string;
    origin_url?: string;
    authority_level: string;
    source_created_at?: string;
    source_updated_at?: string;
  }): Promise<SourceRow>;

  findCurrentDocument(source_id: string): Promise<(DocumentRow & { id: string }) | null>;

  getDocumentChunkFingerprint(document_id: string): Promise<Array<{ chunk_index: number; content_hash: string }>>;

  insertDocument(row: {
    source_id: string;
    title: string;
    content_type: string;
    brand_scope_type: string;
    version: number;
    supersedes_document_id?: string;
  }): Promise<DocumentRow>;

  markDocumentNotCurrent(document_id: string): Promise<void>;

  insertDocumentBrands(document_id: string, brand_ids: string[]): Promise<void>;

  insertContent(document_id: string, chunks: ChunkRecord[]): Promise<ContentRow[]>;

  findOrCreateEntity(owner_user_id: string, ref: EntityRef): Promise<{ id: string }>;

  linkContentEntity(content_id: string, entity_id: string): Promise<void>;

  insertCitation(row: {
    content_id: string;
    source_id: string;
    document_id: string;
    source_locator: Record<string, unknown>;
  }): Promise<void>;
}

export interface IngestionResult {
  outcome: IngestionOutcome;
  source_id: string;
  document_id: string;
  version: number;
  chunk_count: number;
}

function chunkFingerprintsEqual(
  a: Array<{ chunk_index: number; content_hash: string }>,
  b: ChunkRecord[],
): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort((x, y) => x.chunk_index - y.chunk_index);
  const sortedB = [...b].sort((x, y) => x.chunk_index - y.chunk_index);
  return sortedA.every(
    (row, index) =>
      row.chunk_index === sortedB[index].chunk_index &&
      row.content_hash === sortedB[index].content_hash,
  );
}

function validateEnvelope(envelope: IngestionEnvelope): void {
  if (!envelope.source.title.trim()) {
    throw new IngestionError("source.title is required");
  }
  if (!envelope.document.title.trim()) {
    throw new IngestionError("document.title is required");
  }
  const hasCanonicalPointer = envelope.source.source_ref_type !== undefined || envelope.source.source_ref_id !== undefined;
  if (hasCanonicalPointer && (!envelope.source.source_ref_type || !envelope.source.source_ref_id)) {
    throw new IngestionError("source_ref_type and source_ref_id must be supplied together");
  }

  const identityCount = [
    hasCanonicalPointer,
    Boolean(envelope.source.source_external_key?.trim()),
    Boolean(envelope.source.origin_url?.trim()),
  ].filter(Boolean).length;
  if (identityCount !== 1) {
    throw new IngestionError("exactly one stable source identity is required");
  }
  if (envelope.source.type === "manual_note" && !envelope.source.source_external_key?.trim()) {
    throw new IngestionError("manual_note requires source_external_key");
  }
}

/**
 * Performs every deterministic, non-persistence step once. The database RPC
 * receives this payload and owns only the race-sensitive source/version state
 * transition and all-or-nothing persistence.
 */
export async function prepareIngestionPayload(envelope: IngestionEnvelope): Promise<PreparedIngestionPayload> {
  validateEnvelope(envelope);
  const normalizedText = normalizeContent(envelope.content.text);
  const chunks = await chunkContent(normalizedText);
  const { brand_scope_type, brand_ids } = resolveBrandScope(envelope.document.brand_ids);
  const entity_refs = (envelope.entity_refs ?? []).map(validateEntityRef);
  return {
    source: envelope.source,
    document: { ...envelope.document, brand_scope_type, brand_ids },
    chunks,
    entity_refs,
  };
}

export async function ingestKnowledge(
  deps: IngestionDeps,
  ownerUserId: string,
  envelope: IngestionEnvelope,
): Promise<IngestionResult> {
  if (!ownerUserId) {
    throw new IngestionError("ownerUserId must come from the trusted authenticated context");
  }
  const prepared = await prepareIngestionPayload(envelope);
  const { chunks, entity_refs: entityRefs } = prepared;
  const { brand_scope_type, brand_ids } = prepared.document;

  let source = await deps.findMatchingSource({
    owner_user_id: ownerUserId,
    source_type: envelope.source.type,
    source_ref_type: envelope.source.source_ref_type,
    source_ref_id: envelope.source.source_ref_id,
    source_external_key: envelope.source.source_external_key,
    origin_url: envelope.source.origin_url,
  });

  let outcome: IngestionOutcome;

  if (!source) {
    source = await deps.insertSource({
      owner_user_id: ownerUserId,
      source_type: envelope.source.type,
      source_ref_type: envelope.source.source_ref_type,
      source_ref_id: envelope.source.source_ref_id,
      source_external_key: envelope.source.source_external_key,
      title: envelope.source.title,
      origin_url: envelope.source.origin_url,
      authority_level: envelope.source.authority_level,
      source_created_at: envelope.source.source_created_at,
      source_updated_at: envelope.source.source_updated_at,
    });
    outcome = "NEW";
  } else {
    outcome = "UNCHANGED"; // provisional; refined below once compared against current document
  }

  const currentDocument = source ? await deps.findCurrentDocument(source.id) : null;

  if (currentDocument) {
    const existingFingerprint = await deps.getDocumentChunkFingerprint(currentDocument.id);
    if (chunkFingerprintsEqual(existingFingerprint, chunks)) {
      // Identical normalized content already ingested as the current version.
      // Never overwrite provenance silently — no new rows are created.
      return {
        outcome: outcome === "NEW" ? "NEW" : "UNCHANGED",
        source_id: source.id,
        document_id: currentDocument.id,
        version: currentDocument.version,
        chunk_count: existingFingerprint.length,
      };
    }
    if (outcome !== "NEW") {
      outcome = "UPDATED";
    }
  }

  const version = currentDocument ? currentDocument.version + 1 : 1;
  if (currentDocument) {
    await deps.markDocumentNotCurrent(currentDocument.id);
  }

  const document = await deps.insertDocument({
    source_id: source.id,
    title: envelope.document.title,
    content_type: envelope.document.content_type,
    brand_scope_type,
    version,
    supersedes_document_id: currentDocument?.id,
  });

  if (brand_ids.length > 0) {
    await deps.insertDocumentBrands(document.id, brand_ids);
  }

  const contentRows = await deps.insertContent(document.id, chunks);

  for (const ref of entityRefs) {
    const entity = await deps.findOrCreateEntity(ownerUserId, ref);
    for (const contentRow of contentRows) {
      await deps.linkContentEntity(contentRow.id, entity.id);
    }
  }

  for (const contentRow of contentRows) {
    await deps.insertCitation({
      content_id: contentRow.id,
      source_id: source.id,
      document_id: document.id,
      source_locator: { chunk_index: contentRow.chunk_index },
    });
  }

  return {
    outcome,
    source_id: source.id,
    document_id: document.id,
    version,
    chunk_count: contentRows.length,
  };
}
