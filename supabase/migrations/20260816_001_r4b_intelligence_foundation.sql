-- ============================================================================
-- R4B.2 — INTELLIGENCE FOUNDATION
-- Purpose: persistent, owner-scoped intelligence layer above Open Knowledge.
-- Scope: evidence references + signal/construct primitives only.
-- No production deploy. No signal generation. No ATHRTY intelligence rows.
-- ============================================================================

begin;

create type intelligence_evidence_kind as enum ('knowledge', 'cash_operating');
create type intelligence_confidence as enum ('low', 'medium', 'high', 'confirmed');
create type intelligence_signal_status as enum ('proposed', 'accepted', 'rejected', 'archived');
create type intelligence_construct_state as enum ('active', 'weakening', 'confirmed', 'resolved', 'superseded', 'rejected');
create type intelligence_status as enum ('active', 'weakening', 'confirmed', 'resolved', 'superseded', 'rejected', 'proposed', 'accepted');

create table if not exists public.intelligence_evidence_refs (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  evidence_kind intelligence_evidence_kind not null,
  source_id uuid references public.knowledge_sources(id) on delete cascade,
  document_id uuid references public.knowledge_documents(id) on delete cascade,
  content_id uuid references public.knowledge_content(id) on delete cascade,
  citation_id uuid references public.knowledge_citations(id) on delete cascade,
  canonical_table text,
  canonical_row_uuid uuid,
  observed_at timestamptz not null default now(),
  evidence_summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint intelligence_evidence_refs_knowledge_shape check (
    (
      evidence_kind = 'knowledge'
      and source_id is not null
      and (
        (document_id is null and content_id is null and citation_id is null)
        or (document_id is not null and content_id is null and citation_id is null)
        or (document_id is not null and content_id is not null and citation_id is null)
        or (document_id is not null and content_id is not null and citation_id is not null)
      )
      and canonical_table is null
      and canonical_row_uuid is null
    )
    or (
      evidence_kind = 'cash_operating'
      and canonical_table is not null
      and canonical_row_uuid is not null
      and source_id is null
      and document_id is null
      and content_id is null
      and citation_id is null
    )
  ),
  constraint intelligence_evidence_refs_canonical_table_check check (
    canonical_table is null
    or canonical_table in (
      'brands',
      'organizations',
      'contacts',
      'projects',
      'project_tasks',
      'deals',
      'integration_connections',
      'metric_definitions',
      'strategic_moves'
    )
  )
);

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

create trigger intelligence_evidence_refs_touch_updated_at
before update on public.intelligence_evidence_refs
for each row execute function public.touch_updated_at();

create or replace function public.validate_intelligence_evidence_ref_owner()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_owner uuid;
  v_doc_source_owner uuid;
  v_content_doc_owner uuid;
  v_citation_source_owner uuid;
  v_table_name text;
  v_row_owner uuid;
