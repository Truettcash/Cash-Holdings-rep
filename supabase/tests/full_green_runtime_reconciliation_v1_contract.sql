-- Full-green runtime reconciliation v1 contract.

DO $test$
DECLARE
  v_trigger_count integer;
  v_def text;
  v_refresh_def text;
  v_refresh_schedule text;
  v_refresh_active boolean;
  v_stale_schedule text;
  v_stale_active boolean;
  v_stale_scans integer;
  v_unreconciled_qa integer;
BEGIN
  SELECT count(*) INTO v_trigger_count
  FROM pg_trigger
  WHERE tgrelid = 'public.framer_publish_queue'::regclass
    AND tgname = 'trg_sync_framer_daily_attempt_v1'
    AND NOT tgisinternal;
  IF v_trigger_count <> 1 THEN
    RAISE EXCEPTION 'framer daily attempt reconciliation trigger missing';
  END IF;

  SELECT pg_get_functiondef('private.sync_framer_daily_attempt_v1()'::regprocedure)
    INTO v_def;
  IF position('enqueue_framer_component_repair' in v_def) = 0
     OR position('qa_below_source_threshold' in v_def) = 0
     OR position('repair_queued' in v_def) = 0 THEN
    RAISE EXCEPTION 'framer daily attempt reconciliation contract incomplete';
  END IF;

  SELECT pg_get_functiondef('private.dispatch_athrty_outbound_refresh_runner(integer,integer)'::regprocedure)
    INTO v_refresh_def;
  IF position('timeout_milliseconds := 300000' in v_refresh_def) = 0
     OR position('least(coalesce(p_limit, 2), 2)' in v_refresh_def) = 0 THEN
    RAISE EXCEPTION 'qualification refresh runtime budget contract mismatch';
  END IF;

  SELECT schedule, active
    INTO v_refresh_schedule, v_refresh_active
  FROM cron.job
  WHERE jobname = 'athrty-outbound-refresh-15m'
  LIMIT 1;
  IF v_refresh_schedule IS DISTINCT FROM '8,23,38,53 * * * *'
     OR v_refresh_active IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'qualification refresh cron contract mismatch';
  END IF;

  SELECT schedule, active
    INTO v_stale_schedule, v_stale_active
  FROM cron.job
  WHERE jobname = 'framer-merch-stale-scan-recovery'
  LIMIT 1;
  IF v_stale_schedule IS DISTINCT FROM '13,43 * * * *'
     OR v_stale_active IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'framer stale scan recovery cron contract mismatch';
  END IF;

  SELECT count(*) INTO v_stale_scans
  FROM public.framer_merch_runs
  WHERE status = 'scanning'
    AND created_at < now() - interval '30 minutes';
  IF v_stale_scans <> 0 THEN
    RAISE EXCEPTION 'stale framer scans remain after reconciliation';
  END IF;

  SELECT count(*) INTO v_unreconciled_qa
  FROM public.framer_daily_component_attempts a
  JOIN public.framer_publish_queue q ON q.id = a.publish_queue_id
  WHERE a.state = 'qa_requested'
    AND q.qa_score IS NOT NULL
    AND COALESCE((q.metadata ->> 'daily_autopilot')::boolean, false) IS TRUE;
  IF v_unreconciled_qa <> 0 THEN
    RAISE EXCEPTION 'returned Framer QA results remain unreconciled';
  END IF;
END
$test$;

DO $test$
DECLARE
  v_dupes integer;
BEGIN
  SELECT count(*) INTO v_dupes
  FROM public.prospect_outreach_queue q
  WHERE q.sequence_step = 1
    AND q.state IN ('draft','review','approved','scheduled','sending','failed')
    AND EXISTS (
      SELECT 1
      FROM public.prospect_outreach_queue prior
      WHERE prior.owner_user_id = q.owner_user_id
        AND prior.prospect_profile_id = q.prospect_profile_id
        AND prior.id <> q.id
        AND prior.sequence_step = 1
        AND prior.state IN ('sent','replied')
    );
  IF v_dupes <> 0 THEN
    RAISE EXCEPTION 'duplicate initial-touch resurrection risk remains';
  END IF;
END
$test$;
