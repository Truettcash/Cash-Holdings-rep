import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import { prepareIngestionPayload } from "../edge-functions/knowledge-ingest/ingest.ts";
import type { IngestionEnvelope } from "../edge-functions/knowledge-ingest/types.ts";

type CashConfig = {
  supabase_url: string;
  publishable_key: string;
  bound_user_id: string;
};

type SessionState = {
  user_id: string;
  refresh_token: string;
};

type RefreshedSession = {
  access_token: string;
  refresh_token: string;
  user?: { id?: string };
};

type RpcResult = {
  result: "NEW" | "UNCHANGED" | "UPDATED";
  source_id: string;
  document_id: string;
  version: number;
  chunk_count: number;
};

type Brand = {
  id: string;
  key: string | null;
  name: string;
  slug: string;
  status: string | null;
  created_at: string | null;
};

const EXTERNAL_KEY = "athrty-crm-operating-note-v1";
const SOURCE_TITLE = "ATHRTY CRM Operating Note";
const INITIAL_CONTENT = "ATHRTY CRM work is being consolidated into one operating CRM inside Cash Holdings. Inbound, outbound, and Microsoft 365 activity should resolve into one filtered CRM and connect to project and pipeline state when work becomes active.";
const UPDATED_CONTENT = `${INITIAL_CONTENT}\n\nThis CRM should remain the single operational source for ATHRTY customer relationships.`;

