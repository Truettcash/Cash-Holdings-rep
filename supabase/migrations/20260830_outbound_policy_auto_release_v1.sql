-- ATHRTY Outbound Policy Auto-Release v1
-- Standing operator authorization for rows that have already cleared all commercial,
-- compliance, evidence, red-team, preview, and QA gates.
--
-- IMPORTANT: current send workers still consume legacy human_approved_* columns.
-- For approval_mode='policy_auto', those fields are populated as compatibility aliases
-- of the standing operator authorization, while the explicit auto_* fields remain the
-- authoritative audit record. No row can enter this path without the strict contract below.

ALTER TABLE public.prospect_outreach_queue
  ADD COLUMN IF NOT EXISTS approval_mode text,
  ADD COLUMN IF NOT EXISTS auto_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS auto_approval_policy_version text;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.prospect_outreach_queue'::regclass
      AND conname = 'prospect_outreach_queue_approval_mode_check'
  ) THEN
    ALTER TABLE public.prospect_outreach_queue
      ADD CONSTRAINT prospect_outreach_queue_approval_mode_check
      CHECK (approval_mode IS NULL OR approval_mode IN ('human','policy_auto'));
  END IF;
END
$do$;

COMMENT ON COLUMN public.prospect_outreach_queue.approval_mode IS
  'Approval authority: human or policy_auto. Null is legacy/unapproved.';
COMMENT ON COLUMN public.prospect_outreach_queue.auto_approved_at IS
  'Timestamp when the bounded policy-auto release contract approved the row.';
COMMENT ON COLUMN public.prospect_outreach_queue.auto_approval_policy_version IS
  'Versioned policy contract that authorized policy-auto release.';
COMMENT ON COLUMN public.prospect_outreach_queue.human_approved_at IS
  'Legacy sender authorization timestamp. For approval_mode=policy_auto this mirrors auto_approved_at under standing operator authorization; use approval_mode to distinguish provenance.';
COMMENT ON COLUMN public.prospect_outreach_queue.human_approved_by IS
  'Legacy sender authorization identity. For approval_mode=policy_auto this records the owning operator whose standing policy authorization is being exercised; use approval_mode to distinguish provenance.';

CREATE OR REPLACE FUNCTION public.athrty_auto_release_outbound_v1(p_limit integer DEFAULT 10)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_now timestamptz := now();
  v_policy_version constant text := 'athrty_policy_auto_v1';
  v_id uuid;
  v_owner uuid;
  v_approved_ids uuid[] := ARRAY[]::uuid[];
  v_count integer := 0;
