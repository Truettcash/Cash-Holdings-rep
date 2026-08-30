-- ATHRTY production outbound database guard snapshot.
-- Recovery-only source parity. No production DDL was executed by this recovery pass.

CREATE OR REPLACE FUNCTION public.athrty_enforce_outreach_release_gate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_preview public.prospect_preview_sites%rowtype;
  v_qa public.athrty_site_qa_runs%rowtype;
  v_profile public.prospect_profiles%rowtype;
  v_email text;
begin
  if new.state in ('sending','sent') and coalesce(old.state,'') not in ('sending','sent') then
    if coalesce(new.policy_passed,false) is not true then
      raise exception using errcode='23514', message='ATHRTY_POLICY_PASS_REQUIRED';
    end if;
    if new.human_approved_at is null or new.human_approved_by is null then
      raise exception using errcode='23514', message='ATHRTY_HUMAN_APPROVAL_REQUIRED';
    end if;
    if new.human_approved_at < now() - interval '7 days' then
      raise exception using errcode='23514', message='ATHRTY_HUMAN_APPROVAL_EXPIRED';
    end if;
    if new.send_after is not null and new.send_after > now() then
      raise exception using errcode='23514', message='ATHRTY_SEND_NOT_DUE';
    end if;

    select * into v_profile from public.prospect_profiles where id=new.prospect_profile_id limit 1;
    if v_profile.id is null then
      raise exception using errcode='23514', message='ATHRTY_PROFILE_REQUIRED';
    end if;
    if coalesce(v_profile.suppress_outreach,false) or v_profile.outreach_status='suppressed' then
      raise exception using errcode='23514', message='ATHRTY_PROSPECT_SUPPRESSED';
    end if;

    select lower(email) into v_email from public.prospect_contact_candidates where id=new.contact_candidate_id limit 1;
    if v_email is not null and exists (
      select 1 from public.outreach_suppressions s where s.owner_user_id=new.owner_user_id and lower(s.email_normalized)=v_email
    ) then
      raise exception using errcode='23514', message='ATHRTY_CONTACT_SUPPRESSED';
    end if;
    if coalesce(v_profile.canonical_domain,'')<>'' and exists (
      select 1 from public.outreach_suppressions s where s.owner_user_id=new.owner_user_id and lower(s.domain_normalized)=lower(v_profile.canonical_domain)
    ) then
      raise exception using errcode='23514', message='ATHRTY_DOMAIN_SUPPRESSED';
    end if;

    select * into v_preview
    from public.prospect_preview_sites
    where prospect_profile_id = new.prospect_profile_id
    order by updated_at desc nulls last, created_at desc
    limit 1;
    if v_preview.id is null or v_preview.status <> 'published' or coalesce(v_preview.preview_url,'') = '' then
      raise exception using errcode='23514', message='ATHRTY_PREVIEW_RELEASE_REQUIRED';
    end if;

    select * into v_qa
    from public.athrty_site_qa_runs
    where preview_site_id = v_preview.id
    order by coalesce(completed_at,created_at) desc
    limit 1;
    if v_qa.id is null
       or v_qa.status <> 'passed'
       or v_qa.release_decision <> 'release'
       or coalesce(v_qa.total_score,0) < 88
       or coalesce(v_qa.hard_block_count,0) > 0 then
      raise exception using errcode='23514', message='ATHRTY_QA_RELEASE_REQUIRED';
    end if;
  end if;
  return new;
end
$function$;

CREATE OR REPLACE FUNCTION public.prospect_outreach_policy_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_profile public.prospect_profiles%rowtype;
  v_contact public.prospect_contact_candidates%rowtype;
  v_policy public.prospect_outreach_policies%rowtype;
  v_account public.prospect_account_models%rowtype;
  v_fit numeric;
  v_role_ok boolean;
  v_red_team_ok boolean;
  v_ss_ok boolean;
  v_eligible boolean;
