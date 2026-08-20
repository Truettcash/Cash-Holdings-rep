import { createClient } from "npm:@supabase/supabase-js@2.45.4";

declare const Deno: {
  env: {
    get: (key: string) => string | undefined;
  };
  serve: (handler: (req: Request) => Promise<Response> | Response) => void;
};

export type Action =
  | "list_constructs"
  | "get_construct"
  | "get_signal"
  | "get_context"
  | "list_patterns"
  | "get_pattern"
  | "match_patterns"
  | "list_constraints"
  | "get_constraint"
  | "get_reasoning_trace";

export type RequestPayload = {
  action: Action;
  construct_id?: string;
  signal_id?: string;
  status?: string;
  state?: string;
  limit?: number;
  query?: string;
  pattern_key?: string;
  constraint_id?: string;
  problem?: Record<string, unknown>;
};

export type HandlerDeps = {
  createClient: (authorizationHeader: string) => {
    auth: { getUser: () => Promise<{ data: { user: { id: string } | null }; error: { message: string } | null }> };
    from: (tableName: string) => any;
  };
};

type PatternDefinition = {
  id: string;
  pattern_key: string;
  name: string;
  description: string;
  pattern_family: string;
  status: string;
  problem_shape: string;
  structural_signature: Record<string, number>;
  typical_signals: string[];
  typical_constraints: string[];
  known_interventions: string[];
  expected_outcomes: string[];
  supporting_cases: string[];
  counterexamples: string[];
  failure_conditions: string[];
  transfer_conditions: string[];
  confidence: string;
  evidence_strength: string;
  observation_count: number;
  successful_application_count: number;
  failed_application_count: number;
  created_at: string;
  updated_at: string;
};

