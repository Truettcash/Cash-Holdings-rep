-- ATHRTY site quality ratchet v1 regression contract

DO $do$
DECLARE v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM information_schema.tables
  WHERE table_schema='public' AND table_name='athrty_site_quality_cycles';
  IF v_count<>1 THEN RAISE EXCEPTION 'MISSING_ATHRTY_SITE_QUALITY_CYCLES'; END IF;

  SELECT count(*) INTO v_count
  FROM pg_indexes
  WHERE schemaname='public'
    AND indexname='athrty_site_quality_cycles_one_active_per_site'
    AND indexdef ILIKE '%WHERE%state%queued%building%qa%accepted%';
  IF v_count<>1 THEN RAISE EXCEPTION 'MISSING_ACTIVE_SITE_CYCLE_UNIQUENESS'; END IF;

  SELECT count(*) INTO v_count
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname IN (
    'athrty_site_quality_snapshot',
    'seed_athrty_site_quality_cycles',
    'claim_athrty_site_quality_cycle',
    'register_athrty_site_quality_candidate',
    'evaluate_athrty_site_quality_cycles'
  );
  IF v_count<>5 THEN RAISE EXCEPTION 'MISSING_SITE_RATCHET_FUNCTIONS'; END IF;

  SELECT count(*) INTO v_count
  FROM private.runtime_config
  WHERE key='athrty_site_quality_ratchet_enabled' AND lower(value)='false';
  IF v_count<>1 THEN RAISE EXCEPTION 'SITE_RATCHET_MUST_DEFAULT_DISABLED'; END IF;

  SELECT count(*) INTO v_count
  FROM cron.job
  WHERE jobname='athrty-site-quality-ratchet-seed'
    AND schedule='20 4,16 * * *'
    AND active=true;
  IF v_count<>1 THEN RAISE EXCEPTION 'MISSING_SITE_RATCHET_SEED_CRON'; END IF;

  SELECT count(*) INTO v_count
  FROM cron.job
  WHERE jobname='athrty-site-quality-ratchet-evaluate'
    AND schedule='37 * * * *'
    AND active=true;
  IF v_count<>1 THEN RAISE EXCEPTION 'MISSING_SITE_RATCHET_EVALUATOR_CRON'; END IF;

  -- Execution RPCs must not be client-callable.
  SELECT count(*) INTO v_count
  FROM information_schema.routine_privileges
  WHERE specific_schema='public'
    AND routine_name IN (
      'athrty_site_quality_snapshot',
      'seed_athrty_site_quality_cycles',
      'claim_athrty_site_quality_cycle',
      'register_athrty_site_quality_candidate',
      'evaluate_athrty_site_quality_cycles'
    )
    AND grantee IN ('anon','authenticated');
  IF v_count<>0 THEN RAISE EXCEPTION 'SITE_RATCHET_CLIENT_EXECUTE_EXPOSURE'; END IF;

  -- Static guard assertions: a candidate must be versioned and evaluator must require
  -- release + zero blockers + no regression across the quality dimensions.
  SELECT count(*) INTO v_count
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public'
    AND p.proname='register_athrty_site_quality_candidate'
    AND pg_get_functiondef(p.oid) LIKE '%SITE_QUALITY_CANDIDATE_MUST_BE_VERSIONED%'
    AND pg_get_functiondef(p.oid) LIKE '%SITE_QUALITY_CANDIDATE_PROSPECT_MISMATCH%'
    AND pg_get_functiondef(p.oid) LIKE '%SITE_QUALITY_CANDIDATE_ORG_MISMATCH%';
  IF v_count<>1 THEN RAISE EXCEPTION 'SITE_CANDIDATE_VERSION_GUARDS_MISSING'; END IF;

  SELECT count(*) INTO v_count
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public'
    AND p.proname='evaluate_athrty_site_quality_cycles'
    AND pg_get_functiondef(p.oid) LIKE '%hard_block_count%'
    AND pg_get_functiondef(p.oid) LIKE '%commercial_block_count%'
    AND pg_get_functiondef(p.oid) LIKE '%release_decision%'
    AND pg_get_functiondef(p.oid) LIKE '%technical_quality_score%'
    AND pg_get_functiondef(p.oid) LIKE '%total_score%'
    AND pg_get_functiondef(p.oid) LIKE '%bespoke_premium_score%'
    AND pg_get_functiondef(p.oid) LIKE '%specificity_score%'
    AND pg_get_functiondef(p.oid) LIKE '%non_generic_score%'
    AND pg_get_functiondef(p.oid) LIKE '%restraint_score%'
    AND pg_get_functiondef(p.oid) LIKE '%external_quality_score%';
  IF v_count<>1 THEN RAISE EXCEPTION 'SITE_QUALITY_RATCHET_GUARDS_MISSING'; END IF;
END
$do$;
