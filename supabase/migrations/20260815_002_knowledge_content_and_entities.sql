-- ============================================================================
-- CASH HOLDINGS — OPEN KNOWLEDGE: CONTENT + ENTITIES
-- Target project: ldijllskwwmyhhbzspmb (external Cash Holdings Supabase)
-- Idempotent: safe to run more than once.
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> paste -> Run
--
-- Part 2 of 4 (R4A.1 Open Knowledge foundation).
-- knowledge_entities is a pointer layer only — it must never duplicate
-- brands/organizations/contacts/projects/project_tasks/deals/
-- integration_connections/metric_definitions/strategic_moves rows.
--
-- Requires the "vector" extension for the optional embedding column. If the
-- extension is unavailable on this project, this migration will fail at the
-- "create extension" step and must be reviewed before retrying (see
-- runtime/README.md style: do not silently work around infrastructure
-- failures inside a migration).
-- ============================================================================

begin;

create extension if not exists vector with schema extensions;

-- ---------------------------------------------------------------------------
-- 1. KNOWLEDGE CONTENT (retrievable chunks)
-- ---------------------------------------------------------------------------
create table if not exists public.knowledge_content (
  id             uuid primary key default gen_random_uuid(),
  document_id    uuid not null references public.knowledge_documents(id) on delete cascade,
  chunk_index    integer not null,
  content        text not null,
  content_hash   text not null,
  search_vector  tsvector generated always as (to_tsvector('english', content)) stored,
  embedding      extensions.vector(1536),
  embedding_model text,
  embedded_at    timestamptz,
  created_at     timestamptz not null default now(),
  constraint knowledge_content_document_chunk_unique unique (document_id, chunk_index)
);

create index if not exists knowledge_content_document_id_idx
  on public.knowledge_content (document_id);
create index if not exists knowledge_content_content_hash_idx
  on public.knowledge_content (content_hash);

revoke all on public.knowledge_content from anon;
revoke all on public.knowledge_content from authenticated;
grant select, insert, update, delete on public.knowledge_content to authenticated;
grant all on public.knowledge_content to service_role;

alter table public.knowledge_content enable row level security;

drop policy if exists "owner reads own knowledge content" on public.knowledge_content;
drop policy if exists "owner inserts own knowledge content" on public.knowledge_content;
drop policy if exists "owner updates own knowledge content" on public.knowledge_content;
drop policy if exists "owner deletes own knowledge content" on public.knowledge_content;

create policy "owner reads own knowledge content"
  on public.knowledge_content for select to authenticated
  using (
    exists (
      select 1
      from public.knowledge_documents d
      join public.knowledge_sources s on s.id = d.source_id
      where d.id = knowledge_content.document_id
        and s.owner_user_id = auth.uid()
    )
  );

create policy "owner inserts own knowledge content"
  on public.knowledge_content for insert to authenticated
  with check (
    exists (
      select 1
      from public.knowledge_documents d
      join public.knowledge_sources s on s.id = d.source_id
      where d.id = knowledge_content.document_id
        and s.owner_user_id = auth.uid()
    )
  );

create policy "owner updates own knowledge content"
  on public.knowledge_content for update to authenticated
  using (
    exists (
      select 1
      from public.knowledge_documents d
      join public.knowledge_sources s on s.id = d.source_id
      where d.id = knowledge_content.document_id
        and s.owner_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.knowledge_documents d
      join public.knowledge_sources s on s.id = d.source_id
      where d.id = knowledge_content.document_id
        and s.owner_user_id = auth.uid()
    )
  );