type ConstraintDefinition = {
  id: string;
  scope: string;
  description: string;
  constraint_family: string;
  supporting_signals: string[];
  supporting_patterns: string[];
  supporting_evidence: string[];
  counterevidence: string[];
  confidence: string;
  status: string;
  affected_capabilities: string[];
  affected_flows: string[];
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTIONS: Action[] = [
  "list_constructs",
  "get_construct",
  "get_signal",
  "get_context",
  "list_patterns",
  "get_pattern",
  "match_patterns",
  "list_constraints",
  "get_constraint",
  "get_reasoning_trace",
];
const ALLOWED_STATE_VALUES = new Set(["active", "weakening", "confirmed", "resolved", "superseded", "rejected"]);
const ALLOWED_STATUS_VALUES = new Set(["active", "weakening", "confirmed", "resolved", "superseded", "rejected", "proposed", "accepted"]);
const PATTERN_LIBRARY: PatternDefinition[] = [
  {
    id: "pattern-invisible-visible",
    pattern_key: "invisible_to_visible",
    name: "Invisible → Visible",
    description: "Critical state is not visible in a way that enables action or learning.",
    pattern_family: "invisible_to_visible",
    status: "active",
    problem_shape: "missing visible state",
    structural_signature: { visibility_gap: 0.9, signal_missing: 0.8 },
    typical_signals: ["missing status signal", "hidden operational state", "decision without trace"],
    typical_constraints: ["visibility", "information"],
    known_interventions: ["capture state explicitly", "surface operational metrics"],
    expected_outcomes: ["better visibility", "faster diagnosis"],
    supporting_cases: ["ATHRTY CRM Foundation Stage"],
    counterexamples: ["state is already visible"],
    failure_conditions: ["visibility is not the limiting factor"],
    transfer_conditions: ["move from missing visibility to action only when state remains hidden"],
    confidence: "medium",
    evidence_strength: "moderate",
    observation_count: 5,
    successful_application_count: 2,
    failed_application_count: 0,
    created_at: "2026-08-16T00:00:00Z",
    updated_at: "2026-08-16T00:00:00Z",
  },
  {
    id: "pattern-fragmented-structured",
    pattern_key: "fragmented_to_structured",
    name: "Fragmented → Structured",
    description: "Dispersed sources and unclear ownership create a fragmented operating model.",
    pattern_family: "fragmented_to_structured",
    status: "active",
    problem_shape: "fragmented intake with unclear ownership",
    structural_signature: { fragmented_input: 0.9, ownership_unclear: 0.8 },
    typical_signals: ["multiple disconnected sources", "unclear ownership", "repeated handoff"],
    typical_constraints: ["information", "ownership"],
    known_interventions: ["standardize intake", "assign ownership"],
    expected_outcomes: ["clearer ownership", "predictable process flow"],
    supporting_cases: ["ATHRTY CRM Foundation Stage"],
    counterexamples: ["single-source process with clear authority"],
    failure_conditions: ["ownership is already clear"],
    transfer_conditions: ["apply only when fragmentation is the source issue"],
    confidence: "medium",
    evidence_strength: "moderate",
    observation_count: 6,
    successful_application_count: 2,
    failed_application_count: 1,
    created_at: "2026-08-16T00:00:00Z",
    updated_at: "2026-08-16T00:00:00Z",
  },
  {
    id: "pattern-signal-knowledge",
    pattern_key: "signal_capture_to_knowledge_improvement",
    name: "Signal Capture → Knowledge → Improvement",
    description: "Signals become improvement when captured and linked to evidence and learning loops.",
    pattern_family: "signal_capture_to_knowledge_improvement",
    status: "active",
    problem_shape: "signal exists but learning loop is missing",
    structural_signature: { signal_capture: 0.8, knowledge_gap: 0.9 },
    typical_signals: ["signal not recorded", "lessons not captured", "repeated mistakes without learning"],
    typical_constraints: ["flow", "visibility"],
    known_interventions: ["capture evidence with provenance", "close the learning loop"],
    expected_outcomes: ["better future diagnosis", "reduced repeated failure"],
    supporting_cases: ["ATHRTY CRM Foundation Stage"],
    counterexamples: ["the system already has a robust learning loop"],
    failure_conditions: ["no repeated pattern exists"],
    transfer_conditions: ["apply only when the issue is knowledge drift rather than capability absence"],
    confidence: "medium",
    evidence_strength: "moderate",
    observation_count: 4,
    successful_application_count: 2,
    failed_application_count: 0,
    created_at: "2026-08-16T00:00:00Z",
    updated_at: "2026-08-16T00:00:00Z",
  },
] as const;
const CONSTRAINT_LIBRARY: ConstraintDefinition[] = [
  {
    id: "constraint-information-visibility-gap",
    scope: "current operating context",
    description: "Important state is not captured or visible in a way that supports action and learning.",
    constraint_family: "information",
    supporting_signals: ["missing status signal", "missing provenance", "hidden operating state"],
    supporting_patterns: ["invisible_to_visible", "signal_capture_to_knowledge_improvement"],
    supporting_evidence: ["observed evidence is limited to a construct without execution detail"],
    counterevidence: ["execution details are present elsewhere but not yet linked"],
    confidence: "medium",
    status: "candidate",
    affected_capabilities: ["diagnosis", "planning", "execution control"],
    affected_flows: ["information", "decision"],
  },
  {
    id: "constraint-ownership-unclarity",
    scope: "handoff and accountability",
    description: "The system cannot reliably absorb work because ownership is unclear across the flow.",
    constraint_family: "ownership",
    supporting_signals: ["multiple disconnected sources", "unclear ownership", "ambiguous handoff"],
    supporting_patterns: ["fragmented_to_structured"],
    supporting_evidence: ["no clear ownership or execution state was established in the available evidence"],
    counterevidence: ["clear ownership is present in an uninspected system state"],
    confidence: "medium",
    status: "candidate",
    affected_capabilities: ["execution", "coordination", "accountability"],
    affected_flows: ["work", "decision"],
  },
] as const;
const corsHeaders = {
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  Vary: "Origin",
};

function jsonResponse(body: unknown, status: number, req?: Request) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...(req?.headers.get("origin") ? { "Access-Control-Allow-Origin": req.headers.get("origin")! } : {}),
    },
  });
}

function errorResponse(code: string, status: number, req?: Request) {
  return jsonResponse({ error: { code, message: code } }, status, req);
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

function parseLimit(value: unknown): number | null {
  if (value === undefined) return 20;
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric < 1 || numeric > 50) return null;
  return numeric;
}

function stripSensitive<T extends Record<string, unknown>>(value: T): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (["owner_user_id", "embedding", "search_vector", "content_hash", "access_token", "refresh_token", "service_role"].includes(key)) continue;
    output[key] = entry;
  }
  return output;
}

