// Cash Holdings — ebay-integrations Edge Function
// Actions: connect | callback | status | sync | disconnect
//
// Deployment notes (external project ldijllskwwmyhhbzspmb):
//   * verify_jwt MUST be false — eBay redirects the browser to the callback with
//     no Supabase JWT. Every non-callback action verifies the caller's bearer
//     token in-function; callback is authenticated by HMAC-signed, expiring,
//     single-use OAuth state.
//   * Accepted redirect URL to register in the eBay developer portal:
//     https://ldijllskwwmyhhbzspmb.supabase.co/functions/v1/ebay-integrations/callback
//     (?action=callback is also accepted by this router.)
//
// Secrets: EBAY_APP_ID (client id), EBAY_CERT_ID (client secret), EBAY_RU_NAME,
// EBAY_ENV ("production" | "sandbox"), INTEGRATION_STATE_SECRET,
// INTEGRATION_TOKEN_KEY, ALLOWED_ORIGINS, SUPABASE_URL, SUPABASE_ANON_KEY,
// SUPABASE_SERVICE_ROLE_KEY.
//
// No eBay credential or token is ever returned to the browser.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { sealToken, openToken, signState, verifyState } from "./crypto.ts";

const PROVIDER = "ebay";
const DEFAULT_BRAND_KEY = "throttle-kings";

function sandbox() {
  return (Deno.env.get("EBAY_ENV") ?? "production").toLowerCase() === "sandbox";
}
const HOSTS = () =>
  sandbox()
    ? { auth: "https://auth.sandbox.ebay.com", api: "https://api.sandbox.ebay.com" }
    : { auth: "https://auth.ebay.com", api: "https://api.ebay.com" };

const SCOPES = [
  "https://api.ebay.com/oauth/api_scope",
  "https://api.ebay.com/oauth/api_scope/sell.inventory.readonly",
  "https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly",
  "https://api.ebay.com/oauth/api_scope/sell.analytics.readonly",
  "https://api.ebay.com/oauth/api_scope/sell.marketing.readonly",
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

function originApproved(origin: string) {
  const clean = (origin ?? "").replace(/\/$/, "");
  return allowedOrigins().includes(clean) || /^https:\/\/[a-z0-9-]+\.lovable\.app$/.test(clean);
}

function corsHeaders(origin: string | null) {
  const clean = (origin ?? "").replace(/\/$/, "");
  const headers: Record<string, string> = {
    Vary: "Origin",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Max-Age": "86400",
  };
  if (clean && originApproved(clean)) headers["Access-Control-Allow-Origin"] = clean;
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
type Db = ReturnType<typeof admin>;

function clientId() {
  const id = Deno.env.get("EBAY_APP_ID") ?? Deno.env.get("EBAY_CLIENT_ID");
  if (!id) throw new Error("EBAY_APP_ID is not configured");
  return id;
}
function clientSecret() {
  const secret = Deno.env.get("EBAY_CERT_ID") ?? Deno.env.get("EBAY_CLIENT_SECRET");
  if (!secret) throw new Error("EBAY_CERT_ID is not configured");
  return secret;
}
/** eBay swaps the literal redirect URL for an RuName in the authorize + token calls. */
function ruName() {
  const ru = Deno.env.get("EBAY_RU_NAME");
  if (!ru) throw new Error("EBAY_RU_NAME is not configured");
  return ru;
}
function callbackUrl() {
  return `${SUPABASE_URL}/functions/v1/ebay-integrations/callback`;
}

/** Verifies the caller's Supabase session + owner role; returns the user or null. */
async function authenticate(req: Request): Promise<{ id: string; email: string | null } | null> {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) return null;
  const anon = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authHeader } },
  });
  const { data, error } = await anon.auth.getUser();
  if (error || !data.user) return null;
  const { data: isOwner, error: roleError } = await anon.rpc("has_role", {
    _user_id: data.user.id,
    _role: "owner",
  });
  // Fail closed: only an explicit `true` authorizes. Any RPC error, null, or
  // non-boolean result is treated as unauthorized.
  if (roleError || isOwner !== true) return null;
  return { id: data.user.id, email: data.user.email ?? null };
}

