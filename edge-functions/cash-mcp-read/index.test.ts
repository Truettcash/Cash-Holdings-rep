import { strict as assert } from "node:assert";
import { handleCashMcpRead } from "./index.ts";

type Row = Record<string, unknown>;

function makeQuery(rows: Row[]) {
  const state = {
    rows,
    filters: [] as Array<{ column: string; value: string }>,
    orderBy: null as null | { column: string; ascending?: boolean },
    limitCount: null as null | number,
  };

  const query = {
    select() {
      return query;
    },
    eq(column: string, value: string) {
      state.filters.push({ column, value });
      return query;
    },
    order(column: string, options?: { ascending?: boolean }) {
      state.orderBy = { column, ascending: options?.ascending };
      return query;
    },
    limit(count: number) {
      state.limitCount = count;
      return query;
    },
    async maybeSingle() {
      const filtered = filterRows(state.rows, state.filters);
      return { data: filtered[0] ?? null, error: null };
    },
    then<TResult1 = { data: Row[]; error: null }, TResult2 = never>(
      onfulfilled?: ((value: { data: Row[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ): Promise<TResult1 | TResult2> {
      const filtered = filterRows(state.rows, state.filters);
      const ordered = sortRows(filtered, state.orderBy);
      const limited = state.limitCount ? ordered.slice(0, state.limitCount) : ordered;
      const resolved = { data: limited, error: null };
      return Promise.resolve(onfulfilled ? onfulfilled(resolved) : (resolved as TResult1));
    },
  };

  return query;
}

function filterRows(rows: Row[], filters: Array<{ column: string; value: string }>) {
  return rows.filter((row) => filters.every((filter) => String(row[filter.column]) === filter.value));
}

function sortRows(rows: Row[], orderBy: null | { column: string; ascending?: boolean }) {
  if (!orderBy) return [...rows];
  const direction = orderBy.ascending === false ? -1 : 1;
  return [...rows].sort((left, right) => {
    const a = String(left[orderBy.column] ?? "");
    const b = String(right[orderBy.column] ?? "");
    return a.localeCompare(b) * direction;
  });
}

function createFakeClient(dataset: Record<string, Row[]>) {
  return {
    auth: {
      async getUser() {
        return { data: { user: { id: "user-1", email: "owner@example.com" } }, error: null };
      },
    },
    from(table: string) {
      return makeQuery(dataset[table] ?? []);
    },
  };
}

function buildRequest(payload: Record<string, unknown>) {
  return new Request("http://localhost/cash-mcp-read", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer jwt",
    },
    body: JSON.stringify(payload),
  });
}

Deno.test("list_brands returns sanitized rows", async () => {
  const response = await handleCashMcpRead(
    buildRequest({ action: "list_brands" }),
    {
      createClient: () => createFakeClient({
        brands: [
          {
            id: "brand-1",
            key: "vera-inc",
            name: "Vera Inc.",
            slug: "vera-inc",
            status: "active",
            tagline: "Holding co.",
            description: null,
            accent_color: null,
            created_at: "2026-08-11T00:00:00Z",
            owner_user_id: "should-not-leak",
          },
        ],
      }),
      log: () => undefined,
      now: () => 0,
      requestId: () => "req-1",
    },
  );

  assert.equal(response.status, 200);
  const body = await response.json() as { data: { brands: Array<Record<string, unknown>> } };
  assert.equal(body.data.brands.length, 1);
  assert.equal(body.data.brands[0].owner_user_id, undefined);
  assert.equal(body.data.brands[0].name, "Vera Inc.");
});

Deno.test("invalid action is rejected", async () => {
  const response = await handleCashMcpRead(
    buildRequest({ action: "nope" }),
    {
      createClient: () => createFakeClient({}),
      log: () => undefined,
      now: () => 0,
      requestId: () => "req-2",
    },
  );

  assert.equal(response.status, 400);
  const body = await response.json() as { error: { code: string } };
  assert.equal(body.error.code, "INVALID_ACTION");
});

Deno.test("missing auth is rejected", async () => {
  const response = await handleCashMcpRead(
    new Request("http://localhost/cash-mcp-read", { method: "POST", body: "{}" }),
    {
      createClient: () => createFakeClient({}),
      log: () => undefined,
      now: () => 0,
      requestId: () => "req-3",
    },
  );

  assert.equal(response.status, 401);
  const body = await response.json() as { error: { code: string } };
  assert.equal(body.error.code, "AUTH_REQUIRED");
});

Deno.test("get_project includes task summary", async () => {
  const response = await handleCashMcpRead(
    buildRequest({ action: "get_project", project_id: "11111111-1111-4111-8111-111111111111" }),
    {
      createClient: () => createFakeClient({
        projects: [
          {
            id: "11111111-1111-4111-8111-111111111111",
            brand_id: "brand-1",
            name: "Launch",
            description: null,
            status: "active",
            priority: "high",
            project_type: "campaign",
            started_at: null,
            target_date: null,
            completed_at: null,
            created_at: "2026-08-11T00:00:00Z",
          },
        ],
        project_tasks: [
          { id: "task-1", project_id: "11111111-1111-4111-8111-111111111111", title: "One", status: "completed", blocked_reason: null, completed_at: "2026-08-11T00:00:00Z", created_at: "2026-08-10T00:00:00Z" },
          { id: "task-2", project_id: "11111111-1111-4111-8111-111111111111", title: "Two", status: "blocked", blocked_reason: "Waiting", completed_at: null, created_at: "2026-08-10T00:00:00Z" },
        ],
      }),
      log: () => undefined,
      now: () => 0,
      requestId: () => "req-4",
    },
  );

  assert.equal(response.status, 200);
  const body = await response.json() as { data: { task_summary: { total: number; blocked: number; completed: number } } };
  assert.equal(body.data.task_summary.total, 2);
  assert.equal(body.data.task_summary.blocked, 1);
  assert.equal(body.data.task_summary.completed, 1);
});

Deno.test("get_pipeline summarizes deals", async () => {
  const response = await handleCashMcpRead(
    buildRequest({ action: "get_pipeline" }),
    {
      createClient: () => createFakeClient({
        deals: [
          { id: "deal-1", brand_id: "brand-1", organization_id: null, primary_contact_id: null, name: "A", stage: "new", amount: 100, value: 100, expected_close_date: null, next_action: null, next_action_due_at: null, probability: null, closed_at: null, won_at: null, lost_at: null, created_at: "2026-08-10T00:00:00Z" },
          { id: "deal-2", brand_id: "brand-1", organization_id: null, primary_contact_id: null, name: "B", stage: "won", amount: 250, value: 250, expected_close_date: null, next_action: null, next_action_due_at: null, probability: null, closed_at: "2026-08-11T00:00:00Z", won_at: "2026-08-11T00:00:00Z", lost_at: null, created_at: "2026-08-10T00:00:00Z" },
        ],
      }),
      log: () => undefined,
      now: () => 0,
      requestId: () => "req-5",
    },
  );

  assert.equal(response.status, 200);
  const body = await response.json() as { data: { totals: { open_deals: number; won_deals: number; win_rate: number | null } } };
  assert.equal(body.data.totals.open_deals, 1);
  assert.equal(body.data.totals.won_deals, 1);
  assert.equal(body.data.totals.win_rate, 100);
});

Deno.test("get_recent_activity limits rows", async () => {
  const response = await handleCashMcpRead(
    buildRequest({ action: "get_recent_activity", limit: 1 }),
    {
      createClient: () => createFakeClient({
        activities: [
          { id: "act-1", brand_id: "brand-1", contact_id: null, organization_id: null, deal_id: null, project_id: null, project_task_id: null, strategic_move_id: null, activity_type: "note", status: "open", subject: "First", notes: null, outcome: null, activity_at: "2026-08-11T00:00:00Z", created_at: "2026-08-11T00:00:00Z" },
          { id: "act-2", brand_id: "brand-1", contact_id: null, organization_id: null, deal_id: null, project_id: null, project_task_id: null, strategic_move_id: null, activity_type: "note", status: "open", subject: "Second", notes: null, outcome: null, activity_at: "2026-08-10T00:00:00Z", created_at: "2026-08-10T00:00:00Z" },
        ],
      }),
      log: () => undefined,
      now: () => 0,
      requestId: () => "req-6",
    },
  );

  assert.equal(response.status, 200);
  const body = await response.json() as { data: { activities: Array<Record<string, unknown>> } };
  assert.equal(body.data.activities.length, 1);
  assert.equal(body.data.activities[0].subject, "First");
});