function normalizeText(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function tokenSet(value: unknown): Set<string> {
  if (value === null || value === undefined) return new Set();
  const items = Array.isArray(value) ? value : [value];
  const out = new Set<string>();
  for (const item of items) {
    const text = normalizeText(item).replace(/[-_]/g, " ");
    if (!text) continue;
    const tokens = text.split(/\s+/).filter(Boolean);
    for (const token of tokens) out.add(token);
  }
  return out;
}

function overlap(left: unknown[] | string[] | Set<string>, right: unknown[] | string[] | Set<string>) {
  const a = left instanceof Set ? left : new Set((Array.isArray(left) ? left : [left]).map((item) => normalizeText(item).replace(/[-_]/g, " ")));
  const b = right instanceof Set ? right : new Set((Array.isArray(right) ? right : [right]).map((item) => normalizeText(item).replace(/[-_]/g, " ")));
  return Array.from(a).filter((item) => b.has(item));
}

function matchPattern(problem: Record<string, unknown>, pattern: PatternDefinition) {
  const symptoms = tokenSet(problem.symptoms ?? problem.signals ?? problem.observed ?? []);
  const patternSignals = tokenSet(pattern.typical_signals ?? []);
  const structural = pattern.structural_signature as Record<string, number> | undefined;
  const problemStruct = problem.structural_signature as Record<string, number> | undefined;
  const support = {
    symptom_similarity: symptoms.size > 0 && patternSignals.size > 0 ? Math.min(1, Array.from(symptoms).filter((item) => patternSignals.has(item)).length / Math.max(1, patternSignals.size + symptoms.size - 1)) : 0.0,
    structural_similarity: structural && problemStruct ? Object.keys(structural).filter((key) => key in (problemStruct ?? {})).length / Math.max(1, Object.keys(structural).length) : 0.0,
    flow_similarity: Array.isArray(problem.flow_paths) && Array.isArray(pattern.expected_outcomes) ? overlap(problem.flow_paths as string[], pattern.expected_outcomes as string[]).length / Math.max(1, Math.max((problem.flow_paths as string[]).length, (pattern.expected_outcomes as string[]).length)) : 0.0,
    constraint_similarity: Array.isArray(problem.constraints) && Array.isArray(pattern.typical_constraints) ? overlap(problem.constraints as string[], pattern.typical_constraints as string[]).length / Math.max(1, Math.max((problem.constraints as string[]).length, (pattern.typical_constraints as string[]).length)) : 0.0,
    context_similarity: (typeof problem.context === "string" && String(problem.context).toLowerCase().includes("foundation")) || (typeof problem.context === "string" && String(problem.context).toLowerCase().includes("crm")) ? 0.6 : 0.5,
    historical_outcome_similarity: Array.isArray(problem.expected_outcomes) && Array.isArray(pattern.expected_outcomes) ? overlap(problem.expected_outcomes as string[], pattern.expected_outcomes as string[]).length / Math.max(1, Math.max((problem.expected_outcomes as string[]).length, (pattern.expected_outcomes as string[]).length)) : 0.0,
  };
  const evidenceRefs = Array.isArray(problem.evidence_references) ? problem.evidence_references : [];
  const counterEvidence = Array.isArray(problem.counterevidence) ? problem.counterevidence : [];
  const weighted = Object.values(support).reduce((sum, value) => sum + Number(value ?? 0), 0) / Math.max(1, Object.keys(support).length);
  const penalty = counterEvidence.length * 0.12;
  const score = Math.max(0, Math.min(1, weighted * 1.5 + (evidenceRefs.length > 0 ? 0.2 : 0) - penalty));

  return {
    candidate_pattern: pattern,
    support,
    contradict: { counterevidence_strength: Math.min(1, counterEvidence.length / 3) },
    confidence: score,
    evidence_refs: evidenceRefs,
    counterevidence_refs: Array.isArray(problem.counterevidence_references) ? problem.counterevidence_references : [],
  };
}

export function sanitizeConstruct(input: Record<string, unknown>) {
  return stripSensitive({
    id: input.id,
    construct_type: input.construct_type,
    title: input.title,
    summary: input.summary,
    state: input.state,
    status: input.status,
    confidence_level: input.confidence_level ?? null,
    first_observed_at: input.first_observed_at ?? null,
    last_observed_at: input.last_observed_at ?? null,
    resolved_at: input.resolved_at ?? null,
    created_at: input.created_at ?? null,
    updated_at: input.updated_at ?? null,
  } as Record<string, unknown>);
}

export function sanitizeSignal(input: Record<string, unknown>) {
  return stripSensitive({
    id: input.id,
    signal_type: input.signal_type,
    summary: input.summary,
    status: input.status,
    confidence_level: input.confidence_level ?? null,
    scope: input.scope ?? null,
    reason: input.reason ?? null,
    observed_at: input.observed_at ?? null,
    created_at: input.created_at ?? null,
    updated_at: input.updated_at ?? null,
    classification: "DERIVED INTELLIGENCE",
  } as Record<string, unknown>);
}

export function sanitizeEvidenceRef(input: Record<string, unknown>) {
  const evidenceRef: Record<string, unknown> = stripSensitive({
    id: input.id,
    evidence_kind: input.evidence_kind,
    source_id: input.source_id ?? null,
    document_id: input.document_id ?? null,
    content_id: input.content_id ?? null,
    citation_id: input.citation_id ?? null,
    canonical_table: input.canonical_table ?? null,
    canonical_row_uuid: input.canonical_row_uuid ?? null,
    observed_at: input.observed_at ?? null,
    evidence_summary: input.evidence_summary ?? null,
    created_at: input.created_at ?? null,
    updated_at: input.updated_at ?? null,
  } as Record<string, unknown>);
  if (input.source && typeof input.source === "object") {
    evidenceRef.source = stripSensitive(input.source as Record<string, unknown>);
  }
  if (input.document && typeof input.document === "object") {
    evidenceRef.document = stripSensitive(input.document as Record<string, unknown>);
  }
  if (input.content && typeof input.content === "object") {
    evidenceRef.content = stripSensitive(input.content as Record<string, unknown>);
  }
  if (input.citation && typeof input.citation === "object") {
    evidenceRef.citation = stripSensitive(input.citation as Record<string, unknown>);
  }
  return evidenceRef;
}

export function sanitizeContextSource(input: Record<string, unknown>) {
  const data: Record<string, unknown> = stripSensitive({
    id: input.id,
    title: input.title ?? null,
    source_type: input.source_type ?? null,
    authority_level: input.authority_level ?? null,
    origin_url: input.origin_url ?? null,
    source_created_at: input.source_created_at ?? null,
    source_updated_at: input.source_updated_at ?? null,
    ingested_at: input.ingested_at ?? null,
  } as Record<string, unknown>);
  if (typeof input.document === "object" && input.document) {
    data.document = stripSensitive(input.document as Record<string, unknown>);
  }
  return data;
}

function buildDeps(): HandlerDeps {
  return {
    createClient: (authorizationHeader: string) => {
      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
      if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error("SUPABASE_URL or SUPABASE_ANON_KEY is missing");
      }
      return createClient(supabaseUrl, supabaseAnonKey, {
        global: {
          headers: {
            Authorization: authorizationHeader,
          },
        },
      }) as any;
    },
  };
}

