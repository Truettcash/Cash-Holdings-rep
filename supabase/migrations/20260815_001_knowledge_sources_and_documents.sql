-- ============================================================================
-- CASH HOLDINGS — OPEN KNOWLEDGE: SOURCES + DOCUMENTS + BRAND SCOPE
-- Target project: ldijllskwwmyhhbzspmb (external Cash Holdings Supabase)
-- Idempotent: safe to run more than once.
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> paste -> Run
--
-- Part 1 of 4 (R4A.1 Open Knowledge foundation).
-- Does NOT modify any existing table. Does NOT duplicate CRM/brand entities.
-- knowledge_sources is the canonical ownership/provenance root; child tables
-- resolve ownership through the source/document relationship chain rather
-- than duplicating owner_user_id.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. KNOWLEDGE SOURCES (ownership root)
-- ---------------------------------------------------------------------------
create table if not exists public.knowledge_sources (
  id                 uuid primary key default gen_random_uuid(),
  owner_user_id      uuid not null references auth.users(id) on delete cascade,
  source_type        text not null,
  source_ref_type    text,
  source_ref_id      uuid,
  title              text not null,
  origin_url         text,
  authority_level    text not null,
  source_created_at  timestamptz,
  source_updated_at  timestamptz,
  ingested_at        timestamptz not null default now(),
  created_at         timestamptz not null default now(),
  constraint knowledge_sources_source_type_check check (
    source_type in (
      'document', 'crm', 'project', 'email', 'meeting',
      'chatgpt_thread', 'research_url', 'manual_note', 'system_generated'
    )
  ),
  constraint knowledge_sources_authority_level_check check (
    authority_level in ('canonical', 'primary', 'supporting', 'unverified')
  )
);

create index if not exists knowledge_sources_owner_user_id_idx
  on public.knowledge_sources (owner_user_id);
create index if not exists knowledge_sources_source_type_idx
  on public.knowledge_sources (source_type);
create index if not exists knowledge_sources_source_ref_idx
  on public.knowledge_sources (source_ref_type, source_ref_id);
create index if not exists knowledge_sources_ingested_at_idx
  on public.knowledge_sources (ingested_at desc);

revoke all on public.knowledge_sources from anon;
revoke all on public.knowledge_sources from authenticated;
grant select, insert, update, delete on public.knowledge_sources to authenticated;
grant all on public.knowledge_sources to service_role;

alter table public.knowledge_sources enable row level security;

drop policy if exists "owner reads own knowledge sources" on public.knowledge_sources;
drop policy if exists "owner inserts own knowledge sources" on public.knowledge_sources;
drop policy if exists "owner updates own knowledge sources" on public.knowledge_sources;
drop policy if exists "owner deletes own knowledge sources" on public.knowledge_sources;

create policy "owner reads own knowledge sources"
  on public.knowledge_sources for select to authenticated
  using (owner_user_id = auth.uid());

create policy "owner inserts own knowledge sources"
  on public.knowledge_sources for insert to authenticated
  with check (owner_user_id = auth.uid());

create policy "owner updates own knowledge sources"
  on public.knowledge_sources for update to authenticated
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

