import { createClient } from "npm:@supabase/supabase-js@2.57.4";

// Recovery snapshot: live verifier omitted from public source control.
const EXPECTED_TOKEN_HASH = "__RECOVERY_REDACTED_RUNTIME_TOKEN_SHA256__";
const RELEASE_POLICY = "recipient_local_prime_time_v1";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
function fail(code: string, status = 400, detail?: unknown) { return json({ ok: false, error: { code, detail: detail ?? null } }, status); }
function txt(v: unknown) { return typeof v === "string" ? v.trim() : ""; }
async function sha256(v: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v));
  return [...new Uint8Array(d)].map(x => x.toString(16).padStart(2, "0")).join("");
}
async function post(url: string, token: string, body: unknown) {
  const r = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => null) };
}

const STATE_TZ: Record<string,string> = {
  AL:"America/Chicago", AK:"America/Anchorage", AZ:"America/Phoenix", AR:"America/Chicago",
  CA:"America/Los_Angeles", CO:"America/Denver", CT:"America/New_York", DE:"America/New_York", DC:"America/New_York",
  FL:"America/New_York", GA:"America/New_York", HI:"Pacific/Honolulu", ID:"America/Denver", IL:"America/Chicago",
  IN:"America/Indiana/Indianapolis", IA:"America/Chicago", KS:"America/Chicago", KY:"America/New_York", LA:"America/Chicago",
  ME:"America/New_York", MD:"America/New_York", MA:"America/New_York", MI:"America/Detroit", MN:"America/Chicago",
  MS:"America/Chicago", MO:"America/Chicago", MT:"America/Denver", NE:"America/Chicago", NV:"America/Los_Angeles",
  NH:"America/New_York", NJ:"America/New_York", NM:"America/Denver", NY:"America/New_York", NC:"America/New_York",
  ND:"America/Chicago", OH:"America/New_York", OK:"America/Chicago", OR:"America/Los_Angeles", PA:"America/New_York",
  RI:"America/New_York", SC:"America/New_York", SD:"America/Chicago", TN:"America/Chicago", TX:"America/Chicago",
  UT:"America/Denver", VT:"America/New_York", VA:"America/New_York", WA:"America/Los_Angeles", WV:"America/New_York",
  WI:"America/Chicago", WY:"America/Denver"
};

function localParts(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, weekday:"short", hour:"2-digit", minute:"2-digit", hourCycle:"h23" }).formatToParts(now);
  const get = (t:string) => parts.find(p => p.type === t)?.value || "";
  return { weekday: get("weekday"), hour: Number(get("hour")), minute: Number(get("minute")) };
}
function inRange(m:number, start:number, end:number) { return m >= start && m < end; }
function primeWindow(now: Date, stateRaw: string) {
  const state = stateRaw.trim().toUpperCase();
  const timeZone = STATE_TZ[state];
  if (!timeZone) return { eligible:false, reason:"recipient_timezone_unknown", state, time_zone:null, local:null };
  const p = localParts(now, timeZone);
  const m = p.hour * 60 + p.minute;
  let eligible = false;
  if (p.weekday === "Mon") eligible = inRange(m, 540, 630) || inRange(m, 810, 900);
  else if (["Tue","Wed","Thu"].includes(p.weekday)) eligible = inRange(m, 495, 615) || inRange(m, 795, 900);
  else if (p.weekday === "Fri") eligible = inRange(m, 510, 630);
  const reason = ["Sat","Sun"].includes(p.weekday) ? "weekend_hold" : (eligible ? "prime_window" : "outside_prime_window");
  return { eligible, reason, state, time_zone:timeZone, local:{ weekday:p.weekday, hour:p.hour, minute:p.minute } };
}

