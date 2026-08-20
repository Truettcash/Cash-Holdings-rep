import { createClient } from "npm:@supabase/supabase-js@2.45.4";

declare const Deno: {
  env: { get: (key: string) => string | undefined };
  serve: (handler: (req: Request) => Promise<Response> | Response) => void;
};

export type PromotionAction =
  | "ACCEPT_SIGNAL"
  | "ACCEPT_PATTERN_MATCH"
  | "ACCEPT_CONSTRAINT"
  | "REJECT_CANDIDATE"
  | "MARK_UNCERTAIN"
  | "REQUEST_MORE_EVIDENCE";

export type PromotionPayload = {
  action: PromotionAction;
  trace_id?: string;
  target_type?: "signal" | "pattern" | "constraint" | "candidate";
  target_ref?: string;
  reason?: string;
  scope?: string;
  evidence_refs?: string[];
  missing_state?: string[];
  notes?: string;
  expected_resulting_lifecycle_state?: string;
};

export type HandlerDeps = {
  createClient: (authorizationHeader: string) => {
    auth: { getUser: () => Promise<{ data: { user: { id: string } | null }; error: { message: string } | null }> };
    from: (tableName: string) => {
      select: (columns?: string) => any;
      insert: (rows: Record<string, unknown>[]) => any;
      maybeSingle: () => Promise<{ data: any; error: any }>;
      eq: (field: string, value: unknown) => any;
    };
  };
};

const ACTIONS: PromotionAction[] = [
  "ACCEPT_SIGNAL",
  "ACCEPT_PATTERN_MATCH",
  "ACCEPT_CONSTRAINT",
  "REJECT_CANDIDATE",
  "MARK_UNCERTAIN",
  "REQUEST_MORE_EVIDENCE",
];

const ALLOWED_TABLES = new Set([
  "intelligence_review_events",
  "pattern_observations",
  "accepted_constraints",
  "evidence_requests",
]);

const TARGET_TYPES = new Set(["signal", "pattern", "constraint", "candidate"]);
const FORBIDDEN_KEYS = new Set(["owner_user_id", "actor_user_id", "approved_by", "service_role", "table", "rpc", "sql", "raw_sql"]);
const ACTION_STATUS_MAP: Record<PromotionAction, string> = {
  ACCEPT_SIGNAL: "ACCEPTED",
  ACCEPT_PATTERN_MATCH: "ACCEPTED",
  ACCEPT_CONSTRAINT: "ACCEPTED",
  REJECT_CANDIDATE: "REJECTED",
  MARK_UNCERTAIN: "UNCERTAIN",
  REQUEST_MORE_EVIDENCE: "MORE_EVIDENCE_REQUESTED",
};

function jsonResponse(body: unknown, status: number, req?: Request) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...(req?.headers.get("origin") ? { "Access-Control-Allow-Origin": req.headers.get("origin")! } : {}),
      "Access-Control-Allow-Headers": "authorization, apikey, content-type",
      "Access-Control-Allow-Methods": "POST,OPTIONS",
      Vary: "Origin",
    },
  });
}

function errorResponse(code: string, status: number, req?: Request) {
  return jsonResponse({ error: { code, message: code } }, status, req);
}

function isUuid(value: unknown): boolean {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function normalizeText(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeEvidenceRefs(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry) => typeof entry === "string" && isUuid(entry)).map((entry) => String(entry));
}

function buildIdempotencyKey(actorId: string, payload: PromotionPayload): string {
  return [
    actorId,
    payload.action,
    normalizeText(payload.trace_id),
    normalizeText(payload.target_ref),
    normalizeText(payload.scope || "current operating context"),
  ].join("::");
}

function payloadHash(payload: Record<string, unknown>): string {
  return Array.from(new TextEncoder().encode(JSON.stringify(payload))).reduce((acc, byte) => acc + byte.toString(16).padStart(2, "0"), "");
}

