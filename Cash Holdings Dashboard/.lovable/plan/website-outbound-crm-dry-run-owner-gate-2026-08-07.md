# Website Outbound CRM Dry Run — Owner Gate

## What the recovered source actually does

The recovered file (386 lines) is the behavioral baseline. Verified by reading it end to end:

- It is a **read-only** dry run. Every database call is `.select(...)`; the only storage call is `.download(...)`. There is **no** `insert`, `update`, `upsert`, `delete`, or `rpc` anywhere in the file. Zero writes confirmed.
- It downloads `private-imports/website-outbound/2026-08-04/Truett_Cash_Website_Outbound_CRM_2026-08-04 (1).xlsx` with the **service-role client**, parses the `Lead CRM` sheet, and validates 57 rows against expected tier (20/22/15) and status (53 ready / 4 research needed) totals.
- **The gap:** the storage download happens immediately after the client is created. There is no caller authentication at all — any request that reaches the function reads a private workbook containing lead names, emails and phone numbers.
- Secondary issues in the baseline: no `OPTIONS` preflight handler, wildcard `Access-Control-Allow-Origin: *`, and two vestigial placeholder queries (`orgs`/`contacts` with `.limit(1)`) that are fetched and discarded.

## Changes

Store the recovered source verbatim at `edge-functions/website-outbound-crm-dryrun/index.ts` as the baseline, then apply a minimal patch. No logic, parsing, mapping, threshold or output change.

### 1. Owner authorization before any private read

Add the same `authenticate(req)` helper the `ebay-integrations` and `instagram-integrations` functions already use — no new pattern:

- Require an `Authorization: Bearer <jwt>` header.
- Validate it with an anon-key client via `auth.getUser()`.
- Call `has_role(_user_id, _role: 'owner')` and require an explicit `true`. Any error, `null`, or non-boolean fails closed.
- On failure return `401` before the service-role client is constructed, so the storage download is unreachable for unauthorized callers.

The gate is inserted between the method check and the service-role client creation — this is the only control-flow edit.

### 2. CORS hardening (same edit surface)

Handle `OPTIONS` with a `204`, and replace the `*` origin with the project's existing allow-list style (`truett.cash`, `cash-holdings-os.lovable.app`, `*.lovable.app` previews, plus `ALLOWED_ORIGINS`). Required because the gate now depends on a browser-sent `Authorization` header.

### 3. Response-key alignment for the admin page

The existing page at `/admin/imports/website-outbound` reads tolerant key names that do not match the baseline output (`ambiguous_matches`, `failed_rows`, `preview`, `results.counts`, `results.processed`). Fix this **in the page's readers only** — the function's response shape stays exactly as deployed. Nothing else on that page changes; Copy JSON, Download JSON, and the permanently disabled "Run Production Import" button stay as they are.

### 4. What is not touched

No changes to database schema, RLS, other edge functions, routing, or unrelated UI. The two vestigial `.limit(1)` placeholder queries are left in place so the baseline stays byte-comparable apart from the gate.

## Deployment

Nothing is deployed by this plan. After the edits I show you the full diff. On your approval the deploy command is:

```text
supabase functions deploy website-outbound-crm-dryrun --no-verify-jwt --project-ref ldijllskwwmyhhbzspmb
```

`--no-verify-jwt` matches the other functions in this project; authorization is enforced in-function so the gate cannot be bypassed by the gateway setting.

## Verification after deploy

1. Unauthenticated `POST` → `401`, no storage read.
2. Signed-in non-owner → `401`.
3. Owner session from the admin page → dry run returns `processed: 57` and the tier/status checks.
4. Re-read the function to confirm zero write calls remain.
