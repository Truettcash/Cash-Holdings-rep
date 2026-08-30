-- ATHRTY production scheduler topology snapshot.
-- Recovery-only. Live tokens and owner/brand identifiers are not committed.
-- Do not apply this file directly; substitute deployment-specific identifiers and secret references through reviewed configuration.

-- Observed active production cadence:
-- learning reconciliation: daily at 13:15 UTC
-- outbound seed runner: every 15 minutes at minute 1/16/31/46
-- outbound send worker: every 15 minutes at minute 3/18/33/48
-- preview factory: every 10 minutes at minute 5/15/25/35/45/55
-- reply ingestion: every 5 minutes at minute 2/7/12/17/22/27/32/37/42/47/52/57
-- commercial cohort capture: hourly at minute 9

-- Representative scheduler contracts (intentionally not calling cron.schedule here):
-- SELECT private.dispatch_athrty_learning('daily_reconciliation', NULL);
-- SELECT private.dispatch_athrty_outbound_seed_runner(5);
-- SELECT private.dispatch_athrty_outbound_send_worker(2);
-- SELECT private.dispatch_athrty_preview_factory();
-- SELECT private.dispatch_athrty_reply_ingestion();
-- SELECT private.capture_athrty_commercial_cohort(24);

CREATE OR REPLACE FUNCTION private.dispatch_athrty_learning(
  p_trigger_type text DEFAULT 'manual_reconciliation'::text,
  p_trigger_ref text DEFAULT NULL::text
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare
  v_token text;
  v_request_id bigint;
begin
  select value into v_token from private.runtime_config where key='athrty_learning_trigger_token';
  if v_token is null then raise exception 'ATHRTY runtime token missing'; end if;
  select net.http_post(
    url := current_setting('app.athrty_learning_trigger_url', true),
    body := jsonb_build_object(
      'owner_user_id', '__RECOVERY_OWNER_UUID__',
      'brand_id', '__RECOVERY_BRAND_UUID__',
      'window_days', 90,
      'trigger_type', coalesce(nullif(trim(p_trigger_type),''),'manual_reconciliation'),
      'trigger_ref', p_trigger_ref
    ),
    params := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type','application/json','x-athrty-runtime-token',v_token),
    timeout_milliseconds := 30000
  ) into v_request_id;
  return v_request_id;
end;
$function$;

CREATE OR REPLACE FUNCTION private.dispatch_athrty_outbound_seed_runner(p_limit integer DEFAULT 2)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare v_token text; v_request_id bigint;
begin
  select value into v_token from private.runtime_config where key='athrty_learning_trigger_token';
  if v_token is null then raise exception 'ATHRTY runtime token missing'; end if;
  select net.http_post(
    url := current_setting('app.athrty_outbound_seed_runner_url', true),
    body := jsonb_build_object('owner_user_id','__RECOVERY_OWNER_UUID__','limit',greatest(1,least(coalesce(p_limit,2),5))),
    params := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type','application/json','x-athrty-runtime-token',v_token),
    timeout_milliseconds := 120000
  ) into v_request_id;
  return v_request_id;
end;
$function$;

CREATE OR REPLACE FUNCTION private.dispatch_athrty_outbound_send_worker(p_limit integer DEFAULT 2)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare v_token text; v_request_id bigint;
begin
  select value into v_token from private.runtime_config where key='athrty_learning_trigger_token';
  if v_token is null then raise exception 'ATHRTY runtime token missing'; end if;
  select net.http_post(
    url := current_setting('app.athrty_outbound_launch_url', true),
    body := jsonb_build_object('owner_user_id','__RECOVERY_OWNER_UUID__','limit',greatest(1,least(coalesce(p_limit,2),3))),
    params := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type','application/json','x-athrty-runtime-token',v_token),
    timeout_milliseconds := 120000
  ) into v_request_id;
  return v_request_id;
end;
$function$;

CREATE OR REPLACE FUNCTION private.dispatch_athrty_preview_factory()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare
  v_token text;
  v_request_id bigint;
  v_owner uuid;
  v_prospect uuid;
begin
  select value into v_token from private.runtime_config where key='athrty_learning_trigger_token';
  if v_token is null then raise exception 'ATHRTY runtime token missing'; end if;
  select aq.owner_user_id, aq.prospect_profile_id into v_owner, v_prospect
  from public.prospect_acquisition_queue aq
  where aq.website is not null
    and aq.prospect_tier in ('A','B')
    and aq.outreach_eligibility='review_ready'
    and aq.data_sufficiency_score>=75
    and aq.evidence_quality_score>=70
    and not exists (
      select 1 from public.prospect_preview_sites ps
      where ps.prospect_profile_id=aq.prospect_profile_id
        and (ps.status='published' or coalesce(ps.qa_score,0)>=88)
    )
  order by aq.commercial_priority_score desc nulls last
  limit 1;
  if v_prospect is null then return null; end if;
  select net.http_post(
    url := current_setting('app.athrty_preview_factory_proof_url', true),
    body := jsonb_build_object('owner_user_id',v_owner,'prospect_profile_id',v_prospect),
    params := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type','application/json','x-athrty-runtime-token',v_token),
    timeout_milliseconds := 120000
  ) into v_request_id;
  return v_request_id;
end;
$function$;

CREATE OR REPLACE FUNCTION private.dispatch_athrty_reply_ingestion()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare v_token text; v_request_id bigint;
begin
  select value into v_token from private.runtime_config where key='athrty_learning_trigger_token';
  if v_token is null then raise exception 'ATHRTY runtime token missing'; end if;
  select net.http_post(
    url := current_setting('app.athrty_reply_ingestion_url', true),
    body := '{}'::jsonb,
    params := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type','application/json','x-athrty-runtime-token',v_token),
    timeout_milliseconds := 120000
  ) into v_request_id;
  return v_request_id;
end;
$function$;