function sanitizePayloadRecord(payload: Record<string, unknown>): PromotionPayload {
  const action = payload.action;
  if (typeof action !== "string" || !ACTIONS.includes(action as PromotionAction)) {
    throw Object.assign(new Error("INVALID_ACTION"), { code: "INVALID_ACTION" as const });
  }

  const unknownKeys = Object.keys(payload).filter((key) => !FORBIDDEN_KEYS.has(key) && ![
    "action",
    "trace_id",
    "target_type",
    "target_ref",
    "reason",
    "scope",
    "evidence_refs",
    "missing_state",
    "notes",
    "expected_resulting_lifecycle_state",
  ].includes(key));
  if (unknownKeys.length > 0) {
    throw Object.assign(new Error("INVALID_INPUT"), { code: "INVALID_INPUT" as const });
  }
  if (Object.keys(payload).some((key) => FORBIDDEN_KEYS.has(key))) {
    throw Object.assign(new Error("INVALID_INPUT"), { code: "INVALID_INPUT" as const });
  }

  const allowed: Record<PromotionAction, string[]> = {
    ACCEPT_SIGNAL: ["action", "trace_id", "target_type", "target_ref", "reason", "scope", "evidence_refs", "notes", "expected_resulting_lifecycle_state"],
    ACCEPT_PATTERN_MATCH: ["action", "trace_id", "target_type", "target_ref", "reason", "scope", "evidence_refs", "notes", "expected_resulting_lifecycle_state"],
    ACCEPT_CONSTRAINT: ["action", "trace_id", "target_type", "target_ref", "reason", "scope", "evidence_refs", "notes", "expected_resulting_lifecycle_state"],
    REJECT_CANDIDATE: ["action", "trace_id", "target_type", "target_ref", "reason", "scope", "evidence_refs", "notes", "expected_resulting_lifecycle_state"],
    MARK_UNCERTAIN: ["action", "trace_id", "target_type", "target_ref", "reason", "scope", "evidence_refs", "notes", "expected_resulting_lifecycle_state"],
    REQUEST_MORE_EVIDENCE: ["action", "trace_id", "target_type", "target_ref", "reason", "scope", "evidence_refs", "missing_state", "notes", "expected_resulting_lifecycle_state"],
  };

  const keys = Object.keys(payload);
  const bad = keys.filter((key) => !allowed[action as PromotionAction].includes(key));
  if (bad.length > 0) {
    throw Object.assign(new Error("INVALID_INPUT"), { code: "INVALID_INPUT" as const });
  }

  const record: PromotionPayload = { action: action as PromotionAction };
  if ("trace_id" in payload) {
    if (typeof payload.trace_id !== "string" || !payload.trace_id.trim()) throw Object.assign(new Error("INVALID_INPUT"), { code: "INVALID_INPUT" as const });
    record.trace_id = payload.trace_id.trim();
  }
  if ("target_type" in payload) {
    if (typeof payload.target_type !== "string" || !TARGET_TYPES.has(payload.target_type)) throw Object.assign(new Error("INVALID_INPUT"), { code: "INVALID_INPUT" as const });
    record.target_type = payload.target_type as PromotionPayload["target_type"];
  }
  if ("target_ref" in payload) {
    if (typeof payload.target_ref !== "string" || !payload.target_ref.trim()) throw Object.assign(new Error("INVALID_INPUT"), { code: "INVALID_INPUT" as const });
    record.target_ref = payload.target_ref.trim();
  }
  if ("reason" in payload) {
    if (typeof payload.reason !== "string" || !payload.reason.trim()) throw Object.assign(new Error("INVALID_INPUT"), { code: "INVALID_INPUT" as const });
    record.reason = payload.reason.trim();
  }
  if ("scope" in payload) {
    if (typeof payload.scope !== "string" || !payload.scope.trim()) throw Object.assign(new Error("INVALID_INPUT"), { code: "INVALID_INPUT" as const });
    record.scope = payload.scope.trim();
  }
  if ("evidence_refs" in payload) {
    const refs = normalizeEvidenceRefs(payload.evidence_refs);
    if (refs.length === 0) throw Object.assign(new Error("INVALID_INPUT"), { code: "INVALID_INPUT" as const });
    record.evidence_refs = refs;
  }
  if ("missing_state" in payload) {
    if (!Array.isArray(payload.missing_state) || payload.missing_state.length === 0) throw Object.assign(new Error("INVALID_INPUT"), { code: "INVALID_INPUT" as const });
    record.missing_state = payload.missing_state.filter((item) => typeof item === "string" && item.trim()).map((item) => String(item).trim());
  }
  if ("notes" in payload) {
    if (typeof payload.notes !== "string") throw Object.assign(new Error("INVALID_INPUT"), { code: "INVALID_INPUT" as const });
    record.notes = payload.notes;
  }
  if ("expected_resulting_lifecycle_state" in payload) {
    if (typeof payload.expected_resulting_lifecycle_state !== "string" || !payload.expected_resulting_lifecycle_state.trim()) throw Object.assign(new Error("INVALID_INPUT"), { code: "INVALID_INPUT" as const });
    record.expected_resulting_lifecycle_state = payload.expected_resulting_lifecycle_state.trim();
  }

  if (!record.trace_id || !record.target_ref || !record.reason) {
    throw Object.assign(new Error("INVALID_INPUT"), { code: "INVALID_INPUT" as const });
  }

  if (["ACCEPT_SIGNAL", "ACCEPT_PATTERN_MATCH", "ACCEPT_CONSTRAINT"].includes(record.action)) {
    if (!record.evidence_refs || record.evidence_refs.length === 0) {
      throw Object.assign(new Error("INVALID_INPUT"), { code: "INVALID_INPUT" as const });
    }
    if (!record.target_type) throw Object.assign(new Error("INVALID_INPUT"), { code: "INVALID_INPUT" as const });
  }

  if (record.action === "REQUEST_MORE_EVIDENCE") {
    if (!record.missing_state || record.missing_state.length === 0) throw Object.assign(new Error("INVALID_INPUT"), { code: "INVALID_INPUT" as const });
  }

  return record;
}