// ── Events / sync runs ─────────────────────────────────────────────────────
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
  console.error("[ebay-integrations]", raw);
  if (/invalid_grant|token/i.test(raw)) return "eBay rejected the stored token — reconnect required.";
  if (/insufficient|scope|permission/i.test(raw)) return "eBay denied a required permission.";
  if (/EBAY_|INTEGRATION_TOKEN_KEY|not configured|not set/i.test(raw))
    return "eBay integration is missing server configuration.";
  if (/rate|2001/i.test(raw)) return "eBay rate limit reached — try again later.";
  return "eBay sync failed.";
}

// ── eBay API ───────────────────────────────────────────────────────────────
async function ebayGet(path: string, token: string, params: Record<string, string> = {}) {
  const url = new URL(`${HOSTS().api}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (body as any)?.errors?.[0]?.message ?? (body as any)?.message ?? "unknown error";
    throw new Error(`eBay ${path} ${res.status}: ${msg}`);
  }
  return body as Record<string, any>;
}

/** Endpoints vary by account entitlement — an unavailable one is not fatal. */
async function tryGet(path: string, token: string, params: Record<string, string> = {}) {
  try {
    return await ebayGet(path, token, params);
  } catch (error) {
    console.warn("[ebay-integrations] optional endpoint unavailable", String(error));
    return null;
  }
}

async function exchangeToken(form: Record<string, string>) {
  const res = await fetch(`${HOSTS().api}/identity/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${clientId()}:${clientSecret()}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(form).toString(),
  });
  const body = (await res.json().catch(() => ({}))) as any;
  if (!res.ok || !body.access_token) {
    throw new Error(`token exchange ${res.status}: ${body?.error_description ?? body?.error ?? "failed"}`);
  }
  return body as {
    access_token: string;
    expires_in: number;
    refresh_token?: string;
    refresh_token_expires_in?: number;
  };
}

/** Returns a valid access token, refreshing (and re-sealing) when expired. */
async function accessTokenFor(db: Db, account: Record<string, any>): Promise<string> {
  const expiresAt = account.token_expires_at ? Date.parse(account.token_expires_at) : 0;
  const fresh = expiresAt - Date.now() > 120_000;
  if (fresh && account.access_token_encrypted) {
    return openToken(account.access_token_encrypted as string);
  }
  if (!account.refresh_token_encrypted) {
    if (account.access_token_encrypted) return openToken(account.access_token_encrypted as string);
    throw new Error("No stored eBay token — reconnect required");
  }
  const refreshToken = await openToken(account.refresh_token_encrypted as string);
  const token = await exchangeToken({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    scope: SCOPES.join(" "),
  });
  await db
    .from("integration_accounts")
    .update({
      access_token_encrypted: await sealToken(token.access_token),
      token_expires_at: new Date(Date.now() + Number(token.expires_in ?? 7200) * 1000).toISOString(),
    })
    .eq("id", account.id);
  await logEvent(db, account.id as string, "token_refreshed", {});
  return token.access_token;
}

// ── Metric normalization ───────────────────────────────────────────────────
const METRIC_UNITS: Record<string, string> = {
  active_listings: "count",
  sold_items: "count",
  gross_merchandise_value: "currency",
  orders: "count",
  average_order_value: "currency",
  conversion_rate: "percent",
  views: "count",
  impressions: "count",
  watchers: "count",
  returns: "count",
  cancellations: "count",
  average_listing_age_days: "days",
};

const SNAPSHOT_METRICS = new Set([
  "active_listings",
  "watchers",
  "average_listing_age_days",
  "average_order_value",
  "conversion_rate",
]);