async function requireAuthenticatedUser(client: any): Promise<{ id: string }> {
  const { data, error } = await client.auth.getUser();
  if (error || !data?.user?.id) {
    throw Object.assign(new Error("AUTH_INVALID"), { code: "AUTH_INVALID" as const });
  }
  return { id: data.user.id };
}

export function validatePayload(payload: unknown): RequestPayload {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw Object.assign(new Error("INVALID_INPUT"), { code: "INVALID_INPUT" as const });
  }
  const record = payload as Record<string, unknown>;
  const action = record.action;
  if (typeof action !== "string" || !ACTIONS.includes(action as Action)) {
    throw Object.assign(new Error("INVALID_ACTION"), { code: "INVALID_ACTION" as const });
  }

  const allowed: Record<Action, string[]> = {
    list_constructs: ["action", "status", "state", "limit"],
    get_construct: ["action", "construct_id"],
    get_signal: ["action", "signal_id"],
    get_context: ["action", "construct_id", "signal_id", "query", "limit"],
    list_patterns: ["action"],
    get_pattern: ["action", "pattern_key"],
    match_patterns: ["action", "problem", "limit"],
    list_constraints: ["action"],
    get_constraint: ["action", "constraint_id"],
    get_reasoning_trace: ["action", "problem"],
  };

  const unknown = Object.keys(record).filter((key) => !allowed[action as Action].includes(key));
  if (unknown.length > 0) {
    throw Object.assign(new Error("INVALID_INPUT"), { code: "INVALID_INPUT" as const });
  }
  if ("owner_user_id" in record) {
    throw Object.assign(new Error("INVALID_INPUT"), { code: "INVALID_INPUT" as const });
  }

  const parsed: RequestPayload = { action: action as Action };

  if ("construct_id" in record) {
    if (!isUuid(record.construct_id)) throw Object.assign(new Error("INVALID_INPUT"), { code: "INVALID_INPUT" as const });
    parsed.construct_id = String(record.construct_id);
  }
  if ("signal_id" in record) {
    if (!isUuid(record.signal_id)) throw Object.assign(new Error("INVALID_INPUT"), { code: "INVALID_INPUT" as const });
    parsed.signal_id = String(record.signal_id);
  }
  if ("status" in record) {
    if (typeof record.status !== "string" || !ALLOWED_STATUS_VALUES.has(record.status)) {
      throw Object.assign(new Error("INVALID_INPUT"), { code: "INVALID_INPUT" as const });
    }
    parsed.status = record.status;
  }
  if ("state" in record) {
    if (typeof record.state !== "string" || !ALLOWED_STATE_VALUES.has(record.state)) {
      throw Object.assign(new Error("INVALID_INPUT"), { code: "INVALID_INPUT" as const });
    }
    parsed.state = record.state;
  }
  if ("query" in record) {
    if (typeof record.query !== "string" || !record.query.trim()) {
      throw Object.assign(new Error("INVALID_INPUT"), { code: "INVALID_INPUT" as const });
    }
    parsed.query = record.query.trim();
  }
  if ("pattern_key" in record) {
    if (typeof record.pattern_key !== "string" || !record.pattern_key.trim()) {
      throw Object.assign(new Error("INVALID_INPUT"), { code: "INVALID_INPUT" as const });
    }
    parsed.pattern_key = record.pattern_key.trim();
  }
  if ("constraint_id" in record) {
    if (typeof record.constraint_id !== "string" || !record.constraint_id.trim()) {
      throw Object.assign(new Error("INVALID_INPUT"), { code: "INVALID_INPUT" as const });
    }
    parsed.constraint_id = record.constraint_id.trim();
  }
  if ("problem" in record) {
    if (!record.problem || typeof record.problem !== "object" || Array.isArray(record.problem)) {
      throw Object.assign(new Error("INVALID_INPUT"), { code: "INVALID_INPUT" as const });
    }
    parsed.problem = record.problem as Record<string, unknown>;
  }
  if ("limit" in record) {
    const limit = parseLimit(record.limit);
    if (limit === null) throw Object.assign(new Error("INVALID_INPUT"), { code: "INVALID_INPUT" as const });
    parsed.limit = limit;
  }

  if (parsed.action === "get_construct" && !parsed.construct_id) {
    throw Object.assign(new Error("INVALID_INPUT"), { code: "INVALID_INPUT" as const });
  }
  if (parsed.action === "get_signal" && !parsed.signal_id) {
    throw Object.assign(new Error("INVALID_INPUT"), { code: "INVALID_INPUT" as const });
  }
  if (parsed.action === "get_context") {
    if (!parsed.construct_id && !parsed.signal_id && !parsed.query) {
      throw Object.assign(new Error("INVALID_INPUT"), { code: "INVALID_INPUT" as const });
    }
  }
  if (parsed.action === "get_pattern" && !parsed.pattern_key) {
    throw Object.assign(new Error("INVALID_INPUT"), { code: "INVALID_INPUT" as const });
  }
  if (parsed.action === "get_constraint" && !parsed.constraint_id) {
    throw Object.assign(new Error("INVALID_INPUT"), { code: "INVALID_INPUT" as const });
  }
  if ((parsed.action === "match_patterns" || parsed.action === "get_reasoning_trace") && !parsed.problem) {
    throw Object.assign(new Error("INVALID_INPUT"), { code: "INVALID_INPUT" as const });
  }

  return parsed;
}

