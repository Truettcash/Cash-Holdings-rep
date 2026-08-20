import { createClient } from "@supabase/supabase-js";

declare const Deno: {
  env: {
    get: (key: string) => string | undefined;
  };
  serve: (handler: (req: Request) => Promise<Response> | Response) => void;
};

export type Action = "search" | "get_document" | "get_context" | "get_sources";
export type SourceType =
  | "manual_note"
  | "chatgpt_thread"
  | "document"
  | "crm"
  | "project"
  | "email"
  | "meeting"
  | "research_url"
  | "system_generated";

export type CandidateChunk = {
  content_id: string;
  document_id: string;
  source_id: string;
  chunk_index: number;
  content: string;
  rank: number;
  document?: NormalizedDocument;
  source?: NormalizedSource;
};

export type NormalizedSource = {
  id: string;
  title: string;
  source_type: string;
  authority_level: string;
  origin_url: string | null;
  source_created_at: string | null;
  source_updated_at: string | null;
  ingested_at: string | null;
};

export type NormalizedDocument = {
  id: string;
  title: string;
  content_type: string;
  brand_scope_type: "global" | "brand" | "multi_brand";
  version: number | null;
  is_current: boolean;
  created_at: string | null;
  updated_at: string | null;
  brand_ids: string[];
};

export type NormalizedEntity = {
  id: string;
  entity_type: string;
  canonical_type: string | null;
  canonical_id: string | null;
  display_name: string | null;
};

export type NormalizedCitation = {
  content_id: string;
  document_id: string;
  source_id: string;
  source_locator: Record<string, unknown>;
};

export type NormalizedEvidence = {
  content_id: string;
  document_id: string;
  source_id: string;
  chunk_index: number;
  content: string;
  excerpt: string;
  rank: number;
  document: NormalizedDocument;
  source: NormalizedSource;
  brand_ids: string[];
  entities: NormalizedEntity[];
  citation: NormalizedCitation;
};

export type RequestPayload = {
  action: Action;
  query?: string;
  brand_id?: string;
  entity_id?: string;
  entity_ids?: string[];
  source_type?: string;
  authority_level?: string;
  document_id?: string;
  current_only?: boolean;
  limit?: number;
};

export type HandlerDeps = {
  createClient: (authorizationHeader: string) => {
    auth: { getUser: () => Promise<{ data: { user: { id: string } | null }; error: { message: string } | null }> };
    from: (tableName: string) => any;
  };
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SOURCE_TYPES = new Set<SourceType>([
  "manual_note",
  "chatgpt_thread",
  "document",
  "crm",
  "project",
  "email",
  "meeting",
  "research_url",
  "system_generated",
]);
const AUTH_LEVELS = new Set(["canonical", "primary", "supporting", "unverified"]);
const ACTIONS: Action[] = ["search", "get_document", "get_context", "get_sources"];
const cors = {
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  Vary: "Origin",
};

const response = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...cors,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });

const error = (code: string, status: number) => response({ error: { code, message: code } }, status);

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

function parseLimit(value: unknown): number | null {
  if (value === undefined) return 20;
  if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > 50) return null;
  return Number(value);
}

export function normalizeSource(row: Record<string, unknown>): NormalizedSource {
  return {
    id: String(row.id),
    title: String(row.title ?? ""),
    source_type: String(row.source_type ?? ""),
    authority_level: String(row.authority_level ?? ""),
    origin_url: (row.origin_url as string | null) ?? null,
    source_created_at: (row.source_created_at as string | null) ?? null,
    source_updated_at: (row.source_updated_at as string | null) ?? null,
    ingested_at: (row.ingested_at as string | null) ?? null,
  };
}

export function normalizeDocument(row: Record<string, unknown>): NormalizedDocument {
  const brand_ids = Array.isArray(row.brand_ids) ? row.brand_ids.filter((id): id is string => typeof id === "string") : [];
  return {
    id: String(row.id),
    title: String(row.title ?? ""),
    content_type: String(row.content_type ?? ""),
    brand_scope_type: String(row.brand_scope_type ?? "global") as NormalizedDocument["brand_scope_type"],
    version: row.version !== null && row.version !== undefined ? Number(row.version) : null,
    is_current: Boolean(row.is_current),
    created_at: (row.created_at as string | null) ?? null,
    updated_at: (row.updated_at as string | null) ?? null,
    brand_ids,
  };
}