async function fetchMany<T>(query: Promise<{ data: T[] | null; error: { message?: string } | null }>): Promise<T[]> {
  const { data, error } = await query;
  if (error) throw Object.assign(new Error("QUERY_FAILED"), { code: "QUERY_FAILED" as const, detail: error.message ?? "query failed" });
  return (data ?? []) as T[];
}

async function fetchOne<T>(query: Promise<{ data: T | null; error: { message?: string } | null }>): Promise<T | null> {
  const { data, error } = await query;
  if (error) throw Object.assign(new Error("QUERY_FAILED"), { code: "QUERY_FAILED" as const, detail: error.message ?? "query failed" });
  return (data ?? null) as T | null;
}

async function insertWithIdempotency(
  client: any,
  table: string,
  row: Record<string, unknown>,
  key: string,
  payloadSignature: string,
): Promise<{ row: Record<string, unknown>; replayed: boolean; conflict: boolean; }> {
  if (!ALLOWED_TABLES.has(table)) {
    throw Object.assign(new Error("INVALID_INPUT"), { code: "INVALID_INPUT" as const });
  }

  const existing = await fetchOne(
    client.from(table).select("id, idempotency_key, payload_hash").eq("idempotency_key", key).maybeSingle(),
  ) as { id?: string; idempotency_key?: string; payload_hash?: string } | null;

  if (existing) {
    if (String(existing.payload_hash ?? "") === payloadSignature) {
      return { row: existing as Record<string, unknown>, replayed: true, conflict: false };
    }
    throw Object.assign(new Error("IDEMPOTENCY_CONFLICT"), { code: "IDEMPOTENCY_CONFLICT" as const });
  }

  const inserted = await fetchOne(
    client.from(table).insert([row]).select("*").single(),
  );
  if (!inserted) {
    throw Object.assign(new Error("INSERT_FAILED"), { code: "INSERT_FAILED" as const });
  }
  return { row: inserted as Record<string, unknown>, replayed: false, conflict: false };
}

function getAuditStatus(action: PromotionAction): string {
  return ACTION_STATUS_MAP[action];
}

function getTargetType(action: PromotionAction, payloadTargetType?: PromotionPayload["target_type"]): string {
  if (payloadTargetType) return payloadTargetType;
  if (action === "ACCEPT_SIGNAL") return "signal";
  if (action === "ACCEPT_PATTERN_MATCH") return "pattern";
  if (action === "ACCEPT_CONSTRAINT") return "constraint";
  return "candidate";
}

function getDomainTable(action: PromotionAction): string | null {
  switch (action) {
    case "ACCEPT_PATTERN_MATCH":
      return "pattern_observations";
    case "ACCEPT_CONSTRAINT":
      return "accepted_constraints";
    case "REQUEST_MORE_EVIDENCE":
      return "evidence_requests";
    default:
      return null;
  }
}

