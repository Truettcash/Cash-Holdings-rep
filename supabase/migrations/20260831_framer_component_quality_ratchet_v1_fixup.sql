-- Framer component quality ratchet v1 promotion-gate hardening.
-- Supersedes the initial evaluator from the base migration with a stricter no-regression contract.

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
      AND COALESCE(r.candidate_qa,0) >= COALESCE((r.baseline_scores->>'qa_score')::numeric,0)
      AND COALESCE(r.candidate_visual,0) >= COALESCE((r.target_scores->>'visual_score')::numeric,0)
      AND COALESCE(r.candidate_visual,0) >= COALESCE((r.baseline_scores->>'visual_score')::numeric,0)
      AND COALESCE(r.candidate_responsive,0) >= COALESCE((r.target_scores->>'responsive_score')::numeric,0)
      AND COALESCE(r.candidate_responsive,0) >= COALESCE((r.baseline_scores->>'responsive_score')::numeric,0)
      AND COALESCE(r.candidate_configurability,0) >= COALESCE((r.target_scores->>'configurability_score')::numeric,0)
      AND COALESCE(r.candidate_configurability,0) >= COALESCE((r.baseline_scores->>'configurability_score')::numeric,0)
      AND COALESCE(r.candidate_usefulness,0) >= COALESCE((r.baseline_scores->>'usefulness_score')::numeric,0)
      AND COALESCE(r.candidate_commercial,0) >= COALESCE((r.baseline_scores->>'commercial_score')::numeric,0)
      AND COALESCE((v_result->>'marketplace_score')::numeric,0) >= COALESCE((r.baseline_scores->>'marketplace_score')::numeric,0)
      AND (
        r.cycle_type <> 'enhancement'
        OR COALESCE(r.candidate_commercial,0) >= COALESCE((r.target_scores->>'commercial_score')::numeric,0)
      )
      AND v_delta >= v_min_delta;

    IF v_pass THEN
      v_reason := 'candidate_accepted: composite '
        || round(v_baseline_composite,2)::text || ' -> '
        || round(v_candidate_composite,2)::text || ' (+'
        || round(v_delta,2)::text || ')';

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
      v_reason := 'candidate_rejected: composite '
        || round(v_baseline_composite,2)::text || ' -> '
        || round(v_candidate_composite,2)::text || ' ('
        || CASE WHEN v_delta>=0 THEN '+' ELSE '' END
        || round(v_delta,2)::text || '); baseline preserved';

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
