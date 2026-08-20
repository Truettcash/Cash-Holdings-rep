# ATHRTY Outbound Operating Surface

Build a read-first ATHRTY workspace on top of the already-proven Microsoft 365 → SharePoint → Supabase pipeline. No new ingestion, no new CRM tables, no seeded rows, no client-side writes to the synced tables.

## Verification first (before any UI query is written)

The preview session is signed out right now, so the exact column names on `integration_source_records`, `integration_sync_runs`, `integration_connections`, `engagements`, and `organizations` in the live project have not been read yet. Step 0 of the build is a read-only schema + sample-row inspection through the authenticated owner session (PostgREST schema document plus one `limit(1)` read per table, including a look at `source_payload` keys). Every field used in the UI comes from that inspection; if a field named in this plan does not exist, the UI reads the real one instead of inventing it.

## Navigation

New sidebar group `ATHRTY` with five routes:

```text
/athrty            Overview      What is happening?
/athrty/accounts   Accounts      Who are we working?
/athrty/pipeline   Pipeline      Where are they in the process?
/athrty/next       Next Actions  What needs to happen next?
/athrty/sync       Sync Status   Can I trust the information?
```

A layout route holds a compact segmented sub-nav; each leaf gets its own `head()` metadata. Existing routes and nav groups are untouched apart from adding the group.

## Phase A — Overview

Metric strip (all derived from live aggregate queries, never hardcoded): Total Accounts, Total Leads, Named Contacts, Open Pipeline (weighted where probability exists), Follow-Ups Due, Contacted, Not Contacted, High Interest, Recent Changes. Below: pipeline-stage distribution and brand-routing breakdown (canonical brand, with original source route shown as a secondary line — `Authority Systems` and `ATHRTY.SYS` both roll up to `authority-systems`).

## Phase B — Accounts

One working table joining `integration_source_records` to its `organizations` / `contacts` / `engagements` rows, with presentation-only fields read from `source_payload`. Columns: Account, Brand, Tier, Market, City, Phone, Contact, Stage, Call Status, Attempts, Interest, Probability, Next Action, Next Action Date, Owner, Sync State. Debounced search across company, Account ID, Lead ID, contact, phone, city, market. Sortable headers, column-visibility menu, paginated (server-side range) with count.

Compact filter bar above the table: Brand, Stage, Tier, Market, Account Status, Call Status, Interest, Owner, Contact present/missing, Next Action due, Recently modified, plus Clear Filters. Filter and search state lives in the URL search params so views are shareable.

## Phase C — Account Inspector

Right-side drawer (matching the console's existing detail patterns) opened by row click, deep-linkable via `?id=`. Sections: Account, Contact (explicit "No named contact identified" when `contact_id` is null — never derived from the company phone), Sales State, a visually prominent Next Action block with overdue/upcoming state, Notes, and Source Trace (source, list name, SharePoint item id, Account/Lead id, mapping status, external created/modified, last seen, last synced, canonical brand). Hashes stay behind a collapsed developer details block; no tokens, credentials, or service-role details are ever rendered.

## Phase D — Next Actions

Operator queue grouped Overdue / Today / Upcoming / No Next Action, with Account, Brand, Stage, Contact, Phone, Next Action, Due Date, Owner. Overdue uses the existing danger status treatment and leads the page.

## Phase E — Pipeline

Read-only Kanban by actual `pipeline_stage` values (normalized for labels only, never in the database). Compact cards: Account, Tier, contact state, Interest, Next Action, Due Date. No drag-and-drop this phase.

## Phase F — Sync Status

Panel over `integration_connections`, `integration_sync_runs`, `integration_source_records`: connection state, source list, records mapped, last sync time/result, latest read + mapped counts, and recent run history.

## Phase G — Preview Changes

Button invoking `m365-sync-sharepoint-dryrun` with the current user's session (JWT verified server-side), body `{ "integration_connection_id": "f304a30c-b8c4-4d94-9860-e8634efe6b1f" }`. Sanitized result panel: records read, new / changed / unchanged / invalid / ambiguous, organizations / contacts / engagements proposed. Any invalid, ambiguous, duplicate-identity, or error condition raises a clearly visible warning band. Zero writes.

## Phase H — Sync Microsoft

Separate button with a lightweight confirm ("Sync ATHRTY Outbound with Cash Holdings?") that shows the most recent preview result. Invokes `m365-sync-sharepoint` with the same body, then reports records read, source records inserted/updated/unchanged, organizations, contacts (incl. skipped), engagements, duration, and success state, and invalidates the ATHRTY queries. No auto-retry; failures show a sanitized error state.

## Technical notes

- New files under `src/lib/athrty/` (types, query options, presentation-layer normalizers, sync client) and `src/components/athrty/` (metric strip, table, filter bar, inspector, source trace, sync panels). Routes under `src/routes/_authenticated/athrty*`.
- All reads go through the existing `cashHoldingsSupabase` browser client under owner RLS; TanStack Query with `queryOptions`, skeleton loaders, empty states, and error states on every surface.
- Sync mutations only call the two Edge Functions with the user's bearer token. No client writes to `organizations`, `contacts`, `engagements`, or `integration_source_records`. No schema, RLS, or grant changes. No cron or background polling.
- If a needed presentation field exists only in `source_payload`, it is read from there rather than copied elsewhere.