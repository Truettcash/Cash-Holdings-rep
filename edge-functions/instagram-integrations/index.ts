/*
  Edge Function: instagram-integrations
  Routes:
    GET    /health
    OPTIONS (CORS preflight)
    POST   /connect/start
    GET    /callback
    POST   /deauthorize (501)
    POST   /data-deletion (501)

  Auth:
    verify_jwt=false (configured by Supabase; handler validates via Authorization Bearer token using Supabase Auth).
*/

import { createHash, randomBytes } from "node:crypto";
import { createClient } from "npm:@supabase/supabase-js@2";

const CHANNEL_SCOPE = [
  "instagram_business_basic",
  "instagram_business_manage_insights",
] as const;

const INSTAGRAM_OAUTH_AUTHORIZE_URL = "https://www.instagram.com/oauth/authorize";
const INSTAGRAM_OAUTH_TOKEN_URL = "https://api.instagram.com/oauth/access_token";
const INSTAGRAM_GRAPH_TOKEN_EXCHANGE_URL = "https://graph.instagram.com/access_token";
const INSTAGRAM_GRAPH_ME_URL = "https://graph.instagram.com/me";

const CALLBACK_URL = `${Deno.env.get("SUPABASE_URL")}/functions/v1/instagram-integrations/callback`;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function corsify(resp: Response) {
  resp.headers.set("Access-Control-Allow-Origin", "*");
  resp.headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  resp.headers.set("Access-Control-Allow-Headers", "authorization, apikey, content-type");
  return resp;
}

function getBearerToken(req: Request) {
  const auth = req.headers.get("Authorization") ?? "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

function sha256Hex(input: string) {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

function isUuid(maybe: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(maybe);
}

async function requireAuthedUser(req: Request): Promise<{ userId: string }> {
  const token = getBearerToken(req);
  if (!token) {
    throw Object.assign(new Error("No active session"), { status: 401, code: "NO_SESSION" });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
  if (!SUPABASE_URL) throw new Error("SUPABASE_URL is required");
  if (!SUPABASE_ANON_KEY) throw new Error("SUPABASE_ANON_KEY is required");

  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    method: "GET",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
    },
  });

  if (!r.ok) {
    throw Object.assign(new Error("Auth required"), { status: 401, code: "AUTH_REQUIRED" });
  }

  const data = await r.json();
  if (!data?.id) {
    throw Object.assign(new Error("Auth invalid"), { status: 401, code: "AUTH_INVALID" });
  }

  return { userId: data.id as string };
}

async function loadChannelAndValidateOwnership(params: {
  channelId: string;
  userId: string;
}) {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL) throw new Error("SUPABASE_URL is required");
  if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required");

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // Join brands to check brands.owner_user_id.
  const { data, error } = await supabaseAdmin
    .from("channels")
    .select(
      "id, brand_id, provider, archived_at, external_account_id, brands:brand_id ( owner_user_id )",
    )
    .eq("id", params.channelId)
    .eq("brands.owner_user_id", params.userId)
    .is("archived_at", null)
    .eq("provider", "instagram")
    .maybeSingle();

  if (error || !data) {
    throw Object.assign(new Error("CHANNEL_NOT_FOUND"), { status: 404, code: "CHANNEL_NOT_FOUND" });
  }

  return data;
}

function getIntegrationStateSecret() {
  const secret = Deno.env.get("INTEGRATION_STATE_SECRET");
  if (!secret) throw new Error("INTEGRATION_STATE_SECRET is required");
  return secret;
}

async function signState(payload: Record<string, unknown>) {
  const secret = getIntegrationStateSecret();
  const enc = new TextEncoder();

  const header = { alg: "HS256", typ: "JWT" };

  const b64u = (obj: unknown) => {
    const json = typeof obj === "string" ? obj : JSON.stringify(obj);
    const bytes = enc.encode(json);
    // @ts-ignore
    const b64 = btoa(String.fromCharCode(...bytes));
    return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  };

  const unsigned = `${b64u(header)}.${b64u(payload)}`;

  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(unsigned));
  const sigBytes = new Uint8Array(sig);

  let binary = "";
  for (const byte of sigBytes) binary += String.fromCharCode(byte);
  // @ts-ignore
  const sigB64 = btoa(binary);
  const sigB64u = sigB64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");

  return `${unsigned}.${sigB64u}`;
}

