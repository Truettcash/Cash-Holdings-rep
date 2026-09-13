-- Cash Holdings local CLI bridge v2
--
-- Follow-up parity patch for the local prospect scorer.
-- v1 already provides the bundled input payload, including both routed-brand
-- research policies. v2 restores the durable agent_runs lineage emitted by the
-- cloud prospect-score-v2 implementation before that cloud path is retired.

create or replace function public.cash_cli_apply_prospect_score(
  p_prospect_profile_id uuid,
  p_score jsonb,
  p_explanation jsonb,
  p_research jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_next_provider text := nullif(p_research ->> 'next_provider', '');
  v_paid boolean := coalesce((p_research ->> 'paid_enrichment_recommended')::boolean, false);
  v_reason text := nullif(p_research ->> 'reason', '');
  v_priority numeric := coalesce((p_research ->> 'priority')::numeric, 0);
  v_uncertainty numeric := coalesce((p_research ->> 'uncertainty')::numeric, 0);
  v_data_sufficiency numeric := coalesce((p_research ->> 'data_sufficiency')::numeric, 0);
  v_routed_brand text := nullif(p_research ->> 'routed_brand', '');
  v_queue_id uuid;
  v_estimated_cost integer;
  v_updated jsonb;
  v_agent_definition_id uuid;
begin
  select owner_user_id
  into v_owner
  from public.prospect_profiles
  where id = p_prospect_profile_id
  for update;

  if v_owner is null then
    raise exception 'prospect profile not found: %', p_prospect_profile_id
      using errcode = 'P0002';
  end if;

  update public.prospect_profiles
  set
    athrty_fit_score = coalesce((p_score ->> 'athrty_fit_score')::numeric, 0),
    truett_fit_score = coalesce((p_score ->> 'truett_fit_score')::numeric, 0),
    overall_score = coalesce((p_score ->> 'overall_score')::numeric, 0),
    best_fit = nullif(p_score ->> 'best_fit', ''),
    operational_friction_score = coalesce((p_score ->> 'operational_friction_score')::numeric, 0),
    brand_gap_score = coalesce((p_score ->> 'brand_gap_score')::numeric, 0),
    data_sufficiency_score = coalesce((p_score ->> 'data_sufficiency_score')::numeric, 0),
    decision_uncertainty_score = coalesce((p_score ->> 'decision_uncertainty_score')::numeric, 0),
    traffic_relevance_score = coalesce((p_score ->> 'traffic_relevance_score')::numeric, 0),
    commercial_priority_score = coalesce((p_score ->> 'commercial_priority_score')::numeric, 0),
    prospect_tier = nullif(p_score ->> 'prospect_tier', ''),
    research_cost_tier = nullif(p_score ->> 'research_cost_tier', ''),
    paid_enrichment_recommended = coalesce((p_score ->> 'paid_enrichment_recommended')::boolean, false),
    paid_enrichment_reason = nullif(p_score ->> 'paid_enrichment_reason', ''),
    score_version = 'cashos-prospect-v2-local',
    score_explanation = coalesce(p_explanation, '{}'::jsonb),
    updated_at = now()
  where id = p_prospect_profile_id
    and owner_user_id = v_owner
  returning jsonb_build_object(
    'id', id,
    'best_fit', best_fit,
    'prospect_tier', prospect_tier,
    'overall_score', overall_score,
    'commercial_priority_score', commercial_priority_score,
    'data_sufficiency_score', data_sufficiency_score,
    'paid_enrichment_recommended', paid_enrichment_recommended,
    'score_version', score_version
  )
  into v_updated;

  if v_paid and v_next_provider in ('google_places', 'dataforseo') then
    select e.id
    into v_queue_id
    from public.prospect_enrichment_requests e
    where e.owner_user_id = v_owner
      and e.prospect_profile_id = p_prospect_profile_id
      and e.provider_key = v_next_provider
      and e.status in ('queued', 'running', 'blocked_config', 'blocked_budget')
    order by e.created_at desc
    limit 1;

    if v_queue_id is null then
      v_estimated_cost := case when v_next_provider = 'google_places' then 4 else 2 end;

      insert into public.prospect_enrichment_requests (
        owner_user_id,
        prospect_profile_id,
        provider_key,
        reason,
        priority,
        estimated_cost_cents,
        status,
        metadata
      ) values (
        v_owner,
        p_prospect_profile_id,
        v_next_provider,
        v_reason,
        v_priority,
        v_estimated_cost,
        'queued',
        jsonb_build_object(
          'score_version', 'cashos-prospect-v2.1-local',
          'routed_brand', v_routed_brand,
          'uncertainty', v_uncertainty,
          'data_sufficiency', v_data_sufficiency,
          'estimate_basis', case
            when v_next_provider = 'google_places'
              then 'worst_case_post_free_cap_rounded'
            else 'current_live_task_price_rounded'
          end,
          'execution_plane', 'local_cli'
        )
      )
      returning id into v_queue_id;
    end if;
  end if;

  select a.id
  into v_agent_definition_id
  from public.agent_definitions a
  where a.owner_user_id = v_owner
    and a.agent_key = 'prospect-commercial-scorer'
  limit 1;

  if v_agent_definition_id is not null then
    insert into public.agent_runs (
      owner_user_id,
      agent_definition_id,
      trigger_type,
      source_type,
      source_id,
      objective,
      status,
      priority,
      idempotency_key,
      context,
      output,
      started_at,
      completed_at
    ) values (
      v_owner,
      v_agent_definition_id,
      'prospect_scoring',
      'prospect_profile',
      p_prospect_profile_id::text,
      'Score prospect for ATHRTY vs Truett Cash and determine research economics',
      'succeeded',
      round(v_priority)::integer,
      'prospect-score-v2-local:' || p_prospect_profile_id::text || ':' || gen_random_uuid()::text,
      jsonb_build_object(
        'prospect_profile_id', p_prospect_profile_id,
        'execution_plane', 'local_cli'
      ),
      coalesce(p_explanation, '{}'::jsonb),
      now(),
      now()
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'profile', v_updated,
    'enrichment_queue_id', v_queue_id,
    'agent_run_recorded', v_agent_definition_id is not null,
    'execution_plane', 'local_cli'
  );
end;
$$;

revoke all on function public.cash_cli_apply_prospect_score(uuid, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.cash_cli_apply_prospect_score(uuid, jsonb, jsonb, jsonb) to service_role;
