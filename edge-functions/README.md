# Cash Holdings — external integration layer

These files are **not** deployed by Lovable. They target the external Cash
Holdings Supabase project (`ldijllskwwmyhhbzspmb`) and must be deployed there.

## 1. Database

Run `db/integration-layer.sql` in the SQL editor. It is idempotent and additive:
existing `integration_connections`, `integration_oauth_states` and
`integration_sync_runs` are preserved (`integration_sync_runs` only gains the
columns it was missing).

## 2. Edge Function

Deploy `edge-functions/integrations/` as a function named `integrations`:

```
supabase functions deploy integrations --project-ref ldijllskwwmyhhbzspmb
```

The existing `instagram-integrations` function is untouched by the router — it
owns the Instagram flow directly (see below).

## 2b. Instagram function (`edge-functions/instagram-integrations/`)

Complete `connect | callback | status | sync | disconnect` implementation.
Deploy over the existing function (do **not** create a second one):

```
supabase functions deploy instagram-integrations --no-verify-jwt --project-ref ldijllskwwmyhhbzspmb
```

`verify_jwt` MUST be false: Meta redirects the browser to `?action=callback`
with no Supabase JWT, so the gateway would reject it (this is why the function
currently shows zero invocations). Every other action verifies the caller's
bearer token inside the function via `auth.getUser()` + `has_role(uid,'owner')`,
and the callback is authenticated by the HMAC-signed, expiring, single-use
OAuth state (`INTEGRATION_STATE_SECRET`).

### Meta redirect URI (exact)

```
https://ldijllskwwmyhhbzspmb.supabase.co/functions/v1/instagram-integrations?action=callback
```

### Manual Meta App Dashboard configuration still required

1. Products → **Instagram → API setup with Instagram business login**.
2. Business login settings → OAuth redirect URIs → add the URI above verbatim.
3. Permissions: `instagram_business_basic`, `instagram_business_manage_insights`.
4. Add each Instagram account (truett-cash, vera, throttle-kings,
   authority-systems) as a tester/role, or publish the app for live accounts.
   Each account must be **Business or Creator** — personal accounts return no
   insights.
5. App must be in Live mode for accounts outside the tester list.

### CORS

Allow-list only, no wildcard: `https://truett.cash`,
`https://athrty-sys.framer.website`, `https://cash-holdings-os.lovable.app`,
plus anything in `ALLOWED_ORIGINS` and `https://<sub>.lovable.app` previews.
Browser origins are **not** the OAuth redirect URI — only the URI above goes in
Meta.

## 3. Required secrets

Already present: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`,
`INSTAGRAM_APP_ID`, Instagram app secret, `INTEGRATION_STATE_SECRET`,
`ALLOWED_ORIGINS`.

**Must be added before any production token is stored:**

```
INTEGRATION_TOKEN_KEY   # base64 of 32 random bytes: openssl rand -base64 32
```

Without it, `sealToken` throws and no token is ever written in plaintext.

## 4. Google OAuth redirect URI

Add to the Google OAuth client:

```
https://ldijllskwwmyhhbzspmb.supabase.co/functions/v1/integrations?action=callback
```

## Security invariants

- Tokens are AES-256-GCM sealed in the function; the DB holds ciphertext only.
- `anon` and `authenticated` have **no privileges** on `integration_accounts`
  or `integration_raw_records`. The dashboard reads
  `integration_accounts_safe`, which excludes both token columns.
- Every connector response is a safe status object; tokens never leave the
  function.
- `integration_events` is append-only, enforced by trigger for all roles.
## eBay (`ebay-integrations`)

Deploy without JWT verification (eBay redirects the browser back with no session):

```
supabase functions deploy ebay-integrations --no-verify-jwt --project-ref ldijllskwwmyhhbzspmb
```

Accepted redirect URL to register in the eBay developer portal (this is the URL
behind the RuName, not a browser origin):

```
https://ldijllskwwmyhhbzspmb.supabase.co/functions/v1/ebay-integrations/callback
```

Secrets required: `EBAY_APP_ID`, `EBAY_CERT_ID`, `EBAY_RU_NAME`, `EBAY_ENV`
(`production` | `sandbox`), plus the shared `INTEGRATION_STATE_SECRET`,
`INTEGRATION_TOKEN_KEY` and `ALLOWED_ORIGINS`.

Actions: `connect | callback | status | sync | disconnect`. Primary brand routing
is `throttle-kings` (default), overridable per request via `brandKey`.

Incremental behaviour: order and return pulls use the provider
`lastmodifieddate` / creation-date cursors persisted in
`integration_accounts.metadata.cursors`. Orders, listings and returns are
upserted into `integration_raw_records` on
`(provider, record_type, external_record_id)`, so re-running a sync can never
duplicate a record. Metric points are idempotent per
`(metric_definition_id, observed_at)`.

## Website outbound CRM dry run (`website-outbound-crm-dryrun`)

`edge-functions/website-outbound-crm-dryrun/index.ts` is the recovered deployed
source plus one change: an **owner authorization gate**. The gate runs before the
service-role client is created, so the private `private-imports` workbook cannot
be read without an owner session. It requires `Authorization: Bearer <jwt>`,
validates it with `auth.getUser()`, and requires `has_role(uid,'owner') === true`
— any error, `null` or non-boolean fails closed with `401`.

Audited: the function performs **zero writes** (only `storage.download` and
`.select()`); there is no `insert`/`update`/`upsert`/`delete`/`rpc` write path.

CORS is now an explicit allow-list (`truett.cash`, `cash-holdings-os.lovable.app`,
`*.lovable.app` previews, plus `ALLOWED_ORIGINS`) with an `OPTIONS` preflight,
replacing the previous `*` wildcard.

Deploy (only after diff approval):

```
supabase functions deploy website-outbound-crm-dryrun --no-verify-jwt --project-ref ldijllskwwmyhhbzspmb
```

Secrets required: `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, optional `ALLOWED_ORIGINS`.
