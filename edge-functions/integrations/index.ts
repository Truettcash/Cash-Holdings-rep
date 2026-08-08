// Supabase Edge Function: integrations
// Routes:
// - GET /health
// - GET /connect/youtube
// - POST /connect/youtube/start
// - GET /callback/youtube
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

const YOUTUBE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const YOUTUBE_CHANNELS_ME_URL = "https://www.googleapis.com/youtube/v3/channels";
const YOUTUBE_CALLBACK_URL =
  "https://ldijllskwwmyhhbzspmb.supabase.co/functions/v1/integrations/callback/youtube";
const YOUTUBE_SCOPES = [
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/yt-analytics.readonly",
] as const;

const DEFAULT_ORIGINS = [
  "https://truett.cash",
  "https://athrty-sys.framer.website",
  "https://cash-holdings-os.lovable.app",
];

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

function allowedOrigins(): string[] {
  const configured = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter(Boolean);

  return Array.from(new Set([...DEFAULT_ORIGINS, ...configured]));
}

function originApproved(origin: string): boolean {
  const clean = origin.replace(/\/$/, "");
  return allowedOrigins().includes(clean) || /^https:\/\/[a-z0-9-]+\.lovable\.app$/.test(clean);
}

function requestOrigin(req: Request): string | null {
  const rawOrigin = req.headers.get("origin");
  if (rawOrigin) {
    try {
      const normalized = new URL(rawOrigin).origin;
      return originApproved(normalized) ? normalized : null;
    } catch {
      // ignore malformed origin header
    }
  }

  const referer = req.headers.get("referer");
  if (!referer) return null;

  try {
    const normalized = new URL(referer).origin;
    return originApproved(normalized) ? normalized : null;
  } catch {
    return null;
  }
}

function redirectToIntegrations(params: {
  origin: string;
  status: "connected" | "error";
  reason?: string;
}) {
  const target = new URL("/integrations", params.origin);
  target.searchParams.set("integration", "youtube");
  target.searchParams.set("status", params.status);
  if (params.reason) {
    target.searchParams.set("reason", params.reason);
  }

  return new Response(null, {
    status: 302,
    headers: {
      ...CORS_HEADERS,
      Location: target.toString(),
    },
  });
}

