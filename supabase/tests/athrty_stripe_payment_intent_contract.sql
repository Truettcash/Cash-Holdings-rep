-- ATHRTY Stripe PaymentIntent regression contract.
-- Intended for non-production validation after applying the source function.

DO $$
DECLARE
  v_def text;
  v_cast_count integer;
BEGIN
  SELECT pg_get_functiondef('public.process_stripe_event(jsonb)'::regprocedure) INTO v_def;

  SELECT count(*) INTO v_cast_count
  FROM pg_cast
  WHERE castsource='int8'::regtype
    AND casttarget='timestamptz'::regtype;

  IF v_cast_count <> 0 THEN
    RAISE EXCEPTION 'unexpected bigint-to-timestamptz cast appeared; review PaymentIntent contract';
  END IF;

  IF v_def ~* 'v_succeeded_at|v_failed_at' THEN
    RAISE EXCEPTION 'unused PaymentIntent timestamp variables remain in reconciliation function';
  END IF;

  IF v_def ~* '\{data,object,created\}[^;]*::bigint[^;]*timestamptz' THEN
    RAISE EXCEPTION 'Stripe epoch timestamp is still being assigned through an invalid bigint/timestamptz path';
  END IF;

  IF v_def !~* 'payment_intent\.succeeded' OR v_def !~* 'payment_intent\.payment_failed' THEN
    RAISE EXCEPTION 'PaymentIntent event handling contract missing';
  END IF;
END
$$;
