-- ============================================================================
-- CASH HOLDINGS — PATCH UNTYPED has_role() CALLS IN SIX ANALYTICS FUNCTIONS
-- Target project: ldijllskwwmyhhbzspmb
--
-- Cause (confirmed live, owner session, 2026-08-04):
--   analytics.dashboard_summary, dashboard_morning_brief, dashboard_insights,
--   crm_pipeline, projects_progress, brands_performance each call
--     public.has_role(auth.uid(), 'owner')
--   The literal resolves as text, but only has_role(uuid, public.app_role)
--   exists -> 42883 "function public.has_role(uuid, text) does not exist".
--
-- This script rewrites ONLY that expression inside ONLY those six functions.
-- Argument signatures, return types, volatility, SECURITY INVOKER, search_path
-- and grants are all preserved because each function is re-created from its own
-- pg_get_functiondef() text with the single expression substituted.
-- Idempotent: already-cast calls are left untouched.
-- Run in: SQL Editor -> New query -> paste -> Run
-- ============================================================================

begin;

do $do$
declare
  f record;
  src text;
  patched text;
  n int := 0;
begin
  for f in
    select p.oid, p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'analytics'
      and p.proname in (
        'dashboard_summary',
        'dashboard_morning_brief',
        'dashboard_insights',
        'crm_pipeline',
        'projects_progress',
        'brands_performance'
      )
  loop
    src := pg_get_functiondef(f.oid);

    -- add the enum cast only where it is missing
    patched := regexp_replace(
      src,
      'has_role\s*\(\s*auth\.uid\(\)\s*,\s*''owner''\s*\)',
      'has_role(auth.uid(), ''owner''::public.app_role)',
      'gi'
    );

    if patched is distinct from src then
      execute patched;   -- CREATE OR REPLACE FUNCTION ... (identical signature)
      n := n + 1;
      raise notice 'patched analytics.%(%)', f.proname, f.args;
    else
      raise notice 'no untyped call found in analytics.%(%)', f.proname, f.args;
    end if;
  end loop;

  raise notice 'functions patched: %', n;
end
$do$;

commit;

-- reload PostgREST metadata
notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- VERIFICATION (read-only)
-- ---------------------------------------------------------------------------
-- Any remaining untyped calls anywhere in the analytics schema:
--   select n.nspname, p.proname
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'analytics'
--     and pg_get_functiondef(p.oid) ~* 'has_role\s*\(\s*auth\.uid\(\)\s*,\s*''owner''\s*\)';
--   -> expect zero rows
--
-- Signatures unchanged:
--   select p.proname, pg_get_function_identity_arguments(p.oid),
--          p.prosecdef as security_definer
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'analytics' order by 1;