/** Resolves the channel row eBay metrics hang off (brand slug → channel). */
async function resolveChannelId(db: Db, brandKey: string | null, accountName: string | null) {
  if (!brandKey) return null;
  const { data: brand } = await db.from("brands").select("id, name").eq("slug", brandKey).maybeSingle();
  if (!brand) return null;
  const { data: channels } = await db
    .from("channels")
    .select("id, channel_type, name")
    .eq("brand_id", brand.id);
  const existing = (channels ?? []).find((c: any) =>
    String(c.channel_type ?? "").toLowerCase().includes("ebay"),
  );
  if (existing) return existing.id as string;
  const { data: created } = await db
    .from("channels")
    .insert({
      brand_id: brand.id,
      channel_type: "ebay",
      name: accountName ? `eBay · ${accountName}` : "eBay",
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
  const key = ["ebay", brandKey ?? "unassigned", metricKey].join(".");
  const { data: existing } = await db
    .from("metric_definitions")
    .select("id")
    .eq("key", key)
    .maybeSingle();
  if (existing) return existing.id as string;
  const unit = METRIC_UNITS[metricKey] ?? (metricKey.startsWith("inventory_") ? "count" : "count");
  const { data: created, error } = await db
    .from("metric_definitions")
    .insert({
      key,
      name: displayName,
      unit,
      description: `eBay ${metricKey.replace(/_/g, " ")} (${brandKey ?? "unassigned"})`,
      provider: PROVIDER,
      brand_key: brandKey,
      channel: "ebay",
      metric_key: metricKey,
      display_name: displayName,
      aggregation_type:
        SNAPSHOT_METRICS.has(metricKey) || metricKey.startsWith("inventory_") ? "snapshot" : "sum",
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
    // Idempotent per (definition, observed_at): a re-run overwrites, never duplicates.
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
      source: "ebay-integrations",
      external_account_id: externalAccountId,
    };
    const { error } = existing
      ? await db.from("metric_observations").update(row).eq("id", existing.id)
      : await db.from("metric_observations").insert(row);
    if (!error) written += 1;
  }
  return written;
}

/** Raw archive is only for records that support operational drill-down. */
async function archive(
  db: Db,
  accountId: string,
  recordType: "listing" | "order" | "return",
  rows: { id: string; observedAt: string | null; payload: Record<string, unknown> }[],
) {
  if (!rows.length) return 0;
  const { error } = await db.from("integration_raw_records").upsert(
    rows.map((r) => ({
      integration_account_id: accountId,
      provider: PROVIDER,
      record_type: recordType,
      external_record_id: r.id,
      observed_at: r.observedAt,
      payload: r.payload,
    })),
    { onConflict: "provider,record_type,external_record_id" },
  );
  if (error) throw new Error(`integration_raw_records upsert: ${error.message}`);
  return rows.length;
}

// ── Accounts / status ──────────────────────────────────────────────────────
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
  const cursors = (account?.metadata as any)?.cursors ?? null;
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
    cursors,
    environment: sandbox() ? "sandbox" : "production",
    ...extra,
  };
}