function fail(message: string): never {
  throw new Error(message);
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

async function loadConfig(): Promise<CashConfig> {
  const config = await readJson<Partial<CashConfig>>(join(homedir(), ".cash-mcp", "config.json"));
  if (!config.supabase_url?.startsWith("https://") || !config.publishable_key || !config.bound_user_id) {
    fail("Cash MCP configuration is incomplete");
  }
  if (config.supabase_url !== "https://ldijllskwwmyhhbzspmb.supabase.co") {
    fail("Cash MCP configuration is not targeting ldijllskwwmyhhbzspmb");
  }
  return config as CashConfig;
}

async function refreshUserSession(config: CashConfig): Promise<{ token: string; userId: string }> {
  const state = await readJson<SessionState>(join(homedir(), ".cash-mcp", "session.json"));
  if (!state.user_id || !state.refresh_token || state.user_id !== config.bound_user_id) {
    fail("Cash session identity does not match its bound user");
  }
  const response = await fetch(`${config.supabase_url}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { apikey: config.publishable_key, "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: state.refresh_token }),
  });
  if (!response.ok) fail(`user session refresh failed with HTTP ${response.status}`);
  const session = await response.json() as RefreshedSession;
  if (!session.access_token || session.user?.id !== config.bound_user_id) {
    fail("refreshed session identity mismatch");
  }
  return { token: session.access_token, userId: config.bound_user_id };
}

async function rest<T>(config: CashConfig, token: string, path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${config.supabase_url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: config.publishable_key,
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { code?: string; message?: string } | null;
    const detail = payload?.code && payload?.message ? ` ${payload.code}: ${payload.message}` : "";
    fail(`authenticated REST request failed with HTTP ${response.status}${detail}`);
  }
  return await response.json() as T;
}

async function countRows(config: CashConfig, token: string, path: string): Promise<number> {
  const response = await fetch(`${config.supabase_url}/rest/v1/${path}`, {
    method: "HEAD",
    headers: {
      apikey: config.publishable_key,
      Authorization: `Bearer ${token}`,
      Prefer: "count=exact",
    },
  });
  if (!response.ok) fail(`authenticated count request failed with HTTP ${response.status}`);
  const contentRange = response.headers.get("content-range");
  const match = contentRange?.match(/\/(\d+|\*)$/);
  if (!match || match[1] === "*") fail("authenticated count response omitted an exact count");
  return Number(match[1]);
}

async function resolveAthrtyBrand(config: CashConfig, token: string): Promise<Brand> {
  const query = "brands?select=id,key,name,slug,status,created_at&or=(key.eq.ATHRTY.SYS,slug.eq.athrty-sys,name.eq.ATHRTY.SYS)";
  const brands = await rest<Brand[]>(config, token, query);
  if (brands.length !== 1) fail("ATHRTY.SYS did not resolve to exactly one canonical brand");
  return brands[0];
}

function buildEnvelope(brandId: string, content: string): IngestionEnvelope {
  return {
    source: {
      type: "manual_note",
      source_external_key: EXTERNAL_KEY,
      title: SOURCE_TITLE,
      authority_level: "supporting",
    },
    document: {
      title: SOURCE_TITLE,
      content_type: "text",
      brand_ids: [brandId],
    },
    content: { text: content },
    entity_refs: [
      { entity_type: "Brand", canonical_type: "brands", canonical_id: brandId },
      { entity_type: "Topic", display_name: "CRM" },
    ],
  };
}

async function invoke(config: CashConfig, token: string, envelope: IngestionEnvelope): Promise<RpcResult> {
  const prepared = await prepareIngestionPayload(envelope);
  const source = prepared.source;
  const rawResult = await rest<RpcResult | RpcResult[]>(config, token, "rpc/ingest_knowledge_v1", {
    method: "POST",
    body: JSON.stringify({
      p_source_type: source.type,
      p_source_ref_type: source.source_ref_type ?? null,
      p_source_ref_id: source.source_ref_id ?? null,
      p_source_external_key: source.source_external_key ?? null,
      p_source_title: source.title,
      p_origin_url: source.origin_url ?? null,
      p_authority_level: source.authority_level,
      p_source_created_at: source.source_created_at ?? null,
      p_source_updated_at: source.source_updated_at ?? null,
      p_document_title: prepared.document.title,
      p_content_type: prepared.document.content_type,
      p_brand_scope_type: prepared.document.brand_scope_type,
      p_brand_ids: prepared.document.brand_ids,
      p_chunks: prepared.chunks,
      p_entities: prepared.entity_refs,
    }),
  });
  const result = Array.isArray(rawResult) ? rawResult[0] : rawResult;
  if (!result || (Array.isArray(rawResult) && rawResult.length !== 1) || !["NEW", "UNCHANGED", "UPDATED"].includes(result.result)) {
    const shape = Array.isArray(rawResult)
      ? `array(${rawResult.length})`
      : typeof rawResult === "object" && rawResult !== null
        ? `object(${Object.keys(rawResult).sort().join(",")})`
        : typeof rawResult;
    fail(`RPC returned an invalid result contract: ${shape}`);
  }
  return result;
}

async function inspectInitialState(
  config: CashConfig,
  token: string,
  actorId: string,
): Promise<RpcResult> {
  const sources = await rest<Array<{ id: string }>(
    config,
    token,
    `knowledge_sources?select=id&source_external_key=eq.${EXTERNAL_KEY}`,
  );
  if (sources.length !== 1) fail("initial RPC did not leave exactly one owner-scoped source");
  const documents = await rest<Array<{ id: string; is_current: boolean; version: number }>>(
    config,
    token,
    `knowledge_documents?select=id,is_current,version&source_id=eq.${sources[0].id}&order=version.asc`,
  );
  if (documents.length !== 1 || !documents[0].is_current || documents[0].version !== 1) {
    fail("initial RPC did not leave exactly one current version-1 document");
  }
  const chunks = await rest<Array<{ id: string }>(
    config,
    token,
    `knowledge_content?select=id&document_id=eq.${documents[0].id}`,
  );
  if (chunks.length === 0) fail("initial RPC did not leave content chunks");
  return {
    result: "NEW",
    source_id: sources[0].id,
    document_id: documents[0].id,
    version: 1,
    chunk_count: chunks.length,
  };
}

async function diagnoseReadScope(config: CashConfig, token: string, expectedUserId: string): Promise<void> {
  const authResponse = await fetch(`${config.supabase_url}/auth/v1/user`, {
    headers: { apikey: config.publishable_key, Authorization: `Bearer ${token}` },
  });
  if (!authResponse.ok) fail(`authenticated user inspection failed with HTTP ${authResponse.status}`);
  const authUser = await authResponse.json() as { id?: string };
  const allSources = await rest<Array<{ id: string }>(config, token, "knowledge_sources?select=id");
  const keyedSources = await rest<Array<{ id: string }>(
    config,
    token,
    `knowledge_sources?select=id&source_external_key=eq.${EXTERNAL_KEY}`,
  );
  const shape = (value: unknown): string => Array.isArray(value)
    ? `array(${value.length})`
    : typeof value === "object" && value !== null
      ? `object(${Object.keys(value).sort().join(",")})`
      : typeof value;
  console.log(JSON.stringify({
    ok: true,
    mode: "READ_ONLY_DIAGNOSTIC",
    authenticated_identity_matches_session: authUser.id === expectedUserId,
    all_sources_response_shape: shape(allSources),
    target_source_response_shape: shape(keyedSources),
  }));
}

async function verify(
  config: CashConfig,
  token: string,
  actorId: string,
  brandId: string,
  result: RpcResult,
  expectedDocuments: number,
  expectedVersion: number,
): Promise<void> {
  const sourceCount = await countRows(
    config,
    token,
    `knowledge_sources?id=eq.${result.source_id}&source_external_key=eq.${EXTERNAL_KEY}&owner_user_id=eq.${actorId}`,
  );
  const documentCount = await countRows(config, token, `knowledge_documents?source_id=eq.${result.source_id}`);
  const currentDocumentCount = await countRows(config, token, `knowledge_documents?source_id=eq.${result.source_id}&is_current=is.true`);
  const expectedCurrentVersionCount = await countRows(
    config,
    token,
    `knowledge_documents?source_id=eq.${result.source_id}&version=eq.${expectedVersion}&is_current=is.true`,
  );
  const priorVersionRetiredCount = expectedVersion > 1
    ? await countRows(config, token, `knowledge_documents?source_id=eq.${result.source_id}&version=eq.${expectedVersion - 1}&is_current=is.false`)
    : 1;
  const chunkCount = await countRows(config, token, `knowledge_content?document_id=eq.${result.document_id}`);
  const citationCount = await countRows(config, token, `knowledge_citations?document_id=eq.${result.document_id}`);
  const brandLinkCount = await countRows(
    config,
    token,
    `knowledge_document_brands?document_id=eq.${result.document_id}&brand_id=eq.${brandId}`,
  );
  if (
    sourceCount !== 1 ||
    documentCount !== expectedDocuments ||
    currentDocumentCount !== 1 ||
    expectedCurrentVersionCount !== 1 ||
    priorVersionRetiredCount !== 1 ||
    chunkCount !== result.chunk_count ||
    citationCount !== result.chunk_count ||
    brandLinkCount !== 1
  ) {
    fail("post-ingestion verification failed");
  }
}

async function main(): Promise<void> {
  const execute = process.argv.includes("--execute");
  const resumeAfterNew = process.argv.includes("--resume-after-new");
  const inspectOnly = process.argv.includes("--inspect-initial-state");
  const diagnoseOnly = process.argv.includes("--diagnose-read-scope");
  if (resumeAfterNew && !execute) fail("--resume-after-new requires --execute");
  if (inspectOnly && execute) fail("--inspect-initial-state is read-only and cannot be combined with --execute");
  if (diagnoseOnly && execute) fail("--diagnose-read-scope is read-only and cannot be combined with --execute");
  const config = await loadConfig();
  const { token, userId } = await refreshUserSession(config);
  const brand = await resolveAthrtyBrand(config, token);
  const beforeBrandSnapshot = JSON.stringify(brand);

  if (!execute) {
    if (diagnoseOnly) {
      await diagnoseReadScope(config, token, userId);
      return;
    }
    if (inspectOnly) {
      const initial = await inspectInitialState(config, token, userId);
      await verify(config, token, userId, brand.id, initial, 1, 1);
      console.log(JSON.stringify({ ok: true, mode: "READ_ONLY_INITIAL_STATE", new_state_verified: true }));
      return;
    }
    console.log(JSON.stringify({ ok: true, mode: "READ_ONLY_PREFLIGHT", brand_resolved: true }));
    return;
  }

  if (resumeAfterNew) {
    const unchanged = await invoke(config, token, buildEnvelope(brand.id, INITIAL_CONTENT));
    if (unchanged.result !== "UNCHANGED" || unchanged.version !== 1) {
      fail(`exact replay expected UNCHANGED version 1, received ${unchanged.result} version ${unchanged.version}`);
    }
    await verify(config, token, userId, brand.id, unchanged, 1, 1);

    const updated = await invoke(config, token, buildEnvelope(brand.id, UPDATED_CONTENT));
    if (updated.result !== "UPDATED" || updated.version !== 2) {
      fail(`content update expected UPDATED version 2, received ${updated.result} version ${updated.version}`);
    }
    await verify(config, token, userId, brand.id, updated, 2, 2);

    const afterBrand = await resolveAthrtyBrand(config, token);
    if (JSON.stringify(afterBrand) !== beforeBrandSnapshot) fail("operating brand row changed during ingestion proof");

    console.log(JSON.stringify({
      ok: true,
      new: "CONFIRMED_FROM_PRODUCTION_STATE",
      unchanged: unchanged.result,
      updated: updated.result,
      source_deduplicated: true,
      document_versioned: true,
      brand_linked: true,
      chunks_and_citations_present: true,
      owner_bound: true,
      operating_brand_changed: false,
    }));
    return;
  }

  const first = await invoke(config, token, buildEnvelope(brand.id, INITIAL_CONTENT));
  if (first.result !== "NEW" || first.version !== 1) {
    fail(`first ingestion expected NEW version 1, received ${first.result} version ${first.version}`);
  }
  await verify(config, token, userId, brand.id, first, 1, 1);

  const second = await invoke(config, token, buildEnvelope(brand.id, INITIAL_CONTENT));
  if (second.result !== "UNCHANGED" || second.document_id !== first.document_id || second.version !== 1) {
    fail("identical ingestion did not return UNCHANGED for the original document");
  }
  await verify(config, token, userId, brand.id, second, 1, 1);

  const third = await invoke(config, token, buildEnvelope(brand.id, UPDATED_CONTENT));
  if (third.result !== "UPDATED" || third.version !== 2) fail("updated ingestion did not return UPDATED version 2");
  await verify(config, token, userId, brand.id, third, 2, 2);

  const afterBrand = await resolveAthrtyBrand(config, token);
  if (JSON.stringify(afterBrand) !== beforeBrandSnapshot) fail("operating brand row changed during ingestion proof");

  console.log(JSON.stringify({
    ok: true,
    new: first.result,
    unchanged: second.result,
    updated: third.result,
    source_deduplicated: true,
    document_versioned: true,
    brand_linked: true,
    chunks_and_citations_present: true,
    owner_bound: true,
    operating_brand_changed: false,
  }));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "unknown proof failure";
  console.error(JSON.stringify({ ok: false, error: message }));
  process.exitCode = 1;
});