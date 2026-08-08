// Cash Holdings — instagram-integrations Edge Function
// Actions: connect | callback | status | sync | disconnect
//
// Deployment notes (external project ldijllskwwmyhhbzspmb):
//   * verify_jwt MUST be false for this function — Meta redirects the browser to
//     ?action=callback with no Supabase JWT. Every non-callback action verifies
//     the caller's bearer token in-function, and callback is authenticated by the
//     HMAC-signed, expiring, single-use OAuth state.
//   * Redirect URI to register in Meta:
//     https://ldijllskwwmyhhbzspmb.supabase.co/functions/v1/instagram-integrations?action=callback
//
// Secrets: INSTAGRAM_APP_ID, INSTAGRAM_APP_SECRET (or INSTAGRAM_CLIENT_SECRET /
// INSTAGRAM_SECRET), INTEGRATION_STATE_SECRET, INTEGRATION_TOKEN_KEY, ALLOWED_ORIGINS,
// SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { sealToken, openToken, signState, verifyState } from "./crypto.ts";

const PROVIDER = "instagram";
const GRAPH = "https://graph.instagram.com/v21.0";
const IG_AUTHORIZE = "https://www.instagram.com/oauth/authorize";
const IG_TOKEN = "https://api.instagram.com/oauth/access_token";
const SCOPES = [
  "instagram_business_basic",
  "instagram_business_manage_insights",
];

// ── CORS: explicit allow-list only, never a wildcard ────────────────────────
const DEFAULT_ORIGINS = [
  "https://truett.cash",
  "https://athrty-sys.framer.website",
  "https://cash-holdings-os.lovable.app",
];

function allowedOrigins(): string[] {
  const configured = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((o) => o.trim().replace(/\/$/, ""))
    .filter(Boolean);
  return Array.from(new Set([...DEFAULT_ORIGINS, ...configured]));
}

function corsHeaders(origin: string | null) {
  const list = allowedOrigins();
  const clean = (origin ?? "").replace(/\/$/, "");
  const allow =
    list.includes(clean) || /^https:\/\/[a-z0-9-]+\.lovable\.app$/.test(clean) ? clean : "";
  const headers: Record<string, string> = {
    Vary: "Origin",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Max-Age": "86400",
  };
  if (allow) headers["Access-Control-Allow-Origin"] = allow;
  return headers;
}

function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
  });
}

// ── Clients ────────────────────────────────────────────────────────────────
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;

function admin() {
  return createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
}

function appSecret() {
  const secret =
    Deno.env.get("INSTAGRAM_APP_SECRET") ??
    Deno.env.get("INSTAGRAM_CLIENT_SECRET") ??
    Deno.env.get("INSTAGRAM_SECRET");
  if (!secret) throw new Error("Instagram app secret is not configured");
  return secret;
}

function redirectUri() {
  return `${SUPABASE_URL}/functions/v1/instagram-integrations?action=callback`;
}

/** Verifies the caller's Supabase session; returns the user id or null. */
async function authenticate(req: Request): Promise<{ id: string; email: string | null } | null> {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) return null;
  const anon = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authHeader } },
  });
  const { data, error } = await anon.auth.getUser();
  if (error || !data.user) return null;
  // Owner gate — fail closed: only an explicit `true` authorizes.
  const { data: isOwner, error: roleError } = await anon.rpc("has_role", {
    _user_id: data.user.id,
    _role: "owner",
  });
  if (roleError || isOwner !== true) return null;
  return { id: data.user.id, email: data.user.email ?? null };
}

// ── Events / sync runs ─────────────────────────────────────────────────────
type Db = ReturnType<typeof admin>;

async function logEvent(
  db: Db,
  accountId: string | null,
  eventType: string,
  metadata: Record<string, unknown> = {},
) {
  await db.from("integration_events").insert({
    integration_account_id: accountId,
    provider: PROVIDER,
    event_type: eventType,
    metadata,
  });
}

