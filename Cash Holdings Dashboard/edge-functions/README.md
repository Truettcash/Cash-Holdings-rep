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

## Cash Intelligence CORS repair (R4C.1)

Applies to three functions deployed on `ldijllskwwmyhhbzspmb` whose source is
**not** in this repository:

```text
knowledge-mcp-read
intelligence-mcp-read
intelligence-promotion-write
```

Symptom: the browser reports `Failed to fetch` with no HTTP status for every
call, while other calls to the same project on the same session succeed — the
active Lovable origin is not approved by the functions' CORS policy.

Scope of the change: **CORS only.** No change to auth, RLS, tables, reasoning,
promotion logic, or response bodies.

### Step 1 — copy the shared gate into each function

Copy `edge-functions/_shared/intel-cors.ts` next to each function's
`index.ts` (Supabase deploys a function folder, so keep a local copy per
function rather than a cross-folder import):

```
supabase/functions/knowledge-mcp-read/cors.ts
supabase/functions/intelligence-mcp-read/cors.ts
supabase/functions/intelligence-promotion-write/cors.ts
```

Allow-list is hard-coded in that file — production plus the preview origins this
project actually serves from. No wildcard, no suffix regex:

```text
https://cash-holdings-os.lovable.app
https://887516ad-65bf-4188-a5c1-e2c4a467c50b.lovableproject.com
https://id-preview--887516ad-65bf-4188-a5c1-e2c4a467c50b.lovable.app
https://project--887516ad-65bf-4188-a5c1-e2c4a467c50b.lovable.app
https://project--887516ad-65bf-4188-a5c1-e2c4a467c50b-dev.lovable.app
```

### Step 2 — three edits per `index.ts`

**(a) import, at the top of the file**

```ts
import { resolveCors, preflight, withCors } from "./cors.ts";
```

**(b) first two statements inside the request handler**, before any auth,
body parsing, or client creation:

```ts
serve(async (req) => {
  const cors = resolveCors(req);                      // ADD
  if (req.method === "OPTIONS") return preflight(cors); // ADD
  // ...existing JWT verification and operation dispatch, unchanged...
});
```

**(c) wrap every return path.** The cheapest correct way is to keep the existing
body untouched and wrap once at the boundary:

```ts
serve(async (req) => {
  const cors = resolveCors(req);
  if (req.method === "OPTIONS") return preflight(cors);
  try {
    return withCors(await handleRequest(req), cors);   // existing handler body
  } catch (e) {
    return withCors(
      new Response(
        JSON.stringify({ error: { code: "SERVICE_ERROR", message: String(e) } }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      ),
      cors,
    );
  }
});
```

If the handler is inlined rather than extracted, wrap each `return new
Response(...)` with `withCors(..., cors)` instead — **including** the 401
missing/invalid-JWT path and the 403 non-owner path. An error response without
CORS headers is exactly what produces `Failed to fetch` in the browser and hides
the real status.

Result on an approved origin, for OPTIONS and every POST response alike:

```text
Access-Control-Allow-Origin: <validated request origin>
Access-Control-Allow-Headers: authorization, apikey, content-type
Access-Control-Allow-Methods: POST, OPTIONS
Vary: Origin
```

Non-approved origin: `OPTIONS` → bare `403`, POST → normal auth handling with no
`Access-Control-*` headers, so the browser blocks the response.

### Step 3 — deploy, JWT verification preserved

Do **not** pass `--no-verify-jwt` for these three; they are authenticated
operator surfaces:

```
supabase functions deploy knowledge-mcp-read --project-ref ldijllskwwmyhhbzspmb
supabase functions deploy intelligence-mcp-read --project-ref ldijllskwwmyhhbzspmb
supabase functions deploy intelligence-promotion-write --project-ref ldijllskwwmyhhbzspmb
```

### Notes

- `Access-Control-Allow-Credentials` is deliberately **not** set: the operator
  bearer travels in the `Authorization` header, not a cookie.
- The browser client already sends exactly `authorization`, `apikey`,
  `content-type` (`src/lib/cash-intelligence/service.ts`), so the allow-headers
  list matches the real preflight — no client change is required.
- Origin approval is not authorization. Keep the order
  `origin → JWT → has_role(uid,'owner') → operation`.
