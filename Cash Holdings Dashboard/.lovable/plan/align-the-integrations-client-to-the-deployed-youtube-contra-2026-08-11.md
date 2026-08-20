# Align the Integrations client to the deployed YouTube contract

## Current state (verified before planning)

- Branch: `edit/edt-8312946a-61a1-4f8b-bc1d-544d701afa79`, HEAD `fe044fda377c18895ad64efc2ca411206f8c1814`.
- `src/lib/integrations/connector.ts` is a single generic wrapper: every action (`connect`, `status`, `sync`, `refresh`, `disconnect`, `health`) goes through `cashHoldingsSupabase.functions.invoke("integrations", { body: { action, provider, brandKey } })`. `functions.invoke` always POSTs to `/functions/v1/integrations` and cannot address a sub-path, so the deployed path-routed contract is unreachable from this module.
- `src/lib/integrations/youtube.ts` does not exist. YouTube has no provider-specific client; it is driven entirely by `GenericProviderCard` in `src/routes/_authenticated/integrations.tsx` (lines 350-427), which calls the generic `status`, `connect`, `sync`, and `disconnect` actions.
- `connectorHealth()` (`connector.ts:63`) calls `invoke("health", "youtube")` — the source of the `UNREACHABLE` badge.
- `src/lib/integrations/queries.ts` exposes an authenticated read model over `integration_accounts_safe`, `integration_sync_runs`, and `integration_events`; `integrationStatusQuery` delegates to the generic connector action. No file in `src/` references `integration_connections` today.
- Instagram (`instagram.ts`) and eBay (`ebay.ts`) invoke their own separate functions (`instagram-integrations`, `ebay-integrations`) and are untouched by this work.

**Why the obsolete contract is still live:** the client was written against an earlier root-POST action router. When the Edge Function was redeployed as a path-routed service (`/health`, `/connect/youtube/start`), only the server changed — the browser module kept its single `functions.invoke` entry point, which structurally cannot emit a GET or a sub-path request.

## What will change (frontend only)

### 1. Connector health becomes a real GET

Replace the `invoke("health", ...)` call with a direct `fetch`:

- `GET {VITE_CASH_SUPABASE_URL}/functions/v1/integrations/health`
- Headers: `apikey: <publishable key>`, `Authorization: Bearer <current session access token>` when a session exists, `Accept: application/json`.
- Non-2xx throws with status plus response text; the parsed body maps onto the existing `ConnectorHealth` shape, tolerating a bare `{"ok":true}` (missing `missingEnv` / `providers` default to empty arrays) so the badge reads `REACHABLE`.

### 2. New YouTube client module

Add `src/lib/integrations/youtube.ts` with a single `startYouTubeConnect(channelId)`:

- Reads the current Cash Holdings session; throws a clear "sign in again" error when there is no access token.
- `POST {VITE_CASH_SUPABASE_URL}/functions/v1/integrations/connect/youtube/start`
- Headers: `Authorization: Bearer <access token>`, `apikey: <publishable key>`, `Content-Type: application/json`.
- Body: `{ "channel_id": "<channels.id UUID>" }`.
- Requires `ok === true` and a non-empty, absolute `authorization_url`; anything else throws with the server message.
- Returns the URL; the caller navigates via `window.location.assign(...)`.

### 3. YouTube card stops using the generic contract

In `src/routes/_authenticated/integrations.tsx`, the YouTube entry gets its own card controller instead of `GenericProviderCard`:

- **Status** comes from the existing authenticated read model (the `integration_accounts_safe` rows already loaded on the page, filtered to `provider === "youtube"`), summarized with the same helper used for Instagram and eBay. No backend status call.
- **Connect** requires a target channel. The card lists the YouTube channels from the existing `channels` read (`channel_type` = youtube) and connect is enabled once one is selected, sending that row's real `id` as `channel_id`.
- **Sync / refresh / disconnect** buttons are not rendered for YouTube, because production does not implement those endpoints.

### 4. Google Analytics

Google Analytics currently rides the same generic root-POST contract, which production does not implement. It will be presented as not-yet-wired (same treatment as the other unwired catalog entries) rather than firing requests that 404. No new endpoint is invented for it.

## Explicitly not touched

Edge Functions, Supabase config, environment variables, schema, migrations, RLS, auth architecture, Instagram, eBay.

## Verification

Run typecheck and build, then report: branch/HEAD before the change, exact files changed, the exact post-change request shape for connector health and for YouTube connect, typecheck/build result, and a `git diff --stat` summary. No commit, no deploy, no OAuth run.

## Open item

The instruction mentions reading YouTube status from `integration_connections`. No code in this repo references that table, and its presence in the external project cannot be confirmed from here without a live authenticated read. The plan therefore uses the read model that already exists and is proven to load on this page (`integration_accounts_safe`). If you want `integration_connections` specifically, say so and the status read will target it instead.
