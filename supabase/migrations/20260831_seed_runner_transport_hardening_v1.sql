-- ATHRTY seed-runner transport hardening v1
-- Bound each research cycle to two profiles and give the pg_net caller enough time
-- for serial research/enrichment work to complete without transport timeout.

CREATE OR REPLACE FUNCTION private.dispatch_athrty_outbound_seed_runner(
  p_limit integer DEFAULT 2
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_token text;
  v_url text;
  v_owner uuid;
  v_request_id bigint;
BEGIN
  SELECT value INTO v_token
  FROM private.runtime_config
  WHERE key = 'athrty_learning_trigger_token';

  SELECT value INTO v_url
  FROM private.runtime_config
  WHERE key = 'athrty_outbound_seed_runner_url';

  SELECT owner_user_id INTO v_owner
  FROM public.prospect_outreach_policies
  WHERE brand_key = 'authority-systems'
    AND active = true
  LIMIT 1;

  IF v_token IS NULL THEN RAISE EXCEPTION 'ATHRTY_RUNTIME_TOKEN_MISSING'; END IF;
  IF v_url IS NULL THEN RAISE EXCEPTION 'ATHRTY_OUTBOUND_SEED_RUNNER_URL_MISSING'; END IF;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'ATHRTY_ACTIVE_OWNER_POLICY_MISSING'; END IF;

  SELECT net.http_post(
    url := v_url,
    body := jsonb_build_object(
      'owner_user_id', v_owner,
      'limit', greatest(1, least(coalesce(p_limit, 2), 2)),
      'mode', 'research'
    ),
    params := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-athrty-runtime-token', v_token
    ),
    timeout_milliseconds := 300000
  ) INTO v_request_id;

  RETURN v_request_id;
END;
$function$;

REVOKE ALL ON FUNCTION private.dispatch_athrty_outbound_seed_runner(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.dispatch_athrty_outbound_seed_runner(integer) FROM anon;
REVOKE ALL ON FUNCTION private.dispatch_athrty_outbound_seed_runner(integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION private.dispatch_athrty_outbound_seed_runner(integer) TO service_role;

DO $do$
DECLARE
  v_job_id bigint;
BEGIN
  FOR v_job_id IN
    SELECT jobid FROM cron.job WHERE jobname = 'athrty-outbound-seed-runner'
  LOOP
    PERFORM cron.unschedule(v_job_id);
  END LOOP;

  PERFORM cron.schedule(
    'athrty-outbound-seed-runner',
    '*/5 * * * *',
    'select private.dispatch_athrty_outbound_seed_runner(2);'
  );
END
$do$;