async function fetchMany<T extends Record<string, unknown>>(query: Promise<{ data: T[] | null; error: { message?: string } | null }>): Promise<T[]> {
  const { data, error } = await query;
  if (error) {
    throw Object.assign(new Error("QUERY_FAILED"), { code: "QUERY_FAILED" as const, detail: error.message ?? "query failed" });
  }
  return (data ?? []) as T[];
}

async function fetchOne<T extends Record<string, unknown>>(query: Promise<{ data: T | null; error: { message?: string } | null }>): Promise<T | null> {
  const { data, error } = await query;
  if (error) {
    throw Object.assign(new Error("QUERY_FAILED"), { code: "QUERY_FAILED" as const, detail: error.message ?? "query failed" });
  }
  return (data ?? null) as T | null;
}

async function loadConstructRelatedData(client: any, constructId: string) {
  const relatedLinks = await fetchMany(
    client
      .from("construct_signals")
      .select("id,construct_id,signal_id,relationship_type,is_supporting,created_at")
      .eq("construct_id", constructId)
      .order("created_at", { ascending: false }),
  );

  const signalIds = relatedLinks.map((row) => row.signal_id).filter(Boolean);
  if (signalIds.length === 0) {
    return { links: [], signals: [], evidenceRefs: [] as Record<string, unknown>[] };
  }

  const signals = await fetchMany(
    client
      .from("intelligence_signals")
      .select("id,signal_type,summary,status,confidence_level,scope,reason,observed_at,created_at,updated_at")
      .in("id", signalIds),
  );

  const signalMap = new Map(signals.map((signal) => [String(signal.id), signal]));
  const missingSignals = relatedLinks.filter((link) => !signalMap.has(String(link.signal_id)));
  if (missingSignals.length > 0) {
    throw Object.assign(new Error("INVALID_PROVENANCE"), { code: "INVALID_PROVENANCE" as const });
  }

  const evidenceRows = await fetchMany(
    client
      .from("signal_evidence")
      .select("id,signal_id,evidence_ref_id,created_at")
      .in("signal_id", signalIds),
  );
  const evidenceRefIds = evidenceRows.map((row) => row.evidence_ref_id).filter(Boolean);
  if (evidenceRefIds.length === 0) {
    return { links: relatedLinks, signals, evidenceRefs: [] as Record<string, unknown>[] };
  }

  const evidenceRefs = await fetchMany(
    client
      .from("intelligence_evidence_refs")
      .select("id,evidence_kind,source_id,document_id,content_id,citation_id,canonical_table,canonical_row_uuid,observed_at,evidence_summary,created_at,updated_at,source:source_id(id,title,source_type,authority_level,origin_url,source_created_at,source_updated_at,ingested_at),document:document_id(id,title,content_type,brand_scope_type,version,is_current,created_at,updated_at),content:content_id(id,document_id,chunk_index,content),citation:citation_id(id,content_id,document_id,source_id,source_locator)")
      .in("id", evidenceRefIds),
  );

  const evidenceRefMap = new Map(evidenceRefs.map((ref) => [String(ref.id), ref]));
  const missingEvidenceRefs = evidenceRows.filter((row) => !evidenceRefMap.has(String(row.evidence_ref_id)));
  if (missingEvidenceRefs.length > 0) {
    throw Object.assign(new Error("INVALID_PROVENANCE"), { code: "INVALID_PROVENANCE" as const });
  }

  return { links: relatedLinks, signals, evidenceRefs };
}

