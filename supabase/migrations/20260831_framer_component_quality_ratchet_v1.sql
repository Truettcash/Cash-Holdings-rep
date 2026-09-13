-- Framer component quality ratchet v1
-- Versioned repair + enhancement lifecycle. Existing components remain the baseline.
-- Candidates advance only when they beat the baseline without regressing core quality.

CREATE TABLE IF NOT EXISTS public.framer_component_quality_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES public.framer_component_sources(id) ON DELETE CASCADE,
  component_id uuid NOT NULL REFERENCES public.framer_component_inventory(id) ON DELETE CASCADE,
  repair_id uuid REFERENCES public.framer_component_repair_backlog(id) ON DELETE SET NULL,
  variant_queue_id uuid REFERENCES public.framer_product_variant_queue(id) ON DELETE SET NULL,
  cycle_type text NOT NULL CHECK (cycle_type IN ('repair','enhancement','regression')),
  state text NOT NULL DEFAULT 'queued' CHECK (state IN ('queued','building','qa','accepted','rejected','deferred')),
  priority integer NOT NULL DEFAULT 100,
  baseline_scores jsonb NOT NULL DEFAULT '{}'::jsonb,
  target_scores jsonb NOT NULL DEFAULT '{}'::jsonb,
  result_scores jsonb NOT NULL DEFAULT '{}'::jsonb,
  decision_reason text,
  started_at timestamptz,
  evaluated_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS framer_component_quality_cycles_one_active_per_component
  ON public.framer_component_quality_cycles(component_id)
  WHERE state IN ('queued','building','qa');

CREATE INDEX IF NOT EXISTS framer_component_quality_cycles_source_state_idx
  ON public.framer_component_quality_cycles(source_id,state,priority DESC,created_at);

ALTER TABLE public.framer_component_quality_cycles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.framer_component_quality_cycles FROM anon;
REVOKE ALL ON TABLE public.framer_component_quality_cycles FROM authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.framer_component_quality_cycles TO service_role;

