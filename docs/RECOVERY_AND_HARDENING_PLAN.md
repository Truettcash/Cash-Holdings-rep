# Recovery and Hardening Plan

## Goal

Converge the live Cash Holdings runtime into a governed, reproducible source-control system without destabilizing production.

## Phase 1 — Source-control convergence

### 1. Inventory

Create an authoritative production inventory containing, at minimum:

- Edge Function slug
- deployed `verify_jwt` state
- production deployment SHA
- runtime domain
- expected caller
- write/read capability
- required environment variable names
- source-controlled path
- parity state (`matched`, `missing`, `drifted`, `unknown`)

### 2. Recover live source

Extract active function source read-only and commit it by domain. Preserve the existing M365 recovery package as immutable evidence rather than rewriting it in place.

### 3. Recover database contracts

Source-control migrations/contracts for production-critical:

- tables and constraints
- RLS policies
- grants
- views
- RPC/functions
- triggers
- indexes

Do not generate destructive migrations merely to make source match a preferred style. First record production reality.

### 4. Establish parity checks

Add automation that compares source-controlled manifests to live deployment metadata and fails when production changes without a corresponding reviewed source update.

## Phase 2 — Critical authorization hardening

Handle each item as an independent, reversible PR.

### A. `m365-connection-health`

Current evidence: production `verify_jwt = false`, while code expects platform JWT verification and only checks the textual Bearer prefix.

Desired state: actual authentication, with either platform `verify_jwt = true` or a tested internal signed-auth scheme.

Required validation before deployment:

- no auth -> rejected
- malformed bearer -> rejected
- invalid JWT -> rejected
- valid intended operator -> succeeds
- Microsoft token/site/list/drive checks still succeed
- no credential/token body leakage

### B. `m365-sync-sharepoint`

Current evidence: platform `verify_jwt = true`; the function then uses a service-role client for production writes.

Desired state: explicit caller authorization before privileged client use.

Required validation:

- unauthenticated -> rejected by platform
- authenticated unauthorized principal -> rejected
- authorized operator/service identity -> allowed
- wrong integration connection -> rejected
- dry-run/source hash parity preserved
- duplicate/idempotency behavior preserved
- rollback path tested

### C. Database advisor findings

Triage in this order:

1. `ERROR` security-definer views
2. anonymously executable security-definer functions
3. authenticated security-definer functions
4. mutable `search_path` on privileged functions
5. RLS-with-no-policy tables according to intended exposure
6. auth password-hardening settings

For each advisor item, classify first:

- intentional public API
- internal API accidentally exposed
- inaccessible-by-policy despite lint
- confirmed vulnerability

Only confirmed misconfiguration becomes a production migration.

## Phase 3 — Runtime topology cleanup

After parity is established:

- remove or archive obsolete `*-once`, bootstrap, probe and admin-only functions that are no longer required
- group maintained source by domain
- formalize webhook signature verification contracts
- separate read agents from write agents
- centralize privileged mutation through narrow interfaces
- reduce duplicated provider-auth/client code

No live function should be deleted merely because its name suggests it is temporary; usage/logs must prove it is inactive first.

## Phase 4 — Enforced delivery

Target deployment path:

`task -> branch -> tests -> PR -> Hermes QA -> code owner / human approval -> merge -> deployment -> production health check -> learning log`

GitHub `main` should ultimately require:

- PRs
- Hermes Policy Gate
- code-owner review for sensitive paths
- no force pushes
- no branch deletion

## Completion criteria

The system is commercially green when:

- every active production function is inventoried
- every maintained function has a source-controlled canonical path
- production deployment SHAs can be reconciled to Git state
- privileged functions have documented caller/auth contracts
- security advisor `ERROR` findings are resolved or explicitly accepted with rationale
- sensitive production changes cannot bypass PR + QA + human gate
- rollback instructions exist for every deployment class