async function loadSignalRelatedData(client: any, signalId: string) {
  const evidenceRows = await fetchMany(
    client
      .from("signal_evidence")
      .select("id,signal_id,evidence_ref_id,created_at")
      .eq("signal_id", signalId)
      .order("created_at", { ascending: false }),
  );
  const evidenceRefIds = evidenceRows.map((row) => row.evidence_ref_id).filter(Boolean);
  if (evidenceRefIds.length === 0) {
    throw Object.assign(new Error("INVALID_PROVENANCE"), { code: "INVALID_PROVENANCE" as const });
  }

  const evidenceRefs = await fetchMany(
    client
      .from("intelligence_evidence_refs")
      .select("id,evidence_kind,source_id,document_id,content_id,citation_id,canonical_table,canonical_row_uuid,observed_at,evidence_summary,created_at,updated_at,source:source_id(id,title,source_type,authority_level,origin_url,source_created_at,source_updated_at,ingested_at),document:document_id(id,title,content_type,brand_scope_type,version,is_current,created_at,updated_at),content:content_id(id,document_id,chunk_index,content),citation:citation_id(id,content_id,document_id,source_id,source_locator)")
      .in("id", evidenceRefIds),
  );

  const evidenceRefMap = new Map(evidenceRefs.map((ref) => [String(ref.id), ref]));
  if (evidenceRows.some((row) => !evidenceRefMap.has(String(row.evidence_ref_id)))) {
    throw Object.assign(new Error("INVALID_PROVENANCE"), { code: "INVALID_PROVENANCE" as const });
  }

  return { evidenceRefs };
}

async function executeListConstructs(client: any, payload: RequestPayload) {
  let query = client
    .from("active_constructs")
    .select("id,construct_type,title,summary,state,status,confidence_level,first_observed_at,last_observed_at,resolved_at,created_at,updated_at");

  if (payload.state) query = query.eq("state", payload.state);
  if (payload.status) query = query.eq("status", payload.status);

  const rows = await fetchMany(
    query
      .order("last_observed_at", { ascending: false })
      .limit(payload.limit ?? 20),
  );

  return {
    constructs: rows.map((row) => sanitizeConstruct(row as Record<string, unknown>)),
    count: rows.length,
  };
}

async function executeGetConstruct(client: any, payload: RequestPayload) {
  const construct = await fetchOne(
    client
      .from("active_constructs")
      .select("id,construct_type,title,summary,state,status,confidence_level,first_observed_at,last_observed_at,resolved_at,created_at,updated_at")
      .eq("id", payload.construct_id!)
      .maybeSingle(),
  );
  if (!construct) throw Object.assign(new Error("NOT_FOUND"), { code: "NOT_FOUND" as const });

  const related = await loadConstructRelatedData(client, payload.construct_id!);
  const signals = related.signals.map((signal) => sanitizeSignal(signal as Record<string, unknown>));
  const evidenceRefs = related.evidenceRefs.map((ref) => sanitizeEvidenceRef(ref as Record<string, unknown>));

  const description = {
    construct: sanitizeConstruct(construct as Record<string, unknown>),
    linked_signals: related.links.map((link) => {
      const signalId = String(link.signal_id);
      const signal = signalMapFor(signalId, related.signals);
      return {
        id: link.id,
        construct_id: link.construct_id,
        signal_id: link.signal_id,
        relationship_type: link.relationship_type,
        is_supporting: link.is_supporting,
        signal: sanitizeSignal((signal ?? {}) as Record<string, unknown>),
      };
    }),
    evidence_refs: evidenceRefs,
  };

  return description;
}

function signalMapFor(signalId: string, signals: Record<string, unknown>[]) {
  return signals.find((signal) => String((signal as Record<string, unknown>).id) === signalId) ?? null;
}

