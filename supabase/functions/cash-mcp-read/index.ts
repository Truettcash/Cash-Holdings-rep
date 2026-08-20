import { createClient } from "npm:@supabase/supabase-js@2.45.4";

type CashMcpAction =
  | "list_brands"
  | "get_brand"
  | "list_active_projects"
  | "get_project"
  | "get_pipeline"
  | "get_recent_activity";

type RequestPayload = {
  action: CashMcpAction;
  brand_id?: string;
  slug?: string;
  project_id?: string;
  limit?: number;
};

type AuthedUser = {
  id: string;
  email: string | null;
};

type BrandRow = {
  id: string;
  key: string | null;
  name: string;
  slug: string;
  status: string | null;
  tagline: string | null;
  description: string | null;
  accent_color: string | null;
  created_at: string | null;
};

type ProjectRow = {
  id: string;
  brand_id: string;
  name: string;
  description: string | null;
  status: string;
  priority: string;
  project_type: string | null;
  started_at: string | null;
  target_date: string | null;
  completed_at: string | null;
  created_at: string;
};

type DealRow = {
  id: string;
  brand_id: string;
  organization_id: string | null;
  primary_contact_id: string | null;
  name: string;
  stage: string;
  amount: number | null;
  value: number | null;
  expected_close_date: string | null;
  next_action: string | null;
  next_action_due_at: string | null;
  probability: number | null;
  closed_at: string | null;
  won_at: string | null;
  lost_at: string | null;
  created_at: string;
};

type ActivityRow = {
  id: string;
  brand_id: string;
  contact_id: string | null;
  organization_id: string | null;
  deal_id: string | null;
  project_id: string | null;
  project_task_id: string | null;
  strategic_move_id: string | null;
  activity_type: string;
  status: string;
  subject: string;
  notes: string | null;
  outcome: string | null;
  activity_at: string;
  created_at: string;
};

type TaskRow = {
  id: string;
  project_id: string;
  title: string;
  status: string;
  blocked_reason: string | null;
  completed_at: string | null;
  created_at: string;
};

type QueryResult<T> = {
  data: T | null;
  error: { message: string; code?: string; details?: string; hint?: string } | null;
};

