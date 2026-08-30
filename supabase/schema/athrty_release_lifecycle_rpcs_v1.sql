-- ATHRTY production release / lifecycle RPC snapshot.
-- Recovery-only source parity. No production DDL was executed by this recovery pass.

CREATE OR REPLACE FUNCTION public.athrty_evaluate_release_gate(p_preview_site_id uuid, p_qa_run_id uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare r public.athrty_site_qa_runs%rowtype; v_decision text; v_reasons jsonb:='[]'::jsonb; begin
  if p_qa_run_id is null then select * into r from public.athrty_site_qa_runs where preview_site_id=p_preview_site_id order by coalesce(completed_at,created_at) desc limit 1;
  else select * into r from public.athrty_site_qa_runs where id=p_qa_run_id and preview_site_id=p_preview_site_id; end if;
  if r.id is null then return jsonb_build_object('ok',false,'decision','block','code','QA_RUN_MISSING','policy_version','athrty-qa-firewall-v1'); end if;
  if r.hard_block_count>0 then v_reasons:=v_reasons||jsonb_build_array('hard_blockers_present'); end if;
  if coalesce(r.total_score,0)<88 then v_reasons:=v_reasons||jsonb_build_array('quality_threshold_not_met'); end if;
  if coalesce(r.checks->>'attribution_contract','')<>'pass' then v_reasons:=v_reasons||jsonb_build_array('attribution_contract_missing'); end if;
  if coalesce(r.viewport_results->>'desktop','')<>'pass' or coalesce(r.viewport_results->>'tablet','')<>'pass' or coalesce(r.viewport_results->>'phone','')<>'pass' then v_reasons:=v_reasons||jsonb_build_array('responsive_breakpoint_verification_missing'); end if;
  if jsonb_array_length(v_reasons)>0 then v_decision:='block'; elsif r.commercial_block_count>0 then v_decision:='review'; else v_decision:='release'; end if;
  update public.athrty_site_qa_runs set release_decision=v_decision where id=r.id;
  return jsonb_build_object('ok',v_decision='release','decision',v_decision,'qa_run_id',r.id,'total_score',r.total_score,'quality_score',r.quality_score,'hard_block_count',r.hard_block_count,'commercial_block_count',r.commercial_block_count,'reasons',v_reasons,'warnings',r.warnings,'policy_version',r.policy_version);
end;$function$;

CREATE OR REPLACE FUNCTION public.athrty_sync_preview_release_gate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
declare g jsonb; v_decision text; begin
  g:=public.athrty_evaluate_release_gate(new.preview_site_id,new.id);
  v_decision:=coalesce(g->>'decision','block');
  if v_decision='release' then
    update public.prospect_preview_sites
      set qa_score=greatest(coalesce(qa_score,0),coalesce(new.total_score,0)),
          internal_metadata=jsonb_set(coalesce(internal_metadata,'{}'::jsonb),'{release_gate}',g,true),
          updated_at=now()
      where id=new.preview_site_id;
  else
    update public.prospect_preview_sites
      set qa_score=least(coalesce(qa_score,87),87),
          status=case when status='published' then 'built' else status end,
          internal_metadata=(jsonb_set(coalesce(internal_metadata,'{}'::jsonb),'{release_gate}',g,true) #- '{framer,deployment_id}'),
          updated_at=now()
      where id=new.preview_site_id;
  end if;
  return new;
end;$function$;

CREATE OR REPLACE FUNCTION public.athrty_preview_release_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
declare g jsonb; v_new_dep text; v_old_dep text; begin
  v_new_dep:=new.internal_metadata #>> '{framer,deployment_id}';
  v_old_dep:=old.internal_metadata #>> '{framer,deployment_id}';
  if (new.status='published' and (old.status is distinct from new.status or old.published_at is distinct from new.published_at))
     or (v_new_dep is distinct from v_old_dep and v_new_dep is not null) then
    g:=public.athrty_evaluate_release_gate(new.id,null);
    if coalesce(g->>'decision','block')<>'release' then
      raise exception 'ATHRTY_QA_FIREWALL_BLOCKED: %',g::text;
    end if;
  end if;
  return new;
end;$function$;

CREATE OR REPLACE FUNCTION public.athrty_event_envelopes_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $function$ begin raise exception 'ATHRTY_EVENT_ENVELOPES_ARE_IMMUTABLE'; end; $function$;

CREATE OR REPLACE FUNCTION public.athrty_block_lifecycle_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
begin
  raise exception 'ATHRTY_LIFECYCLE_EVENTS_IMMUTABLE';
end;
$function$;

CREATE OR REPLACE FUNCTION public.athrty_record_event(p_event jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_source text := nullif(btrim(p_event->>'source_system'),'');
  v_source_event text := nullif(btrim(p_event->>'source_event_id'),'');
  v_name text := nullif(btrim(p_event->>'event_name'),'');
  v_preview uuid := public.athrty_try_uuid(p_event->>'preview_site_id');
  v_org uuid := public.athrty_try_uuid(p_event->>'organization_id');
  v_id uuid;
  v_key text;
begin
  if v_source is null or v_source_event is null or v_name is null then
    raise exception 'EVENT_CONTRACT_REQUIRED_FIELDS_MISSING';
  end if;
  if v_org is null and v_preview is not null then
    select organization_id into v_org from public.prospect_preview_sites where id=v_preview;
  end if;
  v_key := coalesce(nullif(p_event->>'idempotency_key',''), v_source||':'||v_source_event||':'||v_name);
  insert into public.athrty_event_envelopes(
    event_name,event_role,source_system,source_event_id,organization_id,contact_id,engagement_id,deal_id,preview_site_id,
    session_id,visitor_hash,channel,touchpoint,action,section,component,destination,attribution,context,policy_version,occurred_at,idempotency_key
  ) values (
    v_name,coalesce(nullif(p_event->>'event_role',''),'observed'),v_source,v_source_event,v_org,
    public.athrty_try_uuid(p_event->>'contact_id'),public.athrty_try_uuid(p_event->>'engagement_id'),public.athrty_try_uuid(p_event->>'deal_id'),v_preview,
    nullif(p_event->>'session_id',''),nullif(p_event->>'visitor_hash',''),nullif(p_event->>'channel',''),nullif(p_event->>'touchpoint',''),
    nullif(p_event->>'action',''),nullif(p_event->>'section',''),nullif(p_event->>'component',''),nullif(p_event->>'destination',''),
    coalesce(p_event->'attribution','{}'::jsonb),coalesce(p_event->'context','{}'::jsonb),coalesce(nullif(p_event->>'policy_version',''),'athrty-event-contract-v1'),
    coalesce((p_event->>'occurred_at')::timestamptz,now()),v_key
  ) on conflict(idempotency_key) do nothing returning id into v_id;
  if v_id is null then select id into v_id from public.athrty_event_envelopes where idempotency_key=v_key; end if;
  return v_id;
end;$function$;

CREATE OR REPLACE FUNCTION public.athrty_transition_entity(p_entity_type text, p_entity_id uuid, p_to_state text, p_trigger_key text, p_actor_type text, p_actor_id text, p_idempotency_key text, p_input_snapshot jsonb DEFAULT '{}'::jsonb, p_source text DEFAULT 'athrty_orchestrator'::text, p_source_event_id uuid DEFAULT NULL::uuid, p_approval_context jsonb DEFAULT NULL::jsonb, p_policy_version text DEFAULT 'athrty-lifecycle-v1'::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_current public.athrty_lifecycle_state%rowtype;
  v_policy public.athrty_transition_policies%rowtype;
  v_event public.athrty_lifecycle_events%rowtype;
  v_missing text[];
  v_initial_state text := 'prospect';
begin
  if p_entity_type is null or btrim(p_entity_type) = '' then raise exception 'ENTITY_TYPE_REQUIRED'; end if;
  if p_entity_id is null then raise exception 'ENTITY_ID_REQUIRED'; end if;
  if p_to_state is null or btrim(p_to_state) = '' then raise exception 'TO_STATE_REQUIRED'; end if;
  if p_trigger_key is null or btrim(p_trigger_key) = '' then raise exception 'TRIGGER_KEY_REQUIRED'; end if;
  if p_actor_type is null or btrim(p_actor_type) = '' then raise exception 'ACTOR_TYPE_REQUIRED'; end if;
  if p_idempotency_key is null or btrim(p_idempotency_key) = '' then raise exception 'IDEMPOTENCY_KEY_REQUIRED'; end if;

  select * into v_event from public.athrty_lifecycle_events where idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object('ok', true, 'idempotent_replay', true, 'event_id', v_event.id, 'entity_type', v_event.entity_type, 'entity_id', v_event.entity_id, 'from_state', v_event.from_state, 'to_state', v_event.to_state, 'policy_version', v_event.policy_version);
  end if;

  select * into v_current
  from public.athrty_lifecycle_state
  where entity_type = p_entity_type and entity_id = p_entity_id
  for update;

  if not found then
    v_current.entity_type := p_entity_type;
    v_current.entity_id := p_entity_id;
    v_current.lifecycle_state := v_initial_state;
    v_current.policy_version := p_policy_version;
  end if;

  select * into v_policy
  from public.athrty_transition_policies
  where policy_version = p_policy_version
    and entity_type = p_entity_type
    and from_state = v_current.lifecycle_state
    and to_state = p_to_state
    and trigger_key = p_trigger_key
    and is_active = true
  limit 1;

  if not found then
    raise exception 'TRANSITION_NOT_ALLOWED:%:%->%:%', p_entity_type, v_current.lifecycle_state, p_to_state, p_trigger_key;
  end if;

  if not (p_actor_type = any(v_policy.allowed_actor_types)) then
    raise exception 'ACTOR_NOT_ALLOWED:%', p_actor_type;
  end if;

  select array_agg(k)
  into v_missing
  from unnest(v_policy.required_data_keys) as k
  where not coalesce(p_input_snapshot, '{}'::jsonb) ? k
     or nullif(btrim(coalesce(p_input_snapshot->>k,'')), '') is null;

  if coalesce(array_length(v_missing, 1), 0) > 0 then
    raise exception 'REQUIRED_DATA_MISSING:%', array_to_string(v_missing, ',');
  end if;

  if v_policy.requires_human_approval and coalesce((p_approval_context->>'approved')::boolean, false) is not true then
    raise exception 'HUMAN_APPROVAL_REQUIRED';
  end if;

  insert into public.athrty_lifecycle_events(
    entity_type, entity_id, from_state, to_state, trigger_key,
    actor_type, actor_id, source, source_event_id, idempotency_key,
    policy_version, input_snapshot, side_effects, approval_context
  ) values (
    p_entity_type, p_entity_id, v_current.lifecycle_state, p_to_state, p_trigger_key,
    p_actor_type, p_actor_id, coalesce(nullif(btrim(p_source),''),'athrty_orchestrator'), p_source_event_id, p_idempotency_key,
    p_policy_version, coalesce(p_input_snapshot,'{}'::jsonb), v_policy.side_effects, p_approval_context
  ) returning * into v_event;

  insert into public.athrty_lifecycle_state(
    entity_type, entity_id, lifecycle_state, policy_version,
    source_event_id, last_transition_id, state_context, updated_at
  ) values (
    p_entity_type, p_entity_id, p_to_state, p_policy_version,
    p_source_event_id, v_event.id, coalesce(p_input_snapshot,'{}'::jsonb), now()
  )
  on conflict(entity_type, entity_id) do update set
    lifecycle_state = excluded.lifecycle_state,
    policy_version = excluded.policy_version,
    source_event_id = excluded.source_event_id,
    last_transition_id = excluded.last_transition_id,
    state_context = public.athrty_lifecycle_state.state_context || excluded.state_context,
    updated_at = now();

  return jsonb_build_object(
    'ok', true,
    'idempotent_replay', false,
    'event_id', v_event.id,
    'entity_type', p_entity_type,
    'entity_id', p_entity_id,
    'from_state', v_current.lifecycle_state,
    'to_state', p_to_state,
    'policy_version', p_policy_version,
    'side_effects', v_policy.side_effects
  );
end;
$function$;