create policy "owner deletes own knowledge content"
  on public.knowledge_content for delete to authenticated
  using (
    exists (
      select 1
      from public.knowledge_documents d
      join public.knowledge_sources s on s.id = d.source_id
      where d.id = knowledge_content.document_id
        and s.owner_user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 2. KNOWLEDGE ENTITIES (pointer layer — no shadow CRM)
-- ---------------------------------------------------------------------------
create table if not exists public.knowledge_entities (
  id             uuid primary key default gen_random_uuid(),
  owner_user_id  uuid not null references auth.users(id) on delete cascade,
  entity_type    text not null,
  canonical_type text,
  canonical_id   uuid,
  display_name   text,
  created_at     timestamptz not null default now(),
  constraint knowledge_entities_entity_type_check check (
    entity_type in (
      'Brand', 'Person', 'Organization', 'Project', 'ProjectTask', 'Deal',
      'Offer', 'System', 'Integration', 'Metric', 'Decision', 'Topic',
      'Concept', 'ExternalEntity'
    )
  ),
  constraint knowledge_entities_canonical_type_check check (
    canonical_type is null or canonical_type in (
      'brands', 'organizations', 'contacts', 'projects', 'project_tasks',
      'deals', 'integration_connections', 'metric_definitions', 'strategic_moves'
    )
  ),
  constraint knowledge_entities_canonical_pair_check check (
    (canonical_type is null and canonical_id is null and display_name is not null)
    or
    (canonical_type is not null and canonical_id is not null)
  )
);

-- Owner-aware: two independent owners may each point at the same canonical
-- operating row (or share a native Topic/System/Offer/Concept/ExternalEntity
-- name) without sharing knowledge-layer state.
create unique index if not exists knowledge_entities_canonical_pointer_uniq
  on public.knowledge_entities (owner_user_id, canonical_type, canonical_id)
  where canonical_type is not null;

create index if not exists knowledge_entities_owner_user_id_idx
  on public.knowledge_entities (owner_user_id);
create index if not exists knowledge_entities_entity_type_idx
  on public.knowledge_entities (entity_type);
create index if not exists knowledge_entities_display_name_idx
  on public.knowledge_entities (display_name);

-- knowledge_entities is owner-scoped: pointer rows are per-owner knowledge-
-- layer identities, even when they reference a canonical operating object
-- shared across owners. This keeps the security model consistent with the
-- rest of Open Knowledge and safe for multiple human operators.
revoke all on public.knowledge_entities from anon;
revoke all on public.knowledge_entities from authenticated;
grant select, insert, update, delete on public.knowledge_entities to authenticated;
grant all on public.knowledge_entities to service_role;

alter table public.knowledge_entities enable row level security;

drop policy if exists "authenticated reads knowledge entities" on public.knowledge_entities;
drop policy if exists "authenticated inserts knowledge entities" on public.knowledge_entities;
drop policy if exists "owner reads own knowledge entities" on public.knowledge_entities;
drop policy if exists "owner inserts own knowledge entities" on public.knowledge_entities;
drop policy if exists "owner updates own knowledge entities" on public.knowledge_entities;
drop policy if exists "owner deletes own knowledge entities" on public.knowledge_entities;

create policy "owner reads own knowledge entities"
  on public.knowledge_entities for select to authenticated
  using (owner_user_id = auth.uid());

create policy "owner inserts own knowledge entities"
  on public.knowledge_entities for insert to authenticated
  with check (owner_user_id = auth.uid());

create policy "owner updates own knowledge entities"
  on public.knowledge_entities for update to authenticated
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

create policy "owner deletes own knowledge entities"
  on public.knowledge_entities for delete to authenticated
  using (owner_user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 3. KNOWLEDGE CONTENT <-> ENTITY LINKS
-- ---------------------------------------------------------------------------
create table if not exists public.knowledge_content_entities (
  content_id uuid not null references public.knowledge_content(id) on delete cascade,
  entity_id  uuid not null references public.knowledge_entities(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (content_id, entity_id)
);

create index if not exists knowledge_content_entities_entity_id_idx
  on public.knowledge_content_entities (entity_id);

revoke all on public.knowledge_content_entities from anon;
revoke all on public.knowledge_content_entities from authenticated;
grant select, insert, delete on public.knowledge_content_entities to authenticated;
grant all on public.knowledge_content_entities to service_role;

alter table public.knowledge_content_entities enable row level security;

drop policy if exists "owner reads own knowledge content entities" on public.knowledge_content_entities;
drop policy if exists "owner inserts own knowledge content entities" on public.knowledge_content_entities;
drop policy if exists "owner deletes own knowledge content entities" on public.knowledge_content_entities;

create policy "owner reads own knowledge content entities"
  on public.knowledge_content_entities for select to authenticated
  using (
    exists (
      select 1
      from public.knowledge_content c
      join public.knowledge_documents d on d.id = c.document_id
      join public.knowledge_sources s on s.id = d.source_id
      where c.id = knowledge_content_entities.content_id
        and s.owner_user_id = auth.uid()
    )
  );

create policy "owner inserts own knowledge content entities"
  on public.knowledge_content_entities for insert to authenticated
  with check (
    exists (
      select 1
      from public.knowledge_content c
      join public.knowledge_documents d on d.id = c.document_id
      join public.knowledge_sources s on s.id = d.source_id
      where c.id = knowledge_content_entities.content_id
        and s.owner_user_id = auth.uid()
    )
    and exists (
      select 1
      from public.knowledge_entities e
      where e.id = knowledge_content_entities.entity_id
        and e.owner_user_id = auth.uid()
    )
  );

create policy "owner deletes own knowledge content entities"
  on public.knowledge_content_entities for delete to authenticated
  using (
    exists (
      select 1
      from public.knowledge_content c
      join public.knowledge_documents d on d.id = c.document_id
      join public.knowledge_sources s on s.id = d.source_id
      where c.id = knowledge_content_entities.content_id
        and s.owner_user_id = auth.uid()
    )
  );

commit;