Deno.serve(async req => {
  if (req.method !== "POST") return fail("METHOD_NOT_ALLOWED", 405);
  const supplied = req.headers.get("x-athrty-runtime-token") ?? "";
  if (!supplied || (await sha256(supplied)) !== EXPECTED_TOKEN_HASH) return fail("AUTH_INVALID", 401);
  const su = Deno.env.get("SUPABASE_URL"), anon = Deno.env.get("SUPABASE_ANON_KEY"), service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!su || !anon || !service) return fail("SERVER_CONFIG_ERROR", 500);
  let b:any; try { b = await req.json(); } catch { return fail("INVALID_JSON"); }
  if (b?.approve_review === true) return fail("AUTOMATED_APPROVAL_FORBIDDEN", 403, { human_approval_required:true });
  const owner = txt(b?.owner_user_id); if (!owner) return fail("OWNER_REQUIRED");
  const limit = Math.min(3, Math.max(1, Number(b?.limit) || 2));

  const admin = createClient(su, service, { auth: { persistSession:false, autoRefreshToken:false } });
  const ur = await admin.auth.admin.getUserById(owner); const email = ur.data?.user?.email;
  if (ur.error || !email) return fail("OWNER_AUTH_PROFILE_MISSING", 500, ur.error?.message);
  const link = await admin.auth.admin.generateLink({ type:"magiclink", email });
  if (link.error) return fail("RUNTIME_SESSION_LINK_FAILED", 500, link.error.message);
  const tokenHash = (link.data?.properties as any)?.hashed_token; if (!tokenHash) return fail("RUNTIME_TOKEN_HASH_MISSING", 500);
  const ac = createClient(su, anon, { auth: { persistSession:false, autoRefreshToken:false, detectSessionInUrl:false } });
  const vr = await ac.auth.verifyOtp({ token_hash:tokenHash, type:"email" });
  if (vr.error || !vr.data?.session?.access_token) return fail("RUNTIME_SESSION_FAILED", 500, vr.error?.message);
  const access = vr.data.session.access_token;
  const db = createClient(su, service, { auth: { persistSession:false } });

  const now = new Date();
  const nowIso = now.toISOString();
  const q = await db.from("prospect_outreach_queue")
    .select("id,prospect_profile_id,state,policy_passed,human_approved_at,send_after,created_at")
    .eq("owner_user_id", owner)
    .in("state", ["approved", "scheduled"])
    .eq("policy_passed", true)
    .not("human_approved_at", "is", null)
    .or(`send_after.is.null,send_after.lte.${nowIso}`)
    .order("send_after", { ascending:true, nullsFirst:true })
    .order("created_at", { ascending:true })
    .limit(30);
  if (q.error) return fail("SEND_QUEUE_READ_FAILED", 500, q.error.message);

  const eligible:any[] = [];
  const held:any[] = [];
  for (const row of q.data || []) {
    const pr = await db.from("prospect_profiles").select("state,city,canonical_domain,suppress_outreach,outreach_status").eq("id", row.prospect_profile_id).eq("owner_user_id", owner).maybeSingle();
    if (pr.error || !pr.data) { held.push({ queue_id:row.id, reason:"profile_missing" }); continue; }
    if (pr.data.suppress_outreach || pr.data.outreach_status === "suppressed") { held.push({ queue_id:row.id, reason:"suppressed" }); continue; }
    const w = primeWindow(now, txt(pr.data.state));
    if (w.eligible) eligible.push({ row, profile:pr.data, window:w });
    else held.push({ queue_id:row.id, domain:pr.data.canonical_domain, ...w });
  }

  const results:any[] = [];
  for (const x of eligible.slice(0, limit)) {
    const sent = await post(`${su}/functions/v1/prospect-outreach`, access, { action:"send_one", queue_id:x.row.id });
    if (sent.status >= 200 && sent.status < 300 && sent.body?.ok) results.push({ queue_id:x.row.id, ok:true, sent:!!sent.body?.sent, to:sent.body?.to ?? null, sent_at:sent.body?.sent_at ?? null, recipient_window:x.window });
    else results.push({ queue_id:x.row.id, ok:false, status:sent.status, error:sent.body?.error ?? sent.body, recipient_window:x.window });
  }
  try { await ac.auth.signOut({ scope:"local" }); } catch {}
  return json({ ok:true, release_policy:RELEASE_POLICY, human_approval_required:true, candidate_count:(q.data||[]).length, window_eligible:eligible.length, held_count:held.length, held:held.slice(0,20), selected:results.length, sent:results.filter(x=>x.sent).length, failed:results.filter(x=>!x.ok).length, results });
});