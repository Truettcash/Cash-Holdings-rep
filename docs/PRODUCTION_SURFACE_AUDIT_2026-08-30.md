# Production Surface Audit — 2026-08-30

## Objective

Establish an evidence-based view of what `Cash-Holdings-rep` actually controls today versus what is live in the production Supabase project `ldijllskwwmyhhbzspmb`. This audit is read-only and does not authorize production mutation.

## Executive conclusion

The primary control risk is **source-of-truth fragmentation**.

GitHub currently contains a governed recovery package for the Microsoft 365 integration plus the Hermes control plane. Production Supabase contains a much larger active application surface spanning integrations, commerce, ATHRTY outbound, Framer publishing/preview generation, Retell/call intelligence, Google Ads, eBay/Throttle Kings, Jarvis, learning/control-plane functions, and other runtime services.

Therefore this repository is **not yet a complete rebuildable representation of production**. Until live source is recovered into domain-organized source control, GitHub can govern only the slice it contains.

## Evidence snapshot

### GitHub-controlled application payload

Current application payload on `main` is limited to the recovered M365 package:

- `m365-connection-health`
- `m365-sharepoint-discovery`
- `m365-sync-sharepoint-dryrun`
- `m365-sync-sharepoint`
- `sync_m365_sharepoint_athrty_outbound_v1(...)`
- production schema/deployment evidence and SHA-256 manifests

The rest of the repository is governance/documentation (`AGENTS.md`, CODEOWNERS, PR template, Hermes QA workflow, learning/canary docs).

### Live production surface

Live Supabase was ACTIVE_HEALTHY during this audit and exposed many active Edge Functions beyond the four M365 functions. Observed domains include:

- core integrations / OAuth
- commerce / buyer inquiry / Stripe
- Microsoft 365 / SharePoint
- agent control plane / learning cycle / Jarvis
- ATHRTY prospect discovery, enrichment, scoring, research, outreach, red-team and response intelligence
- Framer publishing, inspection, rendering, preview factory and telemetry
- Retell / phone / call intelligence
- Google Ads sync and optimization
- eBay / Throttle Kings marketplace operations

This is a production-to-repository coverage gap, not necessarily a runtime failure.

## Ranked findings

### P0 — Production is not fully source-controlled

**State:** OPEN

The majority of the live Supabase function surface is absent from this repository. That prevents deterministic rebuild, reliable rollback, full code review, global secret scanning and branch/PR governance across the operating system.

**Required correction:** recover live source and database contracts into GitHub by domain before using this repository as the production source of truth.

### P1 — M365 health endpoint auth contract is inconsistent

**State:** OPEN — do not patch blindly

Production reports `m365-connection-health` with `verify_jwt = false`. The recovered source comments that platform-level JWT verification is expected, but the function itself only checks that the `Authorization` header exists and starts with `Bearer `.

That means the code-level check is not authentication when platform JWT verification is disabled. The function is read-only, but it can obtain a Microsoft client-credentials token and return SharePoint site/list/drive metadata.

**Required correction:** choose one explicit contract and test it before deployment:

1. preferred: enable platform JWT verification and retain authenticated operator access; or
2. implement a real signed internal/custom authorization scheme if this endpoint must remain `verify_jwt = false`.

### P1 — Production M365 sync uses service-role writes after only platform JWT admission

**State:** OPEN — verify intended caller model

`m365-sync-sharepoint` is deployed with `verify_jwt = true`, then creates a Supabase client with the service-role credential. In the recovered source, the request path checks for an Authorization header but does not perform an additional user/role/ownership authorization before the privileged writer is created and used.

If the project can contain more than one authenticated principal, a valid project JWT may be enough to invoke a fixed privileged production sync.

**Required correction:** define the operator principal and enforce it explicitly before privileged writes. Candidate patterns: owner/admin role assertion, dedicated internal service identity, or private orchestration endpoint.

### P1 — Supabase Security Advisor has externally facing findings

**State:** OPEN — triage separately

The production security advisor currently reports:

- `ERROR` findings for multiple `SECURITY DEFINER` views, including `prospect_outreach_eligibility`, `athrty_contractor_lead_page_candidates`, and `athrty_commercial_product_router`.
- multiple RLS-enabled tables with no policies.
- multiple anonymous/authenticated-executable `SECURITY DEFINER` functions that require intent review.
- mutable `search_path` warnings, including `public.sync_m365_sharepoint_athrty_outbound_v1`.
- leaked-password protection disabled.

These findings are not permission to blanket-change production. Each must be classified as intentional-public, internal-only, or misconfigured before remediation.

### P2 — Recovery version metadata is not a reliable rollout identifier

**State:** OPEN

The recovered M365 deployment SHAs match the currently observed Supabase `ezbr_sha256` values, which is strong source-parity evidence. However, the recovery manifest version labels do not match the current Supabase-reported function versions.

Treat deployment SHA as the stronger parity key until version semantics are normalized.

### P2 — Repository navigation is too thin

**State:** IN PROGRESS

The root repository had effectively no architectural map. `docs/ARCHITECTURE.md` is introduced in this audit branch to make domain boundaries, production boundaries and control flow explicit.

## Decision

Do **not** refactor or redeploy the recovered M365 package as part of this audit.

The correct sequence is:

1. recover the broader live production surface into GitHub;
2. establish a deterministic domain layout and inventory manifest;
3. add static/runtime tests around recovered code;
4. harden the highest-risk auth/security surfaces in separate PRs;
5. deploy only after each production-changing PR passes QA and explicit human approval.

## Audit status

- Production health: **GREEN** (`ACTIVE_HEALTHY`)
- M365 deployment SHA parity: **GREEN**
- Hermes PR/QA path: **GREEN**
- Complete source-control coverage: **RED**
- M365 health auth contract: **AMBER/RED**
- Privileged sync caller authorization: **AMBER**
- Supabase security-advisor backlog: **AMBER/RED**
- Production mutation performed by this audit: **NONE**
