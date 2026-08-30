-- ATHRTY production private trigger-helper snapshot.
-- Recovery-only source parity.

CREATE OR REPLACE FUNCTION private.link_published_preview_to_outreach()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
begin
  if new.status='published' and new.preview_url is not null and coalesce(new.qa_score,0)>=88 then
    update public.prospect_outreach_queue q
    set metadata = coalesce(q.metadata,'{}'::jsonb) || jsonb_build_object(
      'preview_site_id',new.id,
      'preview_url',new.preview_url,
      'preview_qa_score',new.qa_score,
      'preview_linked_at',now()
    ), updated_at=now()
    where q.prospect_profile_id=new.prospect_profile_id
      and q.state in ('draft','review','approved','scheduled');
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.normalize_athrty_followup_evidence_copy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare v_claim text; v_greeting text := 'Hi,';
begin
  if coalesce(new.sequence_step,1) <= 1 then return new; end if;
  if coalesce(new.metadata->>'composer','') <> 'athrty-followup-evidence-v1' then return new; end if;
  if coalesce((new.metadata->>'site_led_followup')::boolean,false) then return new; end if;
  v_claim := lower(coalesce(new.evidence_claim,''));
  if v_claim ~ 'plot plan' then
    new.body := v_greeting || E'\n\nOne follow-up on the plot-plan request on your site. Once someone sends it, what happens next before the estimate and approval work is ready?';
  elsif v_claim ~ 'instant (estimate|quote)|fence estimator' then
    new.body := v_greeting || E'\n\nOne follow-up on the online estimator on your site. After someone uses it, what happens next before your team follows up?';
  elsif v_claim ~ 'quote|estimate|estimator|bid' then
    new.body := v_greeting || E'\n\nOne follow-up on the quote requests on your site. When a new request comes in, what happens next before someone can price it?';
  elsif v_claim ~ 'book|appointment|schedule' then
    new.body := v_greeting || E'\n\nOne follow-up on the booking flow on your site. After someone books, what happens next before the request reaches the right person?';
  else
    new.body := v_greeting || E'\n\nOne follow-up on the customer request flow on your site. When a new request comes in, what happens next before your team can act on it?';
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.normalize_athrty_outreach_body()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'private'
AS $function$
begin
  if new.body is not null then
    new.body := regexp_replace(new.body,E'([\\r\\n]+[[:space:]]*)?Truett[[:space:]]*([\\r\\n]+[[:space:]]*)?ATHRTY[[:space:]]*$','','i');
    new.body := regexp_replace(new.body,E'([\\r\\n]+[[:space:]]*)?Truett Cash[[:space:]]*$','','i');
    new.body := rtrim(new.body);
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.normalize_preview_site_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$ begin if new.status = 'qa_hold' then new.status := 'qa'; elsif new.status = 'preview_ready' then new.status := 'published'; elsif new.status = 'built' then new.status := 'ready'; end if; return new; end; $function$;

CREATE OR REPLACE FUNCTION private.record_preview_preflight_qa_hold()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare v_fails jsonb; v_count integer; v_score numeric;
begin
  if new.status <> 'qa' then return new; end if;
  if exists (select 1 from public.athrty_site_qa_runs where preview_site_id=new.id and metadata->>'source'='preflight_hold') then return new; end if;
  v_fails := coalesce(new.internal_metadata #> '{qa,hard_fails}','[]'::jsonb);
  v_count := case when jsonb_typeof(v_fails)='array' then jsonb_array_length(v_fails) else 1 end;
  v_score := least(coalesce(new.qa_score,87),87);
  insert into public.athrty_site_qa_runs(
    preview_site_id,run_type,status,total_score,quality_score,hard_block_count,commercial_block_count,
    checks,failures,warnings,viewport_results,metadata,started_at,completed_at,policy_version
  ) values (
    new.id,'preflight','failed',v_score,v_score,greatest(v_count,1),0,
    jsonb_build_object('preflight','fail','attribution_contract','not_run','responsive_contract','not_run'),
    case when jsonb_typeof(v_fails)='array' then v_fails else jsonb_build_array(v_fails) end,
    '[]'::jsonb,
    jsonb_build_object('desktop','not_run','tablet','not_run','phone','not_run'),
    jsonb_build_object('source','preflight_hold','factory',new.internal_metadata->'factory'),
    now(),now(),'athrty-qa-firewall-v1'
  );
  return new;
end;
$function$;