export function normalizeEntity(row: Record<string, unknown>): NormalizedEntity {
  return {
    id: String(row.id),
    entity_type: String(row.entity_type ?? ""),
    canonical_type: (row.canonical_type as string | null) ?? null,
    canonical_id: (row.canonical_id as string | null) ?? null,
    display_name: (row.display_name as string | null) ?? null,
  };
}

export function normalizeCitation(row: Record<string, unknown>): NormalizedCitation {
  return {
    content_id: String(row.content_id),
    document_id: String(row.document_id),
    source_id: String(row.source_id),
    source_locator: row.source_locator && typeof row.source_locator === "object" ? (row.source_locator as Record<string, unknown>) : {},
  };
}

export function normalizeEvidence(input: Partial<NormalizedEvidence> & Record<string, unknown>): NormalizedEvidence {
  const document = normalizeDocument((input.document ?? {}) as Record<string, unknown>);
  const source = normalizeSource((input.source ?? {}) as Record<string, unknown>);
  const citation = normalizeCitation((input.citation ?? {}) as Record<string, unknown>);
  const entities = Array.isArray(input.entities) ? input.entities.map((entity) => normalizeEntity(entity as Record<string, unknown>)) : [];
  const brand_ids = Array.isArray(input.brand_ids) ? input.brand_ids.filter((id): id is string => typeof id === "string") : document.brand_ids;

  return {
    content_id: String(input.content_id ?? citation.content_id),
    document_id: String(input.document_id ?? document.id ?? citation.document_id),
    source_id: String(input.source_id ?? source.id ?? citation.source_id),
    chunk_index: Number(input.chunk_index ?? 0),
    content: String(input.content ?? ""),
    excerpt: String(input.excerpt ?? input.content ?? ""),
    rank: Number(input.rank ?? 0),
    document,
    source,
    brand_ids,
    entities,
    citation,
  };
}

export function matchesBrandScope(evidence: Partial<NormalizedEvidence>, requestedBrandId?: string): boolean {
  if (!requestedBrandId) return true;
  const scope = evidence.document?.brand_scope_type ?? "global";
  if (scope === "global") return true;
  const brandIds = new Set((evidence.document?.brand_ids ?? evidence.brand_ids ?? []).filter(Boolean));
  return brandIds.has(requestedBrandId);
}

export function matchesEntityScope(evidence: Partial<NormalizedEvidence>, requestedEntityIds?: string[] | string): boolean {
  if (!requestedEntityIds) return true;
  const requested = Array.isArray(requestedEntityIds) ? requestedEntityIds : [requestedEntityIds];
  if (requested.length === 0) return true;
  const allowed = new Set(requested.filter(Boolean));
  return (evidence.entities ?? []).some((entity) => allowed.has(entity.id));
}

export function dedupeSources<T extends { id: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const row of rows) {
    if (!row || !row.id || seen.has(row.id)) continue;
    seen.add(row.id);
    result.push(row);
  }
  return result;
}

export function dedupeEntities<T extends { id: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const row of rows) {
    if (!row || !row.id || seen.has(row.id)) continue;
    seen.add(row.id);
    result.push(row);
  }
  return result;
}

async function queryRows<T = Record<string, unknown>>(query: Promise<{ data: T[] | null; error: { message: string } | null }> | { data: T[] | null; error: { message: string } | null } | { __rows?: T[] } | undefined): Promise<T[]> {
  const resolved = await Promise.resolve(query);
  if (!resolved) return [];
  if ("error" in resolved && resolved.error) throw new Error("QUERY_FAILED");
  if (Array.isArray((resolved as { data?: T[] }).data)) return (resolved as { data: T[] }).data;
  if (Array.isArray((resolved as { __rows?: T[] }).__rows)) return (resolved as { __rows: T[] }).__rows;
  return [];
}

