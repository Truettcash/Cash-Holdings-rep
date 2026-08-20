-- ============================================================================
-- CASH HOLDINGS — OWNER-ONLY AUTH + RLS HARDENING
-- Target project: ldijllskwwmyhhbzspmb (external Cash Holdings Supabase)
-- Idempotent: safe to run more than once.
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> paste -> Run
--
-- Does NOT drop tables, columns, or rows. Does NOT disable RLS.
-- Aborts BEFORE touching policies if the owner account is missing.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. ROLE ENUM
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum ('owner');
  elsif not exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'app_role' and e.enumlabel = 'owner'
  ) then
    alter type public.app_role add value 'owner';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 2. USER ROLES TABLE
-- ---------------------------------------------------------------------------
create table if not exists public.user_roles (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       public.app_role not null,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'user_roles_user_id_role_key'
      and conrelid = 'public.user_roles'::regclass
  ) then
    alter table public.user_roles
      add constraint user_roles_user_id_role_key unique (user_id, role);
  end if;
end
$$;

revoke all on public.user_roles from anon;
grant select on public.user_roles to authenticated;
grant all    on public.user_roles to service_role;

alter table public.user_roles enable row level security;

-- ---------------------------------------------------------------------------
-- 3. has_role() — security definer, no user data exposed
-- ---------------------------------------------------------------------------
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = _user_id
      and role = _role
  );
$$;

revoke all on function public.has_role(uuid, public.app_role) from public;
revoke all on function public.has_role(uuid, public.app_role) from anon;
grant execute on function public.has_role(uuid, public.app_role) to authenticated;
grant execute on function public.has_role(uuid, public.app_role) to service_role;

-- user_roles is readable only by the owner (via the definer function above)
drop policy if exists "owner reads roles" on public.user_roles;
create policy "owner reads roles"
  on public.user_roles for select
  to authenticated
  using (public.has_role(auth.uid(), 'owner'));

-- ---------------------------------------------------------------------------
-- 4. OWNER ASSIGNMENT (aborts the whole migration if the account is missing)
-- ---------------------------------------------------------------------------
do $$
declare
  v_owner uuid;
begin
  select id into v_owner
  from auth.users
  where lower(email) = lower('cashtruett@gmail.com')
  limit 1;

  if v_owner is null then
    raise exception
      'ABORTED: no auth.users record for cashtruett@gmail.com. Create the owner account first; no policies were changed.';
  end if;

  insert into public.user_roles (user_id, role)
  values (v_owner, 'owner')
  on conflict (user_id, role) do nothing;
end
$$;

-- ---------------------------------------------------------------------------
-- 5. REPLACE PERMISSIVE POLICIES WITH OWNER-ONLY CRUD
-- ---------------------------------------------------------------------------
do $$
declare
  t   text;
  pol record;
  tables text[] := array[
    'brands',
    'channels',
    'projects',
    'project_tasks',
    'organizations',
    'contacts',
    'deals',
    'activities',
    'metric_definitions',
    'metric_observations',
    'engagements',
    'engagement_events'
  ];
begin
  foreach t in array tables loop
    -- skip tables that don't exist in this project
    if not exists (
      select 1 from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = t and c.relkind = 'r'
    ) then
      raise notice 'skipping missing table public.%', t;
      continue;
    end if;

    -- drop every existing policy on the table
    for pol in
      select policyname from pg_policies
      where schemaname = 'public' and tablename = t
    loop
      execute format('drop policy %I on public.%I', pol.policyname, t);
    end loop;

    -- RLS stays on
    execute format('alter table public.%I enable row level security', t);

    -- anon gets nothing at the privilege layer as well as the policy layer
    execute format('revoke all on public.%I from anon', t);
    execute format(
      'grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);

    -- four explicit owner-only policies
    execute format($f$
      create policy "owner select %1$s" on public.%1$I
        for select to authenticated
        using (public.has_role(auth.uid(), 'owner'))
    $f$, t);

    execute format($f$
      create policy "owner insert %1$s" on public.%1$I
        for insert to authenticated
        with check (public.has_role(auth.uid(), 'owner'))
    $f$, t);

    execute format($f$
      create policy "owner update %1$s" on public.%1$I
        for update to authenticated
        using (public.has_role(auth.uid(), 'owner'))
        with check (public.has_role(auth.uid(), 'owner'))
    $f$, t);

    execute format($f$
      create policy "owner delete %1$s" on public.%1$I
        for delete to authenticated
        using (public.has_role(auth.uid(), 'owner'))
    $f$, t);
  end loop;
end
$$;

commit;

-- ---------------------------------------------------------------------------
-- VERIFICATION (read-only; run after the migration)
-- ---------------------------------------------------------------------------
-- Owner is assigned:
--   select u.email, r.role from public.user_roles r
--   join auth.users u on u.id = r.user_id;
--
-- No always-true policies remain:
--   select tablename, policyname, cmd, qual, with_check
--   from pg_policies where schemaname = 'public'
--   order by tablename, cmd;
--
-- anon holds no table privileges:
--   select table_name, privilege_type
--   from information_schema.role_table_grants
--   where grantee = 'anon' and table_schema = 'public';