begin
  if new.owner_user_id is null then
    raise exception 'intelligence_evidence_refs.owner_user_id is required';
  end if;

  if new.evidence_kind = 'knowledge' then
    if new.source_id is not null then
      select s.owner_user_id into v_owner
      from public.knowledge_sources s
      where s.id = new.source_id;
      if v_owner is null then
        raise exception 'knowledge evidence source does not exist';
      end if;
      if v_owner <> new.owner_user_id then
        raise exception 'cross-owner evidence reference rejected';
      end if;
    end if;

    if new.document_id is not null then
      select s.owner_user_id into v_doc_source_owner
      from public.knowledge_documents d
      join public.knowledge_sources s on s.id = d.source_id
      where d.id = new.document_id;
      if v_doc_source_owner is null then
        raise exception 'knowledge document reference is invalid';
      end if;
      if v_doc_source_owner <> new.owner_user_id then
        raise exception 'cross-owner evidence reference rejected';
      end if;
      if new.source_id is not null and exists (
        select 1 from public.knowledge_documents d where d.id = new.document_id and d.source_id <> new.source_id
      ) then
        raise exception 'document/source ownership mismatch';
      end if;
    end if;

    if new.content_id is not null then
      select s.owner_user_id into v_content_doc_owner
      from public.knowledge_content c
      join public.knowledge_documents d on d.id = c.document_id
      join public.knowledge_sources s on s.id = d.source_id
      where c.id = new.content_id;
      if v_content_doc_owner is null then
        raise exception 'knowledge content reference is invalid';
      end if;
      if v_content_doc_owner <> new.owner_user_id then
        raise exception 'cross-owner evidence reference rejected';
      end if;
      if new.document_id is not null and exists (
        select 1 from public.knowledge_content c where c.id = new.content_id and c.document_id <> new.document_id
      ) then
        raise exception 'content/document ownership mismatch';
      end if;
    end if;

    if new.citation_id is not null then
      select s.owner_user_id into v_citation_source_owner
      from public.knowledge_citations c
      join public.knowledge_sources s on s.id = c.source_id
      where c.id = new.citation_id;
      if v_citation_source_owner is null then
        raise exception 'knowledge citation reference is invalid';
      end if;
      if v_citation_source_owner <> new.owner_user_id then
        raise exception 'cross-owner evidence reference rejected';
      end if;
      if new.content_id is not null and exists (
        select 1 from public.knowledge_citations c where c.id = new.citation_id and c.content_id <> new.content_id
      ) then
        raise exception 'citation/content ownership mismatch';
      end if;
    end if;

    return new;
  end if;

  if new.evidence_kind = 'cash_operating' then
    if new.canonical_table is null or new.canonical_row_uuid is null then
      raise exception 'cash_operating evidence requires canonical_table and canonical_row_uuid';
    end if;

    v_table_name := new.canonical_table;

    if v_table_name = 'brands' then
      if to_regclass('public.brands') is null then
        raise exception 'canonical table public.brands does not exist';
      end if;
      select owner_user_id into v_row_owner from public.brands where id = new.canonical_row_uuid;
    elsif v_table_name = 'organizations' then
      if to_regclass('public.organizations') is null then
        raise exception 'canonical table public.organizations does not exist';
      end if;
      select owner_user_id into v_row_owner from public.organizations where id = new.canonical_row_uuid;
    elsif v_table_name = 'contacts' then
      if to_regclass('public.contacts') is null then
        raise exception 'canonical table public.contacts does not exist';
      end if;
      select owner_user_id into v_row_owner from public.contacts where id = new.canonical_row_uuid;
    elsif v_table_name = 'projects' then
      if to_regclass('public.projects') is null then
        raise exception 'canonical table public.projects does not exist';
      end if;
      select owner_user_id into v_row_owner from public.projects where id = new.canonical_row_uuid;
    elsif v_table_name = 'project_tasks' then
      if to_regclass('public.project_tasks') is null then
        raise exception 'canonical table public.project_tasks does not exist';
      end if;
      select owner_user_id into v_row_owner from public.project_tasks where id = new.canonical_row_uuid;
    elsif v_table_name = 'deals' then
      if to_regclass('public.deals') is null then
        raise exception 'canonical table public.deals does not exist';
      end if;
      select owner_user_id into v_row_owner from public.deals where id = new.canonical_row_uuid;
    elsif v_table_name = 'integration_connections' then
      if to_regclass('public.integration_connections') is null then
        raise exception 'canonical table public.integration_connections does not exist';
      end if;
      select owner_user_id into v_row_owner from public.integration_connections where id = new.canonical_row_uuid;
    elsif v_table_name = 'metric_definitions' then
      if to_regclass('public.metric_definitions') is null then
        raise exception 'canonical table public.metric_definitions does not exist';
      end if;
      select owner_user_id into v_row_owner from public.metric_definitions where id = new.canonical_row_uuid;
    elsif v_table_name = 'strategic_moves' then
      if to_regclass('public.strategic_moves') is null then
        raise exception 'canonical table public.strategic_moves does not exist';
      end if;
      select owner_user_id into v_row_owner from public.strategic_moves where id = new.canonical_row_uuid;
    else
      raise exception 'unsupported canonical operating table for evidence reference';
    end if;

    if v_row_owner is null then
      raise exception 'cash_operating evidence row not found';
    end if;
    if v_row_owner <> new.owner_user_id then
      raise exception 'cross-owner evidence reference rejected';
    end if;

    return new;
  end if;

  raise exception 'unsupported evidence kind';
end;
$$;

create trigger intelligence_evidence_refs_owner_guard
before insert or update on public.intelligence_evidence_refs
for each row execute function public.validate_intelligence_evidence_ref_owner();

create table if not exists public.intelligence_signals (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  signal_type text not null,
  summary text not null,
  observed_at timestamptz not null,
  scope text,
  reason text,
  status intelligence_signal_status not null default 'proposed',
  confidence_level intelligence_confidence,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  superseded_by uuid references public.intelligence_signals(id),
  resolved_at timestamptz,
  constraint intelligence_signals_type_check check (
    signal_type in (
      'status',
      'trend',
      'risk',
      'opportunity',
      'dependency',
      'milestone',
      'change',
      'gap'
    )
  ),
  constraint intelligence_signals_status_check check (
    status in ('proposed', 'accepted', 'rejected', 'archived')
  )
);

