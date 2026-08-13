-- ---------------------------------------------------------------------------
-- CASH HOLDINGS — JARVIS RUNTIME PRESENCE
-- Target project: ldijllskwwmyhhbzspmb (external Cash Holdings Supabase)
-- Purpose: user-scoped runtime heartbeat metadata for the dedicated Jarvis user
-- session. No credentials, tokens, session IDs, or operational data are stored.
-- ---------------------------------------------------------------------------

begin;

create table if not exists public.jarvis_runtime_presence (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  runtime_key text not null,
  runtime_name text not null,
  agent_id text,
  agent_name text,
  status text not null default 'online',
  tool_count integer not null default 0,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint jarvis_runtime_presence_runtime_unique unique (user_id, runtime_key)
);

create index if not exists jarvis_runtime_presence_user_idx
  on public.jarvis_runtime_presence (user_id);

create index if not exists jarvis_runtime_presence_last_seen_idx
  on public.jarvis_runtime_presence (last_seen_at desc);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists jarvis_runtime_presence_touch_updated_at on public.jarvis_runtime_presence;
create trigger jarvis_runtime_presence_touch_updated_at
  before update on public.jarvis_runtime_presence
  for each row execute function public.touch_updated_at();

revoke all on public.jarvis_runtime_presence from anon;
revoke all on public.jarvis_runtime_presence from authenticated;
grant select, insert, update on public.jarvis_runtime_presence to authenticated;

alter table public.jarvis_runtime_presence enable row level security;

drop policy if exists "authenticated reads own jarvis runtime presence" on public.jarvis_runtime_presence;
drop policy if exists "authenticated inserts own jarvis runtime presence" on public.jarvis_runtime_presence;
drop policy if exists "authenticated updates own jarvis runtime presence" on public.jarvis_runtime_presence;

drop policy if exists "owner reads own jarvis runtime presence" on public.jarvis_runtime_presence;
drop policy if exists "owner inserts own jarvis runtime presence" on public.jarvis_runtime_presence;
drop policy if exists "owner updates own jarvis runtime presence" on public.jarvis_runtime_presence;

create policy "authenticated reads own jarvis runtime presence"
  on public.jarvis_runtime_presence for select to authenticated
  using (user_id = auth.uid());

create policy "authenticated inserts own jarvis runtime presence"
  on public.jarvis_runtime_presence for insert to authenticated
  with check (user_id = auth.uid());

create policy "authenticated updates own jarvis runtime presence"
  on public.jarvis_runtime_presence for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

commit;
