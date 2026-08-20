-- PHASE 3C — INSPECTION ONLY. Zero DDL/DML. Run as owner in the SQL editor.
-- Scope: the five physical tables behind the six cash-mcp-read actions, plus has_role/user_roles proof.

-- 1) Table-level grants for authenticated / anon / service_role
SELECT table_name, grantee, string_agg(privilege_type, ',' ORDER BY privilege_type) AS privs
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN ('brands','projects','project_tasks','deals','activities','user_roles')
  AND grantee IN ('authenticated','anon','service_role')
GROUP BY table_name, grantee
ORDER BY table_name, grantee;

-- 2) RLS enabled / forced
SELECT c.relname, c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('brands','projects','project_tasks','deals','activities','user_roles')
ORDER BY c.relname;

-- 3) SELECT-applicable policies, and whether they invoke has_role
SELECT tablename, policyname, cmd, roles, qual,
       (qual ILIKE '%has_role%') AS uses_has_role
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('brands','projects','project_tasks','deals','activities','user_roles')
  AND cmd IN ('SELECT','ALL')
ORDER BY tablename, policyname;

-- 4) has_role definition + security mode + search_path (proves whether it bypasses RLS on user_roles)
SELECT p.oid::regprocedure AS signature,
       p.prosecdef AS security_definer,
       pg_get_userbyid(p.proowner) AS owner,
       p.proconfig,
       pg_get_functiondef(p.oid) AS definition
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'has_role';

-- 5) EXECUTE privilege on has_role for authenticated
SELECT p.oid::regprocedure AS signature,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'has_role';

-- 6) Schema USAGE on public
SELECT r.rolname, has_schema_privilege(r.rolname, 'public', 'USAGE') AS usage_public
FROM pg_roles r WHERE r.rolname IN ('authenticated','anon','service_role');

-- 7) Effective per-table SELECT privilege check (single-line answer)
SELECT t.tbl,
       has_table_privilege('authenticated', 'public.'||t.tbl, 'SELECT') AS auth_select,
       has_table_privilege('anon', 'public.'||t.tbl, 'SELECT') AS anon_select
FROM (VALUES ('brands'),('projects'),('project_tasks'),('deals'),('activities'),('user_roles')) AS t(tbl);
