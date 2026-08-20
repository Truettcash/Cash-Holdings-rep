-- CASH HOLDINGS — shared external-integration layer
-- Project: ldijllskwwmyhhbzspmb
-- Idempotent. Additive only: existing integration tables are never dropped or rewritten.
-- Run in the Supabase SQL editor as the project owner.

begin;

-- ─────────────────────────────────────────────
-- 0. OWNER ROLE MODEL (no-op if already present)
-- ─────────────────────────────────────────────
do $$ begin
  create type public.app_role as enum ('owner');
exception when duplicate_object then null; end $$;

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

do $$ begin
  create policy "owner reads own roles" on public.user_roles
    for select to authenticated using (user_id = auth.uid());
exception when duplicate_object then null; end $$;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create or replace function public.is_owner()
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(auth.uid(), 'owner')
$$;

-- Assign the owner role. Aborts if the account does not exist.
do $$
declare v_uid uuid;
begin
  select id into v_uid from auth.users where lower(email) = 'cashtruett@gmail.com';
  if v_uid is null then
    raise exception 'Owner account cashtruett@gmail.com not found in auth.users — aborting';
  end if;
  insert into public.user_roles (user_id, role) values (v_uid, 'owner')
  on conflict (user_id, role) do nothing;
end $$;

-- ─────────────────────────────────────────────
-- 1. SHARED INTEGRATION TABLES
-- ─────────────────────────────────────────────
create table if not exists public.integration_accounts (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  brand_key text,
  external_account_id text,
  account_name text,
  account_username text,
  account_type text,
  status text not null default 'disconnected',
  scopes text[],
  access_token_encrypted text,
  refresh_token_encrypted text,
  token_expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$ begin
  alter table public.integration_accounts
    add constraint integration_accounts_provider_check
    check (provider in ('instagram','youtube','google-analytics','ebay'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.integration_accounts
    add constraint integration_accounts_status_check
    check (status in ('disconnected','connecting','connected','error','revoked'));
exception when duplicate_object then null; end $$;

-- One row per provider account.
create unique index if not exists integration_accounts_provider_external_key
  on public.integration_accounts (provider, external_account_id)
  where external_account_id is not null;

create index if not exists integration_accounts_brand_idx
  on public.integration_accounts (brand_key);

create or replace function public.touch_integration_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists integration_accounts_touch on public.integration_accounts;
create trigger integration_accounts_touch before update on public.integration_accounts
  for each row execute function public.touch_integration_updated_at();

-- integration_sync_runs already exists in this project: bring it up to spec additively.
create table if not exists public.integration_sync_runs (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  sync_type text not null,
  status text not null,
  started_at timestamptz not null default now()
);
alter table public.integration_sync_runs
  add column if not exists integration_account_id uuid references public.integration_accounts(id) on delete set null,
  add column if not exists provider text,
  add column if not exists sync_type text,
  add column if not exists status text,
  add column if not exists started_at timestamptz not null default now(),
  add column if not exists completed_at timestamptz,
  add column if not exists records_received integer not null default 0,
  add column if not exists records_written integer not null default 0,
  add column if not exists error_code text,
  add column if not exists error_message text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists integration_sync_runs_account_idx
  on public.integration_sync_runs (integration_account_id, started_at desc);

create table if not exists public.integration_events (
  id uuid primary key default gen_random_uuid(),
  integration_account_id uuid references public.integration_accounts(id) on delete cascade,
  provider text not null,
  event_type text not null,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists integration_events_account_idx
  on public.integration_events (integration_account_id, created_at desc);

-- Append-only: block updates and deletes at the database level for every role.
create or replace function public.integration_events_append_only()
returns trigger language plpgsql set search_path = public as $$
begin raise exception 'integration_events is append-only'; end $$;

drop trigger if exists integration_events_no_mutate on public.integration_events;
create trigger integration_events_no_mutate before update or delete on public.integration_events
  for each row execute function public.integration_events_append_only();

-- ─────────────────────────────────────────────
-- 2. RAW PLATFORM ARCHIVE (bounded)
-- ─────────────────────────────────────────────
create table if not exists public.integration_raw_records (
  id uuid primary key default gen_random_uuid(),
  integration_account_id uuid references public.integration_accounts(id) on delete cascade,
  provider text not null,
  record_type text not null,
  external_record_id text,
  observed_at timestamptz,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create unique index if not exists integration_raw_records_dedupe_key
  on public.integration_raw_records (provider, record_type, external_record_id)
  where external_record_id is not null;

create index if not exists integration_raw_records_account_idx
  on public.integration_raw_records (integration_account_id, observed_at desc);

-- ─────────────────────────────────────────────
-- 3. NORMALIZED METRIC METADATA (existing tables, additive)
-- ─────────────────────────────────────────────
alter table public.metric_definitions
  add column if not exists provider text,
  add column if not exists brand_key text,
  add column if not exists channel text,
  add column if not exists metric_key text,
  add column if not exists display_name text,
  add column if not exists aggregation_type text;

create unique index if not exists metric_definitions_provider_key
  on public.metric_definitions (provider, brand_key, channel, metric_key)
  where provider is not null and metric_key is not null;

alter table public.metric_observations
  add column if not exists external_account_id text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

-- Prevent duplicate points when a sync re-runs over the same window.
create unique index if not exists metric_observations_dedupe_key
  on public.metric_observations (metric_definition_id, observed_at, coalesce(external_account_id, ''));

-- ─────────────────────────────────────────────
-- 4. GRANTS + OWNER-ONLY RLS
-- ─────────────────────────────────────────────
-- Tokens live on integration_accounts, so the browser roles get NO privilege on
-- that table at all. Dashboard reads go through the token-free view below.
revoke all on public.integration_accounts from anon, authenticated;
grant all on public.integration_accounts to service_role;

revoke all on public.integration_raw_records from anon, authenticated;
grant all on public.integration_raw_records to service_role;

revoke all on public.integration_sync_runs from anon;
grant select on public.integration_sync_runs to authenticated;
grant all on public.integration_sync_runs to service_role;

revoke all on public.integration_events from anon;
grant select on public.integration_events to authenticated;
grant all on public.integration_events to service_role;

alter table public.integration_accounts enable row level security;
alter table public.integration_sync_runs enable row level security;
alter table public.integration_events enable row level security;
alter table public.integration_raw_records enable row level security;

do $$ begin
  create policy "owner reads sync runs" on public.integration_sync_runs
    for select to authenticated using (public.is_owner());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "owner reads integration events" on public.integration_events
    for select to authenticated using (public.is_owner());
exception when duplicate_object then null; end $$;

-- No policies for anon/authenticated on integration_accounts or
-- integration_raw_records: only service_role (RLS-bypassing) may touch them.

-- Token-free projection for the dashboard. security_invoker keeps RLS/permission
-- checks running as the caller; the owner gate is explicit in the WHERE clause.
create or replace view public.integration_accounts_safe
with (security_invoker = off) as
  select id, provider, brand_key, external_account_id, account_name, account_username,
         account_type, status, scopes, token_expires_at, last_synced_at, last_error,
         metadata - 'tokens' as metadata, created_at, updated_at
  from public.integration_accounts
  where public.is_owner();

revoke all on public.integration_accounts_safe from anon;
grant select on public.integration_accounts_safe to authenticated;
grant select on public.integration_accounts_safe to service_role;

commit;