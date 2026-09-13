-- Contract checks for Framer component quality ratchet v1.
-- Read-only assertions intended for post-migration verification.

DO $test$
BEGIN
  IF to_regclass('public.framer_component_quality_cycles') IS NULL THEN
    RAISE EXCEPTION 'missing framer_component_quality_cycles';
  END IF;

  IF to_regprocedure('public.framer_component_quality_snapshot(uuid)') IS NULL THEN
    RAISE EXCEPTION 'missing framer_component_quality_snapshot';
  END IF;

  IF to_regprocedure('public.seed_framer_component_quality_cycles(uuid,integer,integer)') IS NULL THEN
    RAISE EXCEPTION 'missing seed_framer_component_quality_cycles';
  END IF;

  IF to_regprocedure('public.evaluate_framer_component_quality_cycles(integer)') IS NULL THEN
    RAISE EXCEPTION 'missing evaluate_framer_component_quality_cycles';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public'
      AND tablename='framer_component_quality_cycles'
      AND indexname='framer_component_quality_cycles_one_active_per_component'
  ) THEN
    RAISE EXCEPTION 'missing one-active-cycle index';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM cron.job
    WHERE jobname='framer-component-quality-ratchet-seed'
      AND active=true
      AND schedule='17 4,16 * * *'
  ) THEN
    RAISE EXCEPTION 'quality ratchet seed cron missing or wrong';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM cron.job
    WHERE jobname='framer-component-quality-ratchet-evaluate'
      AND active=true
      AND schedule='37 * * * *'
  ) THEN
    RAISE EXCEPTION 'quality ratchet evaluator cron missing or wrong';
  END IF;
END
$test$;

-- Promotion contract must contain the no-regression baseline comparisons.
DO $test$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public'
    AND p.proname='evaluate_framer_component_quality_cycles'
    AND pg_get_function_arguments(p.oid)='p_limit integer DEFAULT 20';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'unable to inspect evaluator';
  END IF;

  IF position('candidate_visual' in v_def)=0
     OR position('baseline_scores' in v_def)=0
     OR position('quality_composite_min_delta' in v_def)=0
     OR position('baseline preserved' in v_def)=0 THEN
    RAISE EXCEPTION 'evaluator is missing quality-ratchet guards';
  END IF;
END
$test$;

-- Operational visibility: expected to show the current eligible pool and no duplicate active cycles.
SELECT
  count(*) FILTER (WHERE COALESCE(i.qa_score,0) >= COALESCE(s.qa_threshold,87) AND COALESCE(i.qa_score,0) < 98) AS enhancement_eligible,
  count(*) FILTER (WHERE COALESCE(i.qa_score,0) < COALESCE(s.qa_threshold,87)) AS below_source_gate
FROM public.framer_component_inventory i
JOIN public.framer_component_sources s ON s.id=i.source_id
WHERE s.active=true
  AND i.component_url IS NOT NULL
  AND i.status NOT IN ('archived','blocked');

SELECT component_id,count(*)
FROM public.framer_component_quality_cycles
WHERE state IN ('queued','building','qa')
GROUP BY component_id
HAVING count(*)>1;
