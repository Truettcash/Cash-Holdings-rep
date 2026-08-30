-- ATHRTY production design-learning control snapshot.
-- Recovery-only source parity. Owner-bound helpers are preserved as observed and flagged in the manifest for later portability work.

CREATE OR REPLACE FUNCTION public.athrty_design_context(p_owner uuid, p_industry text, p_template text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
 select jsonb_build_object('version','design-loop-v1','site_learning',public.athrty_site_learning_context(p_owner,p_industry,p_template),
 'skills',coalesce((select jsonb_agg(jsonb_build_object('skill_key',skill_key,'name',name,'domain',domain,'maturity',maturity,'confidence',confidence,'playbook',playbook,'anti_patterns',anti_patterns) order by confidence desc) from public.athrty_design_skills where owner_user_id=p_owner and maturity in ('active','learning','proven')),'[]'::jsonb)); $function$;

CREATE OR REPLACE FUNCTION public.athrty_refresh_site_learning_patterns(p_owner uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare n integer;
begin
  insert into public.athrty_site_learning_patterns(owner_user_id,scope_key,industry,template_family,signal_key,sample_size,pass_count,fail_count,avg_quality_score,confidence,recommendation,evidence,first_observed_at,last_observed_at,updated_at)
  select p_owner,
         'industry_template:'||coalesce(nullif(lower(industry),''),'unknown')||':'||coalesce(nullif(template_family,''),'unknown'),
         industry,template_family,'qa_performance',count(*)::int,
         count(*) filter(where event_type='qa_pass')::int,
         count(*) filter(where event_type='qa_fail')::int,
         round(avg(quality_score),2),
         least(1.0, round((count(*)::numeric/8.0),3)),
         jsonb_build_object('action',case when count(*) filter(where event_type='qa_pass')>0 and avg(quality_score)>=88 then 'prefer' when count(*)>=3 and count(*) filter(where event_type='qa_pass')=0 then 'avoid_or_repair' else 'observe' end,'minimum_samples_for_strong_preference',3),
         jsonb_build_object('event_types',jsonb_object_agg(event_type,event_count),'last_quality',max(quality_score)),
         min(observed_at),max(observed_at),now()
  from (
    select owner_user_id,industry,template_family,event_type,quality_score,observed_at,count(*) over(partition by owner_user_id,industry,template_family,event_type) event_count
    from public.athrty_site_learning_events where owner_user_id=p_owner and event_type in ('qa_pass','qa_fail')
  ) x
  group by industry,template_family
  on conflict(owner_user_id,scope_key,signal_key) do update set sample_size=excluded.sample_size,pass_count=excluded.pass_count,fail_count=excluded.fail_count,avg_quality_score=excluded.avg_quality_score,confidence=excluded.confidence,recommendation=excluded.recommendation,evidence=excluded.evidence,first_observed_at=excluded.first_observed_at,last_observed_at=excluded.last_observed_at,updated_at=now();
  get diagnostics n=row_count; return n;
end $function$;

CREATE OR REPLACE FUNCTION public.athrty_learn_design_skills(p_owner uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$ declare n int:=0; begin
 update public.athrty_design_skills s set
 sample_size=x.n, success_count=x.pass_n, failure_count=x.fail_n,
 confidence=least(0.95,0.35+(x.n::numeric/20)),
 maturity=case when x.n>=8 and x.pass_n::numeric/nullif(x.n,0)>=0.75 then 'proven' when x.n>=3 then 'learning' else s.maturity end,
 evidence=coalesce(s.evidence,'{}'::jsonb)||jsonb_build_object('qa_sample_size',x.n,'qa_passes',x.pass_n,'qa_failures',x.fail_n,'last_refresh',now()),last_learned_at=now(),updated_at=now()
 from (select count(*)::int n,count(*) filter(where event_type='qa_pass')::int pass_n,count(*) filter(where event_type='qa_fail')::int fail_n from public.athrty_site_learning_events where owner_user_id=p_owner and event_type in ('qa_pass','qa_fail')) x
 where s.owner_user_id=p_owner; get diagnostics n=row_count; return n; end $function$;

CREATE OR REPLACE FUNCTION public.athrty_generate_design_critique(p_preview uuid, p_qa uuid DEFAULT NULL::uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare p record; q record; cid uuid; issues jsonb:='[]'::jsonb; recs jsonb:='[]'::jsonb; strengths jsonb:='[]'::jsonb; sev int:=0; scores jsonb;
begin
 select * into p from public.prospect_preview_sites where id=p_preview; if p.id is null then raise exception 'preview_not_found'; end if;
 if p_qa is not null then select * into q from public.athrty_site_qa_runs where id=p_qa; else select * into q from public.athrty_site_qa_runs where preview_site_id=p_preview order by created_at desc limit 1; end if;
 if coalesce(jsonb_array_length(coalesce(p.render_payload->'services','[]'::jsonb)),0)<3 then issues:=issues||jsonb_build_array(jsonb_build_object('dimension','proof_density','issue','thin_services','severity',82)); recs:=recs||jsonb_build_array('Research and structure at least three grounded service/capability signals before relying on decorative sections.'); sev:=greatest(sev,82); else strengths:=strengths||jsonb_build_array('Service depth supports commercial scanning.'); end if;
 if coalesce(jsonb_array_length(coalesce(p.render_payload->'images','[]'::jsonb)),0)<1 then issues:=issues||jsonb_build_array(jsonb_build_object('dimension','proof_density','issue','no_first_party_visual_proof','severity',88)); recs:=recs||jsonb_build_array('Acquire usable first-party project imagery or switch to a composition that does not pretend visual proof exists.'); sev:=greatest(sev,88); else strengths:=strengths||jsonb_build_array('First-party imagery is available to carry visual proof.'); end if;
 if length(coalesce(p.render_payload->>'headline',''))<12 then issues:=issues||jsonb_build_array(jsonb_build_object('dimension','commercial_hierarchy','issue','weak_headline','severity',65)); recs:=recs||jsonb_build_array('Rewrite the hero around a specific capability or customer outcome.'); sev:=greatest(sev,65); end if;
 if coalesce(q.hard_block_count,0)>0 then issues:=issues||jsonb_build_array(jsonb_build_object('dimension','release_integrity','issue','qa_hard_blocks','severity',95,'count',q.hard_block_count)); sev:=greatest(sev,95); else strengths:=strengths||jsonb_build_array('No hard release blockers in latest formal QA.'); end if;
 scores:=jsonb_build_object('commercial_hierarchy',case when length(coalesce(p.render_payload->>'headline',''))>=12 then 88 else 62 end,'proof_density',case when jsonb_array_length(coalesce(p.render_payload->'images','[]'::jsonb))>0 and jsonb_array_length(coalesce(p.render_payload->'services','[]'::jsonb))>=3 then 90 else 58 end,'responsive_integrity',case when coalesce(q.checks->>'responsive_contract','fail')='pass' then 95 else 60 end,'release_quality',coalesce(q.total_score,p.qa_score,0));
 insert into public.athrty_design_critiques(owner_user_id,preview_site_id,qa_run_id,critic_key,dimension_scores,strengths,issues,recommendations,severity,verdict,evidence)
 values('40c26807-e352-4737-9349-8e98c8e1b780',p_preview,q.id,'design-red-team-v1',scores,strengths,issues,recs,sev,case when sev>=80 then 'iterate' when coalesce(q.total_score,p.qa_score,0)>=92 then 'strong_release' else 'release_with_learning' end,jsonb_build_object('template_family',p.template_family,'industry',p.industry,'qa_score',coalesce(q.total_score,p.qa_score))) returning id into cid;
 return cid;
end $function$;

CREATE OR REPLACE FUNCTION private.capture_athrty_site_qa_learning()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare
  v_owner uuid := '40c26807-e352-4737-9349-8e98c8e1b780'::uuid;
  v_preview record;
  v_event text;
  v_signal text;
begin
  select ps.id,ps.prospect_profile_id,ps.organization_id,ps.industry,ps.template_family
    into v_preview
  from public.prospect_preview_sites ps where ps.id=new.preview_site_id;
  if v_preview.id is null then return new; end if;
  v_event := case when new.status='passed' and coalesce(new.hard_block_count,0)=0 and coalesce(new.commercial_block_count,0)=0 then 'qa_pass' else 'qa_fail' end;
  v_signal := case when v_event='qa_pass' then 'milestone' else 'gap' end;
  insert into public.athrty_site_learning_events(owner_user_id,preview_site_id,prospect_profile_id,organization_id,event_type,industry,template_family,quality_score,signal_key,source_table,source_row_id,payload,observed_at)
  values(v_owner,new.preview_site_id,v_preview.prospect_profile_id,v_preview.organization_id,v_event,v_preview.industry,v_preview.template_family,coalesce(new.quality_score,new.total_score),
    case when v_event='qa_pass' then 'site_qa_pass' else 'site_qa_fail' end,
    'athrty_site_qa_runs',new.id,
    jsonb_build_object('run_type',new.run_type,'failures',coalesce(new.failures,'[]'::jsonb),'warnings',coalesce(new.warnings,'[]'::jsonb),'checks',coalesce(new.checks,'{}'::jsonb),'viewport_results',coalesce(new.viewport_results,'{}'::jsonb),'release_decision',new.release_decision,'policy_version',new.policy_version),
    coalesce(new.completed_at,new.created_at,now()))
  on conflict do nothing;
  insert into public.intelligence_signals(owner_user_id,signal_type,summary,observed_at,scope,reason,status,confidence_level)
  values(v_owner,v_signal,
    case when v_event='qa_pass' then 'Site build passed QA at '||coalesce(new.quality_score,new.total_score,0)::text||' for '||coalesce(v_preview.industry,'unknown industry')||' / '||coalesce(v_preview.template_family,'unknown template')
         else 'Site build failed QA at '||coalesce(new.quality_score,new.total_score,0)::text||' for '||coalesce(v_preview.industry,'unknown industry')||' / '||coalesce(v_preview.template_family,'unknown template') end,
    coalesce(new.completed_at,new.created_at,now()),'athrty_site_factory',
    case when v_event='qa_pass' then 'Use successful build patterns as evidence when selecting future site strategies.' else 'Use QA failures as negative evidence; avoid repeating the same build pattern without correction.' end,
    'accepted','confirmed');
  return new;
exception when unique_violation then return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.apply_athrty_site_learning_strategy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare
  v_best text;
  v_best_avg numeric;
  v_best_passes int;
  v_current_failures int;
  v_context jsonb;
begin
  if new.industry is null or new.render_payload is null then return new; end if;
  if coalesce(new.internal_metadata #>> '{client_revision,active}','false')='true' then return new; end if;
  select template_family, avg(quality_score), count(*) filter(where event_type='qa_pass')::int
    into v_best,v_best_avg,v_best_passes
  from public.athrty_site_learning_events
  where owner_user_id='40c26807-e352-4737-9349-8e98c8e1b780'::uuid
    and lower(coalesce(industry,''))=lower(coalesce(new.industry,''))
    and event_type in ('qa_pass','qa_fail')
    and template_family is not null
  group by template_family
  having count(*) filter(where event_type='qa_pass') > 0
  order by (count(*) filter(where event_type='qa_pass'))::numeric / greatest(count(*),1) desc, avg(quality_score) desc, count(*) desc
  limit 1;
  select count(*)::int into v_current_failures
  from public.athrty_site_learning_events
  where owner_user_id='40c26807-e352-4737-9349-8e98c8e1b780'::uuid
    and lower(coalesce(industry,''))=lower(coalesce(new.industry,''))
    and template_family=new.template_family and event_type='qa_fail';
  v_context := jsonb_build_object('version','site-learning-v1','best_observed_template',v_best,'best_observed_avg_quality',v_best_avg,'best_observed_passes',coalesce(v_best_passes,0),'current_template_failures',coalesce(v_current_failures,0),'applied_at',now());
  new.render_payload := jsonb_set(coalesce(new.render_payload,'{}'::jsonb),'{siteLearning}',v_context,true);
  if v_best is not null and v_best <> new.template_family and coalesce(v_current_failures,0) > 0 then
    new.template_family := v_best;
    new.render_payload := jsonb_set(new.render_payload,'{designStrategy,variant}',to_jsonb(v_best),true);
    new.render_payload := jsonb_set(new.render_payload,'{siteLearning,adaptive_override}',to_jsonb(true),true);
  end if;
  return new;
end;
$function$;
