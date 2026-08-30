import { createClient } from "npm:@supabase/supabase-js@2.57.4";

// Recovery snapshot: live verifier omitted from public source control.
const EXPECTED_TOKEN_HASH="__RECOVERY_REDACTED_RUNTIME_TOKEN_SHA256__";
const REFINE_VERSION="followup-refine-v2";
const PROMOTION_VERSION="athrty-policy-promotion-v1";

function json(b:unknown,s=200){return new Response(JSON.stringify(b),{status:s,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}})}
function fail(c:string,s=400,d?:unknown){return json({ok:false,error:{code:c,detail:d??null}},s)}
function txt(v:any){return typeof v==="string"?v.trim():""}
function num(v:any){const n=Number(v);return Number.isFinite(n)?n:0}
async function sha256(v:string){const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v));return[...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,"0")).join("")}
async function post(url:string,token:string,body:any){const r=await fetch(url,{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify(body)});return{status:r.status,body:await r.json().catch(()=>null)}}

Deno.serve(async req=>{
 if(req.method!=="POST")return fail("METHOD_NOT_ALLOWED",405);
 const supplied=req.headers.get("x-athrty-runtime-token")??"";
 if(!supplied||(await sha256(supplied))!==EXPECTED_TOKEN_HASH)return fail("AUTH_INVALID",401);

 const su=Deno.env.get("SUPABASE_URL"),anon=Deno.env.get("SUPABASE_ANON_KEY"),service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!su||!anon||!service)return fail("SERVER_CONFIG_ERROR",500);

 let b:any;try{b=await req.json()}catch{return fail("INVALID_JSON")}
 const owner=txt(b?.owner_user_id);if(!owner)return fail("OWNER_REQUIRED");
 const limit=Math.min(5,Math.max(1,Number(b?.limit)||3));
 const mode=txt(b?.mode)||"research";
 const staleMinutes=Math.min(720,Math.max(15,Number(b?.stale_minutes)||60));

 const db=createClient(su,service,{auth:{persistSession:false,autoRefreshToken:false}});
 const leaseKey=`outbound_seed:${owner}`,leaseToken=crypto.randomUUID();
 const claim=await db.rpc("try_claim_athrty_runtime_lease",{p_lease_key:leaseKey,p_owner_token:leaseToken,p_ttl_seconds:180});
 if(claim.error)return fail("SEED_LEASE_CLAIM_FAILED",500,claim.error.message);
 if(claim.data!==true)return json({ok:true,mode,coalesced:true,selected:0,succeeded:0,failed:0,reason:"seed_runner_already_active"});

 try{
  const admin=createClient(su,service,{auth:{persistSession:false,autoRefreshToken:false}});
  const ur=await admin.auth.admin.getUserById(owner),email=ur.data?.user?.email;
  if(ur.error||!email)return fail("OWNER_AUTH_PROFILE_MISSING",500);

  const link=await admin.auth.admin.generateLink({type:"magiclink",email});
  const tokenHash=(link.data?.properties as any)?.hashed_token;
  if(link.error||!tokenHash)return fail("RUNTIME_SESSION_LINK_FAILED",500,link.error?.message);

  const ac=createClient(su,anon,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  const vr=await ac.auth.verifyOtp({token_hash:tokenHash,type:"email"});
  if(vr.error||!vr.data?.session?.access_token)return fail("RUNTIME_SESSION_FAILED",500,vr.error?.message);
  const access=vr.data.session.access_token;

  async function promoteByPolicy(pid:string){
   const pr=await db.from("prospect_profiles").select("*").eq("id",pid).eq("owner_user_id",owner).maybeSingle();
   if(pr.error||!pr.data)return{policy_ready:false,promoted:false,error:pr.error?.message||"profile_missing"};
   const p:any=pr.data;
   const brandKey=p.best_fit==="truett-cash"?"truett-cash":"authority-systems";
   const fit=brandKey==="truett-cash"?num(p.truett_fit_score):num(p.athrty_fit_score);

   const [policyR,contactsR]=await Promise.all([
    db.from("prospect_outreach_policies").select("*").eq("owner_user_id",owner).eq("brand_key",brandKey).eq("active",true).maybeSingle(),
    db.from("prospect_contact_candidates").select("*").eq("prospect_profile_id",pid).order("outreach_eligible",{ascending:false}).order("contact_quality_score",{ascending:false}).limit(5)
   ]);
   const policy:any=policyR.data||null;
   const contacts:any[]=contactsR.data||[];
   const best=contacts.find((c:any)=>c.outreach_eligible&&["public_site","verified"].includes(String(c.verification_status)))||null;

   const policyReady=!!policy&&!!best
    && !p.suppress_outreach
    && !["suppressed","disqualified","converted"].includes(String(p.outreach_status||""))
    && p.score_version==="cashos-prospect-v2"
    && num(p.data_sufficiency_score)>=78
    && !p.paid_enrichment_recommended
    && num(p.overall_score)>=num(policy.min_overall_score)
    && fit>=num(policy.min_brand_fit_score)
    && num(p.confidence)>=num(policy.min_confidence)
    && num(p.evidence_quality_score)>=num(policy.min_evidence_quality_score)
    && num(p.source_coverage_count)>=num(policy.min_source_coverage)
    && best.outreach_eligible===true
    && ["public_site","verified"].includes(String(best.verification_status))
    && num(best.contact_quality_score)>=num(policy.min_contact_quality_score);

   let promoted=false;
   if(policyReady&&!["A","B"].includes(String(p.prospect_tier||"").toUpperCase())){
    const baseExplanation=p.score_explanation&&typeof p.score_explanation==="object"&&!Array.isArray(p.score_explanation)?p.score_explanation:{};
    const explanation={...baseExplanation,policy_promotion:{version:PROMOTION_VERSION,brand_key:brandKey,prior_tier:p.prospect_tier,promoted_tier:"B",evaluated_at:new Date().toISOString(),core_policy_thresholds:{overall:policy.min_overall_score,brand_fit:policy.min_brand_fit_score,confidence:policy.min_confidence,evidence:policy.min_evidence_quality_score,sources:policy.min_source_coverage,contact:policy.min_contact_quality_score,data_sufficiency_floor:78}}};
    const up=await db.from("prospect_profiles").update({prospect_tier:"B",outreach_eligibility:"review_ready",score_explanation:explanation,updated_at:new Date().toISOString()}).eq("id",pid).eq("owner_user_id",owner);
    if(up.error)throw new Error(`promotion_update_failed:${up.error.message}`);
    promoted=true;
   }

   return{policy_ready:policyReady,promoted,brand_key:brandKey,fit_score:fit,contact_quality:best?num(best.contact_quality_score):0};
  }

  async function reevaluate(pid:string){
   const enrich=await post(`${su}/functions/v1/prospect-profile-enrich`,access,{prospect_profile_id:pid,public_sources:[]});
   const score=await post(`${su}/functions/v1/prospect-score-v2`,access,{prospect_profile_id:pid});
   if(!(score.status>=200&&score.status<300&&score.body?.ok))throw new Error(`score_failed:${JSON.stringify(score.body?.error||score.body).slice(0,500)}`);
   const promotion=await promoteByPolicy(pid);
   const a=await post(`${su}/functions/v1/prospect-account-intelligence`,access,{prospect_profile_id:pid});
   let d:any=null;
   if(a.body?.decision?.state==="contact")d=(await post(`${su}/functions/v1/prospect-outreach-compose`,access,{prospect_profile_id:pid})).body;
   return{enrich_ok:enrich.status>=200&&enrich.status<300,promotion,decision:a.body?.decision||null,draft_queue_id:d?.queue_id||null,quality_gate:d?.quality_gate||null,red_team:d?.red_team||null};
  }

  async function refineFollowups(){
   const q=await db.from("prospect_outreach_queue").select("id,state,body,metadata,human_approved_at,send_after,created_at").eq("owner_user_id",owner).in("state",["draft","review"]).is("human_approved_at",null).gt("sequence_step",1).order("send_after",{ascending:true}).order("created_at",{ascending:true}).limit(30);
   if(q.error)return{selected:0,succeeded:0,failed:1,parked:0,rows:[],error:q.error.message};
   const candidates=(q.data||[]).filter((x:any)=>{const m=x.metadata||{},same=txt(m.followup_refine_version)===REFINE_VERSION,attempts=same?Number(m.followup_refine_attempts||0):0;if(x.state==="draft")return attempts<2;const pu=txt(m.preview_url);return x.state==="review"&&!!pu&&!String(x.body||"").includes(pu)}).slice(0,5);
   const rows:any[]=[];
   for(const x of candidates){try{
    const before=x.metadata||{},same=txt(before.followup_refine_version)===REFINE_VERSION,priorAttempts=same?Number(before.followup_refine_attempts||0):0;
    const r=await post(`${su}/functions/v1/prospect-outreach-compose`,access,{outreach_queue_id:x.id});
    const redPassed=r.body?.red_team?.passed===true,qualityState=r.body?.quality_gate?.item?.state||null,passed=redPassed&&qualityState==="review";
    const fresh=await db.from("prospect_outreach_queue").select("metadata,state").eq("id",x.id).eq("owner_user_id",owner).maybeSingle();
    const fm=fresh.data?.metadata||{};
    const attempts=passed?0:priorAttempts+1,parked=!passed&&attempts>=2;
    await db.from("prospect_outreach_queue").update({metadata:{...fm,followup_refine_version:REFINE_VERSION,followup_refine_attempts:attempts,followup_refine_status:passed?"review_ready":parked?"manual_or_alternate_evidence":"retry_once",last_followup_refine_at:new Date().toISOString()},updated_at:new Date().toISOString()}).eq("id",x.id).eq("owner_user_id",owner);
    rows.push({queue_id:x.id,prior_state:x.state,ok:r.status>=200&&r.status<300&&!!r.body?.ok,red_team_passed:redPassed,quality_state:qualityState,passed,attempts,parked,site_led:!!r.body?.site_led,error:r.body?.error||null});
   }catch(e:any){rows.push({queue_id:x.id,prior_state:x.state,ok:false,passed:false,error:String(e?.message||e).slice(0,700)})}}
   return{selected:candidates.length,succeeded:rows.filter(x=>x.passed).length,failed:rows.filter(x=>!x.passed).length,parked:rows.filter(x=>x.parked).length,rows};
  }

  async function markResearchFailure(c:any,error:any){
   const prior=Number(c?.metadata?.seed_failures||0),failures=prior+1,blocked=failures>=2;
   const metadata={...(c?.metadata||{}),seed_failures:failures,last_seed_failure_at:new Date().toISOString(),last_seed_failure:String(error?.detail||error?.code||error||"research_failed").slice(0,700),retry_policy:blocked?"manual_or_alternate_source":"one_retry",skip_reason:blocked?"repeated_research_fetch_failure":null};
   await db.from("prospect_discovery_candidates").update({status:blocked?"skipped":"new",metadata,updated_at:new Date().toISOString()}).eq("id",c.id);
   return{failures,blocked};
  }

  if(mode==="refresh"){
   const staleBefore=new Date(Date.now()-staleMinutes*60_000).toISOString();
   const q=await db.from("prospect_profiles").select("id,commercial_priority_score,updated_at,prospect_tier").eq("owner_user_id",owner).eq("score_version","cashos-prospect-v2").eq("suppress_outreach",false).not("website","is",null).gte("commercial_priority_score",45).lt("updated_at",staleBefore).order("commercial_priority_score",{ascending:false}).order("updated_at",{ascending:true}).limit(limit);
   if(q.error)return fail("REFRESH_READ_FAILED",500,q.error.message);
   const results:any[]=[];
   for(const x of q.data||[]){try{results.push({prospect_profile_id:x.id,prior_tier:x.prospect_tier,ok:true,...await reevaluate(x.id)})}catch(e:any){results.push({prospect_profile_id:x.id,prior_tier:x.prospect_tier,ok:false,error:String(e?.message||e).slice(0,900)})}}
   const followups=await refineFollowups();
   return json({ok:true,mode,stale_minutes:staleMinutes,coalesced:false,selected:results.length,succeeded:results.filter(x=>x.ok).length,failed:results.filter(x=>!x.ok).length,promoted:results.filter(x=>x.promotion?.promoted).length,policy_ready:results.filter(x=>x.promotion?.policy_ready).length,contact_decisions:results.filter(x=>x.decision?.state==="contact").length,composed:results.filter(x=>x.draft_queue_id).length,followups,results});
  }

  const q=await db.from("prospect_discovery_candidates").select("*").eq("owner_user_id",owner).eq("status","new").not("website","is",null).order("candidate_score",{ascending:false}).order("created_at",{ascending:true}).limit(limit);
  if(q.error)return fail("SEED_READ_FAILED",500,q.error.message);
  const results:any[]=[];
  for(const c of q.data||[]){try{
   await db.from("prospect_discovery_candidates").update({status:"seeded",updated_at:new Date().toISOString()}).eq("id",c.id);
   const provider=c.provider_key||"runtime_seed";
   const source=c.source_url?{channel_type:provider==="google_places"?"google_business":"source_page",url:c.source_url,provider,review_count:c.review_count??null,rating:c.rating??null,observed_text:`Discovery source for ${c.company_name}`}:null;
   const r=await post(`${su}/functions/v1/prospect-research-pipeline`,access,{website:c.website,company_name:c.company_name,city:c.city,state:c.state,industry:c.primary_type,source_type:provider,source_ref:c.provider_entity_id||c.id,public_sources:source?[source]:[],trigger_type:"runtime_seed"});
   if(!(r.status>=200&&r.status<300&&r.body?.ok)){const retry=await markResearchFailure(c,r.body?.error||r.body);results.push({company:c.company_name,ok:false,research_retry:retry,error:r.body?.error||r.body});continue}
   const pid=txt(r.body.prospect_profile_id);
   await db.from("prospect_discovery_candidates").update({status:"researched",prospect_profile_id:pid,metadata:{...(c.metadata||{}),seed_failures:0,last_research_success_at:new Date().toISOString()},updated_at:new Date().toISOString()}).eq("id",c.id);
   const ev=await reevaluate(pid);
   results.push({company:c.company_name,ok:true,prospect_profile_id:pid,research_outcome:r.body.outcome,...ev});
  }catch(e:any){const retry=await markResearchFailure(c,e);results.push({company:c.company_name,ok:false,research_retry:retry,error:String(e?.message||e).slice(0,900)})}}

  const followups=await refineFollowups();
  return json({ok:true,mode,coalesced:false,selected:(q.data||[]).length,succeeded:results.filter(x=>x.ok).length,failed:results.filter(x=>!x.ok).length,promoted:results.filter(x=>x.promotion?.promoted).length,policy_ready:results.filter(x=>x.promotion?.policy_ready).length,contact_decisions:results.filter(x=>x.decision?.state==="contact").length,composed:results.filter(x=>x.draft_queue_id).length,followups,results});
 } finally {
  await db.rpc("release_athrty_runtime_lease",{p_lease_key:leaseKey,p_owner_token:leaseToken});
 }
});
