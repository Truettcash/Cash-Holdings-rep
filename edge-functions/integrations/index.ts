Library
/
index_instagram_start.ts


// Supabase Edge Function: integrations
// Routes:
// - GET /health
// - GET /connect/youtube
// - POST /connect/youtube/start
// - GET /callback/youtube (current deployed behavior remains a 501 placeholder)
// - POST /connect/instagram/start
// - OPTIONS

import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SECRET_KEYS_RAW = Deno.env.get("SUPABASE_SECRET_KEYS");
const INTEGRATION_STATE_SECRET = Deno.env.get("INTEGRATION_STATE_SECRET");

const GOOGLE_OAUTH_CLIENT_ID = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID");
const GOOGLE_OAUTH_CLIENT_SECRET = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET");
const INSTAGRAM_APP_ID = Deno.env.get("INSTAGRAM_APP_ID");

if (!SUPABASE_URL) throw new Error("SUPABASE_URL is required");
if (!SUPABASE_SECRET_KEYS_RAW) throw new Error("SUPABASE_SECRET_KEYS is required");
if (!INTEGRATION_STATE_SECRET) throw new Error("INTEGRATION_STATE_SECRET is required");
if (!GOOGLE_OAUTH_CLIENT_ID) throw new Error("GOOGLE_OAUTH_CLIENT_ID is required");
if (!GOOGLE_OAUTH_CLIENT_SECRET) throw new Error("GOOGLE_OAUTH_CLIENT_SECRET is required");
if (!INSTAGRAM_APP_ID) throw new Error("INSTAGRAM_APP_ID is required");

const secretKeys = JSON.parse(SUPABASE_SECRET_KEYS_RAW);
const serviceRoleKey =
  secretKeys?.service_role ??
  secretKeys?.serviceRole ??
  secretKeys?.supabase_service_role ??
  secretKeys?.sb_service_role ??
  Object.entries(secretKeys).find(([key]) =>
    key.toLowerCase().includes("service_role") ||
    key.toLowerCase().includes("service-role")
  )?.[1];

if (!serviceRoleKey) {
  throw new Error("Service role key not found in SUPABASE_SECRET_KEYS");
}

const supabaseAdmin = createClient(SUPABASE_URL, serviceRoleKey, {
  auth: { persistSession: false },
});

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
};

function jsonError(code: string, status: number) {
  return new Response(JSON.stringify({ error: code }), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json",
    },
  });
}

function jsonOk(data: unknown) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json",
    },
  });
}

function base64UrlEncode(bytes: Uint8Array) {
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecodeToBytes(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/") +
    "===".slice((value.length + 3) % 4);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

function hexLower(bytes: Uint8Array) {
  let output = "";
  for (const byte of bytes) {
    output += byte.toString(16).padStart(2, "0");
  }
  return output;
}

async function sha256HexLowerFromBytes(input: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", input);
  return hexLower(new Uint8Array(digest));
}

async function hmacSha256Base64Url(secret: string, message: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message),
  );

  return base64UrlEncode(new Uint8Array(signature));
}