CREATE OR REPLACE FUNCTION public.framer_component_quality_snapshot(p_component_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_snapshot jsonb;
BEGIN
  SELECT jsonb_build_object(
    'component_id', i.id,
    'component_name', i.component_name,
    'qa_score', COALESCE(i.qa_score,0),
    'visual_score', COALESCE(i.visual_score,0),
    'usefulness_score', COALESCE(i.usefulness_score,0),
    'configurability_score', COALESCE(i.configurability_score,0),
    'responsive_score', COALESCE(i.responsive_score,0),
    'commercial_score', COALESCE(i.commercial_score,0),
    'marketplace_score', COALESCE(i.marketplace_score,0),
    'quality_composite', ROUND((
      COALESCE(i.qa_score,0) * 0.25 +
      COALESCE(i.visual_score,0) * 0.20 +
      COALESCE(i.usefulness_score,0) * 0.15 +
      COALESCE(i.configurability_score,0) * 0.10 +
      COALESCE(i.responsive_score,0) * 0.10 +
      COALESCE(i.commercial_score,0) * 0.10 +
      COALESCE(i.marketplace_score,0) * 0.10
    )::numeric,2),
    'marketplace_ready', COALESCE(i.marketplace_ready,false),
    'version_rank', COALESCE(i.version_rank,0),
    'performance', jsonb_build_object(
      'views', COALESCE(p.views,0),
      'clicks', COALESCE(p.clicks,0),
      'purchases', COALESCE(p.purchases,0),
      'gross_revenue_cents', COALESCE(p.gross_revenue_cents,0),
      'refunds_cents', COALESCE(p.refunds_cents,0),
      'support_events', COALESCE(p.support_events,0),
      'conversion_rate', COALESCE(p.conversion_rate,0)
    )
  ) INTO v_snapshot
  FROM public.framer_component_inventory i
  LEFT JOIN LATERAL (
    SELECT
      SUM(COALESCE(fp.views,0))::bigint AS views,
      SUM(COALESCE(fp.clicks,0))::bigint AS clicks,
      SUM(COALESCE(fp.purchases,0))::bigint AS purchases,
      SUM(COALESCE(fp.gross_revenue_cents,0))::bigint AS gross_revenue_cents,
      SUM(COALESCE(fp.refunds_cents,0))::bigint AS refunds_cents,
      SUM(COALESCE(fp.support_events,0))::bigint AS support_events,
      AVG(COALESCE(fp.conversion_rate,0))::numeric AS conversion_rate
    FROM public.framer_component_performance fp
    WHERE fp.component_id=i.id
  ) p ON true
  WHERE i.id=p_component_id;

  IF v_snapshot IS NULL THEN
    RAISE EXCEPTION 'FRAMER_COMPONENT_NOT_FOUND';
  END IF;

  RETURN v_snapshot;
END;
$function$;

REVOKE ALL ON FUNCTION public.framer_component_quality_snapshot(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.framer_component_quality_snapshot(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.framer_component_quality_snapshot(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.framer_component_quality_snapshot(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.seed_framer_component_quality_cycles(
  p_source_id uuid,
  p_repair_limit integer DEFAULT 3,
  p_enhancement_limit integer DEFAULT 2
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  r record;
  v_cycle_id uuid;
  v_variant_id uuid;
  v_baseline jsonb;
  v_targets jsonb;
  v_repair_count integer := 0;
  v_enhancement_count integer := 0;
  v_active integer := 0;
  v_slots integer := 0;
  v_source_threshold numeric := 87;
BEGIN
  SELECT COALESCE(qa_threshold,87)
    INTO v_source_threshold
  FROM public.framer_component_sources
  WHERE id=p_source_id AND active=true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok',false,'reason','SOURCE_NOT_ACTIVE');
  END IF;

  SELECT count(*) INTO v_active
  FROM public.framer_component_quality_cycles
  WHERE source_id=p_source_id
    AND state IN ('queued','building','qa');

  -- Repair always gets first claim on capacity.
  FOR r IN
    SELECT rb.*, i.component_name
    FROM public.framer_component_repair_backlog rb
    JOIN public.framer_component_inventory i ON i.id=rb.component_id
    WHERE rb.source_id=p_source_id
      AND rb.status IN ('queued','deferred','ready_to_retry')
      AND rb.next_attempt_at<=now()
      AND rb.attempt_count<rb.max_attempts
      AND NOT EXISTS (
        SELECT 1 FROM public.framer_component_quality_cycles c
        WHERE c.component_id=rb.component_id
          AND c.state IN ('queued','building','qa')
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.framer_product_variant_queue q
        WHERE q.source_component_id=rb.component_id
          AND q.signal_type='quality_repair'
          AND q.status IN ('queued','building','qa','ready')
      )
    ORDER BY rb.priority DESC, rb.next_attempt_at ASC
    LIMIT greatest(0,least(coalesce(p_repair_limit,3),6))
  LOOP
    v_baseline := public.framer_component_quality_snapshot(r.component_id);
    v_targets := jsonb_build_object(
      'qa_score', greatest(v_source_threshold, COALESCE((v_baseline->>'qa_score')::numeric,0)),
      'visual_score', greatest(92, COALESCE((v_baseline->>'visual_score')::numeric,0)),
      'responsive_score', greatest(94, COALESCE((v_baseline->>'responsive_score')::numeric,0)),
      'configurability_score', greatest(94, COALESCE((v_baseline->>'configurability_score')::numeric,0)),
      'quality_composite_min_delta', 0.5
    );

    INSERT INTO public.framer_component_quality_cycles(
      source_id,component_id,repair_id,cycle_type,state,priority,baseline_scores,target_scores,started_at
    ) VALUES (
      p_source_id,r.component_id,r.id,'repair','queued',200+r.priority,v_baseline,v_targets,now()
    ) RETURNING id INTO v_cycle_id;

    INSERT INTO public.framer_product_variant_queue(
      source_id,product_type,source_component_id,signal_type,market_problem,variant_brief,priority,status
    ) VALUES (
      p_source_id,'component',r.component_id,'quality_repair',
      'Repair the component without degrading its proven baseline. Produce a versioned candidate; do not mutate the baseline in place.',
      jsonb_build_object(
        'quality_cycle_id',v_cycle_id,
        'repair_id',r.id,
        'reason',r.reason,
        'failure_class',r.failure_class,
        'baseline',v_baseline,
        'targets',v_targets,
        'repair_contract',COALESCE(r.repair_contract,'{}'::jsonb),
        'rules',jsonb_build_array(
          'preserve core utility and buyer-facing workflow',
          'fix the diagnosed failure before adding anything new',
          'maintain commercial restraint and premium composition',
          'maintain responsive behavior at 1440/834/390',
          'preserve configurability and site-style adaptability',
          'do not replace the baseline unless the candidate beats it',
          'do not copy marketplace implementations or visual compositions'
        )
      ),220+r.priority,'queued'
    ) RETURNING id INTO v_variant_id;

    UPDATE public.framer_component_quality_cycles
      SET variant_queue_id=v_variant_id,updated_at=now()
    WHERE id=v_cycle_id;

    UPDATE public.framer_component_repair_backlog
      SET status='repairing',attempt_count=attempt_count+1,updated_at=now()
    WHERE id=r.id;

    v_repair_count := v_repair_count + 1;
  END LOOP;

  SELECT count(*) INTO v_active
  FROM public.framer_component_quality_cycles
  WHERE source_id=p_source_id
    AND state IN ('queued','building','qa');

  v_slots := greatest(0, 8-v_active);

  -- Enhancement uses only spare capacity after repair work.
  FOR r IN
    SELECT i.*,
           COALESCE(perf.gross_revenue_cents,0) AS perf_revenue,
           COALESCE(perf.purchases,0) AS perf_purchases,
           COALESCE(perf.views,0) AS perf_views
    FROM public.framer_component_inventory i
    LEFT JOIN LATERAL (
      SELECT
        SUM(COALESCE(fp.gross_revenue_cents,0))::bigint gross_revenue_cents,
        SUM(COALESCE(fp.purchases,0))::bigint purchases,
        SUM(COALESCE(fp.views,0))::bigint views
      FROM public.framer_component_performance fp
      WHERE fp.component_id=i.id
    ) perf ON true
    WHERE i.source_id=p_source_id
      AND i.component_url IS NOT NULL
      AND i.status NOT IN ('archived','blocked')
      AND COALESCE(i.qa_score,0) >= v_source_threshold
      AND COALESCE(i.qa_score,0) < 98
      AND public.framer_component_public_brand_clean(i.id)
      AND NOT EXISTS (
        SELECT 1 FROM public.framer_component_repair_backlog rb
        WHERE rb.component_id=i.id
          AND rb.status IN ('queued','repairing','ready_to_retry','deferred')
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.framer_component_quality_cycles c
        WHERE c.component_id=i.id
          AND c.state IN ('queued','building','qa')
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.framer_component_quality_cycles c
        WHERE c.component_id=i.id
          AND c.cycle_type='enhancement'
          AND c.created_at > now()-interval '14 days'
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.framer_top_tier_component_allowlist a
        WHERE a.component_id=i.id AND a.release_state='disabled'
      )
    ORDER BY
      COALESCE(perf.gross_revenue_cents,0) DESC,
      COALESCE(perf.purchases,0) DESC,
      COALESCE(i.commercial_score,0) DESC,
      COALESCE(i.marketplace_score,0) DESC,
      COALESCE(i.qa_score,0) ASC,
      COALESCE(i.visual_score,0) ASC,
      i.updated_at ASC
    LIMIT least(v_slots,greatest(0,least(coalesce(p_enhancement_limit,2),4)))
  LOOP
    v_baseline := public.framer_component_quality_snapshot(r.id);
    v_targets := jsonb_build_object(
      'qa_score', least(98,greatest(94,COALESCE((v_baseline->>'qa_score')::numeric,0)+2)),
      'visual_score', least(98,greatest(94,COALESCE((v_baseline->>'visual_score')::numeric,0)+2)),
      'responsive_score', least(99,greatest(96,COALESCE((v_baseline->>'responsive_score')::numeric,0))),
      'configurability_score', least(99,greatest(96,COALESCE((v_baseline->>'configurability_score')::numeric,0))),
      'commercial_score', least(99,COALESCE((v_baseline->>'commercial_score')::numeric,0)+1),
      'quality_composite_min_delta', 1.5
    );

    INSERT INTO public.framer_component_quality_cycles(
      source_id,component_id,cycle_type,state,priority,baseline_scores,target_scores,started_at
    ) VALUES (
      p_source_id,r.id,'enhancement','queued',
      110 + least(100,(COALESCE(r.perf_purchases,0)*10)::integer) + least(50,(COALESCE(r.perf_views,0)/100)::integer),
      v_baseline,v_targets,now()
    ) RETURNING id INTO v_cycle_id;

    INSERT INTO public.framer_product_variant_queue(
      source_id,product_type,source_component_id,signal_type,market_problem,variant_brief,priority,status
    ) VALUES (
      p_source_id,'component',r.id,'quality_enhancement',
      'Raise an already-good component into a stronger premium commercial version while preserving its proven utility and restraint.',
      jsonb_build_object(
        'quality_cycle_id',v_cycle_id,
        'baseline',v_baseline,
        'targets',v_targets,
        'strategy','quality_ratchet_v1',
        'rules',jsonb_build_array(
          'preserve the core use case and useful interaction model',
          'increase intentionality rather than element count',
          'reduce generic language and generic composition',
          'strengthen hierarchy, spacing, responsive behavior and configurability',
          'maintain customer-site style adaptability',
          'prefer richer evidence and brand-specific composition when applicable',
          'do not add decorative complexity that lowers commercial restraint',
          'do not replace the baseline unless the candidate measurably beats it',
          'do not copy marketplace implementations or visual compositions'
        )
      ),130,'queued'
    ) RETURNING id INTO v_variant_id;

    UPDATE public.framer_component_quality_cycles
      SET variant_queue_id=v_variant_id,updated_at=now()
    WHERE id=v_cycle_id;

    v_enhancement_count := v_enhancement_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'ok',true,
    'source_id',p_source_id,
    'repair_cycles_seeded',v_repair_count,
    'enhancement_cycles_seeded',v_enhancement_count,
    'active_capacity_limit',8
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.seed_framer_component_quality_cycles(uuid,integer,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.seed_framer_component_quality_cycles(uuid,integer,integer) FROM anon;
REVOKE ALL ON FUNCTION public.seed_framer_component_quality_cycles(uuid,integer,integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.seed_framer_component_quality_cycles(uuid,integer,integer) TO service_role;

CREATE OR REPLACE FUNCTION public.evaluate_framer_component_quality_cycles(p_limit integer DEFAULT 20)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  r record;
  v_result jsonb;
  v_candidate_composite numeric;
  v_baseline_composite numeric;
  v_delta numeric;
  v_min_delta numeric;
  v_pass boolean;
  v_reason text;
  v_accepted integer := 0;
  v_rejected integer := 0;
BEGIN
  -- Keep orchestration state aligned with the external variant builder.
  UPDATE public.framer_component_quality_cycles c
  SET state = CASE
      WHEN q.status='building' THEN 'building'
      WHEN q.status='qa' THEN 'qa'
      ELSE c.state
    END,
    started_at=COALESCE(c.started_at,now()),
    updated_at=now()
  FROM public.framer_product_variant_queue q
  WHERE q.id=c.variant_queue_id
    AND c.state IN ('queued','building','qa')
    AND q.status IN ('building','qa');

  FOR r IN
    SELECT
      c.*,
      q.status AS queue_status,
      q.created_component_id,
      candidate.qa_score AS candidate_qa,
      candidate.visual_score AS candidate_visual,
      candidate.usefulness_score AS candidate_usefulness,
      candidate.configurability_score AS candidate_configurability,
      candidate.responsive_score AS candidate_responsive,
      candidate.commercial_score AS candidate_commercial,
      candidate.marketplace_score AS candidate_marketplace,
      candidate.version_rank AS candidate_version_rank
    FROM public.framer_component_quality_cycles c
    JOIN public.framer_product_variant_queue q ON q.id=c.variant_queue_id
    JOIN public.framer_component_inventory candidate ON candidate.id=q.created_component_id
    WHERE c.state IN ('queued','building','qa')
      AND q.created_component_id IS NOT NULL
      AND q.status IN ('qa','ready')
      AND candidate.qa_score IS NOT NULL
      AND candidate.visual_score IS NOT NULL
      AND candidate.usefulness_score IS NOT NULL
      AND candidate.configurability_score IS NOT NULL
      AND candidate.responsive_score IS NOT NULL
      AND candidate.commercial_score IS NOT NULL
    ORDER BY c.priority DESC,c.created_at ASC
    LIMIT greatest(1,least(coalesce(p_limit,20),50))
  LOOP
    v_result := public.framer_component_quality_snapshot(r.created_component_id);
    v_candidate_composite := COALESCE((v_result->>'quality_composite')::numeric,0);
    v_baseline_composite := COALESCE((r.baseline_scores->>'quality_composite')::numeric,0);
    v_delta := v_candidate_composite-v_baseline_composite;
    v_min_delta := COALESCE((r.target_scores->>'quality_composite_min_delta')::numeric,1.5);

    v_pass :=
      public.framer_component_public_brand_clean(r.created_component_id)
      AND COALESCE(r.candidate_qa,0) >= COALESCE((r.target_scores->>'qa_score')::numeric,0)
      AND COALESCE(r.candidate_visual,0) >= COALESCE((r.target_scores->>'visual_score')::numeric,0)
      AND COALESCE(r.candidate_responsive,0) >= COALESCE((r.baseline_scores->>'responsive_score')::numeric,0)
      AND COALESCE(r.candidate_configurability,0) >= COALESCE((r.baseline_scores->>'configurability_score')::numeric,0)
      AND COALESCE(r.candidate_usefulness,0) >= COALESCE((r.baseline_scores->>'usefulness_score')::numeric,0)-1
      AND COALESCE(r.candidate_commercial,0) >= COALESCE((r.baseline_scores->>'commercial_score')::numeric,0)-1
      AND v_delta >= v_min_delta;

    IF v_pass THEN
      v_reason := format('candidate_accepted: composite %.2f -> %.2f (+%.2f)',v_baseline_composite,v_candidate_composite,v_delta);

      UPDATE public.framer_component_quality_cycles
      SET state='accepted',result_scores=v_result,decision_reason=v_reason,
          evaluated_at=now(),completed_at=now(),updated_at=now()
      WHERE id=r.id;

      UPDATE public.framer_product_variant_queue
      SET status='ready',
          variant_brief=COALESCE(variant_brief,'{}'::jsonb)||jsonb_build_object(
            'quality_ratchet_decision','accepted',
            'quality_ratchet_reason',v_reason,
            'quality_ratchet_result',v_result
          ),
          updated_at=now()
      WHERE id=r.variant_queue_id;

      UPDATE public.framer_component_inventory candidate
      SET version_rank=greatest(COALESCE(candidate.version_rank,0),COALESCE(source.version_rank,0)+1),
          metadata=COALESCE(candidate.metadata,'{}'::jsonb)||jsonb_build_object(
            'quality_ratchet',jsonb_build_object(
              'cycle_id',r.id,
              'source_component_id',r.component_id,
              'cycle_type',r.cycle_type,
              'accepted_at',now(),
              'baseline',r.baseline_scores,
              'result',v_result
            )
          ),
          updated_at=now()
      FROM public.framer_component_inventory source
      WHERE candidate.id=r.created_component_id
        AND source.id=r.component_id;

      IF r.repair_id IS NOT NULL THEN
        UPDATE public.framer_component_repair_backlog
        SET status='resolved',resolved_at=now(),last_error=NULL,updated_at=now()
        WHERE id=r.repair_id;
      END IF;

      v_accepted := v_accepted+1;
    ELSE
      v_reason := format('candidate_rejected: composite %.2f -> %.2f (%+.2f); baseline preserved',v_baseline_composite,v_candidate_composite,v_delta);

      UPDATE public.framer_component_quality_cycles
      SET state='rejected',result_scores=v_result,decision_reason=v_reason,
          evaluated_at=now(),completed_at=now(),updated_at=now()
      WHERE id=r.id;

      UPDATE public.framer_product_variant_queue
      SET status='rejected',
          variant_brief=COALESCE(variant_brief,'{}'::jsonb)||jsonb_build_object(
            'quality_ratchet_decision','rejected',
            'quality_ratchet_reason',v_reason,
            'quality_ratchet_result',v_result
          ),
          updated_at=now()
      WHERE id=r.variant_queue_id;

      UPDATE public.framer_component_inventory
      SET metadata=COALESCE(metadata,'{}'::jsonb)||jsonb_build_object(
            'quality_ratchet_rejected',jsonb_build_object(
              'cycle_id',r.id,
              'source_component_id',r.component_id,
              'rejected_at',now(),
              'reason',v_reason
            )
          ),
          updated_at=now()
      WHERE id=r.created_component_id;

      IF r.repair_id IS NOT NULL THEN
        UPDATE public.framer_component_repair_backlog
        SET status=CASE WHEN attempt_count>=max_attempts THEN 'abandoned' ELSE 'queued' END,
            next_attempt_at=CASE WHEN attempt_count>=max_attempts THEN next_attempt_at ELSE now()+interval '12 hours' END,
            last_error=v_reason,
            updated_at=now()
        WHERE id=r.repair_id;
      END IF;

      v_rejected := v_rejected+1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('ok',true,'accepted',v_accepted,'rejected',v_rejected);
END;
$function$;

REVOKE ALL ON FUNCTION public.evaluate_framer_component_quality_cycles(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.evaluate_framer_component_quality_cycles(integer) FROM anon;
REVOKE ALL ON FUNCTION public.evaluate_framer_component_quality_cycles(integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.evaluate_framer_component_quality_cycles(integer) TO service_role;

DO $do$
DECLARE
  v_job_id bigint;
BEGIN
  FOR v_job_id IN
    SELECT jobid FROM cron.job WHERE jobname='framer-component-quality-ratchet-seed'
  LOOP
    PERFORM cron.unschedule(v_job_id);
  END LOOP;

  FOR v_job_id IN
    SELECT jobid FROM cron.job WHERE jobname='framer-component-quality-ratchet-evaluate'
  LOOP
    PERFORM cron.unschedule(v_job_id);
  END LOOP;

  PERFORM cron.schedule(
    'framer-component-quality-ratchet-seed',
    '17 4,16 * * *',
    'select public.seed_framer_component_quality_cycles(id,3,2) from public.framer_component_sources where active=true;'
  );

  PERFORM cron.schedule(
    'framer-component-quality-ratchet-evaluate',
    '37 * * * *',
    'select public.evaluate_framer_component_quality_cycles(20);'
  );
END
$do$;