async function querySingle<T = Record<string, unknown>>(query: Promise<{ data: T | null; error: { message: string } | null }> | { data: T | null; error: { message: string } | null } | { __row?: T | null } | undefined): Promise<T | null> {
  const resolved = await Promise.resolve(query);
  if (!resolved) return null;
  if ("error" in resolved && resolved.error) throw new Error("QUERY_FAILED");
  if ((resolved as { data?: T | null }).data !== undefined) return (resolved as { data: T | null }).data ?? null;
  if ((resolved as { __row?: T | null }).__row !== undefined) return (resolved as { __row: T | null }).__row ?? null;
  return null;
}

export async function fetchLexicalCandidates(
  client: any,
  query: string,
  limit = 20,
  sourceType?: string,
  authorityLevel?: string,
): Promise<CandidateChunk[]> {
  let q = client
    .from("knowledge_content")
    .select(
      "id, document_id, chunk_index, content, knowledge_documents!inner(id, title, brand_scope_type, is_current, source_id, knowledge_sources!inner(id, title, source_type, authority_level, origin_url, source_created_at, source_updated_at, ingested_at))"
    )
    .eq("knowledge_documents.is_current", true)
    .textSearch("search_vector", query, { type: "websearch" })
    .limit(limit);

  if (sourceType) q = q.eq("knowledge_documents.knowledge_sources.source_type", sourceType);
  if (authorityLevel) q = q.eq("knowledge_documents.knowledge_sources.authority_level", authorityLevel);

  const rows = await queryRows<any>(q);
  return rows.map((row: any, index: number) => {
    const document = row.knowledge_documents ?? {};
    const source = { ...(row.knowledge_sources ?? {}), ...(document.knowledge_sources ?? {}), ...(row.knowledge_documents?.knowledge_sources ?? {}) };
    const sourceId = String(source.id ?? row.source_id ?? document.source_id ?? "");
    const normalizedSource = normalizeSource({
      ...(source as Record<string, unknown>),
      id: sourceId,
      title: source.title ?? row.knowledge_sources?.title ?? "",
      source_type: source.source_type ?? row.knowledge_sources?.source_type ?? "",
      authority_level: source.authority_level ?? row.knowledge_sources?.authority_level ?? "",
      origin_url: source.origin_url ?? row.knowledge_sources?.origin_url ?? null,
      source_created_at: source.source_created_at ?? row.knowledge_sources?.source_created_at ?? null,
      source_updated_at: source.source_updated_at ?? row.knowledge_sources?.source_updated_at ?? null,
      ingested_at: source.ingested_at ?? row.knowledge_sources?.ingested_at ?? null,
    } as Record<string, unknown>);

    return {
      content_id: String(row.id),
      document_id: String(row.document_id),
      source_id: sourceId,
      chunk_index: Number(row.chunk_index ?? 0),
      content: String(row.content ?? ""),
      rank: index + 1,
      document: {
        id: String(document.id ?? row.document_id ?? ""),
        title: String(document.title ?? ""),
        content_type: "",
        brand_scope_type: String(document.brand_scope_type ?? "global") as NormalizedDocument["brand_scope_type"],
        version: null,
        is_current: Boolean(document.is_current),
        created_at: null,
        updated_at: null,
        brand_ids: [],
      },
      source: normalizedSource,
    };
  });
}

export async function fetchDocumentMetadata(client: any, documentId: string): Promise<Record<string, unknown> | null> {
  const row = await querySingle<any>(
    client
      .from("knowledge_documents")
      .select(
        "id, title, content_type, brand_scope_type, version, is_current, created_at, updated_at, source_id, knowledge_sources!inner(id, title, source_type, authority_level, origin_url, source_created_at, source_updated_at, ingested_at)"
      )
      .eq("id", documentId)
      .maybeSingle(),
  );
  return row;
}

export async function fetchSourceMetadata(client: any, sourceId: string): Promise<Record<string, unknown> | null> {
  const row = await querySingle<any>(
    client.from("knowledge_sources").select("id, title, source_type, authority_level, origin_url, source_created_at, source_updated_at, ingested_at").eq("id", sourceId).maybeSingle(),
  );
  return row;
}

