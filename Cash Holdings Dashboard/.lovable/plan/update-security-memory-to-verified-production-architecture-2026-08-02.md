# Update Security Memory to Verified Production Architecture

Rewrite the project's security memory document so it describes the architecture as it stands now: one external production database that has completed owner-only RLS hardening, and an unused managed Lovable Cloud database whose scanner findings are out of scope.

No application code, database schema, or policy changes are part of this task. The only change is the security memory document.

## What the updated memory will say

**Application and access model**
- Private single-operator console. No public surface, no self-service sign-up.
- The app uses only the external Cash Holdings Supabase project. All auth, sessions, reads, writes, and queries go through `cashHoldingsSupabase`.
- Confirmed by repository inspection: no active application code imports the managed Lovable Cloud client.

**External production database — hardened, complete**
- `public.app_role` and `public.user_roles` exist; roles live in their own table, never on a profile or user row.
- `cashtruett@gmail.com` holds the `owner` role.
- `public.has_role()` is SECURITY DEFINER with a controlled `search_path`.
- `anon` access is revoked from the private operating tables.
- Authenticated users without the owner role cannot reach private operating data; owner access flows through owner-only policies.
- Unrestricted `USING (true)` / `WITH CHECK (true)` policies were replaced on the core production tables.
- `service_role` access remains available for server-side Edge Function writes.
- Protected tables: brands, channels, projects, project_tasks, organizations, contacts, deals, activities, metric_definitions, metric_observations, engagements, engagement_events.
- Authority Systems and Truett Cash intake continue writing through the `authority-intake` Edge Function using service_role.

**Managed Lovable Cloud database — not applicable**
- The 11 scanner findings apply only to the managed database's empty legacy prototype tables (contacts, deals, organizations, activities, brands, channels, projects, project_tasks, metric_definitions, metric_observations).
- Classified as NOT APPLICABLE TO CURRENT PRODUCTION ARCHITECTURE — explicitly not described as technically remediated, since those policies were not changed.
- The exemption is void the moment any application code connects to the managed project; at that point those tables must be hardened before use.
- These findings should not be reopened while the app does not use that database.

**What must never happen** (carried forward and kept current)
- Non-owner or anonymous access to CRM, project, or metric data in the production database.
- OAuth tokens, client secrets, HMAC state secrets, or service-role credentials reaching the browser.
- Fabricated integration status in the UI — connection state, last sync, and health render only from real query results.
- Account-enumerating auth or password-reset responses.

**Where remaining security attention belongs**
Integration tables and token storage, OAuth callback security, password recovery verification, session expiration behavior, audit logging, future multi-user role expansion, and advanced penetration testing. This is listed as focus areas, not as a list of open findings.

## Notes on accuracy

Two things in the memory will be attributed to operator confirmation rather than written as something I verified from here, so the document stays honest:

- The external project's hardened state (roles, `has_role()`, revoked `anon`, replaced policies) was applied and confirmed by you in that project's SQL editor. I have no connection to `ldijllskwwmyhhbzspmb` from this environment, so I cannot re-verify it — the memory will record it as operator-confirmed complete, and will not say the migration is pending.
- The `authority-intake` Edge Function is not part of this repository (it holds `integrations`, `instagram-integrations`, and `ebay-integrations`). The memory will describe it as living in the shared external project.

## Technical detail

Single call to the security memory tool, replacing the document wholesale. Stale content is removed rather than appended to, so the document cannot later justify ignoring a real finding: the managed-database exemption is scoped narrowly and carries its own invalidation condition. No open-findings list is stored.
