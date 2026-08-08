# Supabase Clients: Cash Holdings vs Legacy Lovable

This document explains the two Supabase client roles present in the repository and the intended usage during recovery and migration.

1. Authoritative external Cash Holdings Supabase client

- Path: `src/integrations/cash-holdings/client.ts`
- Export: `cashHoldingsSupabase`
- Purpose: authoritative browser-safe client used for operating reads and authenticated user sessions for the Cash Holdings application. This client uses environment variables:
  - `VITE_CASH_SUPABASE_URL`
  - `VITE_CASH_SUPABASE_PUBLISHABLE_KEY`
- Configuration (parity baseline): `persistSession: true`, `autoRefreshToken: true`, `detectSessionInUrl: true`, `storageKey: "cash-holdings-auth"`.
- Usage: all authenticated routes, session hooks, and attachers reference this client. It is the source of truth for authenticated frontend reads (safe views).

2. Legacy Lovable-managed Supabase client

- Path: `src/integrations/supabase/client.ts` (exists in repo)
- Export: `supabase` (legacy)
- Purpose: older, Lovable-managed project client that includes generated `Database` types and server/admin clients. It is intentionally retained to avoid breaking legacy imports.
- Note: At present the live app uses the Cash Holdings client for authentication and live reads. The legacy client remains dormant; do not remove it during recovery.

Guidance during recovery

- Preserve both clients verbatim during parity commits. Do not refactor the Cash Holdings client before it is recovered and committed.
- The Cash Holdings client must be considered authoritative for frontend reads of `v_integration_connections_safe` and `v_integration_sync_runs_safe`.
- Mutations must remain behind server-side gateways; the frontend must not use either client to expose service-role keys or perform privileged actions.

After recovery

- Generate DB types from the authoritative project and commit them under `src/integrations/cash-holdings/database.types.ts` (or follow existing project conventions). Then type the client via `createClient<Database>(...)`.
- Implement DB→application mappers only after committing generated types.
