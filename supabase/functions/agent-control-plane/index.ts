import { createClient } from "npm:@supabase/supabase-js@2.57.4";

type Action="list_agents"|"get_agent"|"route"|"create_run"|"append_event"|"update_run"|"list_runs";
const ACTIONS=new Set<Action>(["list_agents","get_agent","route","create_run","append_event","update_run","list_runs"]);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function json(b:unknown,s=200){return new Response(JSON.stringify(b),{status:s,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}})}
function fail(c:string,s=400,d?:unknown){return json({ok:false,error:{code:c,detail:d??null}},s)}
function text(v:unknown){return typeof v==="string"?v.trim():""}
function clamp(n:unknown,min:number,max:number,def:number){const x=Number(n);return Number.isFinite(x)?Math.min(max,Math.max(min,Math.round(x))):def}

Deno.serve(async req=>{
 if(req.method!=="POST")return fail("METHOD_NOT_ALLOWED",405);
 const auth=req.headers.get("authorization");if(!auth?.toLowerCase().startsWith("bearer "))return fail("AUTH_REQUIRED",401);
 const url=Deno.env.get("SUPABASE_URL"),anon=Deno.env.get("SUPABASE_ANON_KEY"),service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");if(!url||!anon||!service)return fail("SERVER_CONFIG_ERROR",500);
 let body:any;try{body=await req.json()}catch{return fail("INVALID_JSON")};const action=body?.action as Action;if(!ACTIONS.has(action))return fail("INVALID_ACTION");
 const authClient=createClient(url,anon,{global:{headers:{Authorization:auth}},auth:{persistSession:false}});const {data:ud,error:ue}=await authClient.auth.getUser();if(ue||!ud?.user?.id)return fail("AUTH_INVALID",401);const owner=ud.user.id;
 const db=createClient(url,service,{auth:{persistSession:false}});
 try{
  if(action==="list_agents"){
   let q=db.from("agent_definitions").select("*").eq("owner_user_id",owner).order("agent_class").order("agent_key");if(body?.status)q=q.eq("status",text(body.status));if(body?.agent_class)q=q.eq("agent_class",text(body.agent_class));const {data,error}=await q;if(error)throw error;return json({ok:true,agents:data??[]});
  }
  if(action==="get_agent"){
   const key=text(body.agent_key);if(!key)return fail("AGENT_KEY_REQUIRED");const {data,error}=await db.from("agent_definitions").select("*").eq("owner_user_id",owner).eq("agent_key",key).maybeSingle();if(error)throw error;if(!data)return fail("NOT_FOUND",404);return json({ok:true,agent:data});
  }
  if(action==="route"){
   const capability=text(body.capability);if(!capability)return fail("CAPABILITY_REQUIRED");let q=db.from("agent_definitions").select("*").eq("owner_user_id",owner).eq("status","active").contains("capabilities",[capability]);if(body?.brand_id){if(!UUID.test(body.brand_id))return fail("INVALID_BRAND_ID");q=q.or(`brand_id.eq.${body.brand_id},brand_id.is.null`)}const {data,error}=await q;if(error)throw error;const ranked=(data??[]).sort((a:any,b:any)=>{const ax=a.agent_class==="worker"?0:a.agent_class==="orchestrator"?1:2;const bx=b.agent_class==="worker"?0:b.agent_class==="orchestrator"?1:2;return ax-bx});return json({ok:true,capability,candidates:ranked});
  }
  if(action==="create_run"){
   const key=text(body.agent_key),objective=text(body.objective),trigger=text(body.trigger_type)||"manual";if(!key||!objective)return fail("MISSING_REQUIRED_FIELDS");const {data:agent,error:ae}=await db.from("agent_definitions").select("*").eq("owner_user_id",owner).eq("agent_key",key).eq("status","active").maybeSingle();if(ae)throw ae;if(!agent)return fail("AGENT_NOT_ACTIVE",404);const brand=body?.brand_id??agent.brand_id??null;if(brand&&!UUID.test(brand))return fail("INVALID_BRAND_ID");const parent=body?.parent_run_id??null;if(parent&&!UUID.test(parent))return fail("INVALID_PARENT_RUN_ID");const idem=text(body.idempotency_key)||null;const payload={owner_user_id:owner,agent_definition_id:agent.id,brand_id:brand,parent_run_id:parent,trigger_type:trigger,source_type:text(body.source_type)||null,source_id:text(body.source_id)||null,objective,status:"queued",priority:clamp(body.priority,0,100,50),idempotency_key:idem,context:body?.context&&typeof body.context==="object"?body.context:{}};let res:any;if(idem)res=await db.from("agent_runs").upsert(payload,{onConflict:"owner_user_id,idempotency_key",ignoreDuplicates:true}).select("*").maybeSingle();else res=await db.from("agent_runs").insert(payload).select("*").single();if(res.error)throw res.error;let run=res.data;if(!run&&idem){const g=await db.from("agent_runs").select("*").eq("owner_user_id",owner).eq("idempotency_key",idem).single();if(g.error)throw g.error;run=g.data}return json({ok:true,run,agent:{agent_key:agent.agent_key,name:agent.name}} ,201);
  }
  if(action==="append_event"){
   const runId=text(body.run_id);if(!UUID.test(runId))return fail("INVALID_RUN_ID");const {data:run,error:re}=await db.from("agent_runs").select("id,owner_user_id").eq("id",runId).eq("owner_user_id",owner).maybeSingle();if(re)throw re;if(!run)return fail("NOT_FOUND",404);const {data:last}=await db.from("agent_run_events").select("sequence").eq("run_id",runId).order("sequence",{ascending:false}).limit(1).maybeSingle();const sequence=Number.isInteger(body?.sequence)?body.sequence:(Number(last?.sequence)||0)+1;const {data,error}=await db.from("agent_run_events").insert({owner_user_id:owner,run_id:runId,sequence,event_type:text(body.event_type)||"progress",message:text(body.message)||null,user_visible:body?.user_visible!==false,safe_metadata:body?.safe_metadata&&typeof body.safe_metadata==="object"?body.safe_metadata:{}}).select("*").single();if(error)throw error;return json({ok:true,event:data},201);
  }
  if(action==="update_run"){
   const runId=text(body.run_id);if(!UUID.test(runId))return fail("INVALID_RUN_ID");const allowed=new Set(["queued","running","waiting_review","blocked","succeeded","failed","cancelled"]);const status=text(body.status);if(!allowed.has(status))return fail("INVALID_STATUS");const patch:any={status,updated_at:new Date().toISOString()};if(status==="running")patch.started_at=body?.started_at??new Date().toISOString();if(["succeeded","failed","cancelled"].includes(status))patch.completed_at=body?.completed_at??new Date().toISOString();if(body?.output&&typeof body.output==="object")patch.output=body.output;if(body?.error_code)patch.error_code=text(body.error_code);if(body?.error_message)patch.error_message=text(body.error_message).slice(0,2000);const {data,error}=await db.from("agent_runs").update(patch).eq("id",runId).eq("owner_user_id",owner).select("*").maybeSingle();if(error)throw error;if(!data)return fail("NOT_FOUND",404);return json({ok:true,run:data});
  }
  if(action==="list_runs"){
   let q=db.from("agent_runs").select("*,agent_definitions(agent_key,name,agent_class)").eq("owner_user_id",owner).order("created_at",{ascending:false}).limit(clamp(body.limit,1,100,25));if(body?.status)q=q.eq("status",text(body.status));if(body?.agent_key){const {data:a,error:ae}=await db.from("agent_definitions").select("id").eq("owner_user_id",owner).eq("agent_key",text(body.agent_key)).maybeSingle();if(ae)throw ae;if(!a)return json({ok:true,runs:[]});q=q.eq("agent_definition_id",a.id)}const {data,error}=await q;if(error)throw error;return json({ok:true,runs:data??[]});
  }
  return fail("INVALID_ACTION");
 }catch(e:any){return fail("CONTROL_PLANE_FAILED",500,String(e?.message??e).slice(0,1500))}
});