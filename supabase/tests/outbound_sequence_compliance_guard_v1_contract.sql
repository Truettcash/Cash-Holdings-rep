-- ATHRTY Outbound Sequence + Compliance Guard v1 regression contract.

DO $test$
DECLARE
  v_compliance_trigger text;
  v_sequence_trigger text;
  v_compliance_def text;
  v_sequence_def text;
BEGIN
  SELECT pg_get_triggerdef(t.oid, true)
    INTO v_compliance_trigger
  FROM pg_trigger t
  WHERE t.tgrelid = 'public.prospect_outreach_queue'::regclass
    AND t.tgname = 'a_athrty_delivery_compliance_v1_trg'
    AND NOT t.tgisinternal;

  SELECT pg_get_triggerdef(t.oid, true)
    INTO v_sequence_trigger
  FROM pg_trigger t
  WHERE t.tgrelid = 'public.prospect_outreach_queue'::regclass
    AND t.tgname = 'aa_athrty_initial_sequence_guard_v1_trg'
    AND NOT t.tgisinternal;

  v_compliance_def := pg_get_functiondef('private.athrty_normalize_delivery_compliance_v1()'::regprocedure);
  v_sequence_def := pg_get_functiondef('private.athrty_guard_initial_sequence_v1()'::regprocedure);

  IF v_compliance_trigger IS NULL OR v_sequence_trigger IS NULL THEN
    RAISE EXCEPTION 'outbound guard trigger missing';
  END IF;

  IF position('server_injected_footer' in v_compliance_def) = 0
     OR position('can_spam_footer_v4_ascii' in v_compliance_def) = 0
     OR position('ss_plus_red_team_passed' in v_compliance_def) = 0 THEN
    RAISE EXCEPTION 'delivery compliance normalization contract incomplete';
  END IF;

  IF position('ATHRTY_PRIOR_TOUCH_REQUIRES_FOLLOWUP_SEQUENCE' in v_sequence_def) = 0
     OR position('ATHRTY_ACTIVE_INITIAL_TOUCH_ALREADY_EXISTS' in v_sequence_def) = 0
     OR position('ATHRTY_INITIAL_TOUCH_IMMUTABLE_AFTER_DELIVERY' in v_sequence_def) = 0 THEN
    RAISE EXCEPTION 'initial sequence integrity contract incomplete';
  END IF;
END
$test$;

-- There must be no active initial-touch row for a prospect that already has another
-- delivered/replied touch.
DO $test$
DECLARE
  v_duplicates integer;
BEGIN
  SELECT count(*) INTO v_duplicates
  FROM public.prospect_outreach_queue q
  WHERE COALESCE(q.sequence_step, 1) = 1
    AND q.state IN ('draft','review','approved','scheduled','sending')
    AND EXISTS (
      SELECT 1
      FROM public.prospect_outreach_queue h
      WHERE h.owner_user_id = q.owner_user_id
        AND h.prospect_profile_id = q.prospect_profile_id
        AND h.id <> q.id
        AND h.state IN ('sent','replied')
    );

  IF v_duplicates <> 0 THEN
    RAISE EXCEPTION 'active duplicate initial-touch rows remain: %', v_duplicates;
  END IF;
END
$test$;