create trigger intelligence_signals_touch_updated_at
before update on public.intelligence_signals
for each row execute function public.touch_updated_at();

create or replace function public.validate_signal_evidence_owner()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_signal_owner uuid;
  v_evidence_owner uuid;
begin
  select owner_user_id into v_signal_owner from public.intelligence_signals where id = new.signal_id;
  if v_signal_owner is null then
    raise exception 'signal_evidence.signal_id does not exist';
  end if;
  if v_signal_owner <> new.owner_user_id then
    raise exception 'signal evidence owner mismatch';
  end if;

  select owner_user_id into v_evidence_owner from public.intelligence_evidence_refs where id = new.evidence_ref_id;
  if v_evidence_owner is null then
    raise exception 'signal evidence_ref_id does not exist';
  end if;
  if v_evidence_owner <> new.owner_user_id then
    raise exception 'signal evidence reference owner mismatch';
  end if;

  return new;
end;
$$;

create table if not exists public.signal_evidence (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  signal_id uuid not null references public.intelligence_signals(id) on delete cascade,
  evidence_ref_id uuid not null references public.intelligence_evidence_refs(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint signal_evidence_unique unique (signal_id, evidence_ref_id)
);

create trigger signal_evidence_owner_guard
before insert or update on public.signal_evidence
for each row execute function public.validate_signal_evidence_owner();

create index if not exists intelligence_evidence_refs_owner_idx
  on public.intelligence_evidence_refs (owner_user_id, evidence_kind, created_at desc);
create index if not exists intelligence_evidence_refs_canonical_idx
  on public.intelligence_evidence_refs (canonical_table, canonical_row_uuid);
create index if not exists intelligence_signals_owner_idx
  on public.intelligence_signals (owner_user_id, status, observed_at desc);
create index if not exists signal_evidence_signal_idx
  on public.signal_evidence (signal_id);
create index if not exists signal_evidence_evidence_idx
  on public.signal_evidence (evidence_ref_id);

create table if not exists public.active_constructs (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  construct_type text not null,
  title text not null,
  summary text not null,
  state intelligence_construct_state not null default 'active',
  status intelligence_status not null default 'active',
  confidence_level intelligence_confidence,
  first_observed_at timestamptz not null,
  last_observed_at timestamptz,
  resolved_at timestamptz,
  superseded_by uuid references public.active_constructs(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint active_constructs_type_check check (
    construct_type in (
      'project_state',
      'strategy_context',
      'risk',
      'opportunity',
      'dependency',
      'commercial_state',
      'operating_model'
    )
  ),
  constraint active_constructs_status_check check (
    status in ('active', 'weakening', 'confirmed', 'resolved', 'superseded', 'rejected', 'proposed', 'accepted')
  )
);

create trigger active_constructs_touch_updated_at
before update on public.active_constructs
for each row execute function public.touch_updated_at();

create or replace function public.validate_construct_signals_owner()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_construct_owner uuid;
  v_signal_owner uuid;
begin
  select owner_user_id into v_construct_owner from public.active_constructs where id = new.construct_id;
  if v_construct_owner is null then
    raise exception 'construct_signals.construct_id does not exist';
  end if;
  if v_construct_owner <> new.owner_user_id then
    raise exception 'construct signal owner mismatch';
  end if;

  select owner_user_id into v_signal_owner from public.intelligence_signals where id = new.signal_id;
  if v_signal_owner is null then
    raise exception 'construct_signals.signal_id does not exist';
  end if;
  if v_signal_owner <> new.owner_user_id then
    raise exception 'construct signal signal owner mismatch';
  end if;

  return new;
end;
$$;

create table if not exists public.construct_signals (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  construct_id uuid not null references public.active_constructs(id) on delete cascade,
  signal_id uuid not null references public.intelligence_signals(id) on delete cascade,
  relationship_type text not null default 'supports',
  is_supporting boolean not null default true,
  created_at timestamptz not null default now(),
  constraint construct_signals_relationship_check check (
    relationship_type in ('supports', 'contradicts', 'supersedes', 'replaces', 'contextualizes')
  ),
  constraint construct_signals_unique unique (construct_id, signal_id)
);

create trigger construct_signals_owner_guard
before insert or update on public.construct_signals
for each row execute function public.validate_construct_signals_owner();

create index if not exists active_constructs_owner_idx
  on public.active_constructs (owner_user_id, status, last_observed_at desc);
create index if not exists construct_signals_construct_idx
  on public.construct_signals (construct_id);
create index if not exists construct_signals_signal_idx
  on public.construct_signals (signal_id);

commit;
