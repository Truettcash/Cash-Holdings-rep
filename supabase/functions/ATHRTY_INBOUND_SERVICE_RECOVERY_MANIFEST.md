# ATHRTY Inbound / Customer-Service Recovery Manifest

## Purpose

Recover the remaining production-only inbound execution lane into source control without invoking it:

`M365 inbox -> reply matching -> response intelligence -> customer-service case -> optional site-change request -> revision build -> QA/release gate -> publish`

and the separate public website signal lane:

`browser signal -> validated session event -> signal session -> optional CRM engagement`

This is a **current-state recovery snapshot**, not a deployment package.

## Recovered runtime entrypoints

### `athrty-mail-alias-test`

Observed production behavior:

- scheduler-facing custom runtime-token authentication
- Microsoft Graph application-token acquisition
- reads the configured ATHRTY mailbox when invoked
- ignores messages from the ATHRTY mailbox/domain itself
- matches inbound sender email against prospect contact candidates and prior sent outreach
- falls back to CRM contacts + organization-linked preview sites
- deduplicates by provider message ID and customer-service idempotency key
- strips quoted email history before classification
- classifies supported site-change requests using structured model output
- accepts image attachments up to the existing bucket/file-size contract
- records client-supplied assets as `client_email` / `client_supplied`
- creates customer-service cases and site-change requests
- executes only fully mapped supported changes automatically; unsupported changes are escalated
- revision execution writes a before/after control record
- build failures restore the prior render payload
- revision QA checks responsive contract, contact integrity and attribution contract
- failed QA restores the prior render payload
- successful QA still passes through `athrty_evaluate_release_gate`
- publish failures remain recorded as failed customer-service execution
- outreach replies are passed to the previously recovered `prospect-response-intelligence` function

### Sanitization

The public recovery copy deliberately replaces:

- the live scheduler verifier hash with `__RECOVERY_REDACTED_RUNTIME_TOKEN_SHA256__`
- the live owner UUID with `__RECOVERY_OWNER_USER_ID__`

The recovered source is therefore intentionally **non-deployable as-is**.

### `athrty-signal-intake`

Observed production behavior:

- public POST/OPTIONS endpoint with permissive CORS
- JSON-only request enforcement
- 32 KiB payload limit
- bounded event, constraint, failure-mode and frequency enums
- validated 8-128 character session identifiers
- email/phone validation on contact submission
- 40-event / 10-minute per-session rate limit
- server-derived operational-friction result labels
- UTM / click-ID / page / referrer capture
- signal-session upsert
- append-only signal-event write path
- contact submission creates or updates an ATHRTY CRM engagement
- direct email/phone/contact values are removed from the signal-event payload copy

## Recovered relational substrate

`supabase/schema/athrty_inbound_service_tables_v1.sql` records:

- `athrty_signal_sessions`
- `athrty_signal_events`
- `athrty_customer_service_cases`
- `athrty_site_change_requests`
- production check constraints
- production foreign-key relationships
- signal/session lookup indexes
- customer-service queue index
- customer-service idempotency unique index
- current RLS-enabled posture

At recovery time, all four tables had RLS enabled and no rows in `pg_policies`. The recovery snapshot preserves that service/RPC-controlled posture and does not open authenticated access.

## Existing dependencies already recovered elsewhere

The inbound lane depends on previously source-controlled components including:

- `prospect_response_events`
- `prospect_contact_candidates`
- `prospect_outreach_queue`
- `prospect_preview_sites`
- `prospect_preview_assets`
- `athrty_site_qa_runs`
- `athrty_evaluate_release_gate`
- `athrty-framer-publisher`
- `prospect-response-intelligence`
- `engagements`
- `contacts`
- `organizations`
- `athrty-client-assets` storage contract
- scheduler/dispatcher recovery for reply ingestion

## Authority-boundary findings

### 1. Supported email revisions can auto-publish

Current production logic sets `requires_human_approval` to false when at least one change is fully mapped and there are no unsupported items. In that path the worker can:

`email request -> patch preview -> build -> QA -> release gate -> publish`

without a distinct human-approval event between classification and execution.

This is not changed in recovery. Treat it as a separate **high-risk hardening decision**. A future change should explicitly decide whether client-authenticated email constitutes sufficient approval, or whether all publish-capable revisions require a human/system approval record.

### 2. Public signal rate limiting is caller-session scoped

The signal endpoint limits events by supplied `session_id`. A caller can generate a fresh valid session ID and receive a fresh allowance. Payload-size/type validation and database controls still apply, but the rate limiter is not a robust abuse boundary by itself.

This is not changed in recovery. A future hardening pass can layer IP/visitor/server-issued session controls without changing the commercial event contract.

## Security / operational boundaries

This recovery does **not** authorize or perform:

- mailbox reads
- Microsoft Graph calls
- OpenAI calls
- attachment downloads
- storage uploads
- database writes
- customer-service case creation
- preview mutation
- Framer builds or publishes
- outbound/reply processing
- Supabase deployment
- migration execution
- scheduler changes
- runtime-token restoration
- owner-binding restoration

## Rebuildability implication

With this lane recovered, the major ATHRTY commercial runtime is no longer dependent on undocumented production-only source. The remaining engineering mode should shift from broad source archaeology to:

1. dependency/rebuild validation,
2. isolated defect hardening,
3. controlled deployment plans,
4. rollback-tested production changes.