function errorStatusForCode(code: string): number {
  if (
    code === "STATE_REQUIRED" ||
    code === "MISSING_CODE" ||
    code === "INVALID_OR_EXPIRED_STATE" ||
    code === "CHANNEL_PROVIDER_MISMATCH" ||
    code === "OAUTH_EXCHANGE_FAILED" ||
    code === "ME_LOOKUP_FAILED"
  ) {
    return 400;
  }

  if (code === "CHANNEL_NOT_FOUND") return 404;
  if (code === "CHANNEL_ARCHIVED") return 409;
  if (code === "CREDENTIAL_STORE_FAILED" || code === "INTEGRATION_CONNECTION_PERSIST_FAILED") {
    return 500;
  }

  return 400;
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
  returnOrigin: string | null;
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
    return_origin: params.returnOrigin,
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

type SignedStatePayload = {
  version: number;
  user_id: string;
  channel_id: string;
  provider: "youtube";
  return_origin: string | null;
  nonce: string;
  issued_at: string;
  expires_at: string;
};

type ConsumedOauthState = {
  user_id: string;
  channel_id: string;
  provider: string;
  expires_at: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function validateSignedState(state: string): Promise<SignedStatePayload | null> {
  const [payloadBase64, signature] = state.split(".");
  if (!payloadBase64 || !signature || state.split(".").length !== 2) {
    return null;
  }

  const expectedSignature = await hmacSha256Base64Url(
    INTEGRATION_STATE_SECRET,
    payloadBase64,
  );

  if (signature !== expectedSignature) {
    return null;
  }

  let parsed: unknown;
  try {
    const payloadBytes = base64UrlDecodeToBytes(payloadBase64);
    parsed = JSON.parse(new TextDecoder().decode(payloadBytes));
  } catch {
    return null;
  }

  if (!isRecord(parsed)) return null;

  const version = parsed.version;
  const userId = parsed.user_id;
  const channelId = parsed.channel_id;
  const provider = parsed.provider;
  const returnOrigin = parsed.return_origin;
  const nonce = parsed.nonce;
  const issuedAt = parsed.issued_at;
  const expiresAt = parsed.expires_at;

  if (version !== 1) return null;
  if (typeof userId !== "string" || !userId) return null;
  if (typeof channelId !== "string" || !isUuid(channelId)) return null;
  if (provider !== "youtube") return null;
  if (returnOrigin !== null && (typeof returnOrigin !== "string" || !originApproved(returnOrigin))) {
    return null;
  }
  if (typeof nonce !== "string" || !nonce) return null;
  if (typeof issuedAt !== "string" || !issuedAt) return null;
  if (typeof expiresAt !== "string" || !expiresAt) return null;

  const expiresAtMs = Date.parse(expiresAt);
  if (!Number.isFinite(expiresAtMs) || Date.now() > expiresAtMs) return null;

  return {
    version,
    user_id: userId,
    channel_id: channelId,
    provider,
    return_origin: returnOrigin,
    nonce,
    issued_at: issuedAt,
    expires_at: expiresAt,
  };
}

async function consumeValidatedOauthState(
  payload: SignedStatePayload,
): Promise<ConsumedOauthState | null> {
  let nonceBytes: Uint8Array;
  try {
    nonceBytes = base64UrlDecodeToBytes(payload.nonce);
  } catch {
    return null;
  }

  const nonceHash = await sha256HexLowerFromBytes(nonceBytes);
  const { data, error } = await supabaseAdmin.rpc("consume_integration_oauth_state", {
    p_nonce_hash: nonceHash,
  });

  if (error || !Array.isArray(data) || data.length !== 1) {
    return null;
  }

  const consumed = data[0] as ConsumedOauthState;
  if (!consumed) return null;

  if (
    consumed.provider !== "youtube" ||
    consumed.user_id !== payload.user_id ||
    consumed.channel_id !== payload.channel_id
  ) {
    return null;
  }

  const consumedExpiresMs = Date.parse(consumed.expires_at);
  if (!Number.isFinite(consumedExpiresMs) || Date.now() > consumedExpiresMs) {
    return null;
  }

  return consumed;
}

async function upsertYoutubeConnection(params: {
  channelId: string;
  externalAccountId: string | null;
  grantedScopes: string[];
  credentialRef: string;
  accessTokenExpiresAt: string | null;
  refreshTokenExpiresAt: string | null;
  providerMetadata: Record<string, unknown>;
}) {
  const payload = {
    channel_id: params.channelId,
    provider: "youtube",
    environment: "production",
    authentication_type: "oauth",
    connection_status: "pending_confirmation",
    provider_external_account_id: params.externalAccountId,
    granted_scopes: params.grantedScopes,
    credential_ref: params.credentialRef,
    access_token_expires_at: params.accessTokenExpiresAt,
    refresh_token_expires_at: params.refreshTokenExpiresAt,
    sync_enabled: false,
    archived_at: null,
    last_error_code: null,
    last_error_message: null,
    provider_metadata: params.providerMetadata,
  };

  const { data: existing } = await supabaseAdmin
    .from("integration_connections")
    .select("id")
    .eq("channel_id", params.channelId)
    .eq("provider", "youtube")
    .maybeSingle();

  if (existing?.id) {
    const { error } = await supabaseAdmin
      .from("integration_connections")
      .update(payload)
      .eq("id", existing.id);
    if (error) throw error;
    return existing.id as string;
  }

  const { data: inserted, error } = await supabaseAdmin
    .from("integration_connections")
    .insert(payload)
    .select("id")
    .single();

  if (error || !inserted?.id) throw error ?? new Error("CONNECTION_WRITE_FAILED");
  return inserted.id as string;
}

async function dbRpc<T>(rpcName: string, params: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabaseAdmin.rpc(rpcName, params);
  if (error) throw error;
  return data as T;
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
        returnOrigin: requestOrigin(req),
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
        returnOrigin: requestOrigin(req),
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
      const state = url.searchParams.get("state");
      if (!state) return jsonError("STATE_REQUIRED", 400);

      const validated = await validateSignedState(state);
      if (!validated) return jsonError("INVALID_OR_EXPIRED_STATE", 400);

      const returnOrigin = validated.return_origin && originApproved(validated.return_origin)
        ? validated.return_origin
        : null;

      const callbackError = (code: string) => {
        if (returnOrigin) {
          return redirectToIntegrations({
            origin: returnOrigin,
            status: "error",
            reason: code,
          });
        }
        return jsonError(code, errorStatusForCode(code));
      };

      const code = url.searchParams.get("code");
      if (!code) return callbackError("MISSING_CODE");

      const consumed = await consumeValidatedOauthState(validated);
      if (!consumed) return callbackError("INVALID_OR_EXPIRED_STATE");

      const { data: channel, error: channelError } = await supabaseAdmin
        .from("channels")
        .select("id, provider, archived_at, brands:brands(owner_user_id)")
        .eq("id", validated.channel_id)
        .maybeSingle();

      if (channelError || !channel) {
        return callbackError("CHANNEL_NOT_FOUND");
      }

      const channelRow = channel as {
        id: string;
        provider: string;
        archived_at: string | null;
        brands: { owner_user_id: string | null } | null;
      };

      if (!channelRow.brands?.owner_user_id || channelRow.brands.owner_user_id !== validated.user_id) {
        return callbackError("CHANNEL_NOT_FOUND");
      }
      if (channelRow.provider !== "youtube") {
        return callbackError("CHANNEL_PROVIDER_MISMATCH");
      }
      if (channelRow.archived_at !== null) {
        return callbackError("CHANNEL_ARCHIVED");
      }

      const tokenResp = await fetch(YOUTUBE_OAUTH_TOKEN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: GOOGLE_OAUTH_CLIENT_ID,
          client_secret: GOOGLE_OAUTH_CLIENT_SECRET,
          grant_type: "authorization_code",
          code,
          redirect_uri: YOUTUBE_CALLBACK_URL,
        }),
      });

      if (!tokenResp.ok) {
        return callbackError("OAUTH_EXCHANGE_FAILED");
      }

      const tokenData = await tokenResp.json().catch(() => null);
      const accessToken = tokenData?.access_token;
      const refreshToken = tokenData?.refresh_token;
      const tokenType = tokenData?.token_type;
      const expiresIn = typeof tokenData?.expires_in === "number" ? tokenData.expires_in : null;
      const grantedScopes = typeof tokenData?.scope === "string"
        ? tokenData.scope.split(/\s+/).filter((scope: string) => scope.length > 0)
        : [...YOUTUBE_SCOPES];

      if (typeof accessToken !== "string" || !accessToken) {
        return callbackError("OAUTH_EXCHANGE_FAILED");
      }

      const meUrl = new URL(YOUTUBE_CHANNELS_ME_URL);
      meUrl.searchParams.set("part", "id,snippet");
      meUrl.searchParams.set("mine", "true");

      const meResp = await fetch(meUrl.toString(), {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!meResp.ok) {
        return callbackError("ME_LOOKUP_FAILED");
      }

      const meData = await meResp.json().catch(() => null);
      const firstChannel = Array.isArray(meData?.items) ? meData.items[0] : null;
      const youtubeAccountId = typeof firstChannel?.id === "string" ? firstChannel.id : null;

      if (!youtubeAccountId) {
        return callbackError("ME_LOOKUP_FAILED");
      }

      const nowIso = new Date().toISOString();
      const accessTokenExpiresAt = expiresIn
        ? new Date(Date.now() + expiresIn * 1000).toISOString()
        : null;

      const tokenBundle = {
        provider: "youtube",
        access_token: accessToken,
        refresh_token: typeof refreshToken === "string" ? refreshToken : null,
        token_type: typeof tokenType === "string" ? tokenType : "Bearer",
        scopes: grantedScopes,
        access_token_expires_at: accessTokenExpiresAt,
        youtube_channel_id: youtubeAccountId,
        created_at: nowIso,
        updated_at: nowIso,
      };

      const tokenBundleJson = JSON.stringify(tokenBundle);

      const { data: existingConnection } = await supabaseAdmin
        .from("integration_connections")
        .select("id, credential_ref")
        .eq("channel_id", validated.channel_id)
        .eq("provider", "youtube")
        .maybeSingle();

      const existingSecretId =
        typeof existingConnection?.credential_ref === "string" && existingConnection.credential_ref
          ? existingConnection.credential_ref
          : null;

      const secretName = `cash-holdings-youtube-${validated.channel_id}`;
      const secretDescription = "Encrypted YouTube OAuth credential for Cash Holdings channel";

      let newSecretId: string | null = null;

      try {
        newSecretId = await dbRpc<string>("store_integration_credential", {
          p_existing_secret_id: existingSecretId,
          p_secret_payload: tokenBundleJson,
          p_secret_name: secretName,
          p_secret_description: secretDescription,
        });

        if (!newSecretId) {
          return callbackError("CREDENTIAL_STORE_FAILED");
        }

        const providerMetadata = {
          youtube_channel_id: youtubeAccountId,
          title: typeof firstChannel?.snippet?.title === "string" ? firstChannel.snippet.title : null,
          custom_url: typeof firstChannel?.snippet?.customUrl === "string"
            ? firstChannel.snippet.customUrl
            : null,
          state_issued_at: validated.issued_at,
          state_expires_at: validated.expires_at,
        };

        const connectionId = await upsertYoutubeConnection({
          channelId: validated.channel_id,
          externalAccountId: youtubeAccountId,
          grantedScopes,
          credentialRef: newSecretId,
          accessTokenExpiresAt,
          refreshTokenExpiresAt: null,
          providerMetadata,
        });

        if (existingSecretId && existingSecretId !== newSecretId) {
          await dbRpc("delete_integration_credential", { p_secret_id: existingSecretId });
        }

        if (returnOrigin) {
          return redirectToIntegrations({
            origin: returnOrigin,
            status: "connected",
          });
        }

        return jsonOk({
          ok: true,
          status: "pending_confirmation",
          connection_id: connectionId,
          channel_id: validated.channel_id,
          provider: "youtube",
          provider_account: {
            id: youtubeAccountId,
            title: providerMetadata.title,
            custom_url: providerMetadata.custom_url,
          },
          next_action: "CONFIRM_YOUTUBE_CONNECTION",
        });
      } catch {
        if (newSecretId) {
          try {
            await dbRpc("delete_integration_credential", { p_secret_id: newSecretId });
          } catch {
            // swallow cleanup errors
          }
        }
        return callbackError("INTEGRATION_CONNECTION_PERSIST_FAILED");
      }
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