function buildAuditRow(actorId: string, payload: PromotionPayload, normalizedScope: string, idempotencyKey: string, payloadSignature: string) {
  return {
    owner_user_id: actorId,
    trace_id: payload.trace_id,
    action_type: payload.action,
    target_type: getTargetType(payload.action, payload.target_type),
    target_ref: payload.target_ref,
    scope: normalizedScope,
    reason: payload.reason,
    evidence_ref_ids: payload.evidence_refs ?? [],
    expected_resulting_lifecycle_state: payload.expected_resulting_lifecycle_state ?? getAuditStatus(payload.action),
    notes: payload.notes ?? null,
    idempotency_key: idempotencyKey,
    payload_hash: payloadSignature,
    status: getAuditStatus(payload.action),
  };
}

function buildDomainRow(actorId: string, payload: PromotionPayload, normalizedScope: string, idempotencyKey: string, payloadSignature: string) {
  switch (payload.action) {
    case "ACCEPT_PATTERN_MATCH":
      return {
        owner_user_id: actorId,
        trace_id: payload.trace_id,
        pattern_key: payload.target_ref,
        target_ref: payload.target_ref,
        decision: "accepted",
        scope: normalizedScope,
        confidence: 0.0,
        evidence_ref_ids: payload.evidence_refs ?? [],
        idempotency_key: idempotencyKey,
        payload_hash: payloadSignature,
      };
    case "ACCEPT_CONSTRAINT":
      return {
        owner_user_id: actorId,
        trace_id: payload.trace_id,
        constraint_id: payload.target_ref,
        target_ref: payload.target_ref,
        scope: normalizedScope,
        evidence_ref_ids: payload.evidence_refs ?? [],
        idempotency_key: idempotencyKey,
        payload_hash: payloadSignature,
      };
    case "REQUEST_MORE_EVIDENCE":
      return {
        owner_user_id: actorId,
        trace_id: payload.trace_id,
        target_ref: payload.target_ref,
        scope: normalizedScope,
        reason: payload.reason,
        missing_state: payload.missing_state ?? [],
        evidence_ref_ids: payload.evidence_refs ?? [],
        idempotency_key: idempotencyKey,
        payload_hash: payloadSignature,
      };
    default:
      return null;
  }
}

export function validatePromotionPayload(payload: unknown): PromotionPayload {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw Object.assign(new Error("INVALID_INPUT"), { code: "INVALID_INPUT" as const });
  }
  return sanitizePayloadRecord(payload as Record<string, unknown>);
}

