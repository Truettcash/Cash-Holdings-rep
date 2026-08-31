-- ATHRTY full-green runtime reconciliation v1
-- 1) Reconcile Framer merchant QA results back into the daily attempt state machine.
-- 2) Route sub-threshold Framer components into the existing repair backlog.
-- 3) Recover stale Framer merchant scans automatically.
-- 4) Re-enable stale qualification refresh with a smaller batch and a larger transport budget.

CREATE OR REPLACE FUNCTION private.sync_framer_daily_attempt_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_attempt_id uuid;
  v_threshold numeric;
  v_repair_id uuid;
  v_reason text;
BEGIN
  SELECT a.id, COALESCE(s.qa_threshold, 87)
    INTO v_attempt_id, v_threshold
  FROM public.framer_daily_component_attempts a
  JOIN public.framer_component_sources s ON s.id = a.source_id
  WHERE a.publish_queue_id = NEW.id
  ORDER BY a.created_at DESC
  LIMIT 1;

  IF v_attempt_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'published' THEN
    UPDATE public.framer_daily_component_attempts
    SET state = 'published',
        overall_score = COALESCE(NEW.qa_score, overall_score),
        failure_reason = NULL,
        updated_at = now(),
        completed_at = COALESCE(completed_at, now())
    WHERE id = v_attempt_id;
    RETURN NEW;
  END IF;

  IF NEW.status IN ('ready_for_approval','approved','submitting') THEN
    UPDATE public.framer_daily_component_attempts
    SET state = NEW.status,
        overall_score = COALESCE(NEW.qa_score, overall_score),
        failure_reason = NULL,
        updated_at = now(),
        completed_at = CASE
          WHEN NEW.status IN ('ready_for_approval','approved') THEN COALESCE(completed_at, now())
          ELSE completed_at
        END
    WHERE id = v_attempt_id;
    RETURN NEW;
  END IF;

  IF NEW.status IN ('failed','skipped') THEN
    UPDATE public.framer_daily_component_attempts
    SET state = NEW.status,
        overall_score = COALESCE(NEW.qa_score, overall_score),
        failure_reason = COALESCE(NEW.failure_reason, NEW.status),
        updated_at = now(),
        completed_at = COALESCE(completed_at, now())
    WHERE id = v_attempt_id;
    RETURN NEW;
  END IF;

  IF NEW.status = 'repair' THEN
    UPDATE public.framer_daily_component_attempts
    SET state = 'repair_queued',
        overall_score = COALESCE(NEW.qa_score, overall_score),
        failure_reason = COALESCE(NEW.failure_reason, failure_reason, 'repair_required'),
        updated_at = now(),
        completed_at = COALESCE(completed_at, now())
    WHERE id = v_attempt_id;
    RETURN NEW;
  END IF;

  IF NEW.visual_qa_status = 'fail' THEN
    v_reason := COALESCE(NEW.failure_reason, 'visual_qa_failed');
    v_repair_id := public.enqueue_framer_component_repair(
      NEW.component_id,
      v_reason,
      NULL,
      NEW.id,
      'visual_quality',
      jsonb_build_object(
        'source', 'daily_attempt_reconciliation_v1',
        'visual_qa_status', NEW.visual_qa_status,
        'qa_score', NEW.qa_score
      )
    );

    UPDATE public.framer_daily_component_attempts
    SET state = 'repair_queued',
        overall_score = COALESCE(NEW.qa_score, overall_score),
        failure_reason = v_reason,
        repair_id = v_repair_id,
        updated_at = now(),
        completed_at = COALESCE(completed_at, now())
    WHERE id = v_attempt_id;

    IF NEW.status <> 'repair' AND pg_trigger_depth() = 1 THEN
      UPDATE public.framer_publish_queue
      SET status = 'repair',
          failure_reason = v_reason,
          updated_at = now()
      WHERE id = NEW.id
        AND status <> 'repair';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status = 'qa' AND NEW.qa_score IS NOT NULL THEN
    IF NEW.qa_score < v_threshold THEN
      v_reason := format('qa_below_source_threshold:%s<%s', NEW.qa_score, v_threshold);
      v_repair_id := public.enqueue_framer_component_repair(
        NEW.component_id,
        v_reason,
        NULL,
        NEW.id,
        'quality',
        jsonb_build_object(
          'source', 'daily_attempt_reconciliation_v1',
          'qa_score', NEW.qa_score,
          'qa_threshold', v_threshold,
          'qa_findings', COALESCE(NEW.qa_findings, '{}'::jsonb)
        )
      );

      UPDATE public.framer_daily_component_attempts
      SET state = 'repair_queued',
          overall_score = NEW.qa_score,
          failure_reason = v_reason,
          repair_id = v_repair_id,
          updated_at = now(),
          completed_at = COALESCE(completed_at, now())
      WHERE id = v_attempt_id;

      IF pg_trigger_depth() = 1 THEN
        UPDATE public.framer_publish_queue
        SET status = 'repair',
            failure_reason = v_reason,
            updated_at = now()
        WHERE id = NEW.id
          AND status = 'qa';
      END IF;
    ELSE
      UPDATE public.framer_daily_component_attempts
      SET state = 'qa_passed',
          overall_score = NEW.qa_score,
          failure_reason = NULL,
          updated_at = now()
      WHERE id = v_attempt_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_framer_daily_attempt_v1 ON public.framer_publish_queue;