create policy "owner deletes own knowledge sources"
  on public.knowledge_sources for delete to authenticated
  using (owner_user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 2. KNOWLEDGE DOCUMENTS
-- ---------------------------------------------------------------------------
create table if not exists public.knowledge_documents (
  id                     uuid primary key default gen_random_uuid(),
  source_id              uuid not null references public.knowledge_sources(id) on delete cascade,
  title                  text not null,
  content_type           text not null,
  brand_scope_type       text not null,
  visibility             text not null default 'owner_only',
  version                integer not null default 1,
  supersedes_document_id uuid references public.knowledge_documents(id),
  is_current             boolean not null default true,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint knowledge_documents_content_type_check check (
    content_type in ('text', 'markdown', 'pdf_extract', 'transcript', 'note', 'html', 'structured')
  ),
  constraint knowledge_documents_brand_scope_type_check check (
    brand_scope_type in ('global', 'brand', 'multi_brand')
  ),
  constraint knowledge_documents_visibility_check check (
    visibility in ('owner_only', 'org_wide')
  )
);

create index if not exists knowledge_documents_source_id_idx
  on public.knowledge_documents (source_id);
create index if not exists knowledge_documents_is_current_idx
  on public.knowledge_documents (is_current);
create index if not exists knowledge_documents_brand_scope_type_idx
  on public.knowledge_documents (brand_scope_type);

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

drop trigger if exists trg_knowledge_documents_touch_updated_at on public.knowledge_documents;
create trigger trg_knowledge_documents_touch_updated_at
  before update on public.knowledge_documents
  for each row execute function public.touch_updated_at();

revoke all on public.knowledge_documents from anon;
revoke all on public.knowledge_documents from authenticated;
grant select, insert, update, delete on public.knowledge_documents to authenticated;
grant all on public.knowledge_documents to service_role;

alter table public.knowledge_documents enable row level security;

drop policy if exists "owner reads own knowledge documents" on public.knowledge_documents;
drop policy if exists "owner inserts own knowledge documents" on public.knowledge_documents;
drop policy if exists "owner updates own knowledge documents" on public.knowledge_documents;
drop policy if exists "owner deletes own knowledge documents" on public.knowledge_documents;

create policy "owner reads own knowledge documents"
  on public.knowledge_documents for select to authenticated
  using (
    exists (
      select 1 from public.knowledge_sources s
      where s.id = knowledge_documents.source_id
        and s.owner_user_id = auth.uid()
    )
  );

create policy "owner inserts own knowledge documents"
  on public.knowledge_documents for insert to authenticated
  with check (
    exists (
      select 1 from public.knowledge_sources s
      where s.id = knowledge_documents.source_id
        and s.owner_user_id = auth.uid()
    )
  );

create policy "owner updates own knowledge documents"
  on public.knowledge_documents for update to authenticated
  using (
    exists (
      select 1 from public.knowledge_sources s
      where s.id = knowledge_documents.source_id
        and s.owner_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.knowledge_sources s
      where s.id = knowledge_documents.source_id
        and s.owner_user_id = auth.uid()
    )
  );

create policy "owner deletes own knowledge documents"
  on public.knowledge_documents for delete to authenticated
  using (
    exists (
      select 1 from public.knowledge_sources s
      where s.id = knowledge_documents.source_id
        and s.owner_user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 3. KNOWLEDGE DOCUMENT BRAND SCOPE
-- ---------------------------------------------------------------------------
create table if not exists public.knowledge_document_brands (
  document_id uuid not null references public.knowledge_documents(id) on delete cascade,
  brand_id    uuid not null references public.brands(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (document_id, brand_id)
);

create index if not exists knowledge_document_brands_brand_id_idx
  on public.knowledge_document_brands (brand_id);

-- A 'global' document must have zero brand rows.
create or replace function public.knowledge_document_brands_reject_global()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_scope text;
begin
  select brand_scope_type into v_scope
  from public.knowledge_documents
  where id = new.document_id;

  if v_scope = 'global' then
    raise exception 'Cannot attach a brand to a knowledge_document with brand_scope_type = global';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_knowledge_document_brands_reject_global on public.knowledge_document_brands;
create trigger trg_knowledge_document_brands_reject_global
  before insert on public.knowledge_document_brands
  for each row execute function public.knowledge_document_brands_reject_global();

-- Deferred, per-document row-count check: 'brand' => exactly 1, 'multi_brand' => >= 2.
create or replace function public.knowledge_document_brands_check_count()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_document_id uuid;
  v_scope text;
  v_count integer;
begin
  v_document_id := coalesce(new.document_id, old.document_id);

  select brand_scope_type into v_scope
  from public.knowledge_documents
  where id = v_document_id;

  if v_scope is null then
    return null; -- document was deleted in the same transaction; nothing to enforce
  end if;

  select count(*) into v_count
  from public.knowledge_document_brands
  where document_id = v_document_id;

  if v_scope = 'brand' and v_count <> 1 then
    raise exception 'knowledge_documents.brand_scope_type = brand requires exactly one brand row (found %)', v_count;
  end if;

  if v_scope = 'multi_brand' and v_count < 2 then
    raise exception 'knowledge_documents.brand_scope_type = multi_brand requires at least two brand rows (found %)', v_count;
  end if;

  return null;
end;
$$;

drop trigger if exists trg_knowledge_document_brands_check_count on public.knowledge_document_brands;
create constraint trigger trg_knowledge_document_brands_check_count
  after insert or update or delete on public.knowledge_document_brands
  deferrable initially deferred
  for each row execute function public.knowledge_document_brands_check_count();

-- The trigger above only fires when knowledge_document_brands itself is
-- written. A 'brand'/'multi_brand' document created (or re-scoped) without
-- ever inserting a brand row would otherwise pass silently, so the same
-- count rule is also enforced from the knowledge_documents side.
create or replace function public.knowledge_documents_check_brand_count()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_count integer;
begin
  if new.brand_scope_type = 'global' then
    return null;
  end if;

  select count(*) into v_count
  from public.knowledge_document_brands
  where document_id = new.id;

  if new.brand_scope_type = 'brand' and v_count <> 1 then
    raise exception 'knowledge_documents.brand_scope_type = brand requires exactly one brand row (found %)', v_count;
  end if;

  if new.brand_scope_type = 'multi_brand' and v_count < 2 then
    raise exception 'knowledge_documents.brand_scope_type = multi_brand requires at least two brand rows (found %)', v_count;
  end if;

  return null;
end;
$$;

drop trigger if exists trg_knowledge_documents_check_brand_count on public.knowledge_documents;
create constraint trigger trg_knowledge_documents_check_brand_count
  after insert or update of brand_scope_type on public.knowledge_documents
  deferrable initially deferred
  for each row execute function public.knowledge_documents_check_brand_count();

revoke all on public.knowledge_document_brands from anon;
revoke all on public.knowledge_document_brands from authenticated;
grant select, insert, update, delete on public.knowledge_document_brands to authenticated;
grant all on public.knowledge_document_brands to service_role;

alter table public.knowledge_document_brands enable row level security;

drop policy if exists "owner reads own knowledge document brands" on public.knowledge_document_brands;
drop policy if exists "owner inserts own knowledge document brands" on public.knowledge_document_brands;
drop policy if exists "owner deletes own knowledge document brands" on public.knowledge_document_brands;

create policy "owner reads own knowledge document brands"
  on public.knowledge_document_brands for select to authenticated
  using (
    exists (
      select 1
      from public.knowledge_documents d
      join public.knowledge_sources s on s.id = d.source_id
      where d.id = knowledge_document_brands.document_id
        and s.owner_user_id = auth.uid()
    )
  );

create policy "owner inserts own knowledge document brands"
  on public.knowledge_document_brands for insert to authenticated
  with check (
    exists (
      select 1
      from public.knowledge_documents d
      join public.knowledge_sources s on s.id = d.source_id
      where d.id = knowledge_document_brands.document_id
        and s.owner_user_id = auth.uid()
    )
  );

create policy "owner deletes own knowledge document brands"
  on public.knowledge_document_brands for delete to authenticated
  using (
    exists (
      select 1
      from public.knowledge_documents d
      join public.knowledge_sources s on s.id = d.source_id
      where d.id = knowledge_document_brands.document_id
        and s.owner_user_id = auth.uid()
    )
  );

commit;
