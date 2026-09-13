-- ATHRTY site quality ratchet v1
-- Repair weak sites first, improve healthy sites with spare capacity, and preserve the
-- current baseline until a separately-built candidate proves it is better.

CREATE TABLE IF NOT EXISTS public.athrty_site_quality_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL,
  preview_site_id uuid NOT NULL REFERENCES public.prospect_preview_sites(id) ON DELETE CASCADE,
  candidate_preview_site_id uuid REFERENCES public.prospect_preview_sites(id) ON DELETE SET NULL,
  cycle_type text NOT NULL CHECK (cycle_type IN ('repair','enhancement','regression')),
  state text NOT NULL DEFAULT 'queued' CHECK (state IN ('queued','building','qa','accepted','rejected','deferred','applied')),
  priority integer NOT NULL DEFAULT 100,
  baseline_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  target_scores jsonb NOT NULL DEFAULT '{}'::jsonb,
  candidate_brief jsonb NOT NULL DEFAULT '{}'::jsonb,
  candidate_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  worker_id text,
  decision_reason text,
  started_at timestamptz,
  evaluated_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS athrty_site_quality_cycles_one_active_per_site
  ON public.athrty_site_quality_cycles(preview_site_id)
  WHERE state IN ('queued','building','qa','accepted');

CREATE INDEX IF NOT EXISTS athrty_site_quality_cycles_state_priority_idx
  ON public.athrty_site_quality_cycles(state, priority DESC, created_at);

CREATE INDEX IF NOT EXISTS athrty_site_quality_cycles_owner_state_idx
  ON public.athrty_site_quality_cycles(owner_user_id, state, priority DESC, created_at);

ALTER TABLE public.athrty_site_quality_cycles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.athrty_site_quality_cycles FROM anon;
REVOKE ALL ON TABLE public.athrty_site_quality_cycles FROM authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.athrty_site_quality_cycles TO service_role;