BEGIN
  FOR v_id, v_owner IN
    SELECT q.id, q.owner_user_id
    FROM public.prospect_outreach_queue q
    JOIN public.prospect_profiles p
      ON p.id = q.prospect_profile_id
     AND p.owner_user_id = q.owner_user_id
    JOIN public.prospect_contact_candidates c
      ON c.id = q.contact_candidate_id
     AND c.owner_user_id = q.owner_user_id
    JOIN LATERAL (
      SELECT ps.*
      FROM public.prospect_preview_sites ps
      WHERE ps.prospect_profile_id = q.prospect_profile_id
      ORDER BY ps.updated_at DESC NULLS LAST, ps.created_at DESC
      LIMIT 1
    ) ps ON true
    JOIN LATERAL (
      SELECT qa.*
      FROM public.athrty_site_qa_runs qa
      WHERE qa.preview_site_id = ps.id
      ORDER BY COALESCE(qa.completed_at, qa.created_at) DESC
      LIMIT 1
    ) qa ON true
    WHERE q.state IN ('draft','review')
      AND q.policy_passed IS TRUE
      AND q.message_quality_score >= 90
      AND q.specificity_score >= 90
      AND q.contact_quality_score >= 85
      AND q.evidence_quality_score >= 85
      AND q.opt_out_included IS TRUE
      AND q.postal_address_included IS TRUE
      AND q.commercial_disclosure_version = 'can_spam_footer_v4_ascii'
      AND NULLIF(trim(q.evidence_url), '') IS NOT NULL
      AND NULLIF(trim(q.evidence_claim), '') IS NOT NULL
      AND COALESCE(q.metadata, '{}'::jsonb) @> '{"ss_plus_red_team_passed":true}'::jsonb
      AND p.prospect_tier IN ('A','B')
      AND p.outreach_eligibility = 'review_ready'
      AND p.data_sufficiency_score >= 75
      AND p.evidence_quality_score >= 85
      AND COALESCE(p.suppress_outreach, false) IS FALSE
      AND p.outreach_status NOT IN ('suppressed','disqualified','converted')
      AND c.outreach_eligible IS TRUE
      AND c.verification_status IN ('public_site','verified')
      AND c.contact_quality_score >= 85
      AND ps.status = 'published'
      AND NULLIF(trim(ps.preview_url), '') IS NOT NULL
      AND COALESCE(ps.qa_score, 0) >= 90
      AND qa.status = 'passed'
      AND qa.release_decision = 'release'
      AND COALESCE(qa.total_score, 0) >= 90
      AND COALESCE(qa.hard_block_count, 0) = 0
      AND NOT EXISTS (
        SELECT 1
        FROM public.outreach_suppressions s
        WHERE s.owner_user_id = q.owner_user_id
          AND (
            (c.email IS NOT NULL AND lower(s.email_normalized) = lower(c.email))
            OR (
              NULLIF(trim(p.canonical_domain), '') IS NOT NULL
              AND lower(s.domain_normalized) = lower(p.canonical_domain)
            )
          )
      )
    ORDER BY q.created_at ASC
    FOR UPDATE OF q SKIP LOCKED
    LIMIT greatest(1, least(coalesce(p_limit, 10), 25))
  LOOP
    UPDATE public.prospect_outreach_queue
    SET state = 'approved',
        approval_mode = 'policy_auto',
        auto_approved_at = v_now,
        auto_approval_policy_version = v_policy_version,
        -- Compatibility aliases for the current two send gates. Provenance is approval_mode.
        human_approved_at = v_now,
        human_approved_by = v_owner,
        metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
          'approval_mode', 'policy_auto',
          'auto_approval_policy_version', v_policy_version,
          'auto_approved_at', v_now,
          'standing_operator_authorization', true,
          'auto_release_contract', jsonb_build_object(
            'message_quality_min', 90,
            'specificity_min', 90,
            'contact_quality_min', 85,
            'evidence_quality_min', 85,
            'preview_qa_min', 90,
            'qa_release_required', true,
            'hard_blocks_max', 0,
            'commercial_compliance_required', true,
            'red_team_required', true
          )
        ),
        updated_at = v_now
    WHERE id = v_id
      AND state IN ('draft','review');

    IF FOUND THEN
      INSERT INTO public.prospect_outreach_reviews (
        owner_user_id,
        outreach_queue_id,
        review_status,
        reviewer_type,
        reviewer_id,
        quality_score,
        specificity_score,
        evidence_alignment_score,
        brand_tone_score,
        compliance_score,
        reasons,
        reviewed_at
      )
      SELECT
        q.owner_user_id,
        q.id,
        'approved',
        'policy_auto',
        'policy:' || v_policy_version,
        q.message_quality_score,
        q.specificity_score,
        q.evidence_quality_score,
        95,
        100,
        jsonb_build_array(
          'Standing operator authorization',
          'Premium policy passed',
          'SS+ red-team passed',
          'Commercial compliance passed',
          'Published preview QA >= 90',
          'No hard QA blocks',
          'Recipient remains unsuppressed'
        ),
        v_now
      FROM public.prospect_outreach_queue q
      WHERE q.id = v_id;

      v_approved_ids := array_append(v_approved_ids, v_id);
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'policy_version', v_policy_version,
    'approved_count', v_count,
    'approved_ids', to_jsonb(v_approved_ids),
    'evaluated_at', v_now
  );
END
$function$;

REVOKE ALL ON FUNCTION public.athrty_auto_release_outbound_v1(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.athrty_auto_release_outbound_v1(integer) FROM anon;
REVOKE ALL ON FUNCTION public.athrty_auto_release_outbound_v1(integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.athrty_auto_release_outbound_v1(integer) TO service_role;

-- Run the strict release evaluator one minute before the existing send worker cadence.
DO $do$
DECLARE
  v_job_id bigint;
BEGIN
  FOR v_job_id IN
    SELECT jobid
    FROM cron.job
    WHERE jobname = 'athrty-outbound-policy-auto-release'
  LOOP
    PERFORM cron.unschedule(v_job_id);
  END LOOP;

  PERFORM cron.schedule(
    'athrty-outbound-policy-auto-release',
    '2,17,32,47 * * * *',
    'select public.athrty_auto_release_outbound_v1(10);'
  );
END
$do$;
