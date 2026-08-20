// CASH HOLDINGS — shared integration connector (Deno / Supabase Edge Function).
// Deploy to project ldijllskwwmyhhbzspmb as function name: integrations
//
// Contract: POST { action, provider, ...args }  |  GET /callback?...
// Actions: connect | callback | status | sync | refresh | disconnect
// Tokens are sealed with AES-256-GCM before they touch the database and are
// NEVER included in a response body.
//
// The existing `instagram-integrations` function is preserved and reused:
// instagram requests are forwarded to it rather than reimplemented here.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { openToken, sealToken, signState, verifyState } from "./crypto.ts";

type Provider = "instagram" | "youtube" | "google-analytics" | "ebay";
const PROVIDERS: Provider[] = ["instagram", "youtube", "google-analytics", "ebay"];

// Never construct with a bare `!` at module scope: a missing variable would
// crash the worker at boot (opaque WORKER_ERROR) instead of returning a
// readable error to the caller.
const admin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "https://localhost",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "missing-service-role-key",
  { auth: { persistSession: false } },
);

function missingEnv(): string[] {
  return [
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "INTEGRATION_TOKEN_KEY",
    "INTEGRATION_STATE_SECRET",
    "ALLOWED_ORIGINS",
  ].filter((k) => !Deno.env.get(k));
}

function corsHeaders(origin: string | null) {
  const allowed = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
    .split(",").map((o) => o.trim()).filter(Boolean);
  const allow = origin && allowed.includes(origin) ? origin : (allowed[0] ?? "");
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, content-type, apikey",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    Vary: "Origin",
  };
}

function json(body: unknown, init: ResponseInit & { origin?: string | null } = {}) {
  const { origin, ...rest } = init;
  return new Response(JSON.stringify(body), {
    ...rest,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin ?? null) },
  });
}

/** Owner-only gate: verifies the caller's bearer token and owner role. */
async function requireOwner(req: Request) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const { data } = await admin.auth.getUser(token);
  if (!data.user) return null;
  const { data: isOwner } = await admin.rpc("has_role", {
    _user_id: data.user.id,
    _role: "owner",
  });
  return isOwner === true ? data.user : null;
}

type SafeStatus = {
  provider: Provider;
  connected: boolean;
  accountName: string | null;
  accountUsername: string | null;
  lastSyncedAt: string | null;
  syncStatus: string;
  lastError: string | null;
};

function toSafeStatus(provider: Provider, row: Record<string, unknown> | null): SafeStatus {
  return {
    provider,
    connected: row?.["status"] === "connected",
    accountName: (row?.["account_name"] as string) ?? null,
    accountUsername: (row?.["account_username"] as string) ?? null,
    lastSyncedAt: (row?.["last_synced_at"] as string) ?? null,
    syncStatus: (row?.["status"] as string) ?? "disconnected",
    lastError: (row?.["last_error"] as string) ?? null,
  };
}

async function logEvent(
  accountId: string | null,
  provider: Provider,
  eventType: string,
  metadata: Record<string, unknown> = {},
) {
  await admin.from("integration_events").insert({
    integration_account_id: accountId,
    provider,
    event_type: eventType,
    metadata,
  });
}

// ── Provider adapters ────────────────────────────────────────────────────────

const GOOGLE_SCOPES: Record<string, string[]> = {
  youtube: ["https://www.googleapis.com/auth/yt-analytics.readonly", "https://www.googleapis.com/auth/youtube.readonly"],
  "google-analytics": ["https://www.googleapis.com/auth/analytics.readonly"],
};

function redirectUri(req: Request) {
  return `${new URL(req.url).origin}/functions/v1/integrations?action=callback`;
}

async function googleAuthUrl(req: Request, provider: Provider, brandKey: string | null) {
  const state = await signState({ provider, brandKey });
  const params = new URLSearchParams({
    client_id: Deno.env.get("GOOGLE_OAUTH_CLIENT_ID")!,
    redirect_uri: redirectUri(req),
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    scope: GOOGLE_SCOPES[provider].join(" "),
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

async function googleExchange(req: Request, body: Record<string, string>) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("GOOGLE_OAUTH_CLIENT_ID")!,
      client_secret: Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET")!,
      redirect_uri: redirectUri(req),
      ...body,
    }),
  });
  if (!res.ok) throw new Error(`google_token_exchange_failed:${res.status}`);
  return (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope?: string;
  };
}

