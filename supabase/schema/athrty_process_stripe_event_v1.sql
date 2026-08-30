-- Production Stripe event ledger / reconciliation RPC snapshot.
-- Hardened source contract. No production SQL was applied by this commit.

CREATE OR REPLACE FUNCTION public.process_stripe_event(event jsonb)
RETURNS TABLE(received boolean, duplicate boolean, processing_status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_event_id text;
  v_type text;
  v_object_id text;
  v_api_version text;
  v_livemode boolean;
  v_inserted boolean := false;
  v_order_id uuid;
  v_brand_key text;
  v_org_id uuid;
  v_contact_id uuid;
  v_engagement_id uuid;
  v_buyer_inquiry_id uuid;
  v_stripe_customer_id text;
  v_checkout_session_id text;
  v_payment_intent_id text;
  v_charge_id text;
  v_status text;
  v_amount bigint;
  v_currency text;
  v_payment_method_type text;
  v_failure_code text;
  v_failure_message text;
  v_processing_exception_message text;
BEGIN
  v_event_id := event ->> 'id';
  v_type := event ->> 'type';
  IF v_event_id IS NULL OR v_type IS NULL THEN
    received := false; duplicate := false; processing_status := 'failed'; RETURN NEXT; RETURN;
  END IF;
  v_object_id := event #>> '{data,object,id}';
  v_api_version := event ->> 'api_version';
  v_livemode := (event ->> 'livemode')::boolean;

  BEGIN
    INSERT INTO public.stripe_events(stripe_event_id,event_type,stripe_object_id,api_version,livemode,payload,processing_status,processing_attempts)
    VALUES(v_event_id,v_type,v_object_id,v_api_version,v_livemode,event,'received',0);
    v_inserted := true;
  EXCEPTION WHEN unique_violation THEN
    received := true; duplicate := true; processing_status := 'processed'; RETURN NEXT; RETURN;
  END;

  v_order_id := NULL;
  IF (event #>> '{data,object,metadata,order_id}') IS NOT NULL THEN v_order_id := (event #>> '{data,object,metadata,order_id}')::uuid; END IF;
  v_brand_key := event #>> '{data,object,metadata,brand_key}';
  v_org_id := NULLIF(event #>> '{data,object,metadata,organization_id}','')::uuid;
  v_contact_id := NULLIF(event #>> '{data,object,metadata,contact_id}','')::uuid;
  v_engagement_id := NULLIF(event #>> '{data,object,metadata,engagement_id}','')::uuid;
  v_buyer_inquiry_id := NULLIF(event #>> '{data,object,metadata,buyer_inquiry_id}','')::uuid;
  v_stripe_customer_id := event #>> '{data,object,customer}';
  v_checkout_session_id := event #>> '{data,object,id}';
  v_payment_intent_id := event #>> '{data,object,payment_intent}';
  v_charge_id := event #>> '{data,object,id}';

  IF v_inserted THEN
    UPDATE public.stripe_events SET processing_status='processing',processing_attempts=processing_attempts+1,processed_at=NULL,error_message=NULL WHERE stripe_event_id=v_event_id;
  END IF;

  IF v_type NOT IN ('checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.async_payment_failed','checkout.session.expired','payment_intent.succeeded','payment_intent.payment_failed','charge.refunded','charge.dispute.created') THEN
    UPDATE public.stripe_events SET processing_status='ignored',processed_at=now(),error_message=NULL WHERE stripe_event_id=v_event_id;
    received:=true; duplicate:=false; processing_status:='ignored'; RETURN NEXT; RETURN;
  END IF;

  IF v_order_id IS NULL THEN
    UPDATE public.stripe_events SET processing_status='ignored',processed_at=now(),error_message='NO_DETERMINISTIC_ORDER_ASSOCIATION' WHERE stripe_event_id=v_event_id;
    received:=true; duplicate:=false; processing_status:='ignored'; RETURN NEXT; RETURN;
  END IF;

  BEGIN
    v_payment_method_type:=NULL;v_failure_code:=NULL;v_failure_message:=NULL;v_amount:=NULL;v_currency:=NULL;
    IF v_type IN ('checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.async_payment_failed','checkout.session.expired') THEN
      v_amount := (event #>> '{data,object,amount_total}')::bigint;
      v_currency := COALESCE(event #>> '{data,object,currency}','usd');
      v_checkout_session_id := event #>> '{data,object,id}';

      IF v_type='checkout.session.completed' THEN
        v_status:=event #>> '{data,object,payment_status}';
        IF v_status='paid' THEN UPDATE public.commerce_orders SET status='paid',paid_at=COALESCE(paid_at,now()) WHERE id=v_order_id;
        ELSE UPDATE public.commerce_orders SET status='payment_pending' WHERE id=v_order_id; END IF;
      ELSIF v_type='checkout.session.async_payment_succeeded' THEN
        UPDATE public.commerce_orders SET status='paid',paid_at=COALESCE(paid_at,now()) WHERE id=v_order_id;
      ELSIF v_type='checkout.session.async_payment_failed' THEN
        UPDATE public.commerce_orders SET status='payment_pending' WHERE id=v_order_id;
      ELSIF v_type='checkout.session.expired' THEN
        UPDATE public.commerce_orders SET status='cancelled' WHERE id=v_order_id AND status NOT IN ('paid','fulfilled','refunded','partially_refunded','disputed');
      END IF;

      INSERT INTO public.payments(order_id,organization_id,contact_id,provider,provider_customer_id,provider_payment_id,stripe_checkout_session_id,stripe_payment_intent_id,amount,currency,status,payment_method_type,metadata)
      SELECT v_order_id,
        COALESCE(v_org_id,(SELECT organization_id FROM public.commerce_orders co WHERE co.id=v_order_id)),
        COALESCE(v_contact_id,(SELECT contact_id FROM public.commerce_orders co WHERE co.id=v_order_id)),
        'stripe',v_stripe_customer_id,NULL,v_checkout_session_id,event #>> '{data,object,payment_intent}',
        COALESCE((event #>> '{data,object,amount_total}')::bigint,0),v_currency,
        CASE WHEN v_type='checkout.session.async_payment_failed' THEN 'failed' WHEN v_type IN ('checkout.session.completed','checkout.session.async_payment_succeeded') THEN 'succeeded' ELSE 'pending' END,
        NULL,event
      ON CONFLICT (stripe_checkout_session_id) WHERE stripe_checkout_session_id IS NOT NULL
      DO UPDATE SET order_id=EXCLUDED.order_id,organization_id=EXCLUDED.organization_id,contact_id=EXCLUDED.contact_id,provider_customer_id=EXCLUDED.provider_customer_id,stripe_payment_intent_id=EXCLUDED.stripe_payment_intent_id,amount=EXCLUDED.amount,currency=EXCLUDED.currency,status=EXCLUDED.status,updated_at=now(),metadata=EXCLUDED.metadata;

    ELSIF v_type IN ('payment_intent.succeeded','payment_intent.payment_failed') THEN
      v_payment_intent_id:=event #>> '{data,object,id}';
      v_amount:=(event #>> '{data,object,amount}')::bigint;
      v_currency:=COALESCE(event #>> '{data,object,currency}','usd');
      v_payment_method_type:=event #>> '{data,object,payment_method_types,0}';
      v_failure_code:=event #>> '{data,object,last_payment_error,code}';
      v_failure_message:=event #>> '{data,object,last_payment_error,message}';

      INSERT INTO public.payments(order_id,organization_id,contact_id,provider,provider_customer_id,provider_payment_id,stripe_payment_intent_id,amount,currency,status,payment_method_type,refunded_amount,failure_code,failure_message,succeeded_at,failed_at,metadata)
      SELECT v_order_id,
        COALESCE(v_org_id,(SELECT organization_id FROM public.commerce_orders co WHERE co.id=v_order_id)),
        COALESCE(v_contact_id,(SELECT contact_id FROM public.commerce_orders co WHERE co.id=v_order_id)),
        'stripe',v_stripe_customer_id,NULL,v_payment_intent_id,COALESCE(v_amount,0),v_currency,
        CASE WHEN v_type='payment_intent.succeeded' THEN 'succeeded' ELSE 'failed' END,
        v_payment_method_type,0,v_failure_code,v_failure_message,
        CASE WHEN v_type='payment_intent.succeeded' THEN now() ELSE NULL END,
        CASE WHEN v_type='payment_intent.payment_failed' THEN now() ELSE NULL END,event
      ON CONFLICT (stripe_payment_intent_id) WHERE stripe_payment_intent_id IS NOT NULL
      DO UPDATE SET status=EXCLUDED.status,payment_method_type=EXCLUDED.payment_method_type,failure_code=EXCLUDED.failure_code,failure_message=EXCLUDED.failure_message,succeeded_at=EXCLUDED.succeeded_at,failed_at=EXCLUDED.failed_at,amount=EXCLUDED.amount,currency=EXCLUDED.currency,order_id=EXCLUDED.order_id,updated_at=now(),metadata=EXCLUDED.metadata;
      IF v_type='payment_intent.succeeded' THEN UPDATE public.commerce_orders SET status='paid',paid_at=COALESCE(paid_at,now()) WHERE id=v_order_id; END IF;

    ELSIF v_type IN ('charge.refunded','charge.dispute.created') THEN
      v_payment_intent_id := NULLIF(event #>> '{data,object,payment_intent}','');

      IF v_type='charge.refunded' THEN
        v_amount:=COALESCE((event #>> '{data,object,amount_refunded}')::bigint,0);

        UPDATE public.payments
        SET stripe_charge_id=COALESCE(stripe_charge_id,v_charge_id),
            refunded_amount=GREATEST(COALESCE(refunded_amount,0),v_amount),
            status=CASE WHEN v_amount>=amount THEN 'refunded' ELSE 'partially_refunded' END,
            metadata=jsonb_set(metadata,'{refunded_event_id}',to_jsonb(v_event_id),true),
            updated_at=now()
        WHERE order_id=v_order_id
          AND (v_payment_intent_id IS NULL OR stripe_payment_intent_id=v_payment_intent_id);

        UPDATE public.commerce_orders co
        SET status=CASE
          WHEN p.total_amount>0 AND p.total_refunded>=p.total_amount THEN 'refunded'
          WHEN p.total_refunded>0 THEN 'partially_refunded'
          ELSE co.status
        END
        FROM (
          SELECT order_id,
                 COALESCE(sum(amount),0) AS total_amount,
                 COALESCE(sum(refunded_amount),0) AS total_refunded
          FROM public.payments
          WHERE order_id=v_order_id
          GROUP BY order_id
        ) p
        WHERE co.id=v_order_id AND p.order_id=co.id;
      ELSE
        UPDATE public.payments
        SET stripe_charge_id=COALESCE(stripe_charge_id,v_charge_id),
            status='disputed',
            metadata=jsonb_set(metadata,'{dispute_event_id}',to_jsonb(v_event_id),true),
            updated_at=now()
        WHERE order_id=v_order_id
          AND (v_payment_intent_id IS NULL OR stripe_payment_intent_id=v_payment_intent_id);

        UPDATE public.commerce_orders SET status='disputed' WHERE id=v_order_id;
      END IF;
    END IF;

    UPDATE public.stripe_events SET processing_status='processed',processed_at=now(),error_message=NULL WHERE stripe_event_id=v_event_id;
    received:=true;duplicate:=false;processing_status:='processed';RETURN NEXT;RETURN;
  EXCEPTION WHEN OTHERS THEN
    v_processing_exception_message:=SQLERRM;
    UPDATE public.stripe_events SET processing_status='failed',processing_attempts=processing_attempts+1,error_message='Internal processing error',processed_at=now() WHERE stripe_event_id=v_event_id;
    received:=true;duplicate:=false;processing_status:='failed';RETURN NEXT;RETURN;
  END;
END;
$function$;
