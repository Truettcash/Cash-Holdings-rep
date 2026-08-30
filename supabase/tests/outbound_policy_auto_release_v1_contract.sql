-- ATHRTY Outbound Policy Auto-Release v1 regression contract.
-- Read-only assertions intended for preflight/postflight validation.

DO $test$
DECLARE
  v_def text;
  v_cron_count integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='prospect_outreach_queue' AND column_name='approval_mode'
  ) THEN
    RAISE EXCEPTION 'approval_mode column missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='prospect_outreach_queue' AND column_name='auto_approved_at'
  ) THEN
    RAISE EXCEPTION 'auto_approved_at column missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='prospect_outreach_queue' AND column_name='auto_approval_policy_version'
  ) THEN
    RAISE EXCEPTION 'auto_approval_policy_version column missing';
  END IF;

  SELECT pg_get_functiondef('public.athrty_auto_release_outbound_v1(integer)'::regprocedure)
  INTO v_def;

  IF v_def NOT LIKE '%message_quality_score >= 90%'
     OR v_def NOT LIKE '%specificity_score >= 90%'
     OR v_def NOT LIKE '%contact_quality_score >= 85%'
     OR v_def NOT LIKE '%evidence_quality_score >= 85%'
     OR v_def NOT LIKE '%qa.total_score, 0) >= 90%'
     OR v_def NOT LIKE '%qa.hard_block_count, 0) = 0%'
     OR v_def NOT LIKE '%ss_plus_red_team_passed%'
     OR v_def NOT LIKE '%can_spam_footer_v4_ascii%'
  THEN
    RAISE EXCEPTION 'auto-release strict contract drifted';
  END IF;

  IF has_function_privilege('anon', 'public.athrty_auto_release_outbound_v1(integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon must not execute auto-release';
  END IF;

  IF has_function_privilege('authenticated', 'public.athrty_auto_release_outbound_v1(integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated must not execute auto-release';
  END IF;

  IF NOT has_function_privilege('service_role', 'public.athrty_auto_release_outbound_v1(integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role must execute auto-release';
  END IF;

  SELECT count(*) INTO v_cron_count
  FROM cron.job
  WHERE jobname='athrty-outbound-policy-auto-release'
    AND active=true
    AND schedule='2,17,32,47 * * * *';

  IF v_cron_count <> 1 THEN
    RAISE EXCEPTION 'expected exactly one active auto-release cron job';
  END IF;
END
$test$;

-- Invariant: every policy-auto approved/scheduled/sending/sent row must retain
-- the versioned auto-approval provenance and the existing premium policy pass.
DO $test$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.prospect_outreach_queue
    WHERE approval_mode='policy_auto'
      AND state IN ('approved','scheduled','sending','sent')
      AND (
        policy_passed IS NOT TRUE
        OR auto_approved_at IS NULL
        OR auto_approval_policy_version <> 'athrty_policy_auto_v1'
        OR human_approved_at IS NULL
        OR human_approved_by IS NULL
      )
  ) THEN
    RAISE EXCEPTION 'policy-auto provenance invariant violated';
  END IF;
END
$test$;