CREATE TRIGGER trg_sync_framer_daily_attempt_v1
AFTER INSERT OR UPDATE OF status, qa_score, qa_findings, visual_qa_status, failure_reason, human_approved_at
ON public.framer_publish_queue
FOR EACH ROW
EXECUTE FUNCTION private.sync_framer_daily_attempt_v1();

REVOKE ALL ON FUNCTION private.sync_framer_daily_attempt_v1() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.sync_framer_daily_attempt_v1() FROM anon;
REVOKE ALL ON FUNCTION private.sync_framer_daily_attempt_v1() FROM authenticated;
GRANT EXECUTE ON FUNCTION private.sync_framer_daily_attempt_v1() TO service_role;

CREATE OR REPLACE FUNCTION private.reconcile_stale_framer_merch_runs_v1(
  p_stale interval DEFAULT interval '30 minutes'
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_rows integer := 0;
BEGIN
  UPDATE public.framer_merch_runs
  SET status = 'failed',
      error = COALESCE(error, 'stale_scan_recovered_by_runtime_reconciliation_v1'),
      completed_at = COALESCE(completed_at, now()),
      summary = COALESCE(summary, '{}'::jsonb) || jsonb_build_object(
        'reconciled_at', now(),
        'reconciliation', 'stale_scan_runtime_recovery_v1'
      )
  WHERE status = 'scanning'
    AND created_at < now() - GREATEST(COALESCE(p_stale, interval '30 minutes'), interval '15 minutes');

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  UPDATE public.framer_component_sources s
  SET last_scan_at = x.last_scan_at,
      updated_at = now()
  FROM (
    SELECT source_id, max(completed_at) AS last_scan_at
    FROM public.framer_merch_runs
    WHERE status = 'completed'
      AND discovered_count > 0
      AND indexed_count > 0
      AND completed_at IS NOT NULL
    GROUP BY source_id
  ) x
  WHERE s.id = x.source_id
    AND s.last_scan_at IS DISTINCT FROM x.last_scan_at;

  RETURN v_rows;
END;
$function$;

REVOKE ALL ON FUNCTION private.reconcile_stale_framer_merch_runs_v1(interval) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.reconcile_stale_framer_merch_runs_v1(interval) FROM anon;
REVOKE ALL ON FUNCTION private.reconcile_stale_framer_merch_runs_v1(interval) FROM authenticated;
GRANT EXECUTE ON FUNCTION private.reconcile_stale_framer_merch_runs_v1(interval) TO service_role;

DO $do$
DECLARE
  v_job_id bigint;
BEGIN
  FOR v_job_id IN
    SELECT jobid FROM cron.job WHERE jobname = 'framer-merch-stale-scan-recovery'
  LOOP
    PERFORM cron.unschedule(v_job_id);
  END LOOP;

  PERFORM cron.schedule(
    'framer-merch-stale-scan-recovery',
    '13,43 * * * *',
    'select private.reconcile_stale_framer_merch_runs_v1(interval ''30 minutes'');'
  );
END
$do$;

CREATE OR REPLACE FUNCTION private.dispatch_athrty_outbound_refresh_runner(
  p_limit integer DEFAULT 2,
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
      'mode', 'refresh',
      'stale_minutes', greatest(15, least(coalesce(p_stale_minutes, 60), 720))
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

REVOKE ALL ON FUNCTION private.dispatch_athrty_outbound_refresh_runner(integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.dispatch_athrty_outbound_refresh_runner(integer, integer) FROM anon;
REVOKE ALL ON FUNCTION private.dispatch_athrty_outbound_refresh_runner(integer, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION private.dispatch_athrty_outbound_refresh_runner(integer, integer) TO service_role;

DO $do$
DECLARE
  v_job_id bigint;
BEGIN
  FOR v_job_id IN
    SELECT jobid FROM cron.job WHERE jobname = 'athrty-outbound-refresh-15m'
  LOOP
    PERFORM cron.unschedule(v_job_id);
  END LOOP;

  PERFORM cron.schedule(
    'athrty-outbound-refresh-15m',
    '8,23,38,53 * * * *',
    'select private.dispatch_athrty_outbound_refresh_runner(2,60);'
  );
END
$do$;

-- Reconcile any already-returned QA result that pre-dates the new trigger.
UPDATE public.framer_publish_queue q
SET qa_score = q.qa_score,
    updated_at = now()
WHERE q.status = 'qa'
  AND q.qa_score IS NOT NULL
  AND COALESCE((q.metadata ->> 'daily_autopilot')::boolean, false) IS TRUE
  AND EXISTS (
    SELECT 1
    FROM public.framer_daily_component_attempts a
    WHERE a.publish_queue_id = q.id
      AND a.state = 'qa_requested'
  );

SELECT private.reconcile_stale_framer_merch_runs_v1(interval '30 minutes');
