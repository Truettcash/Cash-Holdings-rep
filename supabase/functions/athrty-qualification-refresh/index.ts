import { createClient } from "npm:@supabase/supabase-js@2.57.4";

// Recovery snapshot: live verifier omitted from public source control.
const EXPECTED_TOKEN_HASH = "__RECOVERY_REDACTED_RUNTIME_TOKEN_SHA256__";
const PROMOTION_VERSION = "athrty-policy-promotion-v1";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
function fail(code: string, status = 400, detail?: unknown) {
  return json({ ok: false, error: { code, detail: detail ?? null } }, status);
}
function txt(v: unknown) { return typeof v === "string" ? v.trim() : ""; }
function num(v: unknown) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
async function sha256(v: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v));
  return [...new Uint8Array(d)].map(x => x.toString(16).padStart(2, "0")).join("");
}
async function post(url: string, token: string, body: unknown) {
  const r = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: await r.json().catch(() => null) };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return fail("METHOD_NOT_ALLOWED", 405);

  const supplied = req.headers.get("x-athrty-runtime-token") ?? "";
  if (!supplied || (await sha256(supplied)) !== EXPECTED_TOKEN_HASH) return fail("AUTH_INVALID", 401);

  const su = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!su || !anon || !service) return fail("SERVER_CONFIG_ERROR", 500);

  let body: any;
  try { body = await req.json(); } catch { return fail("INVALID_JSON"); }
  const owner = txt(body?.owner_user_id);
  if (!owner) return fail("OWNER_REQUIRED");
  const limit = Math.min(10, Math.max(1, Number(body?.limit) || 5));
  const staleMinutes = Math.min(720, Math.max(15, Number(body?.stale_minutes) || 60));

  const db = createClient(su, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const leaseKey = `outbound_seed:${owner}`;
  const leaseToken = crypto.randomUUID();
  const claim = await db.rpc("try_claim_athrty_runtime_lease", {
    p_lease_key: leaseKey,
    p_owner_token: leaseToken,
    p_ttl_seconds: 180,
  });
  if (claim.error) return fail("REFRESH_LEASE_CLAIM_FAILED", 500, claim.error.message);
  if (claim.data !== true) return json({ ok: true, coalesced: true, selected: 0, promoted: 0, composed: 0 });

  try {
    const admin = createClient(su, service, { auth: { persistSession: false, autoRefreshToken: false } });
    const ur = await admin.auth.admin.getUserById(owner);
    const email = ur.data?.user?.email;
    if (ur.error || !email) return fail("OWNER_AUTH_PROFILE_MISSING", 500, ur.error?.message);

    const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
    const tokenHash = (link.data?.properties as any)?.hashed_token;
    if (link.error || !tokenHash) return fail("RUNTIME_SESSION_LINK_FAILED", 500, link.error?.message);

    const ac = createClient(su, anon, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    const vr = await ac.auth.verifyOtp({ token_hash: tokenHash, type: "email" });
    if (vr.error || !vr.data?.session?.access_token) return fail("RUNTIME_SESSION_FAILED", 500, vr.error?.message);
    const access = vr.data.session.access_token;

    const staleBefore = new Date(Date.now() - staleMinutes * 60_000).toISOString();
    const q = await db.from("prospect_profiles")
      .select("id,prospect_tier,commercial_priority_score,updated_at")
      .eq("owner_user_id", owner)
      .eq("score_version", "cashos-prospect-v2")
      .eq("suppress_outreach", false)
      .not("website", "is", null)
      .gte("commercial_priority_score", 45)
      .lt("updated_at", staleBefore)
      .order("commercial_priority_score", { ascending: false })
      .order("updated_at", { ascending: true })
      .limit(limit);
    if (q.error) return fail("REFRESH_READ_FAILED", 500, q.error.message);

    const rows: any[] = [];
    for (const candidate of q.data || []) {
      const pid = candidate.id;
      try {
        const enrich = await post(`${su}/functions/v1/prospect-profile-enrich`, access, { prospect_profile_id: pid, public_sources: [] });
        const score = await post(`${su}/functions/v1/prospect-score-v2`, access, { prospect_profile_id: pid });
        if (!(score.status >= 200 && score.status < 300 && score.body?.ok)) {
          rows.push({ prospect_profile_id: pid, ok: false, stage: "score", error: score.body?.error ?? score.body });
          continue;
        }

        const pr = await db.from("prospect_profiles").select("*").eq("id", pid).eq("owner_user_id", owner).maybeSingle();
        if (pr.error || !pr.data) {
          rows.push({ prospect_profile_id: pid, ok: false, stage: "profile_reload", error: pr.error?.message ?? "profile_missing" });
          continue;
        }
        const p: any = pr.data;
        const brandKey = p.best_fit === "truett-cash" ? "truett-cash" : "authority-systems";
        const fit = brandKey === "truett-cash" ? num(p.truett_fit_score) : num(p.athrty_fit_score);

        const [policyR, contactsR] = await Promise.all([
          db.from("prospect_outreach_policies").select("*").eq("owner_user_id", owner).eq("brand_key", brandKey).eq("active", true).maybeSingle(),
          db.from("prospect_contact_candidates").select("*").eq("prospect_profile_id", pid).order("outreach_eligible", { ascending: false }).order("contact_quality_score", { ascending: false }).limit(5),
        ]);
        const policy: any = policyR.data || null;
        const contacts: any[] = contactsR.data || [];
        const best = contacts.find((c) => c.outreach_eligible && ["public_site", "verified"].includes(String(c.verification_status))) || null;

        const policyReady = !!policy && !!best
          && !p.suppress_outreach
          && !["suppressed", "disqualified", "converted"].includes(String(p.outreach_status || ""))
          && p.score_version === "cashos-prospect-v2"
          && num(p.data_sufficiency_score) >= 78
          && !p.paid_enrichment_recommended
          && num(p.overall_score) >= num(policy.min_overall_score)
          && fit >= num(policy.min_brand_fit_score)
          && num(p.confidence) >= num(policy.min_confidence)
          && num(p.evidence_quality_score) >= num(policy.min_evidence_quality_score)
          && num(p.source_coverage_count) >= num(policy.min_source_coverage)
          && best.outreach_eligible === true
          && ["public_site", "verified"].includes(String(best.verification_status))
          && num(best.contact_quality_score) >= num(policy.min_contact_quality_score);

        let promoted = false;
        if (policyReady && !["A", "B"].includes(String(p.prospect_tier || "").toUpperCase())) {
          const explanation = {
            ...(p.score_explanation || {}),
            policy_promotion: {
              version: PROMOTION_VERSION,
              brand_key: brandKey,
              prior_tier: p.prospect_tier,
              promoted_tier: "B",
              evaluated_at: new Date().toISOString(),
              core_policy_thresholds: {
                overall: policy.min_overall_score,
                brand_fit: policy.min_brand_fit_score,
                confidence: policy.min_confidence,
                evidence: policy.min_evidence_quality_score,
                sources: policy.min_source_coverage,
                contact: policy.min_contact_quality_score,
                data_sufficiency_floor: 78,
              },
            },
          };
          const up = await db.from("prospect_profiles").update({
            prospect_tier: "B",
            outreach_eligibility: "review_ready",
            score_explanation: explanation,
            updated_at: new Date().toISOString(),
          }).eq("id", pid).eq("owner_user_id", owner);
          if (up.error) throw new Error(`promotion_update_failed:${up.error.message}`);
          promoted = true;
        }

        const account = await post(`${su}/functions/v1/prospect-account-intelligence`, access, { prospect_profile_id: pid });
        const decision = account.body?.decision?.state ?? null;
        let compose: any = null;
        if (decision === "contact") {
          compose = await post(`${su}/functions/v1/prospect-outreach-compose`, access, { prospect_profile_id: pid });
        }

        rows.push({
          prospect_profile_id: pid,
          ok: true,
          enrich_ok: enrich.status >= 200 && enrich.status < 300,
          policy_ready: policyReady,
          promoted,
          brand_key: brandKey,
          decision,
          composed: !!compose?.body?.queue_id,
          queue_id: compose?.body?.queue_id ?? null,
          quality_gate: compose?.body?.quality_gate ?? null,
          red_team: compose?.body?.red_team ?? null,
        });
      } catch (e: any) {
        rows.push({ prospect_profile_id: pid, ok: false, error: String(e?.message || e).slice(0, 900) });
      }
    }

    try { await ac.auth.signOut({ scope: "local" }); } catch {}
    return json({
      ok: true,
      promotion_version: PROMOTION_VERSION,
      stale_minutes: staleMinutes,
      selected: rows.length,
      succeeded: rows.filter((x) => x.ok).length,
      failed: rows.filter((x) => !x.ok).length,
      policy_ready: rows.filter((x) => x.policy_ready).length,
      promoted: rows.filter((x) => x.promoted).length,
      contact_decisions: rows.filter((x) => x.decision === "contact").length,
      composed: rows.filter((x) => x.composed).length,
      rows,
    });
  } finally {
    await db.rpc("release_athrty_runtime_lease", { p_lease_key: leaseKey, p_owner_token: leaseToken });
  }
});
