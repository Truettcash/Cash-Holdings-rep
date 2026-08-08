# Source Reconciliation: Cash Holdings

Purpose
-------

This document records the gap between the live Cash Holdings deployment (Lovable) and this GitHub repository, and prescribes a safe recovery plan. Do NOT redeploy, modify production, run migrations, or fabricate source or schema. Follow the recovery steps exactly.

Repository inspection (what exists here)
--------------------------------------

- A React frontend application under `src/` with `App.tsx`, `main.tsx`, `QueryClientProvider`, many UI features (CRM, agents, website-outbound, etc.).
- Frontend integration scaffolding under `src/features/integrations/` (types, schemas, UI components, and a Supabase-backed factory I added that expects an external client).
- One supabase migration file: `supabase/migrations/20260808_001_website_outbound_idempotency.sql`.
- Environment example: `.env.example` with `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` placeholders.
- No `edge-functions/` or `supabase/functions/` source directories present in this repo.

Missing production/deployed source (must be recovered)
---------------------------------------------------

The following deployed serverless functions are known to exist in production but have no source here. Do NOT reimplement — recover the exact deployed source and commit verbatim as a baseline before changes.

- ATHRTY-buyer-inquiry
- ATHRTY-stripe-webhook
- authority-intake
- buyer-inquiry
- instagram-integrations
- integrations
- website-outbound-crm-dryrun

Missing authoritative Supabase client
------------------------------------

- This repo does not contain the browser-safe Cash Holdings Supabase client (no `createClient(...)` or `@supabase/supabase-js` client creation found). The app expects a client to be available at runtime; do not create a replacement client in this repo — recover the original client initialization file from the Lovable project and commit it.

Missing DB/view contracts
------------------------

The following database objects must be recovered (DDL or generated TS types preferred). Do NOT guess columns.

- public.brands
- public.channels
- public.integration_connections
- public.integration_oauth_states
- public.integration_sync_runs
- public.metric_definitions
- public.metric_observations
- v_integration_connections_safe (VIEW)
- v_integration_sync_runs_safe (VIEW)

Preferred recovery artifacts (in order of value)
-----------------------------------------------

1. Exact `CREATE VIEW` / DDL for the views and tables (preferred). Commit under `supabase/ddl/`.
2. Generated Supabase TypeScript types (from `supabase gen types`) committed under `src/db/types/`.
3. Schema-only SQL dump limited to the above objects.

Recovery runbook (summary)
--------------------------

1. Use Supabase UI/CLI to export the exact function source for each deployed Edge Function.
2. Create `edge-functions/<function-name>/` and commit the recovered code verbatim.
3. Export the view/table DDL for the safe views and commit under `supabase/ddl/`.
4. Optionally generate TS DB types and commit under `src/db/types/`.
5. Open a PR with recovered code and DDL; do not change behavior in the same PR — first establish parity.

Files expected to be added once recovered (example tree)
------------------------------------------------------

edge-functions/
├── ATHRTY-buyer-inquiry/
├── ATHRTY-stripe-webhook/
├── authority-intake/
├── buyer-inquiry/
├── instagram-integrations/
├── integrations/
└── website-outbound-crm-dryrun/

supabase/ddl/
├── views_v_integration_connections_safe.sql
├── views_v_integration_sync_runs_safe.sql
└── tables_brands_channels_integration_*.sql

Recovery notes and constraints
------------------------------

- Do not add service-role keys or commit credentials. Keep recovered code verbatim and audited before any changes.
- Do not run migrations from this repository against production without explicit approval.
- After recovery, implement DB→application mappers that convert snake_case DB columns to the frontend Zod schemas; do not assume field names beforehand.

Action required
---------------

1. Obtain the deployed Edge Function source code from the deployment environment (Supabase UI/CLI, provider backups, or CI artifacts). Place under `edge-functions/` and commit.
2. Export/create DDL for the safe views and tables listed above and commit to `supabase/ddl/`.
3. Provide or restore the authoritative browser Supabase client (file that instantiates `createClient(SUPABASE_URL, SUPABASE_ANON_KEY)`) and commit it under `src/` (preserve its original path if possible).
4. After the above are in the repo, implement DB→app mappers and finalize IntegrationApi wiring at app initialization.

Do not proceed with frontend-to-provider mutation wiring until server-side endpoints exist and are verified.