// ── Connect / callback ─────────────────────────────────────────────────────
async function handleConnect(db: Db, userId: string, brandKey: string | null, origin: string) {
  const brand = brandKey ?? DEFAULT_BRAND_KEY;
  const { state, nonce, expiresAt } = await signState({ uid: userId, brand_key: brand, origin });
  await logEvent(db, null, "oauth_state_issued", { nonce, brand_key: brand, expires_at: expiresAt });

  const url = new URL(`${HOSTS().auth}/oauth2/authorize`);
  url.searchParams.set("client_id", clientId());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", ruName());
  url.searchParams.set("scope", SCOPES.join(" "));
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "login");
  return { authorizationUrl: url.toString(), expiresAt, redirectUri: callbackUrl(), ruName: ruName() };
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
  if (!originApproved(state.origin)) {
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
    const token = await exchangeToken({
      grant_type: "authorization_code",
      code: decodeURIComponent(code),
      redirect_uri: ruName(),
    });

    // Identify the seller account (privileges endpoint always works with sell scopes).
    const privileges = await tryGet("/sell/account/v1/privilege", token.access_token);
    const user = await tryGet("/commerce/identity/v1/user/", token.access_token);
    const externalId =
      (user?.userId as string) ??
      (user?.username as string) ??
      `ebay:${state.brand_key ?? DEFAULT_BRAND_KEY}`;

    const { data: account, error: upsertError } = await db
      .from("integration_accounts")
      .upsert(
        {
          provider: PROVIDER,
          brand_key: state.brand_key ?? DEFAULT_BRAND_KEY,
          external_account_id: String(externalId),
          account_name: (user?.username as string) ?? "eBay Seller",
          account_username: (user?.username as string) ?? null,
          account_type: (user?.accountType as string) ?? "SELLER",
          status: "connected",
          scopes: SCOPES,
          access_token_encrypted: await sealToken(token.access_token),
          refresh_token_encrypted: token.refresh_token
            ? await sealToken(token.refresh_token)
            : null,
          token_expires_at: new Date(
            Date.now() + Number(token.expires_in ?? 7200) * 1000,
          ).toISOString(),
          metadata: {
            connected_by: state.uid,
            environment: sandbox() ? "sandbox" : "production",
            selling_limit: privileges?.sellingLimit ?? null,
            refresh_token_expires_at: token.refresh_token_expires_in
              ? new Date(Date.now() + Number(token.refresh_token_expires_in) * 1000).toISOString()
              : null,
          },
          last_error: null,
        },
        { onConflict: "provider,external_account_id" },
      )
      .select("id, brand_key")
      .maybeSingle();
    if (upsertError) throw new Error(`integration_accounts upsert: ${upsertError.message}`);

    await logEvent(db, account?.id ?? null, "account_connected", {
      brand_key: state.brand_key,
      username: user?.username ?? null,
    });
    await finishRun(db, runId, { status: "succeeded", records_received: 1, records_written: 1 });

    try {
      await runSync(db, account?.id as string);
    } catch (syncError) {
      console.warn("[ebay-integrations] initial sync failed", String(syncError));
    }

    return redirectBack(state.origin, {
      integration: PROVIDER,
      status: "connected",
      brand: state.brand_key ?? DEFAULT_BRAND_KEY,
    });
  } catch (err) {
    const message = safeError(err);
    await finishRun(db, runId, {
      status: "failed",
      error_code: "connect_failed",
      error_message: message,
    });
    await logEvent(db, null, "connect_failed", { reason: message });
    return redirectBack(state.origin, { integration: PROVIDER, status: "error", reason: "exchange" });
  }
}

// ── Sync ───────────────────────────────────────────────────────────────────
type Cursors = {
  orders_modified_from?: string | null;
  returns_modified_from?: string | null;
  listings_synced_at?: string | null;
};

