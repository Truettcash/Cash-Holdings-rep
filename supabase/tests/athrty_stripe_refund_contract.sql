-- ATHRTY Stripe refund/dispute regression contract.
-- Intended for non-production validation after applying the source function.

DO $$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_functiondef('public.process_stripe_event(jsonb)'::regprocedure) INTO v_def;

  IF v_def ~* 'refunded_amount[[:space:]]*=[[:space:]]*COALESCE\(refunded_amount,0\)[[:space:]]*\+' THEN
    RAISE EXCEPTION 'refund logic is incrementing Stripe cumulative amount_refunded and can double-count';
  END IF;

  IF v_def !~* 'refunded_amount[[:space:]]*=[[:space:]]*GREATEST\(COALESCE\(refunded_amount,0\),v_amount\)' THEN
    RAISE EXCEPTION 'cumulative-safe refunded_amount reconciliation missing';
  END IF;

  IF v_def ~* 'THEN[[:space:]]+status[[:space:]]+ELSE[[:space:]]+status[[:space:]]+END' THEN
    RAISE EXCEPTION 'commerce order refund status still contains the no-op CASE expression';
  END IF;

  IF v_def !~* 'total_refunded[[:space:]]*>=[[:space:]]*p\.total_amount[[:space:]]+THEN[[:space:]]+''refunded''' THEN
    RAISE EXCEPTION 'full-refund order-state derivation missing';
  END IF;

  IF v_def !~* 'total_refunded[[:space:]]*>[[:space:]]*0[[:space:]]+THEN[[:space:]]+''partially_refunded''' THEN
    RAISE EXCEPTION 'partial-refund order-state derivation missing';
  END IF;

  IF v_def !~* 'stripe_payment_intent_id[[:space:]]*=[[:space:]]*v_payment_intent_id' THEN
    RAISE EXCEPTION 'charge reconciliation is not scoped to the matching PaymentIntent when available';
  END IF;

  IF v_def !~* 'stripe_charge_id[[:space:]]*=[[:space:]]*COALESCE\(stripe_charge_id,v_charge_id\)' THEN
    RAISE EXCEPTION 'charge identity is not persisted on refund/dispute reconciliation';
  END IF;
END
$$;