export async function fetchDocumentBrands(client: any, documentId: string): Promise<string[]> {
  const rows = await queryRows<any>(client.from("knowledge_document_brands").select("brand_id").eq("document_id", documentId));
  return rows.map((row: any) => String(row.brand_id));
}

export async function fetchContentEntities(client: any, contentIds: string[]): Promise<Map<string, NormalizedEntity[]>> {
  if (!contentIds.length) return new Map();
  const rows = await queryRows<any>(
    client
      .from("knowledge_content_entities")
      .select("content_id, entity_id, knowledge_entities!inner(id, entity_type, canonical_type, canonical_id, display_name)")
      .in("content_id", contentIds),
  );

  const map = new Map<string, NormalizedEntity[]>();
  for (const row of rows) {
    let entity: Record<string, unknown> | null = row.knowledge_entities ?? null;
    if (!entity && row.entity_id) {
      entity = await querySingle<any>(
        client.from("knowledge_entities").select("id, entity_type, canonical_type, canonical_id, display_name").eq("id", row.entity_id).maybeSingle(),
      );
    }
    if (!entity) continue;

    const existing = map.get(String(row.content_id)) ?? [];
    existing.push(normalizeEntity(entity));
    map.set(String(row.content_id), existing);
  }
  return map;
}

export async function fetchCitations(client: any, contentIds: string[]): Promise<Map<string, NormalizedCitation>> {
  if (!contentIds.length) return new Map();
  const rows = await queryRows<any>(
    client.from("knowledge_citations").select("content_id, document_id, source_id, source_locator").in("content_id", contentIds),
  );
  const map = new Map<string, NormalizedCitation>();
  for (const row of rows) {
    const citation = normalizeCitation(row as Record<string, unknown>);
    map.set(String(row.content_id), citation);
  }
  return map;
}

export async function buildEvidenceRecords(client: any, candidates: CandidateChunk[]): Promise<NormalizedEvidence[]> {
  const contentIds = candidates.map((candidate) => candidate.content_id);
  const [brandMap, entityMap, citationMap] = await Promise.all([
    Promise.all(
      candidates.map(async (candidate) => [candidate.content_id, await fetchDocumentBrands(client, candidate.document_id)] as const),
    ),
    fetchContentEntities(client, contentIds),
    fetchCitations(client, contentIds),
  ]);

  const byContentBrand = new Map<string, string[]>(brandMap.map(([contentId, brandIds]) => [contentId, brandIds]));
  const records: NormalizedEvidence[] = [];

  for (const candidate of candidates) {
    const citation = citationMap.get(candidate.content_id);
    if (!citation) continue;

    const documentRow = candidate.document ??
      ((await fetchDocumentMetadata(client, candidate.document_id)) as Record<string, unknown> | null) ??
      ({ id: candidate.document_id, title: "", content_type: "", brand_scope_type: "global", version: null, is_current: true, created_at: null, updated_at: null } as Record<string, unknown>);

    const sourceRow = candidate.source ??
      ((await fetchSourceMetadata(client, candidate.source_id)) as Record<string, unknown> | null) ??
      ({ id: candidate.source_id, title: "", source_type: "", authority_level: "unverified", origin_url: null, source_created_at: null, source_updated_at: null, ingested_at: null } as Record<string, unknown>);

    const document = normalizeDocument({
      ...documentRow,
      brand_ids: byContentBrand.get(candidate.content_id) ?? [],
    } as Record<string, unknown>);
    const source = normalizeSource(sourceRow as Record<string, unknown>);
    const entities = (entityMap.get(candidate.content_id) ?? []).map((entity) => normalizeEntity(entity as Record<string, unknown>));
    const evidence = normalizeEvidence({
      content_id: candidate.content_id,
      document_id: candidate.document_id,
      source_id: candidate.source_id,
      chunk_index: candidate.chunk_index,
      content: candidate.content,
      excerpt: candidate.content,
      rank: candidate.rank,
      document,
      source,
      brand_ids: document.brand_ids,
      entities,
      citation,
    });
    records.push(evidence);
  }

  return records;
}

