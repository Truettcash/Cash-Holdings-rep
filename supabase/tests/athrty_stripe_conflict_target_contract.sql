-- ATHRTY Stripe conflict-target regression contract.
-- Intended for a non-production validation database after applying the source function.
-- Learning contract: conflict syntax must match the actual PostgreSQL catalog object type.

DO $$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_functiondef('public.process_stripe_event(jsonb)'::regprocedure) INTO v_def;

  IF v_def LIKE '%ON CONFLICT ON CONSTRAINT payments_stripe_checkout_session_uidx%' THEN
    RAISE EXCEPTION 'invalid checkout-session conflict target: partial unique index referenced as constraint';
  END IF;

  IF v_def LIKE '%ON CONFLICT ON CONSTRAINT payments_stripe_payment_intent_uidx%' THEN
    RAISE EXCEPTION 'invalid payment-intent conflict target: partial unique index referenced as constraint';
  END IF;

  IF v_def !~* 'ON[[:space:]]+CONFLICT[[:space:]]*\(stripe_checkout_session_id\)[[:space:]]+WHERE[[:space:]]+stripe_checkout_session_id[[:space:]]+IS[[:space:]]+NOT[[:space:]]+NULL' THEN
    RAISE EXCEPTION 'checkout-session partial-index inference contract missing';
  END IF;

  IF v_def !~* 'ON[[:space:]]+CONFLICT[[:space:]]*\(stripe_payment_intent_id\)[[:space:]]+WHERE[[:space:]]+stripe_payment_intent_id[[:space:]]+IS[[:space:]]+NOT[[:space:]]+NULL' THEN
    RAISE EXCEPTION 'payment-intent partial-index inference contract missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname='public'
      AND tablename='payments'
      AND indexname='payments_stripe_checkout_session_uidx'
      AND indexdef ILIKE 'CREATE UNIQUE INDEX%stripe_checkout_session_id%WHERE%IS NOT NULL%'
  ) THEN
    RAISE EXCEPTION 'checkout-session partial unique index missing or changed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname='public'
      AND tablename='payments'
      AND indexname='payments_stripe_payment_intent_uidx'
      AND indexdef ILIKE 'CREATE UNIQUE INDEX%stripe_payment_intent_id%WHERE%IS NOT NULL%'
  ) THEN
    RAISE EXCEPTION 'payment-intent partial unique index missing or changed';
  END IF;
END
$$;
