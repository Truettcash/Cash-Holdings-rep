-- Cash Holdings — restore Data API privileges for the owner console.
--
-- Target project: ldijllskwwmyhhbzspmb (external / not managed by Lovable).
-- Run this in that project's SQL editor as the owner.
--
-- WHY: live responses from a signed-in owner session return
--   403  42501  permission denied for table brands / projects / deals /
--               activities / engagements / engagement_events / project_tasks
-- Postgres' own HINT is `GRANT SELECT ON public.<table> TO authenticated;`.
-- This is a PRIVILEGE failure, not RLS: the request is rejected before any
-- policy is evaluated. The `cash-mcp-read` Edge Function queries as the caller,
-- inherits the same denial, and reports it as an opaque QUERY_FAILED.
--
-- This script grants privileges ONLY. It does not create, drop or alter tables,
-- policies, roles or functions. Existing owner-only RLS policies remain the
-- access control; grants merely let the request reach them.
--
-- `anon` is deliberately granted NOTHING: this is a private owner console.
--
-- Idempotent: GRANT is a no-op when the privilege is already held, and every
-- table is guarded so a missing table cannot abort the run.

BEGIN;

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    -- core portfolio schema
    'brands',
    'channels',
    'projects',
    'project_tasks',
    'organizations',
    'contacts',
    'deals',
    'activities',
    'metric_definitions',
    'metric_observations',
    -- intake pipeline
    'engagements',
    'engagement_events',
    -- integration layer (token tables intentionally excluded)
    'integration_sync_runs',
    'integration_events',
    -- dashboard state
    'notification_state'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (
      SELECT 1
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public'
         AND c.relname = t
         AND c.relkind IN ('r', 'p')
    ) THEN
      EXECUTE format(
        'GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
      EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
      RAISE NOTICE 'granted: public.%', t;
    ELSE
      RAISE NOTICE 'skipped (table not present): public.%', t;
    END IF;
  END LOOP;
END
$$;

-- Token-bearing tables must stay unreachable from the Data API. These are
-- read only by the Edge Functions via service_role, never by the browser.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['integration_accounts', 'integration_raw_records',
                           'integration_connections', 'integration_oauth_states'] LOOP
    IF EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relname = t AND c.relkind IN ('r', 'p')
    ) THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
      EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
      RAISE NOTICE 'locked to service_role: public.%', t;
    END IF;
  END LOOP;
END
$$;

-- Owner-only role lookup must stay callable by the signed-in user, otherwise
-- every owner-gated policy fails closed.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'user_roles' AND c.relkind = 'r'
  ) THEN
    GRANT SELECT ON public.user_roles TO authenticated;
    GRANT ALL ON public.user_roles TO service_role;
  END IF;
END
$$;

-- Read-model views the dashboard queries (SELECT only; views carry no tokens).
DO $$
DECLARE
  v record;
BEGIN
  FOR v IN
    SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relkind IN ('v', 'm')
       AND c.relname LIKE '%integration%'
  LOOP
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', v.relname);
    EXECUTE format('GRANT SELECT ON public.%I TO service_role', v.relname);
    RAISE NOTICE 'granted view: public.%', v.relname;
  END LOOP;
END
$$;

COMMIT;

-- Let PostgREST pick the privilege changes up immediately.
NOTIFY pgrst, 'reload schema';


-- ---------------------------------------------------------------------------
-- VERIFICATION 1 — effective privileges for `authenticated`.
-- Every core table below should list SELECT (plus INSERT/UPDATE/DELETE).
-- ---------------------------------------------------------------------------
SELECT table_name,
       string_agg(privilege_type, ', ' ORDER BY privilege_type) AS privileges
  FROM information_schema.role_table_grants
 WHERE grantee = 'authenticated'
   AND table_schema = 'public'
 GROUP BY table_name
 ORDER BY table_name;


-- ---------------------------------------------------------------------------
-- VERIFICATION 2 — real integration read model.
-- The app currently queries `public.integration_accounts_safe` (404 PGRST205)
-- and `integration_sync_runs.integration_account_id` (400 42703). Paste the two
-- result sets back so the frontend queries can be corrected to real identifiers
-- instead of guessed ones.
-- ---------------------------------------------------------------------------
SELECT c.relname AS object_name,
       CASE c.relkind WHEN 'r' THEN 'table' WHEN 'v' THEN 'view'
                      WHEN 'm' THEN 'materialized view' WHEN 'p' THEN 'partitioned table'
                      ELSE c.relkind::text END AS object_kind
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public'
   AND c.relname LIKE '%integration%'
 ORDER BY c.relname;

SELECT table_name, ordinal_position, column_name, data_type, is_nullable
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name LIKE '%integration%'
 ORDER BY table_name, ordinal_position;