function parseRequestPayload(value: unknown): RequestPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("INVALID_INPUT");
  const payload = value as Record<string, unknown>;
  const action = payload.action;
  if (typeof action !== "string" || !ACTIONS.includes(action as Action)) throw new Error("INVALID_ACTION");

  const allowed: Record<Action, readonly string[]> = {
    search: ["action", "query", "brand_id", "entity_id", "source_type", "authority_level", "limit"],
    get_document: ["action", "document_id"],
    get_context: ["action", "query", "brand_id", "entity_ids", "limit"],
    get_sources: ["action", "brand_id", "source_type", "authority_level", "current_only", "limit"],
  };

  const actionKey = action as Action;
  const allowedKeys = allowed[actionKey] ?? [];
  if (Object.keys(payload).some((key) => !allowedKeys.includes(key))) {
    throw new Error("INVALID_INPUT");
  }

  if ((action === "search" || action === "get_context") && (typeof payload.query !== "string" || !payload.query.trim())) {
    throw new Error("INVALID_INPUT");
  }
  if (action === "get_document" && (!isUuid(payload.document_id) || !payload.document_id)) {
    throw new Error("INVALID_INPUT");
  }
  if (action === "search" && payload.entity_id !== undefined && !isUuid(payload.entity_id)) throw new Error("INVALID_INPUT");
  if (action === "get_context" && payload.entity_ids !== undefined && (!Array.isArray(payload.entity_ids) || payload.entity_ids.some((id) => !isUuid(id)))) {
    throw new Error("INVALID_INPUT");
  }
  if (payload.brand_id !== undefined && !isUuid(payload.brand_id)) throw new Error("INVALID_INPUT");
  if (payload.source_type !== undefined && !SOURCE_TYPES.has(payload.source_type as SourceType)) throw new Error("INVALID_INPUT");
  if (payload.authority_level !== undefined && !AUTH_LEVELS.has(String(payload.authority_level))) throw new Error("INVALID_INPUT");
  if (payload.limit !== undefined) {
    const parsed = parseLimit(payload.limit);
    if (parsed === null) throw new Error("INVALID_INPUT");
    payload.limit = parsed;
  }
  if (payload.current_only !== undefined && typeof payload.current_only !== "boolean") throw new Error("INVALID_INPUT");

  return {
    action: action as Action,
    query: typeof payload.query === "string" ? payload.query.trim() : undefined,
    brand_id: typeof payload.brand_id === "string" ? payload.brand_id : undefined,
    entity_id: typeof payload.entity_id === "string" ? payload.entity_id : undefined,
    entity_ids: Array.isArray(payload.entity_ids) ? payload.entity_ids.filter((id): id is string => typeof id === "string") : undefined,
    source_type: typeof payload.source_type === "string" ? payload.source_type : undefined,
    authority_level: typeof payload.authority_level === "string" ? payload.authority_level : undefined,
    document_id: typeof payload.document_id === "string" ? payload.document_id : undefined,
    current_only: typeof payload.current_only === "boolean" ? payload.current_only : true,
    limit: payload.limit !== undefined ? Number(payload.limit) : 20,
  };
}

async function executeSearch(client: any, payload: RequestPayload): Promise<Record<string, unknown>> {
  const limit = payload.limit ?? 20;
  const query = payload.query ?? "";
  const candidates = await fetchLexicalCandidates(client, query, limit, payload.source_type, payload.authority_level);
  const evidence = await buildEvidenceRecords(client, candidates);
  const filtered = evidence.filter((entry) => {
    if (!matchesBrandScope(entry, payload.brand_id)) return false;
    if (payload.entity_id && !matchesEntityScope(entry, payload.entity_id)) return false;
    if (payload.entity_ids && payload.entity_ids.length > 0 && !matchesEntityScope(entry, payload.entity_ids)) return false;
    if (payload.source_type && entry.source.source_type !== payload.source_type) return false;
    if (payload.authority_level && entry.source.authority_level !== payload.authority_level) return false;
    return true;
  });

  const ordered = filtered.sort((a, b) => a.rank - b.rank || a.chunk_index - b.chunk_index);
  const hits = ordered.slice(0, limit).map((entry) => ({
    content_id: entry.content_id,
    document_id: entry.document_id,
    source_id: entry.source_id,
    excerpt: entry.excerpt,
    chunk_index: entry.chunk_index,
    source_title: entry.source.title,
    source_type: entry.source.source_type,
    authority_level: entry.source.authority_level,
    source_created_at: entry.source.source_created_at,
    source_updated_at: entry.source.source_updated_at,
    ingested_at: entry.source.ingested_at,
    brand_ids: entry.brand_ids,
    entities: entry.entities,
    citation: {
      content_id: entry.citation.content_id,
      document_id: entry.citation.document_id,
      source_id: entry.citation.source_id,
      source_locator: entry.citation.source_locator,
    },
  }));

  return { query, hits, count: hits.length };
}

