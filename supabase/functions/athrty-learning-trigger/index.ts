import { createClient } from "npm:@supabase/supabase-js@2.57.4";

// Recovery snapshot: the live SHA-256 verifier is intentionally not committed to the public repository.
const EXPECTED_TOKEN_HASH = "__RECOVERY_REDACTED_RUNTIME_TOKEN_SHA256__";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
function fail(code: string, status = 400, detail?: unknown) {
  return json({ ok: false, error: { code, detail: detail ?? null } }, status);
}
async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return fail("METHOD_NOT_ALLOWED", 405);
  const supplied = req.headers.get("x-athrty-runtime-token") ?? "";
  if (!supplied || (await sha256(supplied)) !== EXPECTED_TOKEN_HASH) return fail("AUTH_INVALID", 401);

  const url = Deno.env.get("SUPABASE_URL");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !service) return fail("SERVER_CONFIG_ERROR", 500);

  let body: any;
  try { body = await req.json(); } catch { return fail("INVALID_JSON"); }
  const owner = typeof body?.owner_user_id === "string" ? body.owner_user_id.trim() : "";
  const brand = typeof body?.brand_id === "string" ? body.brand_id.trim() : "";
  if (!owner || !brand) return fail("OWNER_AND_BRAND_REQUIRED");

  const payload = {
    owner_user_id: owner,
    brand_id: brand,
    window_days: Math.min(365, Math.max(7, Number(body?.window_days) || 90)),
    trigger_type: typeof body?.trigger_type === "string" ? body.trigger_type : "automatic",
    trigger_ref: typeof body?.trigger_ref === "string" ? body.trigger_ref : null,
  };

  const run = fetch(`${url}/functions/v1/learning-cycle`, {
    method: "POST",
    headers: { Authorization: `Bearer ${service}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));

  const result = await run;
  if (result.status < 200 || result.status >= 300 || !result.body?.ok) {
    return fail("LEARNING_CYCLE_FAILED", 502, result.body?.error ?? result.body);
  }
  return json({ ok: true, learning: result.body });
});