type SupabaseQuery = {
  select(columns: string): SupabaseQuery;
  eq(column: string, value: string): SupabaseQuery;
  order(column: string, options?: { ascending?: boolean }): SupabaseQuery;
  limit(count: number): SupabaseQuery;
  maybeSingle(): Promise<QueryResult<Record<string, unknown> | null>>;
  then<TResult1 = QueryResult<Record<string, unknown>[]>, TResult2 = never>(
    onfulfilled?: ((value: QueryResult<Record<string, unknown>[]>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2>;
};

type SupabaseLike = {
  auth: {
    getUser: () => Promise<{ data: { user: { id: string; email?: string | null } | null }; error: { message: string } | null }>;
  };
  from: (table: string) => SupabaseQuery;
};

type HandlerDeps = {
  createClient: (authorizationHeader: string) => SupabaseLike;
  log: (entry: Record<string, unknown>) => void;
  now: () => number;
  requestId: () => string;
};

type CashMcpErrorCode =
  | "AUTH_REQUIRED"
  | "AUTH_INVALID"
  | "INVALID_ACTION"
  | "INVALID_INPUT"
  | "NOT_FOUND"
  | "QUERY_FAILED"
  | "INTERNAL_SERVER_ERROR";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/i;

const STAGE_LABELS: Record<string, string> = {
  new: "New",
  qualified: "Qualified",
  discovery_scheduled: "Discovery",
  proposal_sent: "Proposal",
  negotiation: "Negotiation",
  won: "Won",
  lost: "Lost",
  nurture: "Nurture",
};

const DEFAULT_ORIGINS = [
  "https://truett.cash",
  "https://cash-holdings-os.lovable.app",
  "https://athrty-sys.framer.website",
];

function allowedOrigins(): string[] {
  const configured = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter(Boolean);
  return Array.from(new Set([...DEFAULT_ORIGINS, ...configured]));
}

function originApproved(origin: string): boolean {
  const clean = origin.replace(/\/$/, "");
  return allowedOrigins().includes(clean) || /^https:\/\/[a-z0-9-]+\.lovable\.app$/i.test(clean);
}

function corsHeaders(req: Request): Record<string, string> {
  const headers: Record<string, string> = {
    Vary: "Origin",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Max-Age": "86400",
  };
  const origin = req.headers.get("origin") ?? req.headers.get("referer");
  if (!origin) return headers;
  try {
    const normalized = new URL(origin).origin;
    if (originApproved(normalized)) headers["Access-Control-Allow-Origin"] = normalized;
  } catch {
    // ignore malformed origin / referer
  }
  return headers;
}

function jsonResponse(body: unknown, status: number, req: Request) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(req),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function errorResponse(code: CashMcpErrorCode, status: number, req: Request, message?: string) {
  return jsonResponse(
    {
      error: {
        code,
        message: message ?? code,
      },
    },
    status,
    req,
  );
}

function isUuid(value: string) {
  return UUID_RE.test(value);
}

function isSlug(value: string) {
  return SLUG_RE.test(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function parseLimit(value: unknown): number | null {
  if (value === undefined) return null;
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  if (value < 1 || value > MAX_LIMIT) return null;
  return value;
}

function normalizeBrand(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    key: (row.key as string | null) ?? null,
    name: String(row.name),
    slug: String(row.slug),
    status: (row.status as string | null) ?? null,
    tagline: (row.tagline as string | null) ?? null,
    description: (row.description as string | null) ?? null,
    accent_color: (row.accent_color as string | null) ?? null,
    created_at: (row.created_at as string | null) ?? null,
  };
}

function normalizeProject(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    brand_id: String(row.brand_id),
    name: String(row.name),
    description: (row.description as string | null) ?? null,
    status: String(row.status),
    priority: String(row.priority),
    project_type: (row.project_type as string | null) ?? null,
    started_at: (row.started_at as string | null) ?? null,
    target_date: (row.target_date as string | null) ?? null,
    completed_at: (row.completed_at as string | null) ?? null,
    created_at: String(row.created_at),
  };
}

function normalizeDeal(row: Record<string, unknown>): DealRow {
  return {
    id: String(row.id),
    brand_id: String(row.brand_id),
    organization_id: (row.organization_id as string | null) ?? null,
    primary_contact_id: (row.primary_contact_id as string | null) ?? null,
    name: String(row.name),
    stage: String(row.stage),
    amount: (row.amount as number | null) ?? null,
    value: (row.value as number | null) ?? null,
    expected_close_date: (row.expected_close_date as string | null) ?? null,
    next_action: (row.next_action as string | null) ?? null,
    next_action_due_at: (row.next_action_due_at as string | null) ?? null,
    probability: (row.probability as number | null) ?? null,
    closed_at: (row.closed_at as string | null) ?? null,
    won_at: (row.won_at as string | null) ?? null,
    lost_at: (row.lost_at as string | null) ?? null,
    created_at: String(row.created_at),
  };
}

function normalizeActivity(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    brand_id: String(row.brand_id),
    contact_id: (row.contact_id as string | null) ?? null,
    organization_id: (row.organization_id as string | null) ?? null,
    deal_id: (row.deal_id as string | null) ?? null,
    project_id: (row.project_id as string | null) ?? null,
    project_task_id: (row.project_task_id as string | null) ?? null,
    strategic_move_id: (row.strategic_move_id as string | null) ?? null,
    activity_type: String(row.activity_type),
    status: String(row.status),
    subject: String(row.subject),
    notes: (row.notes as string | null) ?? null,
    outcome: (row.outcome as string | null) ?? null,
    activity_at: String(row.activity_at),
    created_at: String(row.created_at),
  };
}

function summarizeProjectTasks(tasks: TaskRow[]) {
  const total = tasks.length;
  const completed = tasks.filter((task) => task.status === "completed").length;
  const blocked = tasks.filter((task) => task.status === "blocked").length;
  const open = tasks.filter((task) => task.status !== "completed" && task.status !== "archived").length;
  return { total, open, blocked, completed };
}

function summarizePipeline(deals: DealRow[]) {
  const stages = new Map<string, { key: string; label: string; count: number; value: number }>();
  let openDeals = 0;
  let wonDeals = 0;
  let lostDeals = 0;
  let openValue = 0;
  let closedValue = 0;

  for (const deal of deals) {
    const rawValue = deal.value ?? deal.amount ?? 0;
    const value = Number.isFinite(Number(rawValue)) ? Number(rawValue) : 0;
    const stage = deal.stage;
    const current = stages.get(stage) ?? {
      key: stage,
      label: STAGE_LABELS[stage] ?? stage.replace(/_/g, " "),
      count: 0,
      value: 0,
    };
    current.count += 1;
    current.value += value;
    stages.set(stage, current);

    if (stage === "won") {
      wonDeals += 1;
      closedValue += value;
      continue;
    }
    if (stage === "lost") {
      lostDeals += 1;
      closedValue += value;
      continue;
    }

    openDeals += 1;
    openValue += value;
  }

  const closedDeals = wonDeals + lostDeals;
  const winRate = closedDeals === 0 ? null : Number(((wonDeals / closedDeals) * 100).toFixed(1));

  return {
    stages: Array.from(stages.values()).sort((left, right) => left.label.localeCompare(right.label)),
    totals: {
      open_deals: openDeals,
      won_deals: wonDeals,
      lost_deals: lostDeals,
      open_value: Number(openValue.toFixed(2)),
      closed_value: Number(closedValue.toFixed(2)),
      win_rate: winRate,
    },
  };
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
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
        global: {
          headers: {
            Authorization: authorizationHeader,
          },
        },
      }) as unknown as SupabaseLike;
    },
    log: (entry) => console.log(JSON.stringify(entry)),
    now: () => Date.now(),
    requestId: () => crypto.randomUUID(),
  };
}