async function validateSignedState(state: string): Promise<any> {
  const secret = getIntegrationStateSecret();
  const parts = state.split(".");
  if (parts.length !== 3) {
    throw Object.assign(new Error("STATE_REQUIRED"), { status: 400, code: "STATE_REQUIRED" });
  }
  const [h, p, s] = parts;
  const unsigned = `${h}.${p}`;

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );

  const sigBase64 = s.replace(/-/g, "+").replace(/_/g, "/") + "==";
  const sigBytes = Uint8Array.from(atob(sigBase64), (c) => c.charCodeAt(0));

  const ok = await crypto.subtle.verify(
    "HMAC",
    key,
    sigBytes,
    enc.encode(unsigned),
  );

  if (!ok) {
    throw Object.assign(new Error("STATE_REQUIRED"), { status: 400, code: "STATE_REQUIRED" });
  }

  const bodyJson = atob(p.replace(/-/g, "+").replace(/_/g, "/") + "==");
  const body = JSON.parse(bodyJson);

  if (!body?.channel_id || !body?.nonce_hash || !body?.user_id || !body?.exp) {
    throw Object.assign(new Error("STATE_REQUIRED"), { status: 400, code: "STATE_REQUIRED" });
  }

  if (Date.now() > body.exp) {
    throw Object.assign(new Error("STATE_REQUIRED"), { status: 400, code: "STATE_REQUIRED" });
  }

  return body;
}

async function dbRpc<T>(rpcName: string, params: Record<string, unknown>): Promise<T> {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL) throw new Error("SUPABASE_URL is required");
  if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required");

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data, error } = await supabaseAdmin.rpc(rpcName, params as any);
  if (error) throw error;
  return data as T;
}

