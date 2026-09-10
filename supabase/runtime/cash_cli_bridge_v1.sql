-- Cash Holdings local CLI bridge v1
--
-- Purpose:
--   Keep Supabase as the canonical state plane while moving bounded compute to
--   a local Python worker. These RPCs collapse the prospect scorer's N+1 reads
--   into one compact input payload and one governed write transaction.
--
-- Security:
--   service_role only. No anon/authenticated execution.
--
-- This file is intentionally staged for normal reviewed deployment. It does
-- not disable any production Edge Function or cron job by itself.

create or replace function public.cash_cli_runtime_status()
returns jsonb
language sql
stable
security definer
set search_path = public, storage
as $$
  select jsonb_build_object(
    'ok', true,
    'observed_at', now(),
    'prospects', jsonb_build_object(
      'profiles', (select count(*) from public.prospect_profiles),
      'discovery_candidates_new', (
        select count(*) from public.prospect_discovery_candidates where status = 'new'
      ),
      'enrichment_queued', (
        select count(*) from public.prospect_enrichment_requests where status = 'queued'
      ),
      'outreach_draft_or_review', (
        select count(*) from public.prospect_outreach_queue where state in ('draft', 'review')
      )
    ),
    'runtime', jsonb_build_object(
      'agent_runs_total', (select count(*) from public.agent_runs),
      'agent_runs_24h', (
        select count(*) from public.agent_runs where created_at >= now() - interval '24 hours'
      )
    ),
    'legacy_src', jsonb_build_object(
      'engine_catalog_rows', (select count(*) from public.src_engine_catalog),
      'engine_media_rows', (select count(*) from public.src_engine_media),
      'lms_course_rows', (select count(*) from public.src_lms_courses),
      'storage_objects', (
        select count(*)
        from storage.objects
        where bucket_id in ('athrty-client-assets', 'src-lms-assets')
      ),
      'storage_bytes', (
        select coalesce(sum((metadata ->> 'size')::bigint), 0)
        from storage.objects
        where bucket_id in ('athrty-client-assets', 'src-lms-assets')
      )
    )
  );
$$;

revoke all on function public.cash_cli_runtime_status() from public, anon, authenticated;
grant execute on function public.cash_cli_runtime_status() to service_role;


create or replace function public.cash_cli_prospect_score_input(
  p_prospect_profile_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_profile jsonb;
  v_owner uuid;
  v_contacts jsonb := '[]'::jsonb;
  v_provider_keys jsonb := '[]'::jsonb;
  v_policies jsonb := '{}'::jsonb;
begin
  select jsonb_build_object(
    'id', p.id,
    'owner_user_id', p.owner_user_id,
    'confidence', p.confidence,
    'evidence_quality_score', p.evidence_quality_score,
    'source_coverage_count', p.source_coverage_count,
    'signals', coalesce(p.signals, '{}'::jsonb),
    'operations_complexity_score', p.operations_complexity_score,
    'conversion_gap_score', p.conversion_gap_score,
    'website_quality_score', p.website_quality_score,
    'brand_maturity_score', p.brand_maturity_score,
    'contactability_score', p.contactability_score,
    'market_visibility_score', p.market_visibility_score,
    'best_fit', p.best_fit
  ), p.owner_user_id
  into v_profile, v_owner
  from public.prospect_profiles p
  where p.id = p_prospect_profile_id;

  if v_profile is null then
    raise exception 'prospect profile not found: %', p_prospect_profile_id
      using errcode = 'P0002';
  end if;

  select coalesce(jsonb_agg(x.payload), '[]'::jsonb)
  into v_contacts
  from (
    select jsonb_build_object(
      'contact_quality_score', c.contact_quality_score,
      'decision_maker_score', c.decision_maker_score,
      'outreach_eligible', c.outreach_eligible,
      'verification_status', c.verification_status
    ) as payload
    from public.prospect_contact_candidates c
    where c.prospect_profile_id = p_prospect_profile_id
    order by c.outreach_eligible desc nulls last,
             c.contact_quality_score desc nulls last
    limit 1
  ) x;

  select coalesce(jsonb_agg(distinct s.provider_key), '[]'::jsonb)
  into v_provider_keys
  from public.prospect_provider_snapshots s
  where s.prospect_profile_id = p_prospect_profile_id
    and s.provider_status in ('complete', 'partial');

  select coalesce(
    jsonb_object_agg(
      r.brand_key,
      jsonb_build_object(
        'provider_order', r.provider_order,
        'paid_enrichment_min_priority', r.paid_enrichment_min_priority,
        'paid_enrichment_min_uncertainty', r.paid_enrichment_min_uncertainty,
        'paid_enrichment_max_uncertainty', r.paid_enrichment_max_uncertainty
      )
    ),
    '{}'::jsonb
  )
  into v_policies
  from public.prospect_research_policies r
  where r.owner_user_id = v_owner
    and r.active = true
    and r.brand_key in ('authority-systems', 'truett-cash');

  return jsonb_build_object(
    'profile', v_profile,
    'contacts', v_contacts,
    'provider_keys', v_provider_keys,
    'policies', v_policies
  );
end;
$$;

revoke all on function public.cash_cli_prospect_score_input(uuid) from public, anon, authenticated;
grant execute on function public.cash_cli_prospect_score_input(uuid) to service_role;


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

  return jsonb_build_object(
    'ok', true,
    'profile', v_updated,
    'enrichment_queue_id', v_queue_id,
    'execution_plane', 'local_cli'
  );
end;
$$;

revoke all on function public.cash_cli_apply_prospect_score(uuid, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.cash_cli_apply_prospect_score(uuid, jsonb, jsonb, jsonb) to service_role;
