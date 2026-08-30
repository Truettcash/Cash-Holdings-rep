-- ATHRTY Qualification Refresh v1 regression contract.

DO $test$
DECLARE
  v_url text;
  v_schedule text;
  v_active boolean;
  v_anon boolean;
  v_auth boolean;
  v_service boolean;
  v_def text;
BEGIN
  SELECT value INTO v_url
  FROM private.runtime_config
  WHERE key = 'athrty_qualification_refresh_url';

  IF v_url IS NULL OR v_url NOT LIKE '%/functions/v1/athrty-qualification-refresh' THEN
    RAISE EXCEPTION 'qualification refresh runtime URL missing or invalid';
  END IF;

  SELECT schedule, active
    INTO v_schedule, v_active
  FROM cron.job
  WHERE jobname = 'athrty-qualification-refresh-15m'
  LIMIT 1;

  IF v_schedule IS DISTINCT FROM '8,23,38,53 * * * *' OR v_active IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'qualification refresh cron contract mismatch';
  END IF;

  SELECT
    has_function_privilege('anon', 'private.dispatch_athrty_qualification_refresh(integer,integer)', 'EXECUTE'),
    has_function_privilege('authenticated', 'private.dispatch_athrty_qualification_refresh(integer,integer)', 'EXECUTE'),
    has_function_privilege('service_role', 'private.dispatch_athrty_qualification_refresh(integer,integer)', 'EXECUTE'),
    pg_get_functiondef('private.dispatch_athrty_qualification_refresh(integer,integer)'::regprocedure)
  INTO v_anon, v_auth, v_service, v_def;

  IF v_anon OR v_auth OR NOT v_service THEN
    RAISE EXCEPTION 'qualification refresh privilege contract mismatch';
  END IF;

  IF position('athrty_learning_trigger_token' in v_def) = 0
     OR position('prospect_outreach_policies' in v_def) = 0
     OR position('authority-systems' in v_def) = 0
     OR position('stale_minutes' in v_def) = 0 THEN
    RAISE EXCEPTION 'qualification refresh dispatcher contract incomplete';
  END IF;
END
$test$;

-- The active ATHRTY policy must remain the source of promotion thresholds.
DO $test$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.prospect_outreach_policies
  WHERE brand_key = 'authority-systems'
    AND active = true;

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'expected exactly one active authority-systems outreach policy';
  END IF;
END
$test$;