async function executeWrite(client: any, actorId: string, payload: PromotionPayload): Promise<Record<string, unknown>> {
  const normalizedScope = payload.scope || "current operating context";
  const idempotencyKey = buildIdempotencyKey(actorId, payload);
  const payloadSignature = payloadHash({ ...payload, actorId, scope: normalizedScope });
  const domainTable = getDomainTable(payload.action);

  if (payload.evidence_refs && payload.evidence_refs.length > 0) {
    const evidenceRows = await fetchMany(
      client.from("intelligence_evidence_refs").select("id, owner_user_id").in("id", payload.evidence_refs),
    );
    const evidenceById = new Map((evidenceRows ?? []).map((row) => [String((row as Record<string, unknown>).id), row]));
    for (const evidenceId of payload.evidence_refs) {
      const match = evidenceById.get(evidenceId);
      if (!match || String((match as Record<string, unknown>).owner_user_id) !== actorId) {
        throw Object.assign(new Error("INVALID_INPUT"), { code: "INVALID_INPUT" as const });
      }
    }
  }

  const auditExisting = await fetchOne(
    client.from("intelligence_review_events").select("id, idempotency_key, payload_hash").eq("idempotency_key", idempotencyKey).maybeSingle(),
  ) as { id?: string; idempotency_key?: string; payload_hash?: string } | null;

  if (auditExisting) {
    if (String(auditExisting.payload_hash ?? "") !== payloadSignature) {
      throw Object.assign(new Error("IDEMPOTENCY_CONFLICT"), { code: "IDEMPOTENCY_CONFLICT" as const });
    }
    const domainExisting = domainTable
      ? await fetchOne(client.from(domainTable).select("id, idempotency_key, payload_hash").eq("idempotency_key", idempotencyKey).maybeSingle())
      : null;
    if (domainExisting && String((domainExisting as { payload_hash?: string }).payload_hash ?? "") !== payloadSignature) {
      throw Object.assign(new Error("IDEMPOTENCY_CONFLICT"), { code: "IDEMPOTENCY_CONFLICT" as const });
    }
    return {
      status: "replayed",
      promotion_event_id: auditExisting.id ?? null,
      domain_object_type: domainTable ?? null,
      domain_object_id: domainExisting ? (domainExisting as { id?: string }).id ?? null : null,
      action: payload.action,
      trace_id: payload.trace_id,
      target_ref: payload.target_ref,
      scope: normalizedScope,
      data: { status: "replayed", table: "intelligence_review_events", row: auditExisting },
    };
  }

  const auditRow = buildAuditRow(actorId, payload, normalizedScope, idempotencyKey, payloadSignature);
  const insertedAudit = await fetchOne(client.from("intelligence_review_events").insert([auditRow]).select("*").single());
  if (!insertedAudit) {
    throw Object.assign(new Error("INSERT_FAILED"), { code: "INSERT_FAILED" as const });
  }

  let domainRow = null;
  let domainId: string | null = null;
  let domainType: string | null = null;

  if (domainTable) {
    domainRow = buildDomainRow(actorId, payload, normalizedScope, idempotencyKey, payloadSignature);
    const insertedDomain = await fetchOne(client.from(domainTable).insert([domainRow]).select("*").single());
    if (!insertedDomain) {
      throw Object.assign(new Error("INSERT_FAILED"), { code: "INSERT_FAILED" as const });
    }
    domainId = String((insertedDomain as Record<string, unknown>).id ?? "");
    domainType = domainTable;
  }

  return {
    status: "created",
    promotion_event_id: String((insertedAudit as Record<string, unknown>).id ?? ""),
    domain_object_type: domainType,
    domain_object_id: domainId,
    action: payload.action,
    trace_id: payload.trace_id,
    target_ref: payload.target_ref,
    scope: normalizedScope,
    data: {
      status: "created",
      table: "intelligence_review_events",
      row: insertedAudit,
      domain_table: domainType,
      domain_row: domainRow,
    },
  };
}

export async function handleIntelligencePromotionWrite(req: Request, deps: HandlerDeps = buildDeps()): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: { "Access-Control-Allow-Headers": "authorization, apikey, content-type", "Access-Control-Allow-Methods": "POST,OPTIONS", Vary: "Origin" } });
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
    const payload = validatePromotionPayload(parsed);
    const client = deps.createClient(authorization);
    const actor = await client.auth.getUser();
    if (!actor.data.user?.id) return errorResponse("AUTH_INVALID", 401, req);
    const result = await executeWrite(client, actor.data.user.id, payload);
    return jsonResponse({
      ok: true,
      status: result.status,
      promotion_event_id: result.promotion_event_id,
      domain_object_type: result.domain_object_type,
      domain_object_id: result.domain_object_id,
      action: payload.action,
      trace_id: payload.trace_id,
      target_ref: payload.target_ref,
      scope: result.scope,
      actor: actor.data.user.id,
      data: result.data,
    }, 200, req);
  } catch (errorValue) {
    const message = errorValue instanceof Error ? errorValue.message : "INTERNAL_SERVER_ERROR";
    if (message === "AUTH_INVALID") return errorResponse("AUTH_INVALID", 401, req);
    if (message === "INVALID_INPUT") return errorResponse("INVALID_INPUT", 400, req);
    if (message === "INVALID_ACTION") return errorResponse("INVALID_ACTION", 400, req);
    if (message === "IDEMPOTENCY_CONFLICT") return errorResponse("IDEMPOTENCY_CONFLICT", 409, req);
    if (message === "QUERY_FAILED") return errorResponse("QUERY_FAILED", 502, req);
    return errorResponse("INTERNAL_SERVER_ERROR", 500, req);
  }
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
        global: { headers: { Authorization: authorizationHeader } },
      }) as any;
    },
  };
}

if (import.meta.main) {
  Deno.serve((req) => handleIntelligencePromotionWrite(req));
}