async function executeGetDocument(client: any, payload: RequestPayload): Promise<Record<string, unknown>> {
  const documentId = payload.document_id;
  if (!documentId) throw new Error("INVALID_INPUT");

  const documentRow = await fetchDocumentMetadata(client, documentId);
  if (!documentRow) throw new Error("NOT_FOUND");

  const sourceRow = documentRow.knowledge_sources ? documentRow.knowledge_sources : await fetchSourceMetadata(client, String(documentRow.source_id));
  const brandIds = await fetchDocumentBrands(client, documentId);
  const chunkRows = await queryRows<any>(
    client.from("knowledge_content").select("id, document_id, chunk_index, content").eq("document_id", documentId).order("chunk_index"),
  );
  const chunkIds = chunkRows.map((row: any) => String(row.id));
  const [citationMap, entityMap] = await Promise.all([fetchCitations(client, chunkIds), fetchContentEntities(client, chunkIds)]);

  const chunks = chunkRows
    .map((chunk: any) => {
      const citation = citationMap.get(String(chunk.id));
      if (!citation) return null;
      return {
        content_id: String(chunk.id),
        chunk_index: Number(chunk.chunk_index ?? 0),
        content: String(chunk.content ?? ""),
        citation: {
          content_id: citation.content_id,
          document_id: citation.document_id,
          source_id: citation.source_id,
          source_locator: citation.source_locator,
        },
        entities: (entityMap.get(String(chunk.id)) ?? []).map((entity) => normalizeEntity(entity as Record<string, unknown>)),
      };
    })
    .filter(Boolean) as Record<string, unknown>[];

  return {
    document: normalizeDocument({
      ...documentRow,
      brand_ids: brandIds,
    } as Record<string, unknown>),
    source: normalizeSource(sourceRow as Record<string, unknown>),
    brand_ids: brandIds,
    chunks,
  };
}

async function executeGetSources(client: any, payload: RequestPayload): Promise<Record<string, unknown>> {
  const limit = payload.limit ?? 20;
  const currentOnly = payload.current_only ?? true;
  const sourceRows = await queryRows<any>(client.from("knowledge_sources").select("id, title, source_type, authority_level, origin_url, source_created_at, source_updated_at, ingested_at").limit(limit));
  const currentDocs = await queryRows<any>(client.from("knowledge_documents").select("id, source_id, version, is_current, brand_scope_type").eq("is_current", true));
  const currentBySource = new Map<string, Record<string, unknown>>();
  for (const doc of currentDocs) currentBySource.set(String(doc.source_id), doc);

  const results: Record<string, unknown>[] = [];
  for (const sourceRow of sourceRows) {
    if (payload.source_type && sourceRow.source_type !== payload.source_type) continue;
    if (payload.authority_level && sourceRow.authority_level !== payload.authority_level) continue;

    const currentDoc = currentOnly ? currentBySource.get(String(sourceRow.id)) : null;
    const currentDocumentId = currentDoc ? String(currentDoc.id) : null;
    const currentVersion = currentDoc ? Number(currentDoc.version ?? 0) : null;
    const brandIds = currentDocumentId ? await fetchDocumentBrands(client, currentDocumentId) : [];

    if (payload.brand_id && currentDocumentId && currentDoc) {
      const evidenceLike = {
        document: {
          id: String(currentDoc.id),
          title: String(currentDoc.title ?? ""),
          content_type: "",
          brand_scope_type: String(currentDoc.brand_scope_type ?? "global") as NormalizedDocument["brand_scope_type"],
          version: Number(currentDoc.version ?? 0),
          is_current: Boolean(currentDoc.is_current),
          created_at: null,
          updated_at: null,
          brand_ids: brandIds,
        },
        brand_ids: brandIds,
      } as Partial<NormalizedEvidence>;
      if (!matchesBrandScope(evidenceLike, payload.brand_id)) continue;
    }

    results.push({
      source_id: String(sourceRow.id),
      title: String(sourceRow.title ?? ""),
      source_type: String(sourceRow.source_type ?? ""),
      authority_level: String(sourceRow.authority_level ?? ""),
      origin_url: sourceRow.origin_url ?? null,
      source_created_at: sourceRow.source_created_at ?? null,
      source_updated_at: sourceRow.source_updated_at ?? null,
      ingested_at: sourceRow.ingested_at ?? null,
      current_document_id: currentDocumentId,
      current_version: currentVersion,
      brand_ids: brandIds,
    });
  }

  return { sources: results.slice(0, limit), count: results.length };
}