function getBearerToken(req: Request): string | null {
  const authorization = req.headers.get("Authorization");
  if (!authorization) return null;

  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

function randomNonceB64Url(lengthBytes = 32) {
  const nonceBytes = new Uint8Array(lengthBytes);
  crypto.getRandomValues(nonceBytes);
  return base64UrlEncode(nonceBytes);
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    .test(value);
}

type AuthUrlResult =
  | { ok: true; authorization_url: string }
  | {
    ok: false;
    error:
      | "CHANNEL_NOT_FOUND"
      | "CHANNEL_PROVIDER_MISMATCH"
      | "CHANNEL_ARCHIVED"
      | "OAUTH_STATE_CREATE_FAILED";
  };

async function buildYoutubeAuthUrl(params: {
  userId: string;
  channelId: string;
}): Promise<AuthUrlResult> {
  const { data: channelRows, error: channelError } = await supabaseAdmin
    .from("channels")
    .select("id, provider, archived_at, brand_id, brands:brands(owner_user_id)")
    .eq("id", params.channelId)
    .maybeSingle();

  if (channelError || !channelRows) {
    return { ok: false, error: "CHANNEL_NOT_FOUND" };
  }

  const row = channelRows as any;
  if (!row?.brands?.owner_user_id || row.brands.owner_user_id !== params.userId) {
    return { ok: false, error: "CHANNEL_NOT_FOUND" };
  }
  if (row.provider !== "youtube") {
    return { ok: false, error: "CHANNEL_PROVIDER_MISMATCH" };
  }
  if (row.archived_at !== null) {
    return { ok: false, error: "CHANNEL_ARCHIVED" };
  }

  const nonce = randomNonceB64Url(32);
  const nonceHash = await sha256HexLowerFromBytes(
    base64UrlDecodeToBytes(nonce),
  );

  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + 10 * 60 * 1000);

  const payload = {
    version: 1,
    user_id: params.userId,
    channel_id: row.id,
    provider: "youtube",
    nonce,
    issued_at: issuedAt.toISOString(),
    expires_at: expiresAt.toISOString(),
  };

  const payloadBase64 = base64UrlEncode(
    new TextEncoder().encode(JSON.stringify(payload)),
  );
  const signature = await hmacSha256Base64Url(
    INTEGRATION_STATE_SECRET,
    payloadBase64,
  );
  const signedState = `${payloadBase64}.${signature}`;

  const { error: insertError } = await supabaseAdmin
    .from("integration_oauth_states")
    .insert({
      nonce_hash: nonceHash,
      user_id: params.userId,
      channel_id: row.id,
      provider: "youtube",
      expires_at: expiresAt.toISOString(),
    });

  if (insertError) {
    return { ok: false, error: "OAUTH_STATE_CREATE_FAILED" };
  }

  const redirectUri =
    "https://ldijllskwwmyhhbzspmb.supabase.co/functions/v1/integrations/callback/youtube";
  const googleScopes = [
    "https://www.googleapis.com/auth/youtube.readonly",
    "https://www.googleapis.com/auth/yt-analytics.readonly",
  ];

  const authorizationUrl = new URL(
    "https://accounts.google.com/o/oauth2/v2/auth",
  );
  authorizationUrl.searchParams.set("client_id", GOOGLE_OAUTH_CLIENT_ID);
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("access_type", "offline");
  authorizationUrl.searchParams.set("prompt", "consent");
  authorizationUrl.searchParams.set("include_granted_scopes", "true");
  authorizationUrl.searchParams.set("state", signedState);
  authorizationUrl.searchParams.set("scope", googleScopes.join(" "));
  authorizationUrl.searchParams.set("redirect_uri", redirectUri);

  return { ok: true, authorization_url: authorizationUrl.toString() };
}

async function buildInstagramAuthUrl(params: {
  userId: string;
  channelId: string;
}): Promise<AuthUrlResult> {
  const { data: channelRows, error: channelError } = await supabaseAdmin
    .from("channels")
    .select("id, provider, archived_at, brand_id, brands:brands(owner_user_id)")
    .eq("id", params.channelId)
    .maybeSingle();

  if (channelError || !channelRows) {
    return { ok: false, error: "CHANNEL_NOT_FOUND" };
  }

  const row = channelRows as any;
  if (!row?.brands?.owner_user_id || row.brands.owner_user_id !== params.userId) {
    return { ok: false, error: "CHANNEL_NOT_FOUND" };
  }
  if (row.provider !== "instagram") {
    return { ok: false, error: "CHANNEL_PROVIDER_MISMATCH" };
  }
  if (row.archived_at !== null) {
    return { ok: false, error: "CHANNEL_ARCHIVED" };
  }

  const nonce = randomNonceB64Url(32);
  const nonceHash = await sha256HexLowerFromBytes(
    base64UrlDecodeToBytes(nonce),
  );

  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + 10 * 60 * 1000);

  const payload = {
    version: 1,
    user_id: params.userId,
    channel_id: row.id,
    provider: "instagram",
    nonce,
    issued_at: issuedAt.toISOString(),
    expires_at: expiresAt.toISOString(),
  };

  const payloadBase64 = base64UrlEncode(
    new TextEncoder().encode(JSON.stringify(payload)),
  );
  const signature = await hmacSha256Base64Url(
    INTEGRATION_STATE_SECRET,
    payloadBase64,
  );
  const signedState = `${payloadBase64}.${signature}`;

  const { error: insertError } = await supabaseAdmin
    .from("integration_oauth_states")
    .insert({
      nonce_hash: nonceHash,
      user_id: params.userId,
      channel_id: row.id,
      provider: "instagram",
      expires_at: expiresAt.toISOString(),
    });

  if (insertError) {
    return { ok: false, error: "OAUTH_STATE_CREATE_FAILED" };
  }

  const redirectUri =
    "https://ldijllskwwmyhhbzspmb.supabase.co/functions/v1/integrations/callback/instagram";
  const instagramScopes = [
    "instagram_business_basic",
    "instagram_business_manage_insights",
  ];

  const authorizationUrl = new URL("https://www.instagram.com/oauth/authorize");
  authorizationUrl.searchParams.set("client_id", INSTAGRAM_APP_ID);
  authorizationUrl.searchParams.set("redirect_uri", redirectUri);
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("state", signedState);
  authorizationUrl.searchParams.set("scope", instagramScopes.join(","));

  return { ok: true, authorization_url: authorizationUrl.toString() };
}

