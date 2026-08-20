# R4C.1 — Cash Intelligence CORS Connection Repair

The UI is calling the governed Edge Function layer correctly. Every
`knowledge-mcp-read` / `intelligence-mcp-read` call fails as **Failed to fetch**
(no HTTP status reaches the browser), while non-intelligence calls to the same
project succeed on the same session — consistent with the browser blocking the
response for an origin the function does not approve. This is confirmed
observation, not a verified root cause: only the deployed function source can
confirm the allow-list, and that source is not in this repository.

Nothing about the UI, auth, RLS, tables, reasoning, or promotion logic changes.
No table fallbacks, no mock data.

## What blocks a direct fix

Those three functions are deployed to your external Cash Holdings project, and
their source does not exist here — this repo only contains `integrations`,
`ebay-integrations`, `instagram-integrations`, and
`website-outbound-crm-dryrun`. I also have no deploy access to that project. So
the repair is delivered as an exact, ready-to-apply patch plus the allow-list,
and you apply and deploy it; I then verify end to end from the live browser
session.

## 1. Shared CORS module (new file, repo-tracked reference)

`edge-functions/_shared/intel-cors.ts` — a single origin gate used by all three
functions:

- Explicit allow-list, no wildcard, no regex on arbitrary suffixes.
- `resolveCors(request)` returns headers only when the request `Origin` matches
  the list exactly; otherwise it returns nothing and the caller responds without
  CORS approval.
- Approved responses (OPTIONS **and** every POST response, success and error
  alike) carry:

```text
Access-Control-Allow-Origin: <validated request origin>
Access-Control-Allow-Headers: authorization, apikey, content-type
Access-Control-Allow-Methods: POST, OPTIONS
Vary: Origin
```

- Non-approved origins: `OPTIONS` → 403 with no `Access-Control-*` headers;
  POST → normal auth handling with no CORS headers, so the browser blocks it.

Allow-list (production + the preview origins this project actually serves from):

```text
https://cash-holdings-os.lovable.app
https://887516ad-65bf-4188-a5c1-e2c4a467c50b.lovableproject.com
https://id-preview--887516ad-65bf-4188-a5c1-e2c4a467c50b.lovable.app
https://project--887516ad-65bf-4188-a5c1-e2c4a467c50b.lovable.app
https://project--887516ad-65bf-4188-a5c1-e2c4a467c50b-dev.lovable.app
```

## 2. Per-function patch (three functions, same three edits)

For `knowledge-mcp-read`, `intelligence-mcp-read`, and
`intelligence-promotion-write`:

1. Resolve CORS from the request origin as the first statement of the handler.
2. Answer `OPTIONS` with 204 + the approved headers (403 bare when not approved).
3. Merge the approved headers into every `Response` the function already
   returns — including 401/403/4xx/5xx paths.

The existing authenticated JWT requirement is untouched: origin approval happens
before auth and never substitutes for it. Verification order stays
`origin → JWT → owner authorization → operation`.

I will write the patch as an explicit diff-style block in
`edge-functions/README.md` (insertion points and replacement lines), so it can be
applied to the deployed source without guesswork. Deployment stays a
`--no-verify-jwt`-free, JWT-preserving redeploy you run.

## 3. Verification after you deploy

Run from the live signed-in browser session, read-only except one deliberately
invalid promotion probe:

- `knowledge-mcp-read` reachable — real sources/documents return.
- `intelligence-mcp-read` reachable — observations, constraints, requests,
  review events return.
- `intelligence-promotion-write` reachable and **rejects** a knowingly invalid
  payload (missing/unknown action) — no valid promotion is submitted.
- Evidence, Overview, and Durable Intelligence render live governed data.
- Durable observation `c87231ab-dc45-46dd-90c9-6fa23d50309f` re-read before and
  after, byte-compared, and confirmed unchanged.
- No reasoning trace persisted (traces stay in tab memory only).
- A negative-origin check: the same POST from a non-allow-listed origin receives
  no CORS approval.

Reported back exactly in the requested scorecard form, with row create / update /
delete counts, service-role usage, and unexpected-mutation status.

## Technical notes

- Origin comparison is exact string match on `request.headers.get("origin")`;
  `Vary: Origin` is always set on approved responses so no shared cache can
  serve one origin's headers to another.
- No `Access-Control-Allow-Credentials` is added — the browser sends the bearer
  in a header, not a cookie, so credentialed mode is unnecessary.
- Frontend transport (`src/lib/cash-intelligence/service.ts`) already sends
  exactly `authorization`, `apikey`, `content-type`, so the allow-headers list
  matches the real preflight and needs no client change.
