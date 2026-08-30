import { createClient } from "npm:@supabase/supabase-js@2.57.4";
// Recovery snapshot: live runtime verifier intentionally omitted from public source control.
const EXPECTED_TOKEN_HASH="__RECOVERY_REDACTED_RUNTIME_TOKEN_SHA256__";
function J(b:any,s=200){return new Response(JSON.stringify(b),{status:s,headers:{"content-type":"application/json","cache-control":"no-store"}})}
async function sha(v:string){const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v));return[...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,"0")).join("")}
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
Deno.serve(async req=>{
  if(req.method!=="POST")return J({ok:false,error:"METHOD_NOT_ALLOWED"},405);
  const supplied=req.headers.get("x-athrty-runtime-token")||"";
  if(!supplied||(await sha(supplied))!==EXPECTED_TOKEN_HASH)return J({ok:false,error:"AUTH_INVALID"},401);
  const su=Deno.env.get("SUPABASE_URL"),anon=Deno.env.get("SUPABASE_ANON_KEY"),service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!su||!anon||!service)return J({ok:false,error:"SERVER_CONFIG_ERROR"},500);
  const b=await req.json().catch(()=>({})),owner=String(b.owner_user_id||"");
  if(!owner)return J({ok:false,error:"OWNER_REQUIRED"},400);
  const admin=createClient(su,service,{auth:{persistSession:false,autoRefreshToken:false}}),ur=await admin.auth.admin.getUserById(owner),email=ur.data?.user?.email;
  if(ur.error||!email)return J({ok:false,error:"OWNER_AUTH_PROFILE_MISSING"},500);
  const ac=createClient(su,anon,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  let access=""; let lastError:any=null; let attempts=0;
  for(let i=0;i<3;i++){
    attempts=i+1;
    const link=await admin.auth.admin.generateLink({type:"magiclink",email});
    const tokenHash=(link.data?.properties as any)?.hashed_token;
    if(link.error||!tokenHash){lastError=link.error?.message||"token_hash_missing";await sleep(120*(i+1));continue;}
    const vr=await ac.auth.verifyOtp({token_hash:tokenHash,type:"email"});
    if(!vr.error&&vr.data?.session?.access_token){access=vr.data.session.access_token;break;}
    lastError=vr.error?.message||"verify_failed";
    await sleep(180*(i+1));
  }
  if(!access)return J({ok:false,error:"RUNTIME_SESSION_FAILED",attempts,detail:lastError},500);
  const target=String(b.target||"factory");
  const endpoint=target==="publisher"?"athrty-framer-publisher":"athrty-preview-factory-run";
  const payload=target==="publisher"
    ? {action:String(b.action||"health"),preview_id:String(b.preview_id||"")}
    : (b.prospect_profile_id?{prospect_profile_id:b.prospect_profile_id,mode:b.mode||undefined}:{});
  const r=await fetch(`${su}/functions/v1/${endpoint}`,{method:"POST",headers:{Authorization:`Bearer ${access}`,"content-type":"application/json"},body:JSON.stringify(payload),signal:AbortSignal.timeout(120000)}),text=await r.text();
  let data:any;try{data=JSON.parse(text)}catch{data={raw:text}}
  return J({ok:r.ok,status:r.status,auth_attempts:attempts,target,result:data},r.ok?200:r.status)
});