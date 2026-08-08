# Database Migrations

This document explains the project's migration workflow and safety rules for running migrations against Supabase/Postgres.

Repository layout

- `supabase/migrations/` — all SQL migration files (timestamped, descriptive filenames). These are the single source of truth for schema/version history in Git.
- `scripts/db-migrate.js` — Node migration runner that applies pending `supabase/migrations/*.sql` files inside transactions and records applied filenames in `schema_migrations`.
- `scripts/db-status.js` — lists applied and pending migrations without applying changes.

Key principles

- Migration files in `supabase/migrations/` are authoritative and must be reviewed and approved before execution.
- Do NOT include example schema or sample tables in migrations. This repository is integrated with an existing production Supabase project — migrations must represent real, reviewed changes only.
- Do not run migrations against production without deliberate acknowledgment (see Production safeguard below).
- Do not use the Supabase service role key as a PostgreSQL connection string. Use `DATABASE_URL` for connecting directly to Postgres.

Environment variables

- `DATABASE_URL` — PostgreSQL connection string used by migration tooling (server/CI-only). NEVER expose this to Vite/browser code.
- `SUPABASE_URL` — public Supabase URL.
- `SUPABASE_ANON_KEY` — public (client) key suitable for browser usage.
- `SUPABASE_SERVICE_ROLE_KEY` — SERVER ONLY privileged key. NEVER expose to browser code. Use only in trusted server environments.

Running migrations locally

1. Copy `.env.example` to `.env` and fill in `DATABASE_URL` (server-only).
2. Review `supabase/migrations/` files.
3. To see pending migrations:

```bash
npm run db:migrate:status
```

4. To apply pending migrations locally (non-production):

```bash
npm run db:migrate
```

Production safeguard

If `NODE_ENV=production`, the migration runner will refuse to run unless the environment variable `ALLOW_PRODUCTION_MIGRATIONS=true` is set. This ensures that production migrations are deliberate.

CI / GitHub Actions

- This repo does not automatically execute migrations in CI. Production migration automation is intentionally omitted. You can add a dedicated, restricted workflow later that runs migrations against a production database under strict controls.

Notes

- The runner tracks applied migrations in a `schema_migrations` table in the target database. This is created if missing. If you prefer another system (for example, Supabase CLI's migration tooling), we can replace the runner accordingly.