async function startRun(db: Db, accountId: string | null, syncType: string) {
  const { data } = await db
    .from("integration_sync_runs")
    .insert({
      integration_account_id: accountId,
      provider: PROVIDER,
      sync_type: syncType,
      status: "running",
      started_at: new Date().toISOString(),
    })
    .select("id")
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

async function finishRun(
  db: Db,
  runId: string | null,
  patch: {
    status: "succeeded" | "failed";
    records_received?: number;
    records_written?: number;
    error_code?: string | null;
    error_message?: string | null;
    metadata?: Record<string, unknown>;
  },
) {
  if (!runId) return;
  await db
    .from("integration_sync_runs")
    .update({ ...patch, completed_at: new Date().toISOString() })
    .eq("id", runId);
}

/** Provider errors are logged verbatim server-side, but only summarised outward. */
function safeError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  console.error("[instagram-integrations]", raw);
  if (/token/i.test(raw)) return "Instagram rejected the stored token — reconnect required.";
  if (/permission|scope/i.test(raw)) return "Instagram denied a required permission.";
  if (/INTEGRATION_TOKEN_KEY|secret|not configured|not set/i.test(raw))
    return "Integration is missing server configuration.";
  if (/rate/i.test(raw)) return "Instagram rate limit reached — try again later.";
  return "Instagram sync failed.";
}