INSERT INTO private.runtime_config(key,value,created_at,updated_at)
VALUES ('athrty_site_quality_ratchet_enabled','false',now(),now())
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.athrty_site_quality_snapshot(p_preview_site_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_snapshot jsonb;
BEGIN
  SELECT jsonb_build_object(
    'preview_site_id', p.id,
    'prospect_profile_id', p.prospect_profile_id,
    'organization_id', p.organization_id,
    'slug', p.slug,
    'industry', p.industry,
    'template_family', p.template_family,
    'status', p.status,
    'qa_score', COALESCE(p.qa_score,0),
    'preview_url', p.preview_url,
    'checkout_url', p.checkout_url,
    'published_at', p.published_at,
    'render_payload', COALESCE(p.render_payload,'{}'::jsonb),
    'internal_metadata', COALESCE(p.internal_metadata,'{}'::jsonb),
    'quality', jsonb_build_object(
      'technical_quality_score', COALESCE(q.technical_quality_score,0),
      'total_score', COALESCE(q.total_score,0),
      'hard_block_count', COALESCE(q.hard_block_count,0),
      'commercial_block_count', COALESCE(q.commercial_block_count,0),
      'qa_status', q.qa_status,
      'release_decision', q.release_decision,
      'bespoke_premium_score', COALESCE(q.bespoke_premium_score,0),
      'specificity_score', COALESCE(q.specificity_score,0),
      'non_generic_score', COALESCE(q.non_generic_score,0),
      'restraint_score', COALESCE(q.restraint_score,0),
      'external_quality_score', COALESCE(q.external_quality_score,0),
      'image_count', COALESCE(q.image_count,0),
      'proof_count', COALESCE(q.proof_count,0),
      'service_count', COALESCE(q.service_count,0),
      'quality_lane', q.quality_lane,
      'quality_deficiencies', COALESCE(q.quality_deficiencies,'[]'::jsonb),
      'critique_decision', q.critique_decision,
      'critique_brief', COALESCE(q.critique_brief,'{}'::jsonb),
      'improvement_priority', COALESCE(q.improvement_priority,0),
      'quality_fresh', COALESCE(q.quality_fresh,false)
    ),
    'performance', jsonb_build_object(
      'preview_events', COALESCE(ev.event_count,0),
      'preview_views', COALESCE(ev.preview_views,0)
    ),
    'snapshotted_at', now()
  )
  INTO v_snapshot
  FROM public.prospect_preview_sites p
  LEFT JOIN public.athrty_preview_quality_inventory_v1 q ON q.preview_site_id=p.id
  LEFT JOIN LATERAL (
    SELECT count(*)::bigint event_count,
           count(*) FILTER (WHERE e.event_type='preview_viewed')::bigint preview_views
    FROM public.prospect_preview_events e
    WHERE e.preview_site_id=p.id
  ) ev ON true
  WHERE p.id=p_preview_site_id;

  IF v_snapshot IS NULL THEN
    RAISE EXCEPTION 'ATHRTY_SITE_NOT_FOUND';
  END IF;

  RETURN v_snapshot;
END;
$function$;

REVOKE ALL ON FUNCTION public.athrty_site_quality_snapshot(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.athrty_site_quality_snapshot(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.athrty_site_quality_snapshot(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.athrty_site_quality_snapshot(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.seed_athrty_site_quality_cycles(
  p_repair_limit integer DEFAULT 2,
  p_enhancement_limit integer DEFAULT 2
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  r record;
  v_enabled boolean := false;
  v_active integer := 0;
  v_slots integer := 0;
  v_baseline jsonb;
  v_targets jsonb;
  v_repairs integer := 0;
  v_enhancements integer := 0;
BEGIN
  SELECT lower(value)='true'
  INTO v_enabled
  FROM private.runtime_config
  WHERE key='athrty_site_quality_ratchet_enabled';

  IF COALESCE(v_enabled,false) IS NOT TRUE THEN
    RETURN jsonb_build_object('ok',true,'enabled',false,'repair_cycles_seeded',0,'enhancement_cycles_seeded',0);
  END IF;

  SELECT count(*) INTO v_active
  FROM public.athrty_site_quality_cycles
  WHERE state IN ('queued','building','qa','accepted');

  -- Repairs receive first claim on capacity.
  FOR r IN
    SELECT q.*, p.status site_status, p.prospect_profile_id, p.organization_id, pp.owner_user_id,
           COALESCE(ev.views,0) preview_views
    FROM public.athrty_preview_improvement_queue_v1 q
    JOIN public.prospect_preview_sites p ON p.id=q.preview_site_id
    JOIN public.prospect_profiles pp ON pp.id=p.prospect_profile_id
    LEFT JOIN LATERAL (
      SELECT count(*) FILTER (WHERE e.event_type='preview_viewed')::bigint views
      FROM public.prospect_preview_events e
      WHERE e.preview_site_id=p.id
    ) ev ON true
    WHERE p.status NOT IN ('archived','sold')
      AND COALESCE(q.quality_fresh,false)=true
      AND (
        q.quality_lane='backlog'
        OR COALESCE(q.hard_block_count,0)>0
        OR COALESCE(q.commercial_block_count,0)>0
        OR q.release_decision='block'
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.athrty_site_quality_cycles c
        WHERE c.preview_site_id=q.preview_site_id
          AND c.state IN ('queued','building','qa','accepted')
      )
    ORDER BY
      COALESCE(q.hard_block_count,0) DESC,
      COALESCE(q.commercial_block_count,0) DESC,
      COALESCE(q.improvement_priority,0) DESC,
      COALESCE(q.total_score,0) ASC,
      p.updated_at ASC
    LIMIT greatest(0,least(coalesce(p_repair_limit,2),4))
  LOOP
    EXIT WHEN v_active >= 6;
    v_baseline := public.athrty_site_quality_snapshot(r.preview_site_id);
    v_targets := jsonb_build_object(
      'hard_block_count',0,
      'commercial_block_count',0,
      'release_decision','release',
      'technical_quality_score',greatest(90,COALESCE(r.technical_quality_score,0)),
      'total_score',greatest(90,COALESCE(r.total_score,0)),
      'bespoke_premium_score',greatest(75,COALESCE(r.bespoke_premium_score,0)),
      'specificity_score',greatest(70,COALESCE(r.specificity_score,0)),
      'non_generic_score',greatest(75,COALESCE(r.non_generic_score,0)),
      'restraint_score',greatest(90,COALESCE(r.restraint_score,0)),
      'min_total_delta',0
    );

    INSERT INTO public.athrty_site_quality_cycles(
      owner_user_id,preview_site_id,cycle_type,state,priority,baseline_snapshot,target_scores,candidate_brief,started_at
    ) VALUES (
      r.owner_user_id,r.preview_site_id,'repair','queued',
      240 + COALESCE(r.hard_block_count,0)*40 + COALESCE(r.commercial_block_count,0)*20 + LEAST(100,COALESCE(r.improvement_priority,0)::integer),
      v_baseline,v_targets,
      jsonb_build_object(
        'strategy','site_quality_ratchet_v1',
        'mode','repair',
        'company_specificity_required',true,
        'baseline_quality',v_baseline->'quality',
        'targets',v_targets,
        'deficiencies',COALESCE(r.quality_deficiencies,'[]'::jsonb),
        'critique',COALESCE(r.critique_brief,'{}'::jsonb),
        'requirements',jsonb_build_array(
          'fix hard and commercial blockers before adding decorative complexity',
          'use real customer evidence, services, proof and first-party imagery when available',
          'replace generic language with company-specific grounded language',
          'strengthen hierarchy, composition and conversion clarity without reducing restraint',
          'preserve responsive, attribution, contact and checkout contracts',
          'preserve the published baseline until the candidate passes the ratchet',
          'do not invent claims, projects, people, certifications, reviews or imagery'
        )
      ),now()
    );
    v_repairs := v_repairs + 1;
    v_active := v_active + 1;
  END LOOP;

  v_slots := greatest(0,6-v_active);

  -- Healthy sites use spare capacity for periodic enhancement.
  FOR r IN
    SELECT q.*, p.status site_status, p.prospect_profile_id, p.organization_id, pp.owner_user_id,
           COALESCE(ev.views,0) preview_views
    FROM public.athrty_preview_improvement_queue_v1 q
    JOIN public.prospect_preview_sites p ON p.id=q.preview_site_id
    JOIN public.prospect_profiles pp ON pp.id=p.prospect_profile_id
    LEFT JOIN LATERAL (
      SELECT count(*) FILTER (WHERE e.event_type='preview_viewed')::bigint views
      FROM public.prospect_preview_events e
      WHERE e.preview_site_id=p.id
    ) ev ON true
    WHERE p.status IN ('qa','ready','published')
      AND COALESCE(q.quality_fresh,false)=true
      AND COALESCE(q.hard_block_count,0)=0
      AND COALESCE(q.commercial_block_count,0)=0
      AND COALESCE(q.total_score,0)>=90
      AND q.quality_lane IN ('improvement','ship_now')
      AND (
        COALESCE(q.total_score,0)<98
        OR COALESCE(q.bespoke_premium_score,0)<96
        OR COALESCE(q.specificity_score,0)<95
        OR COALESCE(q.non_generic_score,0)<95
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.athrty_site_quality_cycles c
        WHERE c.preview_site_id=q.preview_site_id
          AND c.state IN ('queued','building','qa','accepted')
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.athrty_site_quality_cycles c
        WHERE c.preview_site_id=q.preview_site_id
          AND c.cycle_type='enhancement'
          AND c.created_at > now()-interval '14 days'
      )
    ORDER BY
      COALESCE(ev.views,0) DESC,
      COALESCE(q.improvement_priority,0) DESC,
      COALESCE(q.bespoke_premium_score,0) ASC,
      COALESCE(q.specificity_score,0) ASC,
      COALESCE(q.non_generic_score,0) ASC,
      p.updated_at ASC
    LIMIT least(v_slots,greatest(0,least(coalesce(p_enhancement_limit,2),3)))
  LOOP
    v_baseline := public.athrty_site_quality_snapshot(r.preview_site_id);
    v_targets := jsonb_build_object(
      'hard_block_count',0,
      'commercial_block_count',0,
      'release_decision','release',
      'technical_quality_score',greatest(94,COALESCE(r.technical_quality_score,0)),
      'total_score',least(99,greatest(96,COALESCE(r.total_score,0)+2)),
      'bespoke_premium_score',least(99,greatest(90,COALESCE(r.bespoke_premium_score,0)+4)),
      'specificity_score',least(99,greatest(85,COALESCE(r.specificity_score,0)+5)),
      'non_generic_score',least(99,greatest(90,COALESCE(r.non_generic_score,0)+4)),
      'restraint_score',greatest(95,COALESCE(r.restraint_score,0)),
      'min_total_delta',1.5
    );

    INSERT INTO public.athrty_site_quality_cycles(
      owner_user_id,preview_site_id,cycle_type,state,priority,baseline_snapshot,target_scores,candidate_brief,started_at
    ) VALUES (
      r.owner_user_id,r.preview_site_id,'enhancement','queued',
      130 + LEAST(100,COALESCE(r.improvement_priority,0)::integer) + LEAST(40,COALESCE(r.preview_views,0)::integer*2),
      v_baseline,v_targets,
      jsonb_build_object(
        'strategy','site_quality_ratchet_v1',
        'mode','enhancement',
        'company_specificity_required',true,
        'baseline_quality',v_baseline->'quality',
        'targets',v_targets,
        'deficiencies',COALESCE(r.quality_deficiencies,'[]'::jsonb),
        'critique',COALESCE(r.critique_brief,'{}'::jsonb),
        'requirements',jsonb_build_array(
          'make the site feel more bespoke and premium through intentionality, not more elements',
          'increase company-specific evidence, proof, services and relevant first-party imagery',
          'reduce generic language and generic template composition',
          'improve hierarchy, pacing, conversion clarity and brand-specific composition',
          'preserve or improve restraint',
          'preserve responsive, attribution, contact, checkout and release contracts',
          'keep the existing published version as the baseline until the candidate proves better',
          'do not invent claims, reviews, projects, people, certifications or imagery'
        )
      ),now()
    );
    v_enhancements := v_enhancements + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'ok',true,
    'enabled',true,
    'repair_cycles_seeded',v_repairs,
    'enhancement_cycles_seeded',v_enhancements,
    'active_capacity_limit',6
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.seed_athrty_site_quality_cycles(integer,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.seed_athrty_site_quality_cycles(integer,integer) FROM anon;
REVOKE ALL ON FUNCTION public.seed_athrty_site_quality_cycles(integer,integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.seed_athrty_site_quality_cycles(integer,integer) TO service_role;

CREATE OR REPLACE FUNCTION public.claim_athrty_site_quality_cycle(p_worker_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_cycle public.athrty_site_quality_cycles%ROWTYPE;
BEGIN
  IF COALESCE(NULLIF(trim(p_worker_id),''),'')='' THEN
    RAISE EXCEPTION 'WORKER_ID_REQUIRED';
  END IF;

  SELECT * INTO v_cycle
  FROM public.athrty_site_quality_cycles
  WHERE state='queued'
  ORDER BY priority DESC, created_at ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF v_cycle.id IS NULL THEN
    RETURN jsonb_build_object('ok',true,'cycle',null);
  END IF;

  UPDATE public.athrty_site_quality_cycles
  SET state='building',worker_id=p_worker_id,started_at=COALESCE(started_at,now()),updated_at=now()
  WHERE id=v_cycle.id;

  RETURN jsonb_build_object(
    'ok',true,
    'cycle',jsonb_build_object(
      'id',v_cycle.id,
      'preview_site_id',v_cycle.preview_site_id,
      'cycle_type',v_cycle.cycle_type,
      'priority',v_cycle.priority,
      'baseline_snapshot',v_cycle.baseline_snapshot,
      'target_scores',v_cycle.target_scores,
      'candidate_brief',v_cycle.candidate_brief
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.claim_athrty_site_quality_cycle(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_athrty_site_quality_cycle(text) FROM anon;
REVOKE ALL ON FUNCTION public.claim_athrty_site_quality_cycle(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_athrty_site_quality_cycle(text) TO service_role;

CREATE OR REPLACE FUNCTION public.register_athrty_site_quality_candidate(
  p_cycle_id uuid,
  p_candidate_preview_site_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_cycle public.athrty_site_quality_cycles%ROWTYPE;
  v_base public.prospect_preview_sites%ROWTYPE;
  v_candidate public.prospect_preview_sites%ROWTYPE;
BEGIN
  SELECT * INTO v_cycle FROM public.athrty_site_quality_cycles WHERE id=p_cycle_id FOR UPDATE;
  IF v_cycle.id IS NULL THEN RAISE EXCEPTION 'SITE_QUALITY_CYCLE_NOT_FOUND'; END IF;
  IF v_cycle.state NOT IN ('building','qa') THEN RAISE EXCEPTION 'SITE_QUALITY_CYCLE_NOT_BUILDING'; END IF;

  SELECT * INTO v_base FROM public.prospect_preview_sites WHERE id=v_cycle.preview_site_id;
  SELECT * INTO v_candidate FROM public.prospect_preview_sites WHERE id=p_candidate_preview_site_id;
  IF v_candidate.id IS NULL THEN RAISE EXCEPTION 'SITE_QUALITY_CANDIDATE_NOT_FOUND'; END IF;
  IF v_candidate.id=v_base.id THEN RAISE EXCEPTION 'SITE_QUALITY_CANDIDATE_MUST_BE_VERSIONED'; END IF;
  IF v_candidate.prospect_profile_id IS DISTINCT FROM v_base.prospect_profile_id THEN RAISE EXCEPTION 'SITE_QUALITY_CANDIDATE_PROSPECT_MISMATCH'; END IF;
  IF v_candidate.organization_id IS DISTINCT FROM v_base.organization_id THEN RAISE EXCEPTION 'SITE_QUALITY_CANDIDATE_ORG_MISMATCH'; END IF;
  IF v_candidate.status IN ('sold','published') THEN RAISE EXCEPTION 'SITE_QUALITY_CANDIDATE_MUST_NOT_BE_LIVE'; END IF;

  UPDATE public.athrty_site_quality_cycles
  SET candidate_preview_site_id=p_candidate_preview_site_id,state='qa',updated_at=now()
  WHERE id=p_cycle_id;

  RETURN jsonb_build_object('ok',true,'cycle_id',p_cycle_id,'candidate_preview_site_id',p_candidate_preview_site_id,'state','qa');
END;
$function$;

REVOKE ALL ON FUNCTION public.register_athrty_site_quality_candidate(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.register_athrty_site_quality_candidate(uuid,uuid) FROM anon;
REVOKE ALL ON FUNCTION public.register_athrty_site_quality_candidate(uuid,uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.register_athrty_site_quality_candidate(uuid,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.evaluate_athrty_site_quality_cycles(p_limit integer DEFAULT 20)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  r record;
  v_candidate jsonb;
  bq jsonb;
  cq jsonb;
  v_pass boolean;
  v_reason text;
  v_min_delta numeric;
  v_accepted integer := 0;
  v_rejected integer := 0;
BEGIN
  FOR r IN
    SELECT *
    FROM public.athrty_site_quality_cycles
    WHERE state='qa' AND candidate_preview_site_id IS NOT NULL
    ORDER BY priority DESC, updated_at ASC
    LIMIT greatest(1,least(coalesce(p_limit,20),50))
    FOR UPDATE SKIP LOCKED
  LOOP
    v_candidate := public.athrty_site_quality_snapshot(r.candidate_preview_site_id);
    bq := COALESCE(r.baseline_snapshot->'quality','{}'::jsonb);
    cq := COALESCE(v_candidate->'quality','{}'::jsonb);
    v_min_delta := COALESCE((r.target_scores->>'min_total_delta')::numeric, CASE WHEN r.cycle_type='enhancement' THEN 1.5 ELSE 0 END);

    v_pass :=
      COALESCE((cq->>'quality_fresh')::boolean,false)=true
      AND COALESCE((cq->>'hard_block_count')::integer,99)=0
      AND COALESCE((cq->>'commercial_block_count')::integer,99)=0
      AND COALESCE(cq->>'qa_status','')='passed'
      AND COALESCE(cq->>'release_decision','')='release'
      AND COALESCE((cq->>'technical_quality_score')::numeric,0) >= COALESCE((bq->>'technical_quality_score')::numeric,0)
      AND COALESCE((cq->>'total_score')::numeric,0) >= COALESCE((bq->>'total_score')::numeric,0) + v_min_delta
      AND COALESCE((cq->>'bespoke_premium_score')::numeric,0) >= COALESCE((bq->>'bespoke_premium_score')::numeric,0)
      AND COALESCE((cq->>'specificity_score')::numeric,0) >= COALESCE((bq->>'specificity_score')::numeric,0)
      AND COALESCE((cq->>'non_generic_score')::numeric,0) >= COALESCE((bq->>'non_generic_score')::numeric,0)
      AND COALESCE((cq->>'restraint_score')::numeric,0) >= COALESCE((bq->>'restraint_score')::numeric,0)
      AND COALESCE((cq->>'external_quality_score')::numeric,0) >= COALESCE((bq->>'external_quality_score')::numeric,0)
      AND COALESCE((cq->>'technical_quality_score')::numeric,0) >= COALESCE((r.target_scores->>'technical_quality_score')::numeric,0)
      AND COALESCE((cq->>'total_score')::numeric,0) >= COALESCE((r.target_scores->>'total_score')::numeric,0)
      AND COALESCE((cq->>'bespoke_premium_score')::numeric,0) >= COALESCE((r.target_scores->>'bespoke_premium_score')::numeric,0)
      AND COALESCE((cq->>'specificity_score')::numeric,0) >= COALESCE((r.target_scores->>'specificity_score')::numeric,0)
      AND COALESCE((cq->>'non_generic_score')::numeric,0) >= COALESCE((r.target_scores->>'non_generic_score')::numeric,0)
      AND COALESCE((cq->>'restraint_score')::numeric,0) >= COALESCE((r.target_scores->>'restraint_score')::numeric,0);

    IF v_pass THEN
      v_reason := 'candidate_beats_baseline_and_clears_release_contract';
      UPDATE public.athrty_site_quality_cycles
      SET state='accepted',candidate_snapshot=v_candidate,decision_reason=v_reason,evaluated_at=now(),updated_at=now()
      WHERE id=r.id;
      v_accepted := v_accepted + 1;

      INSERT INTO public.athrty_site_learning_events(
        owner_user_id,preview_site_id,prospect_profile_id,organization_id,event_type,industry,template_family,
        quality_score,signal_key,source_table,source_row_id,payload,observed_at
      )
      SELECT r.owner_user_id,r.candidate_preview_site_id,p.prospect_profile_id,p.organization_id,'qa_pass',p.industry,p.template_family,
             COALESCE((cq->>'total_score')::numeric,0),'site_quality_ratchet_accept','athrty_site_quality_cycles',r.id,
             jsonb_build_object('cycle_type',r.cycle_type,'baseline_quality',bq,'candidate_quality',cq,'targets',r.target_scores),now()
      FROM public.prospect_preview_sites p WHERE p.id=r.candidate_preview_site_id;
    ELSE
      v_reason := 'candidate_failed_quality_ratchet';
      UPDATE public.athrty_site_quality_cycles
      SET state='rejected',candidate_snapshot=v_candidate,decision_reason=v_reason,evaluated_at=now(),completed_at=now(),updated_at=now()
      WHERE id=r.id;
      UPDATE public.prospect_preview_sites
      SET status='archived',updated_at=now()
      WHERE id=r.candidate_preview_site_id
        AND status NOT IN ('published','sold','archived');
      v_rejected := v_rejected + 1;

      INSERT INTO public.athrty_site_learning_events(
        owner_user_id,preview_site_id,prospect_profile_id,organization_id,event_type,industry,template_family,
        quality_score,signal_key,source_table,source_row_id,payload,observed_at
      )
      SELECT r.owner_user_id,r.candidate_preview_site_id,p.prospect_profile_id,p.organization_id,'qa_fail',p.industry,p.template_family,
             COALESCE((cq->>'total_score')::numeric,0),'site_quality_ratchet_reject','athrty_site_quality_cycles',r.id,
             jsonb_build_object('cycle_type',r.cycle_type,'baseline_quality',bq,'candidate_quality',cq,'targets',r.target_scores),now()
      FROM public.prospect_preview_sites p WHERE p.id=r.candidate_preview_site_id;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('ok',true,'accepted',v_accepted,'rejected',v_rejected);
END;
$function$;

REVOKE ALL ON FUNCTION public.evaluate_athrty_site_quality_cycles(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.evaluate_athrty_site_quality_cycles(integer) FROM anon;
REVOKE ALL ON FUNCTION public.evaluate_athrty_site_quality_cycles(integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.evaluate_athrty_site_quality_cycles(integer) TO service_role;

DO $do$
DECLARE v_job_id bigint;
BEGIN
  FOR v_job_id IN SELECT jobid FROM cron.job WHERE jobname='athrty-site-quality-ratchet-seed' LOOP
    PERFORM cron.unschedule(v_job_id);
  END LOOP;
  PERFORM cron.schedule(
    'athrty-site-quality-ratchet-seed',
    '20 4,16 * * *',
    'select public.seed_athrty_site_quality_cycles(2,2);'
  );

  FOR v_job_id IN SELECT jobid FROM cron.job WHERE jobname='athrty-site-quality-ratchet-evaluate' LOOP
    PERFORM cron.unschedule(v_job_id);
  END LOOP;
  PERFORM cron.schedule(
    'athrty-site-quality-ratchet-evaluate',
    '37 * * * *',
    'select public.evaluate_athrty_site_quality_cycles(20);'
  );
END
$do$;
