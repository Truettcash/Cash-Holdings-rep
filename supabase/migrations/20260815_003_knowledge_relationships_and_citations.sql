-- ============================================================================
-- CASH HOLDINGS — OPEN KNOWLEDGE: RELATIONSHIPS + CITATIONS
-- Target project: ldijllskwwmyhhbzspmb (external Cash Holdings Supabase)
-- Idempotent: safe to run more than once.
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> paste -> Run
--
-- Part 3 of 4 (R4A.1 Open Knowledge foundation).
-- Every relationship and citation carries explicit source provenance.
-- No agent-generated / inferred relationships are created here — those
-- belong to R4B Intelligence, out of scope for this migration.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. KNOWLEDGE RELATIONSHIPS
-- ---------------------------------------------------------------------------
create table if not exists public.knowledge_relationships (
  id                uuid primary key default gen_random_uuid(),
  from_entity_id    uuid not null references public.knowledge_entities(id) on delete cascade,
  to_entity_id      uuid not null references public.knowledge_entities(id) on delete cascade,
  relationship_type text not null,
  source_id         uuid not null references public.knowledge_sources(id) on delete cascade,
  created_at        timestamptz not null default now(),
  constraint knowledge_relationships_type_check check (
    relationship_type in (
      'relates_to', 'references', 'supersedes', 'derived_from', 'supports', 'contradicts'
    )
  )
);

create index if not exists knowledge_relationships_from_entity_id_idx
  on public.knowledge_relationships (from_entity_id);
create index if not exists knowledge_relationships_to_entity_id_idx
  on public.knowledge_relationships (to_entity_id);
create index if not exists knowledge_relationships_source_id_idx
  on public.knowledge_relationships (source_id);

revoke all on public.knowledge_relationships from anon;
revoke all on public.knowledge_relationships from authenticated;
grant select, insert, delete on public.knowledge_relationships to authenticated;
grant all on public.knowledge_relationships to service_role;

alter table public.knowledge_relationships enable row level security;

drop policy if exists "owner reads own knowledge relationships" on public.knowledge_relationships;
drop policy if exists "owner inserts own knowledge relationships" on public.knowledge_relationships;
drop policy if exists "owner deletes own knowledge relationships" on public.knowledge_relationships;

create policy "owner reads own knowledge relationships"
  on public.knowledge_relationships for select to authenticated
  using (
    exists (
      select 1 from public.knowledge_sources s
      where s.id = knowledge_relationships.source_id
        and s.owner_user_id = auth.uid()
    )
  );

create policy "owner inserts own knowledge relationships"
  on public.knowledge_relationships for insert to authenticated
  with check (
    exists (
      select 1 from public.knowledge_sources s
      where s.id = knowledge_relationships.source_id
        and s.owner_user_id = auth.uid()
    )
    and exists (
      select 1 from public.knowledge_entities e
      where e.id = knowledge_relationships.from_entity_id
        and e.owner_user_id = auth.uid()
    )
    and exists (
      select 1 from public.knowledge_entities e
      where e.id = knowledge_relationships.to_entity_id
        and e.owner_user_id = auth.uid()
    )
  );

create policy "owner deletes own knowledge relationships"
  on public.knowledge_relationships for delete to authenticated
  using (
    exists (
      select 1 from public.knowledge_sources s
      where s.id = knowledge_relationships.source_id
        and s.owner_user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 2. KNOWLEDGE CITATIONS (exact evidence locators)
-- ---------------------------------------------------------------------------
create table if not exists public.knowledge_citations (
  id             uuid primary key default gen_random_uuid(),
  content_id     uuid not null references public.knowledge_content(id) on delete cascade,
  source_id      uuid not null references public.knowledge_sources(id) on delete cascade,
  document_id    uuid not null references public.knowledge_documents(id) on delete cascade,
  source_locator jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);

create index if not exists knowledge_citations_content_id_idx
  on public.knowledge_citations (content_id);
create index if not exists knowledge_citations_source_id_idx
  on public.knowledge_citations (source_id);
create index if not exists knowledge_citations_document_id_idx
  on public.knowledge_citations (document_id);

revoke all on public.knowledge_citations from anon;
revoke all on public.knowledge_citations from authenticated;
grant select, insert, delete on public.knowledge_citations to authenticated;
grant all on public.knowledge_citations to service_role;

alter table public.knowledge_citations enable row level security;

drop policy if exists "owner reads own knowledge citations" on public.knowledge_citations;
drop policy if exists "owner inserts own knowledge citations" on public.knowledge_citations;
drop policy if exists "owner deletes own knowledge citations" on public.knowledge_citations;

create policy "owner reads own knowledge citations"
  on public.knowledge_citations for select to authenticated
  using (
    exists (
      select 1 from public.knowledge_sources s
      where s.id = knowledge_citations.source_id
        and s.owner_user_id = auth.uid()
    )
  );

create policy "owner inserts own knowledge citations"
  on public.knowledge_citations for insert to authenticated
  with check (
    exists (
      select 1 from public.knowledge_sources s
      where s.id = knowledge_citations.source_id
        and s.owner_user_id = auth.uid()
    )
  );

create policy "owner deletes own knowledge citations"
  on public.knowledge_citations for delete to authenticated
  using (
    exists (
      select 1 from public.knowledge_sources s
      where s.id = knowledge_citations.source_id
        and s.owner_user_id = auth.uid()
    )
  );

commit;
