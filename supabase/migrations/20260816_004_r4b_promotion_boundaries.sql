-- ============================================================================
-- R4B.6H-R2B — PROMOTION STORAGE BOUNDARY
-- Purpose: append-only, owner-scoped promotion review record storage.
-- Scope: review events + observation records + accepted constraints + evidence requests.
-- Absolute stop: no migration deploy; no production write gateway; no write registration.
-- ============================================================================

begin;

create type promotion_action_enum as enum (
  'ACCEPT_SIGNAL',
  'ACCEPT_PATTERN_MATCH',
  'ACCEPT_CONSTRAINT',
  'REJECT_CANDIDATE',
  'MARK_UNCERTAIN',
  'REQUEST_MORE_EVIDENCE'
);

create type promotion_target_enum as enum (
  'signal',
  'pattern',
  'constraint',
  'candidate'
);

create type promotion_status_enum as enum (
  'UNDER_REVIEW',
  'ACCEPTED',
  'REJECTED',
  'UNCERTAIN',
  'MORE_EVIDENCE_REQUESTED'
);

create or replace function public.ensure_same_owner_for_evidence_ids()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_ref_id uuid;
  v_owner uuid;
begin
  if new.owner_user_id is null then
    raise exception 'owner_user_id is required';
  end if;

  if auth.uid() is null then
    raise exception 'authenticated user required';
  end if;

  if new.owner_user_id <> auth.uid() then
    raise exception 'owner_user_id mismatch';
  end if;

  if new.evidence_ref_ids is null or array_length(new.evidence_ref_ids, 1) is null then
    return new;
  end if;

  foreach v_ref_id in array new.evidence_ref_ids loop
    select owner_user_id into v_owner
    from public.intelligence_evidence_refs
    where id = v_ref_id;

    if v_owner is null then
      raise exception 'evidence reference does not exist';
    end if;

    if v_owner <> new.owner_user_id then
      raise exception 'cross-owner evidence reference rejected';
    end if;
  end loop;

  return new;
end;
$$;

create table if not exists public.intelligence_review_events (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  trace_id text not null,
  action_type promotion_action_enum not null,
  target_type promotion_target_enum not null,
  target_ref text not null,
  scope text not null default 'current operating context',
  reason text not null,
  evidence_ref_ids uuid[] not null default '{}'::uuid[],
  expected_resulting_lifecycle_state text not null default 'UNDER_REVIEW',
  notes text,
  idempotency_key text not null,
  payload_hash text not null,
  status promotion_status_enum not null default 'UNDER_REVIEW',
  created_at timestamptz not null default now(),
  constraint intelligence_review_events_unique unique (owner_user_id, idempotency_key),
  constraint intelligence_review_events_trace_required check (length(trim(trace_id)) > 0),
  constraint intelligence_review_events_target_ref_required check (length(trim(target_ref)) > 0),
  constraint intelligence_review_events_reason_required check (length(trim(reason)) > 0)
);

create table if not exists public.pattern_observations (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  trace_id text not null,
  pattern_key text not null,
  target_ref text not null,
  decision text not null check (decision in ('accepted', 'rejected', 'uncertain')),
  scope text not null default 'current operating context',
  confidence numeric(5,4) not null default 0,
  evidence_ref_ids uuid[] not null default '{}'::uuid[],
  idempotency_key text not null,
  payload_hash text not null,
  created_at timestamptz not null default now(),
  constraint pattern_observations_unique unique (owner_user_id, idempotency_key),
  constraint pattern_observations_trace_required check (length(trim(trace_id)) > 0),
  constraint pattern_observations_pattern_key_required check (length(trim(pattern_key)) > 0),
  constraint pattern_observations_target_ref_required check (length(trim(target_ref)) > 0)
);

create table if not exists public.accepted_constraints (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  trace_id text not null,
  constraint_id text not null,
  target_ref text not null,
  scope text not null default 'current operating context',
  evidence_ref_ids uuid[] not null default '{}'::uuid[],
  idempotency_key text not null,
  payload_hash text not null,
  created_at timestamptz not null default now(),
  constraint accepted_constraints_unique unique (owner_user_id, idempotency_key),
  constraint accepted_constraints_trace_required check (length(trim(trace_id)) > 0),
  constraint accepted_constraints_target_ref_required check (length(trim(target_ref)) > 0),
  constraint accepted_constraints_constraint_id_required check (length(trim(constraint_id)) > 0)
);

create table if not exists public.evidence_requests (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  trace_id text not null,
  target_ref text not null,
  scope text not null default 'current operating context',
  reason text not null,
  missing_state text[] not null default '{}'::text[],
  evidence_ref_ids uuid[] not null default '{}'::uuid[],
  idempotency_key text not null,
  payload_hash text not null,
  created_at timestamptz not null default now(),
  constraint evidence_requests_unique unique (owner_user_id, idempotency_key),
  constraint evidence_requests_trace_required check (length(trim(trace_id)) > 0),
  constraint evidence_requests_target_ref_required check (length(trim(target_ref)) > 0),
  constraint evidence_requests_reason_required check (length(trim(reason)) > 0)
);

create trigger intelligence_review_events_owner_guard
before insert or update on public.intelligence_review_events
for each row execute function public.ensure_same_owner_for_evidence_ids();

create trigger pattern_observations_owner_guard
before insert or update on public.pattern_observations
for each row execute function public.ensure_same_owner_for_evidence_ids();

create trigger accepted_constraints_owner_guard
before insert or update on public.accepted_constraints
for each row execute function public.ensure_same_owner_for_evidence_ids();

create trigger evidence_requests_owner_guard
before insert or update on public.evidence_requests
for each row execute function public.ensure_same_owner_for_evidence_ids();

alter table public.intelligence_review_events enable row level security;
alter table public.pattern_observations enable row level security;
alter table public.accepted_constraints enable row level security;
alter table public.evidence_requests enable row level security;

create policy "owner reads own review events"
  on public.intelligence_review_events for select to authenticated
  using (owner_user_id = auth.uid());
create policy "owner inserts own review events"
  on public.intelligence_review_events for insert to authenticated
  with check (owner_user_id = auth.uid());

create policy "owner reads own pattern observations"
  on public.pattern_observations for select to authenticated
  using (owner_user_id = auth.uid());
create policy "owner inserts own pattern observations"
  on public.pattern_observations for insert to authenticated
  with check (owner_user_id = auth.uid());

create policy "owner reads own accepted constraints"
  on public.accepted_constraints for select to authenticated
  using (owner_user_id = auth.uid());
create policy "owner inserts own accepted constraints"
  on public.accepted_constraints for insert to authenticated
  with check (owner_user_id = auth.uid());

create policy "owner reads own evidence requests"
  on public.evidence_requests for select to authenticated
  using (owner_user_id = auth.uid());
create policy "owner inserts own evidence requests"
  on public.evidence_requests for insert to authenticated
  with check (owner_user_id = auth.uid());

create index if not exists intelligence_review_events_owner_trace_idx
  on public.intelligence_review_events (owner_user_id, trace_id, created_at desc);
create index if not exists intelligence_review_events_action_idx
  on public.intelligence_review_events (owner_user_id, action_type, created_at desc);
create index if not exists pattern_observations_owner_trace_idx
  on public.pattern_observations (owner_user_id, trace_id, created_at desc);
create index if not exists accepted_constraints_owner_trace_idx
  on public.accepted_constraints (owner_user_id, trace_id, created_at desc);
create index if not exists evidence_requests_owner_trace_idx
  on public.evidence_requests (owner_user_id, trace_id, created_at desc);

commit;