begin
  select * into v_profile from public.prospect_profiles where id=new.prospect_profile_id;
  if v_profile.id is null then raise exception 'prospect_profile_not_found'; end if;
  if new.contact_candidate_id is not null then select * into v_contact from public.prospect_contact_candidates where id=new.contact_candidate_id; end if;
  select * into v_policy from public.prospect_outreach_policies where owner_user_id=new.owner_user_id and brand_key=new.brand_key and active=true limit 1;
  select * into v_account from public.prospect_account_models where owner_user_id=new.owner_user_id and prospect_profile_id=new.prospect_profile_id limit 1;
  if v_policy.id is null then
    new.policy_passed:=false;
    new.policy_reasons:=coalesce(new.policy_reasons,'[]'::jsonb)||jsonb_build_array('active_policy_missing');
    if new.state='review' then new.state:='draft'; end if;
    if new.state in ('approved','scheduled','sending') then raise exception 'active_outreach_policy_required'; end if;
    return new;
  end if;
  v_fit:=case when new.brand_key='truett-cash' then v_profile.truett_fit_score else v_profile.athrty_fit_score end;
  v_role_ok:=v_contact.id is not null and (
    v_contact.contact_type='decision_maker'
    or coalesce(v_contact.role_class,'') in ('owner','founder','executive','marketing_leader','operations_leader','sales_leader')
    or (v_contact.contact_type in ('business','department') and v_profile.overall_score>=v_policy.generic_inbox_min_overall_score and v_profile.source_coverage_count>=v_policy.generic_inbox_min_source_coverage)
  );
  v_red_team_ok:=coalesce(new.metadata,'{}'::jsonb) @> '{"ss_plus_red_team_passed":true}'::jsonb;
  v_ss_ok:=v_account.id is not null and v_account.model_version='cashos-account-v1' and v_account.decision_state='contact';
  v_eligible:=
    not v_profile.suppress_outreach
    and v_profile.outreach_status not in ('suppressed','disqualified','converted')
    and v_profile.score_version='cashos-prospect-v2'
    and v_profile.prospect_tier in ('A','B')
    and v_profile.data_sufficiency_score>=72
    and not coalesce(v_profile.paid_enrichment_recommended,false)
    and v_profile.overall_score>=v_policy.min_overall_score
    and v_fit>=v_policy.min_brand_fit_score
    and v_profile.confidence>=v_policy.min_confidence
    and v_profile.evidence_quality_score>=v_policy.min_evidence_quality_score
    and v_profile.source_coverage_count>=v_policy.min_source_coverage
    and v_contact.id is not null
    and v_contact.verification_status in ('public_site','verified')
    and v_contact.outreach_eligible
    and v_contact.contact_quality_score>=v_policy.min_contact_quality_score
    and v_role_ok
    and new.evidence_quality_score>=v_policy.min_evidence_quality_score
    and new.contact_quality_score>=v_policy.min_contact_quality_score
    and new.message_quality_score>=v_policy.min_message_quality_score
    and new.specificity_score>=75
    and (not v_policy.require_opt_out or coalesce(new.opt_out_included,false))
    and (not v_policy.require_postal_address or coalesce(new.postal_address_included,false))
    and v_ss_ok
    and v_red_team_ok;
  new.policy_passed:=v_eligible;
  new.policy_reasons:=case when v_eligible then jsonb_build_array('premium_policy_passed','ss_plus_account_contact','ss_plus_red_team_passed','commercial_compliance_passed','human_review_required') else jsonb_build_array(
    case when v_profile.suppress_outreach then 'profile_suppressed' end,
    case when v_profile.score_version is distinct from 'cashos-prospect-v2' then 'ss_plus_score_version_required' end,
    case when coalesce(v_profile.prospect_tier,'HOLD') not in ('A','B') then 'ss_plus_tier_not_contactable' end,
    case when coalesce(v_profile.data_sufficiency_score,0)<72 then 'ss_plus_data_sufficiency_below_72' end,
    case when coalesce(v_profile.paid_enrichment_recommended,false) then 'decision_changing_research_pending' end,
    case when v_profile.overall_score<v_policy.min_overall_score then 'overall_score_below_threshold' end,
    case when v_fit<v_policy.min_brand_fit_score then 'brand_fit_below_threshold' end,
    case when v_profile.confidence<v_policy.min_confidence then 'profile_confidence_below_threshold' end,
    case when v_profile.evidence_quality_score<v_policy.min_evidence_quality_score then 'profile_evidence_below_threshold' end,
    case when v_profile.source_coverage_count<v_policy.min_source_coverage then 'source_coverage_below_threshold' end,
    case when v_contact.id is null then 'contact_missing' end,
    case when v_contact.id is not null and v_contact.verification_status not in ('public_site','verified') then 'contact_not_publicly_verified' end,
    case when v_contact.id is not null and not v_contact.outreach_eligible then 'contact_not_outreach_eligible' end,
    case when v_contact.id is not null and v_contact.contact_quality_score<v_policy.min_contact_quality_score then 'contact_quality_below_threshold' end,
    case when not coalesce(v_role_ok,false) then 'contact_role_not_preferred' end,
    case when new.message_quality_score<v_policy.min_message_quality_score then 'message_quality_below_threshold' end,
    case when new.specificity_score<75 then 'message_specificity_below_threshold' end,
    case when v_policy.require_opt_out and not coalesce(new.opt_out_included,false) then 'commercial_opt_out_required' end,
    case when v_policy.require_postal_address and not coalesce(new.postal_address_included,false) then 'commercial_postal_address_required' end,
    case when not v_ss_ok then 'ss_plus_account_decision_not_contact' end,
    case when not v_red_team_ok then 'ss_plus_red_team_required' end
  ) end;
  new.policy_reasons:=(select coalesce(jsonb_agg(x),'[]'::jsonb) from jsonb_array_elements(new.policy_reasons) x where x<>'null'::jsonb);
  if new.state='review' and not v_eligible then new.state:='draft'; end if;
  if new.state in ('approved','scheduled','sending') then
    if v_policy.require_opt_out and not coalesce(new.opt_out_included,false) then raise exception 'commercial_opt_out_required'; end if;
    if v_policy.require_postal_address and not coalesce(new.postal_address_included,false) then raise exception 'commercial_postal_address_required'; end if;
    if not v_eligible then raise exception 'premium_ss_plus_outreach_policy_not_met'; end if;
    if new.human_approved_at is null then raise exception 'human_approval_required'; end if;
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.normalize_athrty_outreach_and_preview_contract()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if tg_table_name = 'prospect_outreach_queue' then
    if new.body is not null then
      new.body := replace(new.body, chr(92) || 'n', E'\n');
    end if;
    if new.evidence_url is not null then
      new.evidence_url := replace(new.evidence_url,'https://digital-combination-662544.framer.app','https://athrty.framer.website');
    end if;
    if new.metadata ? 'preview_url' then
      new.metadata := jsonb_set(coalesce(new.metadata, '{}'::jsonb),'{preview_url}',to_jsonb(replace(coalesce(new.metadata->>'preview_url',''),'https://digital-combination-662544.framer.app','https://athrty.framer.website')),true);
    end if;
  elsif tg_table_name = 'prospect_preview_sites' then
    if new.preview_url is not null then
      new.preview_url := replace(new.preview_url,'https://digital-combination-662544.framer.app','https://athrty.framer.website');
    end if;
  end if;
  return new;
