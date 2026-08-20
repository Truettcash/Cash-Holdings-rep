-- PHASE 3C — MINIMAL PATCH (read-only proof surface for cash-mcp-read).
-- Run ONLY after inspection confirms authenticated lacks SELECT on these tables.
-- No INSERT/UPDATE/DELETE. No anon grants. No policy changes. No RLS changes.

BEGIN;

GRANT SELECT ON public.brands        TO authenticated;
GRANT SELECT ON public.projects      TO authenticated;
GRANT SELECT ON public.project_tasks TO authenticated;
GRANT SELECT ON public.deals         TO authenticated;
GRANT SELECT ON public.activities    TO authenticated;

-- CONDITIONAL — include the next line ONLY if inspection step 4 shows
-- public.has_role is NOT SECURITY DEFINER (i.e. it reads user_roles as the caller):
-- GRANT SELECT ON public.user_roles TO authenticated;

COMMIT;

-- Post-patch verification (expect t for the five tables, f for anon)
SELECT t.tbl,
       has_table_privilege('authenticated', 'public.'||t.tbl, 'SELECT') AS auth_select,
       has_table_privilege('authenticated', 'public.'||t.tbl, 'INSERT') AS auth_insert,
       has_table_privilege('anon', 'public.'||t.tbl, 'SELECT')          AS anon_select
FROM (VALUES ('brands'),('projects'),('project_tasks'),('deals'),('activities')) AS t(tbl);
