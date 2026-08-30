-- ATHRTY Qualification Refresh v1
-- Continuously re-evaluates stale high-priority prospects so current evidence and the
-- active commercial policy can promote qualified accounts into the outbound lane.

DO $do$
DECLARE
  v_seed_command text;
  v_seed_url text;
  v_refresh_url text;
BEGIN
  SELECT command
    INTO v_seed_command
  FROM cron.job
  WHERE jobname = 'athrty-outbound-seed-runner'
    AND active = true
  LIMIT 1;

  IF v_seed_command IS NULL THEN
    RAISE EXCEPTION 'ATHRTY_ACTIVE_SEED_JOB_REQUIRED';
  END IF;

  v_seed_url := substring(
    v_seed_command
    FROM 'https://[^'']+/functions/v1/athrty-outbound-seed-runner'
  );
  IF v_seed_url IS NULL THEN
    RAISE EXCEPTION 'ATHRTY_SEED_FUNCTION_URL_NOT_DISCOVERABLE';
  END IF;

  v_refresh_url := replace(
    v_seed_url,
    '/functions/v1/athrty-outbound-seed-runner',
    '/functions/v1/athrty-qualification-refresh'
  );

  INSERT INTO private.runtime_config(key, value, updated_at)
  VALUES ('athrty_qualification_refresh_url', v_refresh_url, now())
  ON CONFLICT (key) DO UPDATE
    SET value = excluded.value,
        updated_at = now();
END
$do$;

CREATE OR REPLACE FUNCTION private.dispatch_athrty_qualification_refresh(
  p_limit integer DEFAULT 5,
  p_stale_minutes integer DEFAULT 60
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
  WHERE key = 'athrty_qualification_refresh_url';

  SELECT owner_user_id INTO v_owner
  FROM public.prospect_outreach_policies
  WHERE brand_key = 'authority-systems'
    AND active = true
  LIMIT 1;

  IF v_token IS NULL THEN RAISE EXCEPTION 'ATHRTY_RUNTIME_TOKEN_MISSING'; END IF;
  IF v_url IS NULL THEN RAISE EXCEPTION 'ATHRTY_QUALIFICATION_REFRESH_URL_MISSING'; END IF;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'ATHRTY_ACTIVE_OWNER_POLICY_MISSING'; END IF;

  SELECT net.http_post(
    url := v_url,
    body := jsonb_build_object(
      'owner_user_id', v_owner,
      'limit', greatest(1, least(coalesce(p_limit, 5), 10)),
      'stale_minutes', greatest(15, least(coalesce(p_stale_minutes, 60), 720))
    ),
    params := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-athrty-runtime-token', v_token
    ),
    timeout_milliseconds := 120000
  ) INTO v_request_id;

  RETURN v_request_id;
END;
$function$;

REVOKE ALL ON FUNCTION private.dispatch_athrty_qualification_refresh(integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.dispatch_athrty_qualification_refresh(integer, integer) FROM anon;
REVOKE ALL ON FUNCTION private.dispatch_athrty_qualification_refresh(integer, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION private.dispatch_athrty_qualification_refresh(integer, integer) TO service_role;

DO $do$
DECLARE
  v_job_id bigint;
BEGIN
  FOR v_job_id IN
    SELECT jobid
    FROM cron.job
    WHERE jobname = 'athrty-qualification-refresh-15m'
  LOOP
    PERFORM cron.unschedule(v_job_id);
  END LOOP;

  PERFORM cron.schedule(
    'athrty-qualification-refresh-15m',
    '8,23,38,53 * * * *',
    'select private.dispatch_athrty_qualification_refresh(5,60);'
  );
END
$do$;
