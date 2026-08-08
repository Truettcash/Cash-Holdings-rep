-- ============================================================================
-- CASH HOLDINGS — NOTIFICATION INTERACTION STATE
-- Target project: ldijllskwwmyhhbzspmb (external Cash Holdings Supabase)
-- Idempotent: safe to run more than once.
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> paste -> Run
--
-- Stores ONLY per-operator interaction state (read / archived) for
-- notifications that the app derives from existing production rows.
-- No notification payload is duplicated. No existing table is modified.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. TABLE
-- ---------------------------------------------------------------------------
create table if not exists public.notification_state (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  notification_key text not null,
  read_at          timestamptz,
  archived_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create unique index if not exists notification_state_user_key_idx
  on public.notification_state (user_id, notification_key);

create index if not exists notification_state_user_idx
  on public.notification_state (user_id);

-- ---------------------------------------------------------------------------
-- 2. UPDATED_AT TRIGGER (reuses the shared function when it already exists)
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'touch_updated_at'
  ) then
    create function public.touch_updated_at()
    returns trigger
    language plpgsql
    set search_path = public
    as $fn$
    begin
      new.updated_at = now();
      return new;
    end;
    $fn$;
  end if;
end
$$;

drop trigger if exists notification_state_touch_updated_at on public.notification_state;
create trigger notification_state_touch_updated_at
  before update on public.notification_state
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 3. GRANTS
--    anon gets nothing. authenticated is gated by owner-only RLS below.
-- ---------------------------------------------------------------------------
revoke all on public.notification_state from anon;
grant select, insert, update, delete on public.notification_state to authenticated;
grant all on public.notification_state to service_role;

-- ---------------------------------------------------------------------------
-- 4. ROW LEVEL SECURITY — owner only, own rows only
--    Requires public.has_role(uuid, public.app_role) from db/harden-owner-rls.sql.
-- ---------------------------------------------------------------------------
alter table public.notification_state enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'has_role'
  ) then
    raise exception 'public.has_role() is missing — run db/harden-owner-rls.sql first.';
  end if;
end
$$;

drop policy if exists "owner reads own notification state"   on public.notification_state;
drop policy if exists "owner inserts own notification state" on public.notification_state;
drop policy if exists "owner updates own notification state" on public.notification_state;
drop policy if exists "owner deletes own notification state" on public.notification_state;

create policy "owner reads own notification state"
  on public.notification_state for select to authenticated
  using (user_id = auth.uid() and public.has_role(auth.uid(), 'owner'));

create policy "owner inserts own notification state"
  on public.notification_state for insert to authenticated
  with check (user_id = auth.uid() and public.has_role(auth.uid(), 'owner'));

create policy "owner updates own notification state"
  on public.notification_state for update to authenticated
  using (user_id = auth.uid() and public.has_role(auth.uid(), 'owner'))
  with check (user_id = auth.uid() and public.has_role(auth.uid(), 'owner'));

create policy "owner deletes own notification state"
  on public.notification_state for delete to authenticated
  using (user_id = auth.uid() and public.has_role(auth.uid(), 'owner'));

commit;

-- ---------------------------------------------------------------------------
-- VERIFICATION (run separately, signed in as the owner)
--   select count(*) from public.notification_state;          -- 0 rows, no error
--   select * from pg_policies where tablename = 'notification_state';
-- ---------------------------------------------------------------------------