# Restore Data API grants on the Cash Holdings project

## What the proof actually revealed

`cash-mcp-read` is not broken. Its router, token validation, input validation and
method guard all behave correctly (`INVALID_ACTION`, `INVALID_INPUT`, `405` all
returned as designed). Every *data* action fails identically because the database
refuses the read underneath it.

The browser network log from the same signed-in session proves it directly. These
are live responses captured this session against project `ldijllskwwmyhhbzspmb`:

```text
GET /rest/v1/brands            403  42501  permission denied for table brands
GET /rest/v1/projects          403  42501  permission denied for table projects
GET /rest/v1/project_tasks     403  42501  permission denied for table project_tasks
GET /rest/v1/deals             403  42501  permission denied for table deals
GET /rest/v1/activities        403  42501  permission denied for table activities
GET /rest/v1/engagements       403  42501  permission denied for table engagements
GET /rest/v1/engagement_events 403  42501  permission denied for table engagement_events
```

Postgres itself supplies the fix in the hint: `GRANT SELECT ON public.<table> TO
authenticated;`. This is a **privilege** failure (42501), not RLS — RLS would
return zero rows, not a permission error. The `authenticated` role has no table
privileges on the core schema, so every read fails before any policy is
evaluated. `cash-mcp-read` queries as the caller, inherits the same denial, and
collapses it into its opaque `QUERY_FAILED`.

One table does work (`notification_state` returned `200 []`), which confirms the
API, the key and the session are all healthy — the grants are the only difference.

## Three further live failures, same session

These are independent of the grant problem and also break dashboard surfaces:

1. `integration_accounts_safe` → `404 PGRST205` "Could not find the table
   'public.integration_accounts_safe' in the schema cache". The view the
   Integrations page reads does not exist in the project (PostgREST suggests
   `public.v_integration_sync_runs_safe`).
2. `integration_sync_runs.integration_account_id` → `400 42703` column does not
   exist. The deployed table has a different column name than the app queries.
3. `analytics.dashboard_*` RPCs → `404 42883` "function public.has_role(uuid,
   text) does not exist". The `::public.app_role` cast patch in
   `db/patch-analytics-has-role-cast.sql` was never applied.

## Plan

### 1. Grants SQL (you run it; I cannot reach this project)

I will write `db/restore-data-api-grants.sql`, idempotent, for you to run in the
SQL editor of `ldijllskwwmyhhbzspmb`. For each core table — `brands`, `channels`,
`projects`, `project_tasks`, `organizations`, `contacts`, `deals`, `activities`,
`metric_definitions`, `metric_observations`, `engagements`, `engagement_events`,
`integration_sync_runs`, `integration_events`, `notification_state`:

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON public.<table> TO authenticated;
GRANT ALL ON public.<table> TO service_role;
```

No `anon` grants — this is an owner-only console and every policy is owner-gated,
so `anon` stays with zero privileges. RLS is untouched: the existing owner-only
policies remain the access control; grants only let the request reach them.

### 2. Confirm the real integration read model

Rather than guess, the same SQL file ends with a read-only introspection query
listing the actual columns of `integration_sync_runs` and the actual
`integration_*` views. You paste the result back, and I then correct
`src/lib/integrations/queries.ts` to the real view name and real column names —
no invented identifiers.

### 3. Apply the pending analytics cast patch

`db/patch-analytics-has-role-cast.sql` already exists and is unapplied. Run it in
the same session to clear the `has_role(uuid, text)` 42883 errors.

### 4. Make `cash-mcp-read` diagnosable (optional, needs its source)

`cash-mcp-read` has no source in this repo, so I cannot edit it. If you paste it
in, I will plan two changes: return the underlying Postgres code (e.g.
`PERMISSION_DENIED`, `42501`) instead of a blanket `QUERY_FAILED`, and return
`404 NOT_FOUND` for a valid-but-unknown UUID so a missing record is
distinguishable from a failed query.

## Order of operations

1. Run the grants SQL, then the analytics cast patch.
2. I re-run the same proof script and report every action's status.
3. You paste the introspection output; I fix the integration query identifiers.

## Not touched

RLS policies, auth, Edge Function deployments, schema shape, Instagram, eBay, the
YouTube connect path.