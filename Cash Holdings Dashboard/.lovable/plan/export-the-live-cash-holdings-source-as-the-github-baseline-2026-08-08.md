# Export the live Cash Holdings source as the GitHub baseline

Goal: hand you the exact, unmodified current source of the live app, packaged for commit — no refactors, no regeneration, no deploys, no secrets.

## What gets produced

A single archive written to the artifacts folder (`/mnt/documents/cash-holdings-live-baseline.zip`) containing every tracked source file, plus a printed inventory in chat.

Included (all as-is on disk today):
- `src/` — 149 files: routes, components, feature modules (`src/lib/analytics`, `src/lib/engagements`, `src/lib/integrations`, `src/lib/intelligence`), both Supabase integrations, auth/session helpers, router + bootstrap
- Build/config: `package.json`, `package-lock.json`, `bun.lock`, `bunfig.toml`, `tsconfig.json`, `vite.config.ts`, `eslint.config.js`, `components.json`, `.prettierrc`, `.prettierignore`, `.gitignore`, `AGENTS.md`
- Backend-adjacent source already in the repo: `edge-functions/`, `db/*.sql`, `supabase/config.toml`, `supabase/migrations/`
- `.env.example` generated fresh with variable **names only**, no values

Excluded: `node_modules`, build output, caches, `.env`, any key/token/secret value, `.lovable/` internal planning files.

## Answers to your nine questions (verified against the working tree)

1. **Total source file count** — 177 tracked files excluding `.lovable/`; 149 of them under `src/`.
2. **App entry** — no `index.html` and no `public/` directory exist; this is a TanStack Start SSR app. Entries are `src/router.tsx` (client/router bootstrap), `src/server.ts` (SSR entry, wired via `vite.config.ts` → `tanstackStart.server.entry`), and `src/start.ts` (middleware registration).
3. **Router configuration** — `src/router.tsx` plus file-based routes in `src/routes/`, with the generated tree at `src/routeTree.gen.ts`; root layout `src/routes/__root.tsx`, auth gate `src/routes/_authenticated/route.tsx`.
4. **Authoritative Cash Holdings Supabase client** — `src/integrations/cash-holdings/client.ts`, export `cashHoldingsSupabase` (plus `auth-attacher.ts` in the same folder).
5. **Legacy Lovable-managed client** — present at `src/integrations/supabase/client.ts` (export `supabase`), with `client.server.ts`, `auth-middleware.ts`, `auth-attacher.ts`, `types.ts`.
6. **Package manager / lockfile** — bun is the primary manager (`bun.lock`, `bunfig.toml`); `package-lock.json` is also tracked. Both ship in the archive.
7. **Generated Supabase Database types** — yes: `src/integrations/supabase/types.ts` (630 lines), typed for the legacy managed project. The external Cash Holdings client is untyped.
8. **Lovable-generated, do-not-hand-edit files** — `src/routeTree.gen.ts` (TanStack plugin) and `src/integrations/supabase/{client.ts, client.server.ts, auth-middleware.ts, auth-attacher.ts, types.ts}`. A `GENERATED-FILES.md` note listing these goes in the archive root.
9. **Preferred export method** — connect Git sync (Plus menu → GitHub → Connect project) so the repo becomes the live two-way baseline; "Download codebase" in the code editor is the manual alternative. The archive from this plan is for an immediate one-shot commit.

## Notes

Read-only operation: files are copied into the archive, nothing in the project is modified, regenerated, or deployed. No comparison or merge with any other repository.