async function executeGetContext(client: any, payload: RequestPayload): Promise<Record<string, unknown>> {
  const query = payload.query ?? "";
  const candidates = await fetchLexicalCandidates(client, query, payload.limit ?? 20, undefined, undefined);
  const evidence = await buildEvidenceRecords(client, candidates);
  const filtered = evidence.filter((entry) => {
    if (!matchesBrandScope(entry, payload.brand_id)) return false;
    if (payload.entity_ids && payload.entity_ids.length > 0 && !matchesEntityScope(entry, payload.entity_ids)) return false;
    return true;
  });
  const dedupedSources = dedupeSources(filtered.map((entry) => entry.source));
  const dedupedEntities = dedupeEntities(filtered.flatMap((entry) => entry.entities));
  const bounded = filtered.slice(0, payload.limit ?? 20).map((entry) => normalizeEvidence(entry));

  return {
    query,
    scope: {
      brand_id: payload.brand_id ?? null,
      entity_ids: payload.entity_ids ?? [],
      current_only: true,
    },
    knowledge: bounded,
    sources: dedupedSources,
    entities: dedupedEntities,
    gaps: bounded.length === 0 ? ["No current source-backed knowledge matched the supplied query."] : [],
  };
}

async function executeAction(client: any, payload: RequestPayload): Promise<Record<string, unknown>> {
  switch (payload.action) {
    case "search":
      return executeSearch(client, payload);
    case "get_document":
      return executeGetDocument(client, payload);
    case "get_context":
      return executeGetContext(client, payload);
    case "get_sources":
      return executeGetSources(client, payload);
    default:
      throw new Error("INVALID_ACTION");
  }
}

export async function handleKnowledgeMcpRead(req: Request, deps: HandlerDeps = {
  createClient: (authorizationHeader: string) =>
    createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authorizationHeader } },
    }),
}): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return error("INVALID_INPUT", 405);

  const authHeader = req.headers.get("authorization");
  if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) return error("AUTH_REQUIRED", 401);

  try {
    const payload = parseRequestPayload(await req.json());
    const client = deps.createClient(authHeader);
    const { data: authData, error: authError } = await client.auth.getUser();
    if (authError || !authData?.user) return error("AUTH_INVALID", 401);

    const data = await executeAction(client, payload);
    return response({ ok: true, action: payload.action, actor: authData.user.id, data }, 200);
  } catch (errorValue) {
    const message = errorValue instanceof Error ? errorValue.message : "INTERNAL_SERVER_ERROR";
    const status = message === "NOT_FOUND" ? 404 : message === "QUERY_FAILED" ? 502 : 400;
    const code = ["INVALID_ACTION", "INVALID_INPUT", "NOT_FOUND", "QUERY_FAILED"].includes(message) ? message : "INTERNAL_SERVER_ERROR";
    return error(code, status);
  }
}

if (import.meta.main) {
  Deno.serve((req) => handleKnowledgeMcpRead(req));
}