async function requireAuthenticatedUser(client: SupabaseLike): Promise<AuthedUser> {
  const { data, error } = await client.auth.getUser();
  const user = data.user;
  if (error || !user?.id) {
    throw Object.assign(new Error("AUTH_INVALID"), { code: "AUTH_INVALID" as const });
  }
  return { id: user.id, email: user.email ?? null };
}

// Diagnostic-only checkpoint logging. No credential/body/row contents are ever included.
function logCheckpoint(
  deps: HandlerDeps,
  requestId: string,
  started: number,
  stage: string,
  extra?: { action?: CashMcpAction; actor?: string },
) {
  deps.log({
    request_id: requestId,
    tool: "cash-mcp-read",
    stage,
    duration_ms: Math.max(0, deps.now() - started),
    ...(extra?.action ? { action: extra.action } : {}),
    ...(extra?.actor ? { actor: extra.actor } : {}),
  });
}

// Diagnostic-only: safe (non-credential) Supabase/PostgREST error metadata,
// attached to the thrown error for server-side logging only.
function dbErrorFields(error: { message: string; code?: string; details?: string; hint?: string }) {
  return {
    db_error_code: error.code ?? null,
    db_error_message: error.message ?? null,
    db_error_details: error.details ?? null,
    db_error_hint: error.hint ?? null,
  };
}

async function fetchMany<T extends Record<string, unknown>>(
  query: Promise<QueryResult<T[]>>,
): Promise<T[]> {
  const { data, error } = await query;
  if (error) throw Object.assign(new Error("QUERY_FAILED"), { code: "QUERY_FAILED" as const, detail: error.message, ...dbErrorFields(error) });
  return (data ?? []) as T[];
}

async function fetchOne<T extends Record<string, unknown>>(
  query: Promise<QueryResult<T | null>>,
): Promise<T | null> {
  const { data, error } = await query;
  if (error) throw Object.assign(new Error("QUERY_FAILED"), { code: "QUERY_FAILED" as const, detail: error.message, ...dbErrorFields(error) });
  return (data ?? null) as T | null;
}