async function executeGetSignal(client: any, payload: RequestPayload) {
  const signal = await fetchOne(
    client
      .from("intelligence_signals")
      .select("id,signal_type,summary,status,confidence_level,scope,reason,observed_at,created_at,updated_at")
      .eq("id", payload.signal_id!)
      .maybeSingle(),
  );
  if (!signal) throw Object.assign(new Error("NOT_FOUND"), { code: "NOT_FOUND" as const });

  const related = await loadSignalRelatedData(client, payload.signal_id!);
  return {
    signal: sanitizeSignal(signal as Record<string, unknown>),
    evidence_refs: related.evidenceRefs.map((ref) => sanitizeEvidenceRef(ref as Record<string, unknown>)),
    classification: "DERIVED INTELLIGENCE",
  };
}

async function executeGetContext(client: any, payload: RequestPayload) {
  const observedEvidence: Record<string, unknown>[] = [];
  const derivedSignals: Record<string, unknown>[] = [];
  const activeConstructs: Record<string, unknown>[] = [];
  const sources: Record<string, unknown>[] = [];
  const gaps: string[] = [];

  if (payload.construct_id) {
    const construct = await fetchOne(
      client
        .from("active_constructs")
        .select("id,construct_type,title,summary,state,status,confidence_level,first_observed_at,last_observed_at,resolved_at,created_at,updated_at")
        .eq("id", payload.construct_id)
        .maybeSingle(),
    );
    if (!construct) throw Object.assign(new Error("NOT_FOUND"), { code: "NOT_FOUND" as const });
    activeConstructs.push(sanitizeConstruct(construct as Record<string, unknown>));

    const related = await loadConstructRelatedData(client, payload.construct_id);
    for (const link of related.links) {
      const signal = related.signals.find((entry) => String((entry as Record<string, unknown>).id) === String(link.signal_id));
      if (!signal) {
        throw Object.assign(new Error("INVALID_PROVENANCE"), { code: "INVALID_PROVENANCE" as const });
      }
      derivedSignals.push(sanitizeSignal(signal as Record<string, unknown>));
    }
    for (const ref of related.evidenceRefs) {
      observedEvidence.push(sanitizeEvidenceRef(ref as Record<string, unknown>));
      if ((ref as Record<string, unknown>).source && typeof (ref as Record<string, unknown>).source === "object") {
        const source = (ref as Record<string, unknown>).source as Record<string, unknown>;
        sources.push(sanitizeContextSource(source));
      }
    }
  }

  if (payload.signal_id) {
    const signal = await fetchOne(
      client
        .from("intelligence_signals")
        .select("id,signal_type,summary,status,confidence_level,scope,reason,observed_at,created_at,updated_at")
        .eq("id", payload.signal_id)
        .maybeSingle(),
    );
    if (!signal) throw Object.assign(new Error("NOT_FOUND"), { code: "NOT_FOUND" as const });
    derivedSignals.push(sanitizeSignal(signal as Record<string, unknown>));

    const related = await loadSignalRelatedData(client, payload.signal_id);
    for (const ref of related.evidenceRefs) {
      observedEvidence.push(sanitizeEvidenceRef(ref as Record<string, unknown>));
      if ((ref as Record<string, unknown>).source && typeof (ref as Record<string, unknown>).source === "object") {
        const source = (ref as Record<string, unknown>).source as Record<string, unknown>;
        sources.push(sanitizeContextSource(source));
      }
    }
  }

  if (payload.query && !payload.construct_id && !payload.signal_id) {
    const constructMatches = await fetchMany(
      client
        .from("active_constructs")
        .select("id,construct_type,title,summary,state,status,confidence_level,first_observed_at,last_observed_at,resolved_at")
        .ilike("title", `%${payload.query}%`)
        .limit(10),
    );
    const signalMatches = await fetchMany(
      client
        .from("intelligence_signals")
        .select("id,signal_type,summary,status,confidence_level,scope,reason,observed_at")
        .ilike("summary", `%${payload.query}%`)
        .limit(10),
    );
    for (const construct of constructMatches) activeConstructs.push(sanitizeConstruct(construct as Record<string, unknown>));
    for (const signal of signalMatches) derivedSignals.push(sanitizeSignal(signal as Record<string, unknown>));
  }

  if (observedEvidence.length === 0 && (payload.construct_id || payload.signal_id)) {
    gaps.push("Missing provenance evidence for the requested intelligence item.");
  }

  return {
    observed_evidence: observedEvidence,
    derived_signals: derivedSignals,
    active_constructs: activeConstructs,
    sources: sources,
    gaps,
  };
}

async function executeListPatterns() {
  return { patterns: PATTERN_LIBRARY.map((pattern) => ({ ...pattern })) };
}