end
$function$;

CREATE OR REPLACE FUNCTION public.sync_prospect_outreach_experiment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_org uuid;
  v_key text;
begin
  select organization_id into v_org from public.prospect_profiles where id=new.prospect_profile_id;
  v_key:='outreach:'||new.id::text;
  if new.state='sent' and (tg_op='INSERT' or old.state is distinct from new.state) then
    insert into public.prospect_commercial_experiments(
      owner_user_id,prospect_profile_id,organization_id,brand_key,experiment_key,hypothesis,channel,angle_key,offer_key,subject_variant,message_variant,timing_variant,contact_candidate_id,outreach_queue_id,status,started_at,replied,positive_reply,meeting_booked,qualified,converted,metadata
    ) values (
      new.owner_user_id,new.prospect_profile_id,v_org,new.brand_key,v_key,
      coalesce(nullif(new.rationale,''),nullif(new.evidence_claim,''),'Evidence-bound curated outreach'),
      coalesce(new.channel,'email'),new.metadata->>'angle_key',new.metadata->>'offer_key',new.subject,new.body,
      coalesce(new.metadata->>'timing_variant','human_approved'),new.contact_candidate_id,new.id,'running',coalesce(new.sent_at,now()),false,false,false,false,false,
      jsonb_build_object('sequence_key',new.sequence_key,'sequence_step',new.sequence_step,'evidence_url',new.evidence_url,'evidence_claim',new.evidence_claim,'message_quality_score',new.message_quality_score,'specificity_score',new.specificity_score)
    ) on conflict (owner_user_id,experiment_key) do update set
      status='running',started_at=coalesce(public.prospect_commercial_experiments.started_at,excluded.started_at),updated_at=now();
  end if;
  if new.replied_at is not null or new.state='replied' then
    update public.prospect_commercial_experiments
      set replied=true,status='observed',observed_at=coalesce(observed_at,new.replied_at,now()),updated_at=now()
      where owner_user_id=new.owner_user_id and outreach_queue_id=new.id;
  end if;
  if new.state in ('cancelled','suppressed') then
    update public.prospect_commercial_experiments
      set status=case when status='planned' then 'cancelled' else status end,updated_at=now()
      where owner_user_id=new.owner_user_id and outreach_queue_id=new.id;
  end if;
  return new;
end $function$;