function validatePayload(payload: unknown): RequestPayload {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw Object.assign(new Error("INVALID_INPUT"), { code: "INVALID_INPUT" as const });
  }

  const record = payload as Record<string, unknown>;
  const action = record.action;
  if (
    action !== "list_brands" &&
    action !== "get_brand" &&
    action !== "list_active_projects" &&
    action !== "get_project" &&
    action !== "get_pipeline" &&
    action !== "get_recent_activity"
  ) {
    throw Object.assign(new Error("INVALID_ACTION"), { code: "INVALID_ACTION" as const });
  }

  switch (action) {
    case "list_brands": {
      const allowed = new Set(["action"]);
      for (const key of Object.keys(record)) if (!allowed.has(key)) throw Object.assign(new Error("INVALID_INPUT"), { code: "INVALID_INPUT" as const });
      return { action };
    }
    case "get_brand": {
      const brandId = record.brand_id;
      const slug = record.slug;
      const allowed = new Set(["action", "brand_id", "slug"]);
      for (const key of Object.keys(record)) if (!allowed.has(key)) throw Object.assign(new Error("INVALID_INPUT"), { code: "INVALID_INPUT" as const });
      if (brandId !== undefined && slug !== undefined) {
        throw Object.assign(new Error("INVALID_INPUT"), { code: "INVALID_INPUT" as const });
      }
      if (brandId === undefined && slug === undefined) {
        throw Object.assign(new Error("INVALID_INPUT"), { code: "INVALID_INPUT" as const });
      }
      if (brandId !== undefined && (!isNonEmptyString(brandId) || !isUuid(brandId.trim()))) {
        throw Object.assign(new Error("INVALID_INPUT"), { code: "INVALID_INPUT" as const });
      }
      if (slug !== undefined && (!isNonEmptyString(slug) || !isSlug(slug.trim()))) {
        throw Object.assign(new Error("INVALID_INPUT"), { code: "INVALID_INPUT" as const });
      }
      return { action, brand_id: typeof brandId === "string" ? brandId.trim() : undefined, slug: typeof slug === "string" ? slug.trim() : undefined };
    }
    case "list_active_projects": {
      const allowed = new Set(["action", "brand_id"]);
      for (const key of Object.keys(record)) if (!allowed.has(key)) throw Object.assign(new Error("INVALID_INPUT"), { code: "INVALID_INPUT" as const });
      const brandId = record.brand_id;
      if (brandId !== undefined && (!isNonEmptyString(brandId) || !isUuid(brandId.trim()))) {
        throw Object.assign(new Error("INVALID_INPUT"), { code: "INVALID_INPUT" as const });
      }
      return { action, brand_id: typeof brandId === "string" ? brandId.trim() : undefined };
    }
    case "get_project": {
      const allowed = new Set(["action", "project_id"]);
      for (const key of Object.keys(record)) if (!allowed.has(key)) throw Object.assign(new Error("INVALID_INPUT"), { code: "INVALID_INPUT" as const });
      if (!isNonEmptyString(record.project_id) || !isUuid(record.project_id.trim())) {
        throw Object.assign(new Error("INVALID_INPUT"), { code: "INVALID_INPUT" as const });
      }
      return { action, project_id: record.project_id.trim() };
    }
    case "get_pipeline": {
      const allowed = new Set(["action", "brand_id"]);
      for (const key of Object.keys(record)) if (!allowed.has(key)) throw Object.assign(new Error("INVALID_INPUT"), { code: "INVALID_INPUT" as const });
      const brandId = record.brand_id;
      if (brandId !== undefined && (!isNonEmptyString(brandId) || !isUuid(brandId.trim()))) {
        throw Object.assign(new Error("INVALID_INPUT"), { code: "INVALID_INPUT" as const });
      }
      return { action, brand_id: typeof brandId === "string" ? brandId.trim() : undefined };
    }
    case "get_recent_activity": {
      const allowed = new Set(["action", "brand_id", "limit"]);
      for (const key of Object.keys(record)) if (!allowed.has(key)) throw Object.assign(new Error("INVALID_INPUT"), { code: "INVALID_INPUT" as const });
      const brandId = record.brand_id;
      const limit = parseLimit(record.limit);
      if (brandId !== undefined && (!isNonEmptyString(brandId) || !isUuid(brandId.trim()))) {
        throw Object.assign(new Error("INVALID_INPUT"), { code: "INVALID_INPUT" as const });
      }
      if (record.limit !== undefined && limit === null) {
        throw Object.assign(new Error("INVALID_INPUT"), { code: "INVALID_INPUT" as const });
      }
      return {
        action,
        brand_id: typeof brandId === "string" ? brandId.trim() : undefined,
        limit: limit ?? undefined,
      };
    }
  }
}

