# Analytics RPC Payload Cutover

## One constraint up front
The live RPCs sit behind your external Supabase project with owner-only RLS, and my sandbox has no owner session (auth status: signed out, no service key). So I cannot read the live response bodies myself. Instead of guessing key names, the plan makes the app itself do the inspection from your signed-in browser session, and builds adapters that are shape-tolerant so the cutover works regardless of which of the common payload envelopes each function returns.

## What gets built

### 1. Shape capture (System → Data Health)
Extend the existing Analytics API matrix so each PASS row also records a structural fingerprint: root keys, nested array/object names, value types, record-count location, empty-state shape, and any `unsupported` markers. Values are never captured — only key names and `typeof`. Each row gets a "Copy shape" action and the whole run gets "Copy all shapes" so the captured JSON can be pasted back if a payload turns out to need a hand-written mapping.

### 2. Typed adapters (one per RPC)
New `src/lib/analytics/adapters/` with 14 files matching your list, plus a shared `envelope.ts` helper that:
- validates the response is a non-null object, rejects malformed payloads
- unwraps either `{ data, summary, meta }` or a bare object/array root
- resolves fields by candidate key (camelCase / snake_case / nested-under-data) so live naming variance does not break the wire-up
- defaults missing arrays to `[]`, missing objects to `{}`
- preserves `null` for unsupported metrics — never coerced to `0`
- returns a typed frontend view model, fabricating nothing

Each adapter returns `{ model, ok, reason? }`; an `ok: false` result is treated as a validation failure by the cutover layer.

### 3. Surface cutover
Route components stop touching raw RPC fields and read only adapter models:
- Morning Brief → `dashboard_morning_brief`
- Command Center → `dashboard_summary`, `dashboard_activity`, `dashboard_notifications`, `dashboard_insights`
- CRM → `crm_pipeline`, `crm_engagements`, `crm_qualification`
- Projects → `projects_overview`, `projects_workload`, `projects_progress`
- Analytics / Brands → `brands_performance`, `brands_metrics`, `brands_health`

No metric is recomputed in TypeScript; components render what the RPC returned.

### 4. Cutover rules
`service.ts` gains adapter-aware resolution: RPC + adapter both succeed → `rpc`; RPC error or adapter rejection → existing raw-table fallback (unchanged); neither → `unsupported` with the failure surfaced. Fallback is never run in parallel with a successful RPC. Source labels stay dev-only (`window.__analyticsSources` plus the Data Health matrix) and are stripped from production UI.

### 5. Verification
After the wire-up I run a typecheck and drive the app headlessly to confirm no console errors and that every surface renders through the adapter path. Live-value confirmation (Authority Systems / Truett Cash engagements, qualification average and rate, booking count and conversion, demand, notification counts, recent activity, brand filters incl. All Holdings, metric observations, unsupported nulls) needs your owner session — I will give you the Data Health matrix run to confirm, and any function whose captured shape does not fit the tolerant mapping gets listed as remaining-fallback with its fingerprint so I can close it in one follow-up pass.

## Technical notes
- Signatures in `ANALYTICS_SIGNATURES` are used verbatim; range-only functions never receive `p_brand_key`.
- Scope: `p_start_at` = 30 days ago, `p_end_at` = now, `p_brand_key` = null for the matrix run.
- No changes to Supabase, auth, RLS, routes, theme, typography, integrations, intake/booking, or the fallback implementations.

## Files
- New: `src/lib/analytics/adapters/*` (14 adapters + `envelope.ts` + `index.ts`), `src/lib/analytics/shape.ts`
- Edited: `src/lib/analytics/service.ts`, `hooks.ts`, `probe.ts`, `src/routes/_authenticated/data-health.tsx`, and the mapped route components (`index.tsx`, `command.tsx`, `crm.tsx`, `projects.tsx`, `analytics.tsx`, `brand.$slug.tsx`) plus notification/insight panels as needed.

## Final report
On completion you get the requested report: RPC matrix PASS/FAIL, shapes captured, adapters created, per-surface RPC/FALLBACK/PARTIAL/FAIL status, remaining fallback modules, malformed payloads, console-error status, files changed, and an overall READY / NEEDS ATTENTION verdict.