function money(value: any): number {
  const n = Number(value?.value ?? value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** Listings: full offer/inventory snapshot (counts + age + category mix). */
async function syncListings(db: Db, accountId: string, token: string) {
  const listings: Record<string, any>[] = [];
  let offset = 0;
  for (let page = 0; page < 20; page += 1) {
    const body = await ebayGet("/sell/inventory/v1/offer", token, {
      limit: "100",
      offset: String(offset),
      // The API requires a seller-scoped filter; sku-less listing pulls use marketplace.
      marketplace_id: "EBAY_US",
    }).catch(async (err) => {
      // Some accounts only expose offers per-SKU; fall back to the inventory items.
      console.warn("[ebay-integrations] offer list unavailable", String(err));
      return null;
    });
    const rows = (body?.offers as any[]) ?? [];
    listings.push(...rows);
    if (rows.length < 100) break;
    offset += 100;
  }

  if (!listings.length) {
    const inv = await tryGet("/sell/inventory/v1/inventory_item", token, { limit: "100" });
    for (const item of (inv?.inventoryItems as any[]) ?? []) {
      listings.push({
        offerId: item.sku,
        sku: item.sku,
        status: "UNKNOWN",
        availableQuantity: item.availability?.shipToLocationAvailability?.quantity ?? null,
        categoryId: item.product?.aspects?.category ?? null,
        listing: null,
        _inventoryOnly: true,
      });
    }
  }

  const active = listings.filter((l) => String(l.status ?? "").toUpperCase() === "PUBLISHED");
  const now = Date.now();
  const ages = active
    .map((l) => l.listing?.listingStartDate ?? l.listingStartDate)
    .filter(Boolean)
    .map((d: string) => (now - Date.parse(d)) / 86_400_000)
    .filter((n: number) => Number.isFinite(n));
  const avgAge = ages.length ? ages.reduce((a: number, b: number) => a + b, 0) / ages.length : null;

  const byCategory = new Map<string, number>();
  for (const l of listings) {
    const cat = String(l.categoryId ?? l.listing?.categoryId ?? "uncategorized");
    byCategory.set(cat, (byCategory.get(cat) ?? 0) + 1);
  }

  // Raw archive supports listing-level drill-down (SKU, price, quantity, state).
  await archive(
    db,
    accountId,
    "listing",
    listings
      .filter((l) => l.offerId ?? l.sku)
      .map((l) => ({
        id: String(l.offerId ?? l.sku),
        observedAt: l.listing?.listingStartDate ?? new Date().toISOString(),
        payload: l,
      })),
  );

  return { listings, activeCount: active.length || listings.length, avgAge, byCategory };
}

/** Orders: incremental on lastmodifieddate, deduped by orderId. */
async function syncOrders(db: Db, accountId: string, token: string, since: string | null) {
  const from = since ?? new Date(Date.now() - 90 * 86_400_000).toISOString();
  const orders: Record<string, any>[] = [];
  let offset = 0;
  for (let page = 0; page < 20; page += 1) {
    const body = await ebayGet("/sell/fulfillment/v1/order", token, {
      filter: `lastmodifieddate:[${from.replace(/\.\d+Z$/, "Z")}..]`,
      limit: "50",
      offset: String(offset),
    });
    const rows = (body?.orders as any[]) ?? [];
    orders.push(...rows);
    if (rows.length < 50) break;
    offset += 50;
  }

  await archive(
    db,
    accountId,
    "order",
    orders.map((o) => ({
      id: String(o.orderId),
      observedAt: o.creationDate ?? null,
      payload: o,
    })),
  );

  const paid = orders.filter((o) => String(o.orderPaymentStatus ?? "").toUpperCase() === "PAID");
  const cancelled = orders.filter(
    (o) => String(o.cancelStatus?.cancelState ?? "").toUpperCase() === "CANCELED",
  );
  const gmv = paid.reduce((sum, o) => sum + money(o.pricingSummary?.total), 0);
  const units = paid.reduce(
    (sum, o) =>
      sum + ((o.lineItems as any[]) ?? []).reduce((n, li) => n + Number(li.quantity ?? 0), 0),
    0,
  );
  const newest = orders
    .map((o) => o.lastModifiedDate ?? o.creationDate)
    .filter(Boolean)
    .sort()
    .pop() as string | undefined;

  return {
    count: orders.length,
    orders: paid.length,
    gmv,
    units,
    cancellations: cancelled.length,
    cursor: newest ?? from,
  };
}

/** Returns: incremental via the Post-Order return search. Optional entitlement. */
async function syncReturns(db: Db, accountId: string, token: string, since: string | null) {
  const from = since ?? new Date(Date.now() - 90 * 86_400_000).toISOString();
  const res = await fetch(
    `${HOSTS().api}/post-order/v2/return/search?return_role=SELLER&creation_date_range_from=${encodeURIComponent(from)}&limit=100`,
    {
      headers: {
        Authorization: `IAF ${token}`,
        Accept: "application/json",
        "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
      },
    },
  ).catch(() => null);
  if (!res || !res.ok) {
    console.warn("[ebay-integrations] return search unavailable", res?.status);
    return null;
  }
  const body = (await res.json().catch(() => ({}))) as any;
  const members = (body?.members as any[]) ?? [];
  await archive(
    db,
    accountId,
    "return",
    members
      .filter((r) => r.returnId)
      .map((r) => ({
        id: String(r.returnId),
        observedAt: r.creationInfo?.creationDate?.value ?? null,
        payload: r,
      })),
  );
  return { count: members.length, cursor: new Date().toISOString() };
}

/** Traffic: views, impressions and conversion where the account is entitled. */
async function syncTraffic(token: string) {
  const end = new Date();
  const start = new Date(end.getTime() - 29 * 86_400_000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");
  const body = await tryGet("/sell/analytics/v1/traffic_report", token, {
    dimension: "DAY",
    metric: "LISTING_VIEWS_TOTAL,LISTING_IMPRESSION_TOTAL,SALES_CONVERSION_RATE,TRANSACTION",
    filter: `marketplace_ids:{EBAY_US},date_range:[${fmt(start)}..${fmt(end)}]`,
  });
  if (!body) return null;
  const headers = ((body.header as any)?.metrics as any[]) ?? [];
  const records = (body.records as any[]) ?? [];
  const totals: Record<string, number> = {};
  for (const record of records) {
    (record.metricValues as any[])?.forEach((mv, i) => {
      const key = String(headers[i]?.key ?? "");
      const value = Number(mv?.value ?? 0);
      if (!key || !Number.isFinite(value)) return;
      totals[key] = (totals[key] ?? 0) + value;
    });
  }
  if (records.length && totals["SALES_CONVERSION_RATE"] !== undefined) {
    totals["SALES_CONVERSION_RATE"] = totals["SALES_CONVERSION_RATE"] / records.length;
  }
  return totals;
}

/** Watchers only exist on the legacy Trading API; absence is not an error. */
async function syncWatchers(token: string): Promise<number | null> {
  try {
    const res = await fetch(`${HOSTS().api.replace("api.", "api.")}/ws/api.dll`, {
      method: "POST",
      headers: {
        "X-EBAY-API-CALL-NAME": "GetMyeBaySelling",
        "X-EBAY-API-SITEID": "0",
        "X-EBAY-API-COMPATIBILITY-LEVEL": "1235",
        "X-EBAY-API-IAF-TOKEN": token,
        "Content-Type": "text/xml",
      },
      body: `<?xml version="1.0" encoding="utf-8"?>
<GetMyeBaySellingRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ActiveList><Include>true</Include><Pagination><EntriesPerPage>200</EntriesPerPage></Pagination></ActiveList>
</GetMyeBaySellingRequest>`,
    });
    if (!res.ok) return null;
    const xml = await res.text();
    if (!/<Ack>(Success|Warning)<\/Ack>/.test(xml)) return null;
    const matches = xml.match(/<WatchCount>(\d+)<\/WatchCount>/g) ?? [];
    if (!matches.length) return null;
    return matches.reduce((sum, m) => sum + Number(m.replace(/\D/g, "")), 0);
  } catch (error) {
    console.warn("[ebay-integrations] watch count unavailable", String(error));
    return null;
  }
}

async function runSync(db: Db, accountId: string) {
  const { data: account } = await db
    .from("integration_accounts")
    .select("*")
    .eq("id", accountId)
    .maybeSingle();
  if (!account) throw new Error("eBay account not found");

  const runId = await startRun(db, accountId, "operations");
  let received = 0;
  try {
    const token = await accessTokenFor(db, account);
    const cursors: Cursors = ((account.metadata as any)?.cursors ?? {}) as Cursors;
    const observedAt = new Date().toISOString();
    const points: Point[] = [];
    const push = (metricKey: string, label: string, value: unknown) => {
      const n = Number(value);
      if (value === null || value === undefined || !Number.isFinite(n)) return;
      points.push({ metricKey, label, value: n, observedAt });
    };

    // 1. Listings snapshot.
    const listings = await syncListings(db, accountId, token);
    received += listings.listings.length;
    push("active_listings", "eBay Active Listings", listings.activeCount);
    if (listings.avgAge !== null) {
      push("average_listing_age_days", "eBay Avg Listing Age (days)", Math.round(listings.avgAge));
    }
    for (const [category, count] of listings.byCategory) {
      const safeKey = category.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 40);
      push(`inventory_${safeKey}`, `eBay Inventory · ${category}`, count);
    }

    // 2. Orders (incremental, deduped by orderId).
    const orders = await syncOrders(db, accountId, token, cursors.orders_modified_from ?? null);
    received += orders.count;
    push("orders", "eBay Orders", orders.orders);
    push("sold_items", "eBay Sold Items", orders.units);
    push("gross_merchandise_value", "eBay GMV", Number(orders.gmv.toFixed(2)));
    push("cancellations", "eBay Cancellations", orders.cancellations);
    if (orders.orders > 0) {
      push("average_order_value", "eBay Average Order Value", Number((orders.gmv / orders.orders).toFixed(2)));
    }

    // 3. Returns (optional entitlement).
    const returns = await syncReturns(db, accountId, token, cursors.returns_modified_from ?? null);
    if (returns) {
      received += returns.count;
      push("returns", "eBay Returns", returns.count);
    }

    // 4. Traffic + conversion (only when eBay actually reports them).
    const traffic = await syncTraffic(token);
    if (traffic) {
      received += Object.keys(traffic).length;
      push("views", "eBay Listing Views (30d)", traffic["LISTING_VIEWS_TOTAL"]);
      push("impressions", "eBay Impressions (30d)", traffic["LISTING_IMPRESSION_TOTAL"]);
      push("conversion_rate", "eBay Conversion Rate (30d)", traffic["SALES_CONVERSION_RATE"]);
    }

    // 5. Watchers (legacy API; skipped silently when unavailable).
    const watchers = await syncWatchers(token);
    if (watchers !== null) push("watchers", "eBay Watchers", watchers);

    const channelId = await resolveChannelId(
      db,
      (account.brand_key as string | null) ?? DEFAULT_BRAND_KEY,
      account.account_name as string | null,
    );
    const written = await writeObservations(
      db,
      points,
      (account.brand_key as string | null) ?? DEFAULT_BRAND_KEY,
      channelId,
      String(account.external_account_id ?? ""),
    );

    const nextCursors: Cursors = {
      orders_modified_from: orders.cursor,
      returns_modified_from: returns?.cursor ?? cursors.returns_modified_from ?? null,
      listings_synced_at: observedAt,
    };

    await db
      .from("integration_accounts")
      .update({
        last_synced_at: observedAt,
        last_error: channelId ? null : "No eBay channel resolved for this brand.",
        status: "connected",
        metadata: { ...(account.metadata ?? {}), cursors: nextCursors },
      })
      .eq("id", accountId);

    await finishRun(db, runId, {
      status: "succeeded",
      records_received: received,
      records_written: written,
      metadata: {
        metrics: points.map((p) => p.metricKey),
        cursors: nextCursors,
        channel_resolved: Boolean(channelId),
      },
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

  // eBay redirects the browser here — no JWT, authenticated by signed state.
  if (url.pathname.endsWith("/callback") || url.searchParams.get("action") === "callback") {
    return handleCallback(req, db);
  }

  let body: { action?: string; brandKey?: string | null; returnOrigin?: string } = {};
  if (req.method === "POST") body = await req.json().catch(() => ({}));
  const action = body.action ?? url.searchParams.get("action") ?? "status";

  if (origin && !originApproved(origin)) {
    return new Response("Origin not allowed", { status: 403 });
  }

  const user = await authenticate(req);
  if (!user) return json({ error: "Unauthorized" }, 401, origin);

  const brandKey = body.brandKey ?? url.searchParams.get("brandKey") ?? DEFAULT_BRAND_KEY;

  try {
    switch (action) {
      case "connect": {
        const requested = (body.returnOrigin ?? origin ?? "").replace(/\/$/, "");
        if (!originApproved(requested)) {
          return json({ error: "Return origin is not approved" }, 400, origin);
        }
        return json(await handleConnect(db, user.id, brandKey, requested), 200, origin);
      }
      case "status": {
        const account = await accountFor(db, brandKey);
        return json(statusPayload(account, { redirectUri: callbackUrl() }), 200, origin);
      }
      case "sync": {
        const account = await accountFor(db, brandKey);
        if (!account) return json({ error: "eBay is not connected" }, 409, origin);
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