async function executeAction(client: SupabaseLike, payload: RequestPayload) {
  switch (payload.action) {
    case "list_brands": {
      const rows = await fetchMany<BrandRow>(
        client
          .from("brands")
          .select("id,key,name,slug,status,created_at")
          .order("name", { ascending: true }) as unknown as Promise<QueryResult<BrandRow[]>>,
      );
      return {
        data: {
          brands: rows.map(normalizeBrand),
          count: rows.length,
        },
        entityIds: rows.map((row) => String(row.id)),
      };
    }
    case "get_brand": {
      const query = client
        .from("brands")
        .select("id,key,name,slug,status,created_at");
      const row = await fetchOne<BrandRow>(
        (payload.brand_id
          ? query.eq("id", payload.brand_id)
          : query.eq("slug", payload.slug ?? ""))
          .maybeSingle() as unknown as Promise<QueryResult<BrandRow | null>>,
      );
      if (!row) throw Object.assign(new Error("NOT_FOUND"), { code: "NOT_FOUND" as const });
      return {
        data: { brand: normalizeBrand(row) },
        entityIds: [String(row.id)],
      };
    }
    case "list_active_projects": {
      let query = client
        .from("projects")
        .select("id,brand_id,name,description,status,priority,project_type,started_at,target_date,completed_at,created_at")
        .eq("status", "active");
      if (payload.brand_id) query = query.eq("brand_id", payload.brand_id);
      const rows = await fetchMany<ProjectRow>(
        query.order("created_at", { ascending: false }) as unknown as Promise<QueryResult<ProjectRow[]>>,
      );
      return {
        data: {
          projects: rows.map(normalizeProject),
          count: rows.length,
        },
        entityIds: rows.map((row) => String(row.id)),
      };
    }
    case "get_project": {
      const row = await fetchOne<ProjectRow>(
        client
          .from("projects")
          .select("id,brand_id,name,description,status,priority,project_type,started_at,target_date,completed_at,created_at")
          .eq("id", payload.project_id)
          .maybeSingle() as unknown as Promise<QueryResult<ProjectRow | null>>,
      );
      if (!row) throw Object.assign(new Error("NOT_FOUND"), { code: "NOT_FOUND" as const });
      const tasks = await fetchMany<TaskRow>(
        client
          .from("project_tasks")
          .select("id,project_id,title,status,blocked_reason,completed_at,created_at")
          .eq("project_id", payload.project_id)
          .order("created_at", { ascending: false }) as unknown as Promise<QueryResult<TaskRow[]>>,
      );
      return {
        data: {
          project: normalizeProject(row),
          task_summary: summarizeProjectTasks(tasks),
        },
        entityIds: [String(row.id), String(row.brand_id)],
      };
    }
    case "get_pipeline": {
      let query = client
        .from("deals")
        .select("id,brand_id,organization_id,primary_contact_id,name,stage,amount,value,expected_close_date,next_action,next_action_due_at,probability,closed_at,won_at,lost_at,created_at");
      if (payload.brand_id) query = query.eq("brand_id", payload.brand_id);
      const rows = await fetchMany<DealRow>(
        query.order("created_at", { ascending: false }) as unknown as Promise<QueryResult<DealRow[]>>,
      );
      const summary = summarizePipeline(rows.map(normalizeDeal));
      return {
        data: {
          pipeline: summary.stages,
          totals: summary.totals,
          count: rows.length,
        },
        entityIds: rows.map((row) => String(row.id)),
      };
    }
    case "get_recent_activity": {
      let query = client
        .from("activities")
        .select("id,brand_id,contact_id,organization_id,deal_id,project_id,project_task_id,strategic_move_id,activity_type,status,subject,notes,outcome,activity_at,created_at");
      if (payload.brand_id) query = query.eq("brand_id", payload.brand_id);
      const rows = await fetchMany<ActivityRow>(
        query
          .order("activity_at", { ascending: false })
          .limit(payload.limit ?? DEFAULT_LIMIT) as unknown as Promise<QueryResult<ActivityRow[]>>,
      );
      return {
        data: {
          activities: rows.map(normalizeActivity),
          count: rows.length,
        },
        entityIds: rows.map((row) => String(row.id)),
      };
    }
  }
}

