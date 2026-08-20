# Harden Auth + RLS for Cash Holdings (owner-only)

## What I verified before writing this

- This project has no SQL write path to your external Cash Holdings project (`ldijllskwwmyhhbzspmb`): no `PGHOST`, no `SUPABASE_DB_URL`, and the Lovable migration tooling is bound to a different (Lovable Cloud) project. So I **cannot apply the migration myself** — the plan delivers one complete idempotent SQL script for you to run in your own project's SQL editor.
- The security scanner currently reports both findings you named: `SUPA_rls_policy_always_true` (warn) and `contacts_any_authenticated_user_access` (error). Both describe `USING (true)` policies for `authenticated` across all core tables.
- The app has **no password-reset UI at all** today (`src/routes/auth.tsx` is sign-in only; no `resetPasswordForEmail` / `updateUser` calls anywhere). Section 5 therefore needs new frontend work, not just Supabase URL config.
- No code in this app references `engagements` or `engagement_events`; those tables are written only by your service-role intake function, which RLS never applies to.

## Part 1 — SQL migration (you run it)

One idempotent script, safe to re-run, that:

1. Creates `public.app_role` enum with value `owner` (guarded by `if not exists`).
2. Creates `public.user_roles` (`id`, `user_id` → `auth.users` on delete cascade, `role`, `created_at`) with a unique constraint on `(user_id, role)`.
3. Grants `select` on `user_roles` to `authenticated`, `all` to `service_role`, no `anon` access; enables RLS; owner-only read policy.
4. Creates `public.has_role(_user_id uuid, _role public.app_role) returns boolean`, `stable`, `security definer`, `set search_path = public, pg_temp`, returning only a boolean existence check. Execute granted to `authenticated` and `service_role` only.
5. **Owner assignment guard**: looks up `cashtruett@gmail.com` in `auth.users`. If absent, the script raises an exception and rolls back *before* touching any policy — nothing is changed and you keep your current access. If present, inserts the `owner` role with `on conflict do nothing`.
6. Drops every existing policy on the twelve tables (`brands`, `channels`, `projects`, `project_tasks`, `organizations`, `contacts`, `deals`, `activities`, `metric_definitions`, `metric_observations`, and `engagements` / `engagement_events` if they exist) via a loop over `pg_policies`, then creates four explicit policies per table — `select`, `insert`, `update`, `delete` — each `to authenticated` and gated on `public.has_role(auth.uid(), 'owner')`.
7. Revokes all privileges from `anon` on those tables, keeps `select/insert/update/delete` for `authenticated` and `all` for `service_role`. RLS stays enabled everywhere; no table, column, or row is dropped or altered.

Net effect: anon gets nothing, a signed-in non-owner passes the grant check but fails every policy, the owner keeps full CRUD, and the intake function keeps writing because `service_role` bypasses RLS entirely.

## Part 2 — Password recovery (app changes)

1. New public route `src/routes/auth.reset-password.tsx` at `/auth/reset-password` that reads the recovery session from the URL and calls `supabase.auth.updateUser({ password })`, then sends you to sign-in.
2. Add a "Forgot password" affordance to `src/routes/auth.tsx` calling `cashHoldingsSupabase.auth.resetPasswordForEmail(email, { redirectTo: \`${window.location.origin}/auth/reset-password\` })`. The UI always shows the same neutral confirmation regardless of whether the email exists — no account enumeration.
3. Uses `window.location.origin`, so nothing about localhost is hardcoded.

## Part 3 — Supabase Auth URL config (you set it)

In your external project's Auth → URL Configuration:

- Site URL: `https://cash-holdings-os.lovable.app`
- Redirect URLs: `https://cash-holdings-os.lovable.app/auth/reset-password`, `https://id-preview--887516ad-65bf-4188-a5c1-e2c4a467c50b.lovable.app/auth/reset-password`, `http://localhost:8080/auth/reset-password`

Email/password sign-in stays enabled; nothing about providers changes.

## Part 4 — Verification

After you run the SQL and I ship the UI, I will drive the live app in a browser and report the exact matrix you asked for (Owner Role, Owner Assignment, RLS, Contacts Finding, Always-True Finding, Password Sign-In, Password Recovery, Intake Edge Function Compatibility, Overall).

Honest limits on that report:

- **anon** and **authenticated-without-role** access I can verify directly from this sandbox against your project's public API.
- **owner** access I verify through your signed-in session in the preview.
- **service_role** I cannot exercise — I have no secret key for your external project. I will mark intake compatibility as PASS-by-construction (RLS is bypassed for `service_role` and I change no grants it relies on) and say so plainly rather than claiming a live test.
- The Lovable security advisor scans the **Lovable Cloud** project, not your external one, so re-running it will not reflect these fixes. I will not mark the two findings as fixed on a scan that does not cover the database that changed; I will verify the policies directly instead and tell you the result.

## Order of work

1. I write the SQL script into the repo so you can copy it out and run it.
2. You run it and confirm (or report the "owner not found" error, which stops safely).
3. I ship the password-recovery route and forgot-password UI.
4. You set the Auth URL config.
5. I run verification and return the PASS/FAIL matrix.
