-- ============================================================================
-- R4B.2 — DECISIONS, OUTCOMES, LESSONS
-- Purpose: explicit decision and after-action persistence above the derived
-- signal/construct layer. No production deploy. No ATHRTY intelligence rows.
-- ============================================================================

begin;

create type intelligence_decision_status as enum (
  'proposed',
  'accepted',
  'rejected',
  'superseded',
  'resolved'
);

create type intelligence_outcome_status as enum (
  'pending',
  'observed',
  'resolved',
  'rejected'
);

create table if not exists public.decision_paths (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  decision_type text not null,
  title text not null,
  summary text not null,
  decision_source text not null,
  status intelligence_decision_status not null default 'proposed',
  effective_from timestamptz,
  effective_to timestamptz,
  resolved_at timestamptz,
  superseded_by uuid references public.decision_paths(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint decision_paths_type_check check (
    decision_type in (
      'priority',
      'resource_allocation',
      'sequence',
      'go_no_go',
      'commercial_choice',
      'operating_choice'
    )
  ),
  constraint decision_paths_source_check check (
    decision_source in ('operator', 'approved_agent', 'explicit_policy')
  ),
  constraint decision_paths_timeline_check check (
    effective_to is null or effective_to >= effective_from
  )
);

create trigger decision_paths_touch_updated_at
before update on public.decision_paths
for each row execute function public.touch_updated_at();

create or replace function public.validate_decision_evidence_owner()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_decision_owner uuid;
  v_evidence_owner uuid;
begin
  select owner_user_id into v_decision_owner from public.decision_paths where id = new.decision_id;
  if v_decision_owner is null then
    raise exception 'decision_evidence.decision_id does not exist';
  end if;
  if v_decision_owner <> new.owner_user_id then
    raise exception 'decision evidence owner mismatch';
  end if;

  select owner_user_id into v_evidence_owner from public.intelligence_evidence_refs where id = new.evidence_ref_id;
  if v_evidence_owner is null then
    raise exception 'decision_evidence.evidence_ref_id does not exist';
  end if;
  if v_evidence_owner <> new.owner_user_id then
    raise exception 'decision evidence reference owner mismatch';
  end if;

  return new;
end;
$$;

create table if not exists public.decision_evidence (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  decision_id uuid not null references public.decision_paths(id) on delete cascade,
  evidence_ref_id uuid not null references public.intelligence_evidence_refs(id) on delete cascade,
  role text not null default 'supporting',
  weight text not null default 'medium',
  created_at timestamptz not null default now(),
  constraint decision_evidence_role_check check (
    role in ('supporting', 'primary', 'contextual')
  ),
  constraint decision_evidence_weight_check check (
    weight in ('low', 'medium', 'high', 'decisive')
  ),
  constraint decision_evidence_unique unique (decision_id, evidence_ref_id)
);

create trigger decision_evidence_owner_guard
before insert or update on public.decision_evidence
for each row execute function public.validate_decision_evidence_owner();

create table if not exists public.outcomes (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  decision_id uuid references public.decision_paths(id) on delete cascade,
  outcome_type text not null,
  summary text not null,
  status intelligence_outcome_status not null default 'pending',
  observed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint outcomes_type_check check (
    outcome_type in (
      'success',
      'partial_success',
      'delay',
      'stall',
      'failure',
      'no_material_change'
    )
  )
);

create trigger outcomes_touch_updated_at
before update on public.outcomes
for each row execute function public.touch_updated_at();

create table if not exists public.lessons (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  decision_id uuid references public.decision_paths(id) on delete cascade,
  outcome_id uuid references public.outcomes(id) on delete cascade,
  lesson_type text not null,
  summary text not null,
  confidence_level intelligence_confidence,
  status intelligence_status not null default 'proposed',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lessons_type_check check (
    lesson_type in (
      'timing',
      'dependency',
      'quality',
      'resource',
      'process',
      'commercial'
    )
  )
);

create trigger lessons_touch_updated_at
before update on public.lessons
for each row execute function public.touch_updated_at();

create or replace function public.validate_lesson_evidence_owner()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_lesson_owner uuid;
  v_evidence_owner uuid;
begin
  select owner_user_id into v_lesson_owner from public.lessons where id = new.lesson_id;
  if v_lesson_owner is null then
    raise exception 'lesson_evidence.lesson_id does not exist';
  end if;
  if v_lesson_owner <> new.owner_user_id then
    raise exception 'lesson evidence owner mismatch';
  end if;

  select owner_user_id into v_evidence_owner from public.intelligence_evidence_refs where id = new.evidence_ref_id;
  if v_evidence_owner is null then
    raise exception 'lesson_evidence.evidence_ref_id does not exist';
  end if;
  if v_evidence_owner <> new.owner_user_id then
    raise exception 'lesson evidence reference owner mismatch';
  end if;

  return new;
end;
$$;

create table if not exists public.lesson_evidence (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  evidence_ref_id uuid not null references public.intelligence_evidence_refs(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint lesson_evidence_unique unique (lesson_id, evidence_ref_id)
);

create trigger lesson_evidence_owner_guard
before insert or update on public.lesson_evidence
for each row execute function public.validate_lesson_evidence_owner();

create index if not exists decision_paths_owner_idx
  on public.decision_paths (owner_user_id, status, created_at desc);
create index if not exists decision_evidence_decision_idx
  on public.decision_evidence (decision_id);
create index if not exists decision_evidence_evidence_idx
  on public.decision_evidence (evidence_ref_id);
create index if not exists outcomes_decision_idx
  on public.outcomes (decision_id, observed_at desc);
create index if not exists lessons_decision_idx
  on public.lessons (decision_id, status, created_at desc);
create index if not exists lesson_evidence_lesson_idx
  on public.lesson_evidence (lesson_id);
create index if not exists lesson_evidence_evidence_idx
  on public.lesson_evidence (evidence_ref_id);

commit;