export async function handleCashMcpRead(req: Request, deps: HandlerDeps = buildDeps()): Promise<Response> {
  const started = deps.now();
  const requestId = deps.requestId();
  const authorization = req.headers.get("authorization") ?? req.headers.get("Authorization");
  let actor: AuthedUser | null = null;

  const baseLog = {
    timestamp: new Date(started).toISOString(),
    request_id: requestId,
    tool: "cash-mcp-read",
    classification: "read",
    method: req.method,
  };

  try {
    logCheckpoint(deps, requestId, started, "request_received");

    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(req) });
    }

    if (req.method !== "POST") {
      return errorResponse("INVALID_INPUT", 405, req, "POST only");
    }

    if (!authorization?.toLowerCase().startsWith("bearer ")) {
      return errorResponse("AUTH_REQUIRED", 401, req, "Authorization: Bearer <token> required");
    }

    let parsed: unknown;
    try {
      parsed = await req.json();
    } catch {
      return errorResponse("INVALID_INPUT", 400, req, "Request body must be JSON");
    }

    const payload = validatePayload(parsed);
    logCheckpoint(deps, requestId, started, "request_parsed", { action: payload.action });

    const client = deps.createClient(authorization);
    logCheckpoint(deps, requestId, started, "client_created", { action: payload.action });

    logCheckpoint(deps, requestId, started, "auth_start", { action: payload.action });
    actor = await requireAuthenticatedUser(client);
    logCheckpoint(deps, requestId, started, "auth_complete", { action: payload.action, actor: actor.id });

    logCheckpoint(deps, requestId, started, "query_start", { action: payload.action, actor: actor.id });
    const result = await executeAction(client, payload);
    logCheckpoint(deps, requestId, started, "query_complete", { action: payload.action, actor: actor.id });

    const durationMs = Math.max(0, deps.now() - started);

    deps.log({
      ...baseLog,
      actor: actor.id,
      action: payload.action,
      entity_ids: result.entityIds,
      status: "success",
      duration_ms: durationMs,
    });

    logCheckpoint(deps, requestId, started, "response_ready", { action: payload.action, actor: actor.id });

    return jsonResponse({
      ok: true,
      action: payload.action,
      actor: actor.id,
      data: result.data,
    }, 200, req);
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error && typeof (error as { code?: string }).code === "string"
        ? (error as { code: CashMcpErrorCode }).code
        : "INTERNAL_SERVER_ERROR";
    const durationMs = Math.max(0, deps.now() - started);
    const errorRecord = error && typeof error === "object" ? (error as Record<string, unknown>) : {};

    deps.log({
      ...baseLog,
      actor: actor?.id ?? null,
      status: "failure",
      error_code: code,
      duration_ms: durationMs,
      ...(code === "QUERY_FAILED"
        ? {
            db_error_code: errorRecord.db_error_code ?? null,
            db_error_message: errorRecord.db_error_message ?? null,
            db_error_details: errorRecord.db_error_details ?? null,
            db_error_hint: errorRecord.db_error_hint ?? null,
          }
        : {}),
    });

    if (code === "INVALID_ACTION") return errorResponse("INVALID_ACTION", 400, req);
    if (code === "INVALID_INPUT") return errorResponse("INVALID_INPUT", 400, req);
    if (code === "NOT_FOUND") return errorResponse("NOT_FOUND", 404, req);
    if (code === "QUERY_FAILED") return errorResponse("QUERY_FAILED", 502, req);
    if (code === "AUTH_INVALID") return errorResponse("AUTH_INVALID", 401, req);
    return errorResponse("INTERNAL_SERVER_ERROR", 500, req);
  }
}

Deno.serve((req) => handleCashMcpRead(req));