async function upsertActiveConnection(params: {
  channelId: string;
  providerExternalAccountId: string;
  grantedScopes: string[];
  accessTokenExpiresAt: string | null;
  providerMetadata: Record<string, unknown>;
  credentialRef: string; // Vault UUID string only
}) {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL) throw new Error("SUPABASE_URL is required");
  if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required");

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const payload = {
    channel_id: params.channelId,
    provider: "instagram",
    environment: "production",
    authentication_type: "oauth",
    connection_status: "pending_confirmation",
    provider_external_account_id: params.providerExternalAccountId,
    granted_scopes: params.grantedScopes,
    credential_ref: params.credentialRef,
    access_token_expires_at: params.accessTokenExpiresAt,
    sync_enabled: false,
    archived_at: null,
    provider_metadata: params.providerMetadata,
  };

  const { data: existing } = await supabaseAdmin
    .from("integration_connections")
    .select("id")
    .eq("channel_id", params.channelId)
    .eq("provider", "instagram")
    .maybeSingle();

  if (existing?.id) {
    const { error } = await supabaseAdmin
      .from("integration_connections")
      .update(payload)
      .eq("id", existing.id);
    if (error) throw error;
    return existing.id as string;
  }

  const { data: inserted, error: insErr } = await supabaseAdmin
    .from("integration_connections")
    .insert(payload)
    .select("id")
    .single();
  if (insErr) throw insErr;
  return inserted.id as string;
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const path = url.pathname;

    if (req.method === "OPTIONS") {
      return corsify(new Response(null, { status: 204 }));
    }

    if (req.method === "GET" && path.endsWith("/health")) {
      return jsonResponse({ ok: true });
    }

    if (req.method === "POST" && path.endsWith("/connect/start")) {
      const { userId } = await requireAuthedUser(req);

      const body = await req.json().catch(() => null);
      const channelId = body?.channel_id;

      if (!channelId || typeof channelId !== "string" || !isUuid(channelId)) {
        return jsonResponse({ error: "CHANNEL_NOT_FOUND" }, 404);
      }

      await loadChannelAndValidateOwnership({ channelId, userId });

      const nonce = randomBytes(32).toString("hex");
      const nonceHash = sha256Hex(nonce).toLowerCase();
      const expiresAtMs = Date.now() + 10 * 60 * 1000;

      // Store nonce hash only.
      const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
      const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (!SUPABASE_URL) throw new Error("SUPABASE_URL is required");
      if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required");

      const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false },
      });

      const { error: insertErr } = await supabaseAdmin
        .from("integration_oauth_states")
        .insert({
          nonce_hash: nonceHash,
          user_id: userId,
          channel_id: channelId,
          provider: "instagram",
          expires_at: new Date(expiresAtMs).toISOString(),
        });
      if (insertErr) throw insertErr;

      const signedState = await signState({
        channel_id: channelId,
        nonce_hash: nonceHash,
        user_id: userId,
        exp: expiresAtMs,
        provider: "instagram",
      });

      const authorizeUrl = new URL(INSTAGRAM_OAUTH_AUTHORIZE_URL);
      const appId = Deno.env.get("INSTAGRAM_APP_ID");
      if (!appId) throw new Error("INSTAGRAM_APP_ID is required");

      authorizeUrl.searchParams.set("client_id", appId);
      authorizeUrl.searchParams.set("redirect_uri", CALLBACK_URL);
      authorizeUrl.searchParams.set("response_type", "code");
      authorizeUrl.searchParams.set("state", signedState);
      authorizeUrl.searchParams.set("scope", CHANNEL_SCOPE.join(","));

      return jsonResponse({ ok: true, authorization_url: authorizeUrl.toString() });
    }

    if (req.method === "GET" && path.endsWith("/callback")) {
      const state = url.searchParams.get("state");
      if (!state) return jsonResponse({ error: "STATE_REQUIRED" }, 400);

      const code = url.searchParams.get("code");
      if (!code) return jsonResponse({ error: "MISSING_CODE" }, 400);

      const validated = await validateSignedState(state);
      const channelId = validated.channel_id as string;
      const nonceHash = (validated.nonce_hash as string).toLowerCase();
      const userId = validated.user_id as string;

      // Consume nonce exactly once: public.consume_integration_oauth_state(p_nonce_hash text)
      await dbRpc("consume_integration_oauth_state", { p_nonce_hash: nonceHash });

      await loadChannelAndValidateOwnership({ channelId, userId });

      const INSTAGRAM_APP_ID = Deno.env.get("INSTAGRAM_APP_ID");
      const INSTAGRAM_APP_SECRET = Deno.env.get("INSTAGRAM_APP_SECRET");
      if (!INSTAGRAM_APP_ID || !INSTAGRAM_APP_SECRET) throw new Error("INSTAGRAM OAuth secrets missing");

      // Exchange auth code for short-lived token
      const tokenResp = await fetch(INSTAGRAM_OAUTH_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: INSTAGRAM_APP_ID,
          client_secret: INSTAGRAM_APP_SECRET,
          grant_type: "authorization_code",
          redirect_uri: CALLBACK_URL,
          code,
        }),
      });

      if (!tokenResp.ok) {
        return jsonResponse({ error: "OAUTH_EXCHANGE_FAILED" }, 400);
      }

      const tokenData = await tokenResp.json();
      const shortLivedToken = tokenData?.access_token as string | undefined;
      const expiresIn = tokenData?.expires_in as number | undefined;

      if (!shortLivedToken) return jsonResponse({ error: "OAUTH_EXCHANGE_FAILED" }, 400);

      // Long-lived token exchange
      const longUrl = new URL(INSTAGRAM_GRAPH_TOKEN_EXCHANGE_URL);
      longUrl.searchParams.set("grant_type", "ig_exchange_token");
      longUrl.searchParams.set("client_secret", INSTAGRAM_APP_SECRET);
      longUrl.searchParams.set("access_token", shortLivedToken);

      const longR = await fetch(longUrl.toString());
      if (!longR.ok) return jsonResponse({ error: "LONG_LIVED_EXCHANGE_FAILED" }, 400);

      const longData = await longR.json();
      const longLivedToken = longData?.access_token as string | undefined;
      const longExpiresIn = longData?.expires_in as number | undefined;
      if (!longLivedToken) return jsonResponse({ error: "LONG_LIVED_EXCHANGE_FAILED" }, 400);

      const expiresAtIso = longExpiresIn
        ? new Date(Date.now() + longExpiresIn * 1000).toISOString()
        : null;

      // Retrieve professional account identity
      const meUrl = new URL(INSTAGRAM_GRAPH_ME_URL);
      meUrl.searchParams.set("fields", "id,username,name,profile_picture_url,followers_count,media_count");
      meUrl.searchParams.set("access_token", longLivedToken);

      const meR = await fetch(meUrl.toString());
      if (!meR.ok) return jsonResponse({ error: "ME_LOOKUP_FAILED" }, 400);

      const me = await meR.json();

      // Ensure exactly one professional account. Graph /me returns one object.
      const instagramAccountId = me?.id as string | undefined;
      if (!instagramAccountId) return jsonResponse({ error: "ME_LOOKUP_FAILED" }, 400);

      // Granted scopes handling.
      let grantedScopes: string[] = [...CHANNEL_SCOPE];
      if (tokenData?.scope && Array.isArray(tokenData.scope)) {
        grantedScopes = tokenData.scope.filter((s: any) => typeof s === "string");
      }

      // Store long-lived token encrypted through public.store_integration_credential
      // with exact rpc signature:
      // public.store_integration_credential(p_existing_secret_id uuid, p_secret_payload text, p_secret_name text, p_secret_description text)

      const nowIso = new Date().toISOString();

      const tokenBundle = {
        provider: "instagram",
        access_token: longLivedToken,
        token_type: "bearer",
        scopes: [...CHANNEL_SCOPE],
        access_token_expires_at: expiresAtIso,
        instagram_account_id: instagramAccountId,
        created_at: nowIso,
        updated_at: nowIso,
      };

      const tokenBundleJson = JSON.stringify(tokenBundle);

      // Decide if we need to replace an existing credential
      const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
      const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (!SUPABASE_URL) throw new Error("SUPABASE_URL is required");
      if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required");

      const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false },
      });

      const { data: existingConn } = await supabaseAdmin
        .from("integration_connections")
        .select("id, credential_ref")
        .eq("channel_id", channelId)
        .eq("provider", "instagram")
        .maybeSingle();

      // Existing credential_ref is a Vault UUID string; convert for rpc inputs.
      const existingSecretId = existingConn?.credential_ref ? (existingConn.credential_ref as string) : null;

      // Create new vault credential first
      const secretName = `cash-holdings-instagram-${channelId}`;
      const secretDesc = "Encrypted Instagram OAuth credential for Cash Holdings channel";

      let newSecretId: string | null = null;
      try {
        newSecretId = (await dbRpc<string>("store_integration_credential", {
          p_existing_secret_id: existingSecretId,
          p_secret_payload: tokenBundleJson,
          p_secret_name: secretName,
          p_secret_description: secretDesc,
        })) as unknown as string;

        if (!newSecretId) throw new Error("CREDENTIAL_STORE_FAILED");

        // Update connection to point at NEW credential.
        const providerMetadata = {
          username: me.username,
          name: me.name,
          profile_picture_url: me.profile_picture_url,
          follower_count: me.followers_count,
          media_count: me.media_count,
        };

        const connectionId = await upsertActiveConnection({
          channelId,
          providerExternalAccountId: instagramAccountId,
          grantedScopes,
          accessTokenExpiresAt: expiresAtIso,
          providerMetadata,
          credentialRef: newSecretId,
        });

        // Delete previous vault credential ONLY after update succeeds
        if (existingSecretId && existingSecretId !== newSecretId) {
          await dbRpc("delete_integration_credential", { p_secret_id: existingSecretId });
        }

        return jsonResponse({
          ok: true,
          status: "pending_confirmation",
          connection_id: connectionId,
          channel_id: channelId,
          provider: "instagram",
          provider_account: {
            id: instagramAccountId,
            username: me.username,
            name: me.name,
            profile_picture_url: me.profile_picture_url,
          },
          next_action: "CONFIRM_INSTAGRAM_CONNECTION",
        });
      } catch (err) {
        // Vault cleanup on any failure AFTER creating a new Vault credential
        if (newSecretId) {
          try {
            await dbRpc("delete_integration_credential", { p_secret_id: newSecretId });
          } catch {
            // swallow cleanup errors
          }
        }
        throw err;
      }
    }

    if (req.method === "POST" && path.endsWith("/deauthorize")) {
      return corsify(new Response(null, { status: 501 }));
    }

    if (req.method === "POST" && path.endsWith("/data-deletion")) {
      return corsify(new Response(null, { status: 501 }));
    }

    return corsify(jsonResponse({ error: "NOT_FOUND" }, 404));
  } catch (err) {
    const e = err as any;
    const status = e?.status ?? 400;
    const code = e?.code;

    if (code === "NO_SESSION") return corsify(jsonResponse({ error: "NO_ACTIVE_SESSION" }, 401));
    if (code === "AUTH_REQUIRED" || code === "AUTH_INVALID") return corsify(jsonResponse({ error: "AUTH_REQUIRED" }, 401));
    if (code === "STATE_REQUIRED") return corsify(jsonResponse({ error: "STATE_REQUIRED" }, 400));
    if (code === "CHANNEL_NOT_FOUND") return corsify(jsonResponse({ error: "CHANNEL_NOT_FOUND" }, 404));

    return corsify(jsonResponse({ error: code ?? "INSTAGRAM_CONNECTION_COULD_NOT_BE_STARTED" }, status));
  }
});