/** Instagram stays with the existing, working function. */
/** Delegate to a provider-owned function (instagram-integrations, ebay-integrations). */
async function forwardToProvider(req: Request, fn: string, payload: unknown) {
  const res = await fetch(`${new URL(req.url).origin}/functions/v1/${fn}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: req.headers.get("Authorization") ?? "",
      apikey: req.headers.get("apikey") ?? "",
    },
    body: JSON.stringify(payload),
  });
  return { status: res.status, body: await res.text() };
}

// ── Sync: normalize into metric_definitions / metric_observations ────────────

async function upsertMetric(
  account: Record<string, unknown>,
  metricKey: string,
  displayName: string,
  unit: string,
  aggregation: string,
  observedAt: string,
  value: number,
) {
  const definition = {
    provider: account["provider"],
    brand_key: account["brand_key"],
    channel: (account["account_username"] as string) ?? (account["external_account_id"] as string),
    metric_key: metricKey,
    display_name: displayName,
    unit,
    aggregation_type: aggregation,
    name: displayName,
  };
  const { data: def, error } = await admin
    .from("metric_definitions")
    .upsert(definition, { onConflict: "provider,brand_key,channel,metric_key" })
    .select("id")
    .single();
  if (error) throw error;

  const { error: obsError } = await admin.from("metric_observations").upsert(
    {
      metric_definition_id: def.id,
      observed_at: observedAt,
      value,
      external_account_id: account["external_account_id"],
      source: account["provider"],
      metadata: {},
    },
    { onConflict: "metric_definition_id,observed_at,external_account_id" },
  );
  if (obsError) throw obsError;
  return 1;
}

async function syncYoutube(account: Record<string, unknown>) {
  const accessToken = await openToken(account["access_token_encrypted"] as string);
  const res = await fetch(
    "https://www.googleapis.com/youtube/v3/channels?part=statistics,snippet&mine=true",
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) throw new Error(`youtube_fetch_failed:${res.status}`);
  const payload = (await res.json()) as {
    items?: Array<{ id: string; snippet: { title: string }; statistics: Record<string, string> }>;
  };
  const channel = payload.items?.[0];
  if (!channel) return { received: 0, written: 0 };

  await admin.from("integration_raw_records").upsert(
    {
      integration_account_id: account["id"],
      provider: "youtube",
      record_type: "channel_statistics",
      external_record_id: `${channel.id}:${new Date().toISOString().slice(0, 10)}`,
      observed_at: new Date().toISOString(),
      payload: channel.statistics,
    },
    { onConflict: "provider,record_type,external_record_id" },
  );

  const observedAt = new Date().toISOString();
  let written = 0;
  const metrics: Array<[string, string, string, string]> = [
    ["subscriberCount", "Subscribers", "count", "last_value"],
    ["viewCount", "Lifetime Views", "count", "last_value"],
    ["videoCount", "Videos Published", "count", "last_value"],
  ];
  for (const [key, label, unit, aggregation] of metrics) {
    const raw = channel.statistics[key];
    if (raw === undefined) continue;
    written += await upsertMetric(account, key, label, unit, aggregation, observedAt, Number(raw));
  }
  return { received: metrics.length, written };
}

async function refreshGoogleToken(req: Request, account: Record<string, unknown>) {
  const refresh = account["refresh_token_encrypted"] as string | null;
  if (!refresh) throw new Error("no_refresh_token");
  const tokens = await googleExchange(req, {
    grant_type: "refresh_token",
    refresh_token: await openToken(refresh),
  });
  await admin
    .from("integration_accounts")
    .update({
      access_token_encrypted: await sealToken(tokens.access_token),
      token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      status: "connected",
      last_error: null,
    })
    .eq("id", account["id"]);
  await logEvent(account["id"] as string, account["provider"] as Provider, "token_refreshed");
  return { ...account, access_token_encrypted: await sealToken(tokens.access_token) };
}

async function loadAccount(provider: Provider, brandKey: string | null) {
  let query = admin.from("integration_accounts").select("*").eq("provider", provider);
  if (brandKey) query = query.eq("brand_key", brandKey);
  const { data } = await query.order("updated_at", { ascending: false }).limit(1);
  return data?.[0] ?? null;
}

// ── Router ──────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(origin) });

  const url = new URL(req.url);

  // OAuth callback: browser redirect, no bearer token available.
  if (url.searchParams.get("action") === "callback") {
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const payload = state ? await verifyState(state) : null;
    if (!code || !payload) return new Response("Invalid OAuth state", { status: 400 });
    const provider = payload["provider"] as Provider;
    const brandKey = (payload["brandKey"] as string) ?? null;

    try {
      const tokens = await googleExchange(req, { grant_type: "authorization_code", code });
      let externalId = `${provider}:pending`;
      let accountName: string | null = null;
      let accountUsername: string | null = null;

      if (provider === "youtube") {
        const res = await fetch(
          "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
          { headers: { Authorization: `Bearer ${tokens.access_token}` } },
        );
        const body = (await res.json()) as {
          items?: Array<{ id: string; snippet: { title: string; customUrl?: string } }>;
        };
        const channel = body.items?.[0];
        if (channel) {
          externalId = channel.id;
          accountName = channel.snippet.title;
          accountUsername = channel.snippet.customUrl ?? null;
        }
      }

      const { data: row } = await admin
        .from("integration_accounts")
        .upsert(
          {
            provider,
            brand_key: brandKey,
            external_account_id: externalId,
            account_name: accountName,
            account_username: accountUsername,
            status: "connected",
            scopes: tokens.scope?.split(" ") ?? null,
            access_token_encrypted: await sealToken(tokens.access_token),
            refresh_token_encrypted: tokens.refresh_token
              ? await sealToken(tokens.refresh_token)
              : null,
            token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
            last_error: null,
          },
          { onConflict: "provider,external_account_id" },
        )
        .select("id")
        .single();

      await logEvent(row?.id ?? null, provider, "account_connected", { brand_key: brandKey });
      const redirect = (Deno.env.get("ALLOWED_ORIGINS") ?? "").split(",")[0]?.trim();
      return new Response(null, {
        status: 302,
        headers: { Location: `${redirect}/integrations?connected=${provider}` },
      });
    } catch (error) {
      await logEvent(null, provider, "connect_failed", { message: String(error) });
      return new Response("OAuth exchange failed", { status: 400 });
    }
  }

  // The `action=health` diagnostic is owner-only; it is handled after the
  // owner gate below so a merely signed-in user cannot enumerate configuration.
  const owner = await requireOwner(req);
  if (!owner) return json({ error: "forbidden" }, { status: 403, origin });

  // Wiring diagnostic: reports which server-side variables are still missing.
  // Never returns a secret value — variable names only.
  if (url.searchParams.get("action") === "health") {
    return json(
      { ok: missingEnv().length === 0, missingEnv: missingEnv(), providers: PROVIDERS },
      { origin },
    );
  }

  let body: { action?: string; provider?: Provider; brandKey?: string | null } = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_body" }, { status: 400, origin });
  }

  const provider = body.provider as Provider;
  if (!PROVIDERS.includes(provider)) {
    return json({ error: "unsupported_provider" }, { status: 400, origin });
  }
  const brandKey = body.brandKey ?? null;

  // Providers with a dedicated function own their whole lifecycle.
  const delegated: Partial<Record<Provider, string>> = {
    instagram: "instagram-integrations",
    ebay: "ebay-integrations",
  };
  if (delegated[provider]) {
    const forwarded = await forwardToProvider(req, delegated[provider]!, body);
    return new Response(forwarded.body, {
      status: forwarded.status,
      headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
    });
  }

  switch (body.action) {
    case "health":
      return json(
        { ok: missingEnv().length === 0, missingEnv: missingEnv(), providers: PROVIDERS },
        { origin },
      );

    case "connect": {
      return json({ authorizationUrl: await googleAuthUrl(req, provider, brandKey) }, { origin });
    }

    case "status": {
      const account = await loadAccount(provider, brandKey);
      return json(toSafeStatus(provider, account), { origin });
    }

    case "refresh": {
      const account = await loadAccount(provider, brandKey);
      if (!account) return json({ error: "not_connected" }, { status: 404, origin });
      await refreshGoogleToken(req, account);
      return json(toSafeStatus(provider, await loadAccount(provider, brandKey)), { origin });
    }

    case "sync": {
      let account = await loadAccount(provider, brandKey);
      if (!account) return json({ error: "not_connected" }, { status: 404, origin });

      const { data: run } = await admin
        .from("integration_sync_runs")
        .insert({
          integration_account_id: account["id"],
          provider,
          sync_type: "incremental",
          status: "running",
        })
        .select("id")
        .single();

      try {
        const expires = account["token_expires_at"] as string | null;
        if (expires && new Date(expires).getTime() < Date.now() + 60_000) {
          account = await refreshGoogleToken(req, account);
        }
        const result =
          provider === "youtube"
            ? await syncYoutube(account)
            : { received: 0, written: 0 };

        await admin
          .from("integration_sync_runs")
          .update({
            status: "succeeded",
            completed_at: new Date().toISOString(),
            records_received: result.received,
            records_written: result.written,
          })
          .eq("id", run?.id);
        await admin
          .from("integration_accounts")
          .update({ last_synced_at: new Date().toISOString(), last_error: null })
          .eq("id", account["id"]);
        await logEvent(account["id"] as string, provider, "sync_succeeded", result);
        return json(
          { ...toSafeStatus(provider, await loadAccount(provider, brandKey)), ...result },
          { origin },
        );
      } catch (error) {
        const message = String(error).slice(0, 500);
        await admin
          .from("integration_sync_runs")
          .update({
            status: "failed",
            completed_at: new Date().toISOString(),
            error_code: "sync_failed",
            error_message: message,
          })
          .eq("id", run?.id);
        await admin
          .from("integration_accounts")
          .update({ status: "error", last_error: message })
          .eq("id", account["id"]);
        await logEvent(account["id"] as string, provider, "sync_failed", { message });
        return json({ error: "sync_failed" }, { status: 502, origin });
      }
    }

    case "disconnect": {
      const account = await loadAccount(provider, brandKey);
      if (!account) return json({ error: "not_connected" }, { status: 404, origin });
      await admin
        .from("integration_accounts")
        .update({
          status: "disconnected",
          access_token_encrypted: null,
          refresh_token_encrypted: null,
          token_expires_at: null,
        })
        .eq("id", account["id"]);
      await logEvent(account["id"] as string, provider, "account_disconnected");
      return json(toSafeStatus(provider, await loadAccount(provider, brandKey)), { origin });
    }

    default:
      return json({ error: "unknown_action" }, { status: 400, origin });
  }
});