import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const headers={"content-type":"application/json","access-control-allow-origin":"*","access-control-allow-headers":"content-type","access-control-allow-methods":"POST,OPTIONS","cache-control":"no-store"};
const J=(b:any,s=200)=>new Response(JSON.stringify(b),{status:s,headers});
const allowed=new Set(["preview_viewed","gallery_opened","gallery_image_selected","service_expanded","review_interaction","social_clicked","cta_clicked","quote_opened","estimate_opened","form_started","lead_submitted","booking_clicked","checkout_clicked","phone_clicked","email_clicked","map_clicked"]);
const conversionEvents=new Set(["quote_opened","estimate_opened","form_started","lead_submitted","booking_clicked","checkout_clicked","phone_clicked","email_clicked"]);
async function sha(s:string){const b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("")}
const clean=(v:any,n=500)=>typeof v==="string"?v.trim().slice(0,n):null;
const validEmail=(v:string|null)=>!v||/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const validPhone=(v:string|null)=>!v||v.replace(/\D/g,"").length>=7;

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return J({ok:true});
  if(req.method!=="POST")return J({ok:false,error:"METHOD_NOT_ALLOWED"},405);
  const body=await req.json().catch(()=>({}));
  const previewId=clean(body.preview_id,80);
  const event=clean(body.event_type,80);
  if(!previewId||!event||!allowed.has(event))return J({ok:false,error:"INVALID_EVENT"},400);
  const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const p=await db.from("prospect_preview_sites").select("id,organization_id,status,slug,industry,prospect_profile_id").eq("id",previewId).maybeSingle();
  if(p.error||!p.data||!["published","sold","ready"].includes(p.data.status))return J({ok:false,error:"PREVIEW_NOT_ACTIVE"},404);

  const ip=(req.headers.get("x-forwarded-for")||"").split(",")[0].trim();
  const visitor=ip?await sha(ip+"|"+(req.headers.get("user-agent")||"")):null;
  if(visitor){
    const since=new Date(Date.now()-15*60*1000).toISOString();
    const rate=await db.from("prospect_preview_events").select("id",{count:"exact",head:true}).eq("visitor_hash",visitor).gte("occurred_at",since);
    if((rate.count||0)>80)return J({ok:false,error:"RATE_LIMITED"},429);
  }

  const meta:any={};
  for(const k of ["target","source","utm_source","utm_medium","utm_campaign","utm_content","utm_term","referrer","page_url","section","component","variant"]){const v=clean(body[k],400);if(v)meta[k]=v;}
  if(body.metadata&&typeof body.metadata==="object")meta.client=body.metadata;
  const sessionId=clean(body.session_id,100);

  const ins=await db.from("prospect_preview_events").insert({preview_site_id:previewId,organization_id:p.data.organization_id,event_type:event,session_id:sessionId,visitor_hash:visitor,metadata:meta}).select("id").single();
  if(ins.error)return J({ok:false,error:"EVENT_WRITE_FAILED"},500);

  if(event!=="lead_submitted")return J({ok:true,event_id:ins.data.id,conversion:conversionEvents.has(event)});

  if(clean(body.website,100))return J({ok:true,accepted:true});
  const name=clean(body.name,120);
  const email=clean(body.email,240)?.toLowerCase()||null;
  const phone=clean(body.phone,80);
  const details=clean(body.project_details,3000);
  if((!email&&!phone)||!details||details.length<8)return J({ok:false,error:"LEAD_FIELDS_REQUIRED"},400);
  if(!validEmail(email)||!validPhone(phone))return J({ok:false,error:"INVALID_CONTACT"},400);

  const org=await db.from("organizations").select("name").eq("id",p.data.organization_id).maybeSingle();
  const scoreBase=20+(email?20:0)+(phone?15:0)+(details.length>=25?15:0)+(details.length>=80?10:0)+(/estimate|quote|price|cost|install|replace|repair|project|commercial|residential|schedule|timeline/i.test(details)?15:0)+(/asap|urgent|this week|this month|ready|start/i.test(details)?10:0)+5;
  const score=Math.min(100,scoreBase);
  const priority=score>=80?"urgent":score>=65?"high":score>=45?"normal":"low";
  const followMinutes=score>=80?5:score>=65?15:score>=45?60:240;
  const followAt=new Date(Date.now()+followMinutes*60*1000).toISOString();
  const raw={name,email,phone,project_details:details,preview_id:previewId,preview_slug:p.data.slug,session_id:sessionId,attribution:meta};

  const eng=await db.from("engagements").insert({
    brand_key:"authority-systems",submission_type:"preview_lead",schema_version:"2.0",status:"new",pipeline_stage:"lead",
    source:"website_preview",entry_point:p.data.slug,funnel_key:"preview_to_quote",intake_mode:"quick",project_type:p.data.industry,
    company_name:org.data?.name||null,contact_name:name,email,phone,qualification_score:score,
    qualification_details:{priority,source:"preview",intent_event:"lead_submitted"},raw_submission:raw,
    metadata:{preview_site_id:previewId,organization_id:p.data.organization_id,prospect_profile_id:p.data.prospect_profile_id,attribution:meta},
    next_action:score>=65?"Respond to lead now":"Review and respond to lead",follow_up_at:followAt
  }).select("id").single();
  if(eng.error)return J({ok:false,error:"LEAD_ROUTE_FAILED",event_id:ins.data.id},500);
  await db.from("engagement_events").insert({engagement_id:eng.data.id,event_type:"lead_captured",actor_type:"system",source:"athrty-preview-telemetry",metadata:{preview_site_id:previewId,score,priority,event_id:ins.data.id}});

  return J({ok:true,event_id:ins.data.id,engagement_id:eng.data.id,lead_score:score,priority,follow_up_at:followAt,acknowledgment:"Thanks — your request was received. The team has the project details and contact information."});
});