async function executeGetPattern(payload: RequestPayload) {
  const found = PATTERN_LIBRARY.find((pattern) => pattern.pattern_key === payload.pattern_key);
  if (!found) throw Object.assign(new Error("NOT_FOUND"), { code: "NOT_FOUND" as const });
  return { pattern: found };
}

async function executeMatchPatterns(payload: RequestPayload) {
  const problem = payload.problem ?? {};
  const candidates = PATTERN_LIBRARY.map((pattern) => matchPattern(problem, pattern)).filter((candidate) => candidate.confidence >= 0.2 || (Array.isArray(problem.evidence_references) && problem.evidence_references.length > 0));
  candidates.sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));
  return { matches: candidates.slice(0, Math.max(1, Number(payload.limit ?? 5))) };
}

async function executeListConstraints() {
  return { constraints: CONSTRAINT_LIBRARY.map((constraint) => ({ ...constraint })) };
}

async function executeGetConstraint(payload: RequestPayload) {
  const found = CONSTRAINT_LIBRARY.find((constraint) => constraint.id === payload.constraint_id);
  if (!found) throw Object.assign(new Error("NOT_FOUND"), { code: "NOT_FOUND" as const });
  return { constraint: found };
}

async function executeGetReasoningTrace(payload: RequestPayload) {
  const problem = payload.problem ?? {};
  const matches = await executeMatchPatterns(payload);
  return {
    trace: {
      observed: Array.isArray(problem.observed) ? problem.observed : [],
      derived: Array.isArray(problem.derived) ? problem.derived : [],
      hypothesis: Array.isArray(problem.hypothesis) ? problem.hypothesis : [],
      match_candidates: matches.matches,
      constraint_candidates: matches.matches.slice(0, 2).map((match) => ({
        id: `constraint-${match.candidate_pattern.pattern_key}`,
        constraint_family: match.candidate_pattern.typical_constraints?.[0] ?? "information",
        scope: typeof problem.scope === "string" ? problem.scope : "current operating context",
        supporting_evidence: Array.isArray(problem.observed) ? problem.observed : [],
        counterevidence: Array.isArray(problem.counterevidence) ? problem.counterevidence : [],
      })),
    },
  };
}

async function executeAction(client: any, payload: RequestPayload): Promise<Record<string, unknown>> {
  switch (payload.action) {
    case "list_constructs":
      return { data: await executeListConstructs(client, payload) };
    case "get_construct":
      return { data: await executeGetConstruct(client, payload) };
    case "get_signal":
      return { data: await executeGetSignal(client, payload) };
    case "get_context":
      return { data: await executeGetContext(client, payload) };
    case "list_patterns":
      return { data: await executeListPatterns() };
    case "get_pattern":
      return { data: await executeGetPattern(payload) };
    case "match_patterns":
      return { data: await executeMatchPatterns(payload) };
    case "list_constraints":
      return { data: await executeListConstraints() };
    case "get_constraint":
      return { data: await executeGetConstraint(payload) };
    case "get_reasoning_trace":
      return { data: await executeGetReasoningTrace(payload) };
    default:
      throw Object.assign(new Error("INVALID_ACTION"), { code: "INVALID_ACTION" as const });
  }
}

export async function handleIntelligenceMcpRead(req: Request, deps: HandlerDeps = buildDeps()): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("INVALID_INPUT", 405, req);

  const authorization = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!authorization || !authorization.toLowerCase().startsWith("bearer ")) {
    return errorResponse("AUTH_REQUIRED", 401, req);
  }

  let parsed: unknown;
  try {
    parsed = await req.json();
  } catch {
    return errorResponse("INVALID_INPUT", 400, req);
  }

  try {
    const payload = validatePayload(parsed);
    const client = deps.createClient(authorization);
    const actor = await requireAuthenticatedUser(client);
    const result = await executeAction(client, payload);
    return jsonResponse({ ok: true, action: payload.action, actor: actor.id, data: result.data }, 200, req);
  } catch (errorValue) {
    const message = errorValue instanceof Error ? errorValue.message : "INTERNAL_SERVER_ERROR";
    if (message === "AUTH_INVALID") return errorResponse("AUTH_INVALID", 401, req);
    if (message === "NOT_FOUND") return errorResponse("NOT_FOUND", 404, req);
    if (message === "INVALID_PROVENANCE") return errorResponse("INVALID_PROVENANCE", 409, req);
    if (message === "QUERY_FAILED") return errorResponse("QUERY_FAILED", 502, req);
    if (message === "INVALID_ACTION") return errorResponse("INVALID_ACTION", 400, req);
    if (message === "INVALID_INPUT") return errorResponse("INVALID_INPUT", 400, req);
    return errorResponse("INTERNAL_SERVER_ERROR", 500, req);
  }
}

if (import.meta.main) {
  Deno.serve((req) => handleIntelligenceMcpRead(req));
}
