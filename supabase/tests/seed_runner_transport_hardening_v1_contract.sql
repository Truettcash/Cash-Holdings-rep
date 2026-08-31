-- Seed runner transport hardening v1 contract.

DO $test$
DECLARE
  v_def text;
  v_schedule text;
  v_active boolean;
  v_command text;
BEGIN
  SELECT pg_get_functiondef('private.dispatch_athrty_outbound_seed_runner(integer)'::regprocedure)
    INTO v_def;

  IF position('timeout_milliseconds := 300000' in v_def) = 0
     OR position('least(coalesce(p_limit, 2), 2)' in v_def) = 0
     OR position('athrty_outbound_seed_runner_url' in v_def) = 0
     OR position('prospect_outreach_policies' in v_def) = 0
     OR position('''mode'', ''research''' in v_def) = 0 THEN
    RAISE EXCEPTION 'seed runner transport contract mismatch';
  END IF;

  SELECT schedule, active, command
    INTO v_schedule, v_active, v_command
  FROM cron.job
  WHERE jobname = 'athrty-outbound-seed-runner'
  LIMIT 1;

  IF v_schedule IS DISTINCT FROM '*/5 * * * *'
     OR v_active IS DISTINCT FROM true
     OR v_command NOT LIKE '%dispatch_athrty_outbound_seed_runner(2)%' THEN
    RAISE EXCEPTION 'seed runner cron contract mismatch';
  END IF;
END
$test$;
