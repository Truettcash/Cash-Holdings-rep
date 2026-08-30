# Cash Holdings

Governed source-control and recovery repository for the Cash Holdings operating system.

## Current state

This repository currently contains:

- Hermes governance and QA controls
- an immutable recovered Microsoft 365 / SharePoint production package
- architecture, audit and recovery/hardening documentation

It does **not yet contain the complete live production surface**. Production Supabase currently contains additional active functions and database logic that must be recovered and reconciled into Git before this repository can be treated as the complete source of truth.

## Start here

- [`AGENTS.md`](AGENTS.md) — agent operating contract and production boundaries
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — system/domain architecture
- [`docs/PRODUCTION_SURFACE_AUDIT_2026-08-30.md`](docs/PRODUCTION_SURFACE_AUDIT_2026-08-30.md) — current production-vs-Git audit
- [`docs/RECOVERY_AND_HARDENING_PLAN.md`](docs/RECOVERY_AND_HARDENING_PLAN.md) — convergence and security-hardening sequence
- [`docs/HERMES_LEARNING_LOG.md`](docs/HERMES_LEARNING_LOG.md) — validated operating lessons

## Delivery contract

`task -> branch -> validation -> pull request -> Hermes QA -> human approval for sensitive changes -> merge -> deployment verification -> learning`

Production-changing work must remain reversible, evidenced and scoped. Secrets never belong in Git.