function mapAuthUrlError(result: Exclude<AuthUrlResult, { ok: true }>) {
  if (result.error === "CHANNEL_NOT_FOUND") {
    return jsonError("CHANNEL_NOT_FOUND", 404);
  }
  if (result.error === "CHANNEL_PROVIDER_MISMATCH") {
    return jsonError("CHANNEL_PROVIDER_MISMATCH", 400);
  }
  if (result.error === "CHANNEL_ARCHIVED") {
    return jsonError("CHANNEL_ARCHIVED", 409);
  }
  return jsonError("OAUTH_STATE_CREATE_FAILED", 500);
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const pathname = url.pathname;

    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS,
      });
    }

    if (pathname === "/health" || pathname.endsWith("/health")) {
      if (req.method !== "GET") {
        return new Response(null, {
          status: 405,
          headers: CORS_HEADERS,
        });
      }

      return jsonOk({ ok: true });
    }

    if (req.method === "GET" && pathname.includes("/connect/youtube")) {
      const token = getBearerToken(req);
      if (!token) return jsonError("AUTH_REQUIRED", 401);

      const { data: userData, error: userError } = await supabaseAdmin.auth
        .getUser(token);
      if (userError || !userData?.user) {
        return jsonError("AUTH_INVALID", 401);
      }

      const channelId = url.searchParams.get("channel_id");
      if (!channelId) return jsonError("CHANNEL_ID_REQUIRED", 400);

      const result = await buildYoutubeAuthUrl({
        userId: userData.user.id,
        channelId,
      });
      if (!result.ok) return mapAuthUrlError(result);

      return new Response(null, {
        status: 302,
        headers: {
          ...CORS_HEADERS,
          Location: result.authorization_url,
        },
      });
    }

    if (
      req.method === "POST" &&
      pathname.includes("/connect/youtube/start")
    ) {
      const token = getBearerToken(req);
      if (!token) return jsonError("AUTH_REQUIRED", 401);

      const { data: userData, error: userError } = await supabaseAdmin.auth
        .getUser(token);
      if (userError || !userData?.user) {
        return jsonError("AUTH_INVALID", 401);
      }

      const body = await req.json().catch(() => null);
      const channelId = body?.channel_id;
      if (!channelId || typeof channelId !== "string") {
        return jsonError("CHANNEL_ID_REQUIRED", 400);
      }

      const result = await buildYoutubeAuthUrl({
        userId: userData.user.id,
        channelId,
      });
      if (!result.ok) return mapAuthUrlError(result);

      return jsonOk({ ok: true, authorization_url: result.authorization_url });
    }

    if (
      req.method === "POST" &&
      pathname.includes("/connect/instagram/start")
    ) {
      const token = getBearerToken(req);
      if (!token) return jsonError("AUTH_REQUIRED", 401);

      const { data: userData, error: userError } = await supabaseAdmin.auth
        .getUser(token);
      if (userError || !userData?.user) {
        return jsonError("AUTH_INVALID", 401);
      }

      const body = await req.json().catch(() => null);
      const channelId = body?.channel_id;
      if (
        !channelId ||
        typeof channelId !== "string" ||
        !isUuid(channelId)
      ) {
        return jsonError("CHANNEL_ID_REQUIRED", 400);
      }

      const result = await buildInstagramAuthUrl({
        userId: userData.user.id,
        channelId,
      });
      if (!result.ok) return mapAuthUrlError(result);

      return jsonOk({ ok: true, authorization_url: result.authorization_url });
    }

    if (req.method === "GET" && pathname.includes("/callback/youtube")) {
      return new Response(JSON.stringify({ error: "NOT_IMPLEMENTED" }), {
        status: 501,
        headers: {
          ...CORS_HEADERS,
          "Content-Type": "application/json",
        },
      });
    }

    return new Response(JSON.stringify({ error: "NOT_FOUND" }), {
      status: 404,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "application/json",
      },
    });
  } catch {
    return jsonError("INTERNAL_SERVER_ERROR", 500);
  }
});