// ── Instagram API ──────────────────────────────────────────────────────────
async function graph(path: string, params: Record<string, string>, token: string) {
  const url = new URL(`${GRAPH}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("access_token", token);
  const res = await fetch(url.toString());
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      `Instagram ${path} ${res.status}: ${(body as any)?.error?.message ?? "unknown error"}`,
    );
  }
  return body as Record<string, unknown>;
}

/** Insights differ per account type / granted scopes — a failure is not fatal. */
async function tryGraph(path: string, params: Record<string, string>, token: string) {
  try {
    return await graph(path, params, token);
  } catch (error) {
    console.warn("[instagram-integrations] optional metric unavailable", String(error));
    return null;
  }
}

// ── Metric normalization ───────────────────────────────────────────────────
const METRIC_UNITS: Record<string, string> = {
  followers: "count",
  following: "count",
  media_count: "count",
  reach: "count",
  impressions: "count",
  profile_views: "count",
  website_clicks: "count",
  accounts_engaged: "count",
  engagement: "count",
  post_likes: "count",
  post_comments: "count",
};

/** Resolves the channel row Instagram metrics hang off (brand slug → channel). */
async function resolveChannelId(db: Db, brandKey: string | null, username: string | null) {
  if (!brandKey) return null;
  const { data: brand } = await db
    .from("brands")
    .select("id, name")
    .eq("slug", brandKey)
    .maybeSingle();
  if (!brand) return null;
  const { data: channels } = await db
    .from("channels")
    .select("id, channel_type, name")
    .eq("brand_id", brand.id);
  const existing = (channels ?? []).find((c: any) =>
    String(c.channel_type ?? "").toLowerCase().includes("instagram"),
  );
  if (existing) return existing.id as string;
  const { data: created } = await db
    .from("channels")
    .insert({
      brand_id: brand.id,
      channel_type: "instagram",
      name: username ? `Instagram · @${username}` : "Instagram",
    })
    .select("id")
    .maybeSingle();
  return (created?.id as string | undefined) ?? null;
}

async function metricDefinitionId(
  db: Db,
  brandKey: string | null,
  metricKey: string,
  displayName: string,
) {
  const key = ["instagram", brandKey ?? "unassigned", metricKey].join(".");
  const { data: existing } = await db
    .from("metric_definitions")
    .select("id")
    .eq("key", key)
    .maybeSingle();
  if (existing) return existing.id as string;
  const { data: created, error } = await db
    .from("metric_definitions")
    .insert({
      key,
      name: displayName,
      unit: METRIC_UNITS[metricKey] ?? "count",
      description: `Instagram ${metricKey.replace(/_/g, " ")} (${brandKey ?? "unassigned"})`,
      provider: PROVIDER,
      brand_key: brandKey,
      channel: "instagram",
      metric_key: metricKey,
      display_name: displayName,
      aggregation_type: metricKey === "followers" || metricKey === "media_count" ? "snapshot" : "sum",
    })
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`metric_definitions insert: ${error.message}`);
  return (created?.id as string | undefined) ?? null;
}

type Point = { metricKey: string; label: string; value: number; observedAt: string };

async function writeObservations(
  db: Db,
  points: Point[],
  brandKey: string | null,
  channelId: string | null,
  externalAccountId: string,
) {
  if (!channelId) return 0;
  let written = 0;
  for (const point of points) {
    const definitionId = await metricDefinitionId(db, brandKey, point.metricKey, point.label);
    if (!definitionId) continue;
    const { data: existing } = await db
      .from("metric_observations")
      .select("id")
      .eq("metric_definition_id", definitionId)
      .eq("observed_at", point.observedAt)
      .maybeSingle();
    const row = {
      metric_definition_id: definitionId,
      channel_id: channelId,
      value: point.value,
      observed_at: point.observedAt,
      source: "instagram-integrations",
      external_account_id: externalAccountId,
    };
    const { error } = existing
      ? await db.from("metric_observations").update(row).eq("id", existing.id)
      : await db.from("metric_observations").insert(row);
    if (!error) written += 1;
  }
  return written;
}

// ── Actions ────────────────────────────────────────────────────────────────
async function accountFor(db: Db, brandKey: string | null) {
  let query = db
    .from("integration_accounts")
    .select("*")
    .eq("provider", PROVIDER)
    .order("updated_at", { ascending: false })
    .limit(1);
  query = brandKey ? query.eq("brand_key", brandKey) : query.is("brand_key", null);
  const { data } = await query.maybeSingle();
  return data as Record<string, any> | null;
}

function statusPayload(account: Record<string, any> | null, extra: Record<string, unknown> = {}) {
  return {
    provider: PROVIDER,
    connected: account?.status === "connected",
    accountName: account?.account_name ?? null,
    accountUsername: account?.account_username ?? null,
    accountType: account?.account_type ?? null,
    brandKey: account?.brand_key ?? null,
    lastSyncedAt: account?.last_synced_at ?? null,
    syncStatus: account?.status ?? "disconnected",
    lastError: account?.last_error ?? null,
    ...extra,
  };
}

async function handleConnect(db: Db, userId: string, brandKey: string | null, origin: string) {
  const appId = Deno.env.get("INSTAGRAM_APP_ID");
  if (!appId) throw new Error("INSTAGRAM_APP_ID is not configured");
  const { state, nonce, expiresAt } = await signState({ uid: userId, brand_key: brandKey, origin });
  await logEvent(db, null, "oauth_state_issued", { nonce, brand_key: brandKey, expires_at: expiresAt });

  const url = new URL(IG_AUTHORIZE);
  url.searchParams.set("client_id", appId);
  url.searchParams.set("redirect_uri", redirectUri());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPES.join(","));
  url.searchParams.set("state", state);
  return { authorizationUrl: url.toString(), expiresAt, redirectUri: redirectUri() };
}

function redirectBack(origin: string, params: Record<string, string>) {
  const target = new URL("/integrations", origin);
  for (const [k, v] of Object.entries(params)) target.searchParams.set(k, v);
  return new Response(null, { status: 302, headers: { Location: target.toString() } });
}

async function handleCallback(req: Request, db: Db) {
  const url = new URL(req.url);
  const rawState = url.searchParams.get("state") ?? "";
  const state = await verifyState(rawState);
  const fallbackOrigin = allowedOrigins()[0];
  if (!state) {
    await logEvent(db, null, "connect_failed", { reason: "invalid_or_expired_state" });
    return redirectBack(fallbackOrigin, { integration: PROVIDER, status: "error", reason: "state" });
  }
  if (!allowedOrigins().includes(state.origin)) {
    await logEvent(db, null, "connect_failed", { reason: "unapproved_origin" });
    return redirectBack(fallbackOrigin, { integration: PROVIDER, status: "error", reason: "origin" });
  }

  // Single-use: refuse a nonce that has already been consumed.
  const { data: consumed } = await db
    .from("integration_events")
    .select("id")
    .eq("provider", PROVIDER)
    .eq("event_type", "oauth_state_consumed")
    .contains("metadata", { nonce: state.nonce })
    .maybeSingle();
  if (consumed) {
    await logEvent(db, null, "connect_failed", { reason: "state_replayed" });
    return redirectBack(state.origin, { integration: PROVIDER, status: "error", reason: "replay" });
  }
  await logEvent(db, null, "oauth_state_consumed", { nonce: state.nonce });

  const error = url.searchParams.get("error_description") ?? url.searchParams.get("error");
  const code = url.searchParams.get("code");
  if (error || !code) {
    await logEvent(db, null, "connect_failed", { reason: "provider_denied" });
    return redirectBack(state.origin, { integration: PROVIDER, status: "error", reason: "denied" });
  }

  const runId = await startRun(db, null, "connect");
  try {
    // 1. Short-lived token.
    const form = new FormData();
    form.set("client_id", Deno.env.get("INSTAGRAM_APP_ID")!);
    form.set("client_secret", appSecret());
    form.set("grant_type", "authorization_code");
    form.set("redirect_uri", redirectUri());
    form.set("code", code);
    const tokenRes = await fetch(IG_TOKEN, { method: "POST", body: form });
    const tokenBody = (await tokenRes.json().catch(() => ({}))) as any;
    if (!tokenRes.ok || !tokenBody.access_token) {
      throw new Error(`token exchange ${tokenRes.status}: ${tokenBody?.error_message ?? "failed"}`);
    }

    // 2. Long-lived (60-day) token.
    const longRes = await fetch(
      `${GRAPH}/access_token?grant_type=ig_exchange_token&client_secret=${encodeURIComponent(
        appSecret(),
      )}&access_token=${encodeURIComponent(tokenBody.access_token)}`,
    );
    const longBody = (await longRes.json().catch(() => ({}))) as any;
    const accessToken: string = longBody?.access_token ?? tokenBody.access_token;
    const expiresIn: number = Number(longBody?.expires_in ?? 0);

    // 3. The connected account.
    const me = await graph(
      "/me",
      { fields: "user_id,id,username,account_type,media_count,followers_count,follows_count" },
      accessToken,
    );
    const externalId = String(me.user_id ?? me.id ?? tokenBody.user_id ?? "");
    if (!externalId) throw new Error("Instagram did not return an account id");

    const { data: account, error: upsertError } = await db
      .from("integration_accounts")
      .upsert(
        {
          provider: PROVIDER,
          brand_key: state.brand_key,
          external_account_id: externalId,
          account_name: (me.username as string) ?? null,
          account_username: (me.username as string) ?? null,
          account_type: (me.account_type as string) ?? null,
          status: "connected",
          scopes: SCOPES,
          access_token_encrypted: await sealToken(accessToken),
          token_expires_at: expiresIn
            ? new Date(Date.now() + expiresIn * 1000).toISOString()
            : null,
          metadata: { connected_by: state.uid, media_count: me.media_count ?? null },
          last_error: null,
        },
        { onConflict: "provider,external_account_id" },
      )
      .select("id, brand_key")
      .maybeSingle();
    if (upsertError) throw new Error(`integration_accounts upsert: ${upsertError.message}`);

    await logEvent(db, account?.id ?? null, "account_connected", {
      brand_key: state.brand_key,
      username: me.username ?? null,
      account_type: me.account_type ?? null,
    });
    await finishRun(db, runId, { status: "succeeded", records_received: 1, records_written: 1 });

    // 4. First sync immediately, so the dashboard has data on landing.
    try {
      await runSync(db, account?.id as string);
    } catch (syncError) {
      console.warn("[instagram-integrations] initial sync failed", String(syncError));
    }

    return redirectBack(state.origin, {
      integration: PROVIDER,
      status: "connected",
      brand: state.brand_key ?? "",
    });
  } catch (err) {
    const message = safeError(err);
    await finishRun(db, runId, { status: "failed", error_code: "connect_failed", error_message: message });
    await logEvent(db, null, "connect_failed", { reason: message });
    return redirectBack(state.origin, { integration: PROVIDER, status: "error", reason: "exchange" });
  }
}

/** Pulls every metric the account type + granted scopes actually allow. */
async function runSync(db: Db, accountId: string) {
  const { data: account } = await db
    .from("integration_accounts")
    .select("*")
    .eq("id", accountId)
    .maybeSingle();
  if (!account) throw new Error("Instagram account not found");
  if (!account.access_token_encrypted) throw new Error("No stored token — reconnect required");

  const runId = await startRun(db, accountId, "metrics");
  let received = 0;
  try {
    const token = await openToken(account.access_token_encrypted as string);
    const observedAt = new Date().toISOString();
    const day = observedAt.slice(0, 10);
    const points: Point[] = [];

    // Profile snapshot (always available for business/creator accounts).
    const me = await graph(
      "/me",
      { fields: "user_id,username,account_type,media_count,followers_count,follows_count" },
      token,
    );
    received += 1;
    const push = (metricKey: string, label: string, value: unknown) => {
      if (value === null || value === undefined || Number.isNaN(Number(value))) return;
      points.push({ metricKey, label, value: Number(value), observedAt });
    };
    push("followers", "IG Followers", me.followers_count);
    push("following", "IG Following", me.follows_count);
    push("media_count", "IG Media Count", me.media_count);

    // Account insights — only stored when the platform actually returns them.
    const insights = await tryGraph(
      "/me/insights",
      {
        metric: "reach,profile_views,website_clicks,accounts_engaged",
        period: "day",
        metric_type: "total_value",
        since: day,
        until: day,
      },
      token,
    );
    for (const entry of ((insights?.data as any[]) ?? [])) {
      received += 1;
      const value = entry?.total_value?.value ?? entry?.values?.[0]?.value;
      const name = String(entry?.name ?? "");
      if (!name || value === undefined || value === null) continue;
      push(name, `IG ${String(entry?.title ?? name)}`, value);
    }

    // Post-level performance, aggregated into an engagement point + raw archive.
    const media = await tryGraph(
      "/me/media",
      { fields: "id,caption,media_type,timestamp,permalink,like_count,comments_count", limit: "25" },
      token,
    );
    const mediaRows = ((media?.data as any[]) ?? []);
    received += mediaRows.length;
    if (mediaRows.length) {
      let likes = 0;
      let comments = 0;
      for (const item of mediaRows) {
        likes += Number(item.like_count ?? 0);
        comments += Number(item.comments_count ?? 0);
      }
      push("post_likes", "IG Likes (last 25 posts)", likes);
      push("post_comments", "IG Comments (last 25 posts)", comments);
      push("engagement", "IG Engagement (last 25 posts)", likes + comments);

      await db.from("integration_raw_records").upsert(
        mediaRows.map((item) => ({
          integration_account_id: accountId,
          provider: PROVIDER,
          record_type: "media",
          external_record_id: String(item.id),
          observed_at: item.timestamp ?? observedAt,
          payload: item,
        })),
        { onConflict: "provider,record_type,external_record_id" },
      );
    }

    const channelId = await resolveChannelId(
      db,
      account.brand_key as string | null,
      (me.username as string) ?? null,
    );
    const written = await writeObservations(
      db,
      points,
      account.brand_key as string | null,
      channelId,
      String(account.external_account_id ?? ""),
    );

    await db
      .from("integration_accounts")
      .update({
        last_synced_at: observedAt,
        last_error: channelId ? null : "No Instagram channel resolved for this brand.",
        status: "connected",
        account_username: (me.username as string) ?? account.account_username,
        account_type: (me.account_type as string) ?? account.account_type,
      })
      .eq("id", accountId);

    await finishRun(db, runId, {
      status: "succeeded",
      records_received: received,
      records_written: written,
      metadata: { metrics: points.map((p) => p.metricKey), channel_resolved: Boolean(channelId) },
    });
    await logEvent(db, accountId, "sync_succeeded", { received, written });
    return { received, written };
  } catch (err) {
    const message = safeError(err);
    await finishRun(db, runId, {
      status: "failed",
      records_received: received,
      error_code: "sync_failed",
      error_message: message,
    });
    await db
      .from("integration_accounts")
      .update({ status: "error", last_error: message })
      .eq("id", accountId);
    await logEvent(db, accountId, "sync_failed", { reason: message });
    throw new Error(message);
  }
}

async function handleDisconnect(db: Db, brandKey: string | null) {
  const account = await accountFor(db, brandKey);
  if (!account) return statusPayload(null);
  await db
    .from("integration_accounts")
    .update({
      status: "disconnected",
      access_token_encrypted: null,
      refresh_token_encrypted: null,
      token_expires_at: null,
      last_error: null,
    })
    .eq("id", account.id);
  await logEvent(db, account.id, "account_disconnected", { brand_key: brandKey });
  return statusPayload({ ...account, status: "disconnected" });
}

// ── Router ─────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  const url = new URL(req.url);

  if (req.method === "OPTIONS") {
    const headers = corsHeaders(origin);
    if (!headers["Access-Control-Allow-Origin"]) return new Response("Origin not allowed", { status: 403 });
    return new Response(null, { status: 204, headers });
  }

  const db = admin();

  // Meta redirects the browser here — no JWT, authenticated by signed state.
  if (url.searchParams.get("action") === "callback") {
    return handleCallback(req, db);
  }

  let body: { action?: string; brandKey?: string | null; returnOrigin?: string } = {};
  if (req.method === "POST") body = await req.json().catch(() => ({}));
  const action = body.action ?? url.searchParams.get("action") ?? "status";

  if (!corsHeaders(origin)["Access-Control-Allow-Origin"] && origin) {
    return new Response("Origin not allowed", { status: 403 });
  }

  const user = await authenticate(req);
  if (!user) return json({ error: "Unauthorized" }, 401, origin);

  const brandKey = body.brandKey ?? url.searchParams.get("brandKey") ?? null;

  try {
    switch (action) {
      case "connect": {
        const requested = (body.returnOrigin ?? origin ?? "").replace(/\/$/, "");
        if (!allowedOrigins().includes(requested) && !/^https:\/\/[a-z0-9-]+\.lovable\.app$/.test(requested)) {
          return json({ error: "Return origin is not approved" }, 400, origin);
        }
        return json(await handleConnect(db, user.id, brandKey, requested), 200, origin);
      }
      case "status": {
        const account = await accountFor(db, brandKey);
        return json(statusPayload(account, { redirectUri: redirectUri() }), 200, origin);
      }
      case "sync": {
        const account = await accountFor(db, brandKey);
        if (!account) return json({ error: "Instagram is not connected" }, 409, origin);
        const result = await runSync(db, account.id as string);
        const fresh = await accountFor(db, brandKey);
        return json(statusPayload(fresh, result), 200, origin);
      }
      case "disconnect":
        return json(await handleDisconnect(db, brandKey), 200, origin);
      default:
        return json({ error: `Unknown action: ${action}` }, 400, origin);
    }
  } catch (err) {
    return json({ error: safeError(err) }, 500, origin);
  }
});