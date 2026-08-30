-- ATHRTY production event-attribution bridge snapshot.
-- Recovery-only source parity.

CREATE OR REPLACE FUNCTION public.athrty_engagement_event_to_envelope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_meta jsonb; v_org uuid; begin
  select metadata into v_meta from public.engagements where id=new.engagement_id;
  v_org:=public.athrty_try_uuid(v_meta->>'organization_id');
  perform public.athrty_record_event(jsonb_strip_nulls(jsonb_build_object(
    'event_name',public.athrty_normalize_event_name('engagement_events',new.event_type),'event_role','operational','source_system','engagement_events','source_event_id',new.id::text,
    'organization_id',v_org::text,'engagement_id',new.engagement_id::text,'channel',coalesce(new.source,'crm'),'touchpoint','engagement','action',new.event_type,
    'context',new.metadata,'occurred_at',new.created_at
  )));
  return new;
end;$function$;

CREATE OR REPLACE FUNCTION public.athrty_outreach_event_to_envelope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_org uuid; v_event text; v_time timestamptz; begin
  select coalesce(c.organization_id,p.organization_id) into v_org from public.prospect_profiles p left join public.prospect_contact_candidates c on c.id=new.contact_candidate_id where p.id=new.prospect_profile_id;
  if old.sent_at is null and new.sent_at is not null then v_event:='outbound_touch'; v_time:=new.sent_at;
  elsif old.replied_at is null and new.replied_at is not null then v_event:='inbound_reply'; v_time:=new.replied_at; else return new; end if;
  perform public.athrty_record_event(jsonb_strip_nulls(jsonb_build_object(
    'event_name',v_event,'event_role','observed','source_system','prospect_outreach_queue','source_event_id',new.id::text||':'||v_event,
    'organization_id',v_org::text,'engagement_id',new.engagement_id::text,'channel',new.channel,'touchpoint','outbound','action',v_event,
    'attribution',jsonb_strip_nulls(jsonb_build_object('sequence_key',new.sequence_key,'sequence_step',new.sequence_step,'provider_message_id',new.provider_message_id)),
    'context',jsonb_strip_nulls(jsonb_build_object('state',new.state,'message_quality_score',new.message_quality_score,'specificity_score',new.specificity_score)),'occurred_at',v_time
  ))); return new; end; $function$;

CREATE OR REPLACE FUNCTION public.athrty_preview_event_to_envelope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  perform public.athrty_record_event(jsonb_strip_nulls(jsonb_build_object(
    'event_name',public.athrty_normalize_event_name('prospect_preview_events',new.event_type),
    'event_role','observed','source_system','prospect_preview_events','source_event_id',new.id::text,
    'organization_id',new.organization_id::text,'preview_site_id',new.preview_site_id::text,'session_id',new.session_id,'visitor_hash',new.visitor_hash,
    'channel',coalesce(new.metadata->>'source','website_preview'),'touchpoint','preview_site','action',new.event_type,'section',new.metadata->>'section',
    'component',new.metadata->>'component','destination',coalesce(new.metadata->>'target',new.metadata->>'destination'),
    'attribution',jsonb_strip_nulls(jsonb_build_object('utm_source',new.metadata->>'utm_source','utm_medium',new.metadata->>'utm_medium','utm_campaign',new.metadata->>'utm_campaign','utm_content',new.metadata->>'utm_content','utm_term',new.metadata->>'utm_term','referrer',new.metadata->>'referrer','page_url',new.metadata->>'page_url')),
    'context',(new.metadata - 'name' - 'email' - 'phone'),'occurred_at',new.occurred_at
  )));
  return new;
end;$function$;

CREATE OR REPLACE FUNCTION public.athrty_sync_preview_event_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
begin
  new.render_payload:=jsonb_set(coalesce(new.render_payload,'{}'::jsonb),'{previewId}',to_jsonb(new.id::text),true);
  new.render_payload:=jsonb_set(new.render_payload,'{preview_id}',to_jsonb(new.id::text),true);
  if new.slug is not null then new.render_payload:=jsonb_set(new.render_payload,'{slug}',to_jsonb(new.slug),true); end if;
  return new;
end;$function$;

CREATE OR REPLACE FUNCTION public.athrty_normalize_preview_render_payload()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
begin
  if new.render_payload is null then new.render_payload := '{}'::jsonb; end if;
  if jsonb_typeof(new.render_payload->'services') is distinct from 'array' then new.render_payload := jsonb_set(new.render_payload,'{services}','[]'::jsonb,true); end if;
  if jsonb_typeof(new.render_payload->'images') is distinct from 'array' then new.render_payload := jsonb_set(new.render_payload,'{images}','[]'::jsonb,true); end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.sync_prospect_preview_slug_into_payload()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
begin
  new.render_payload := coalesce(new.render_payload,'{}'::jsonb) || jsonb_build_object('slug', new.slug);
  return new;
end;
$function$;
