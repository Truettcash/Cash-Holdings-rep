-- ============================================================================
-- CASH HOLDINGS - OPEN KNOWLEDGE: ATOMIC INGESTION + SOURCE IDENTITY
-- Target project: ldijllskwwmyhhbzspmb (external Cash Holdings Supabase)
-- Idempotent: safe to run more than once.
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> paste -> Run
--
-- R4A.3A. Adds stable identities for external sources and one authenticated,
-- SECURITY INVOKER transaction boundary. It does not alter operating-table
-- schemas or RLS and does not use a service role.
-- ============================================================================

begin;

alter table public.knowledge_sources
  add column if not exists source_external_key text;

-- Each non-null identity strategy is owner-scoped. Callers must select exactly
-- one strategy; this makes lookup deterministic and prevents concurrent source
-- creation from producing duplicate ownership roots.
create unique index if not exists knowledge_sources_canonical_identity_uniq
  on public.knowledge_sources (owner_user_id, source_type, source_ref_type, source_ref_id)
  where source_ref_type is not null and source_ref_id is not null;

create unique index if not exists knowledge_sources_external_key_identity_uniq
  on public.knowledge_sources (owner_user_id, source_type, source_external_key)
  where source_external_key is not null;

create unique index if not exists knowledge_sources_origin_url_identity_uniq
  on public.knowledge_sources (owner_user_id, source_type, origin_url)
  where origin_url is not null;

-- One current document per source is the concurrency guard for version chains.
create unique index if not exists knowledge_documents_one_current_per_source_uniq
  on public.knowledge_documents (source_id)
  where is_current;

create or replace function public.ingest_knowledge_v1(
  p_source_type text,
  p_source_ref_type text,
  p_source_ref_id uuid,
  p_source_external_key text,
  p_source_title text,
  p_origin_url text,
  p_authority_level text,
  p_source_created_at timestamptz,
  p_source_updated_at timestamptz,
  p_document_title text,
  p_content_type text,
  p_brand_scope_type text,
  p_brand_ids uuid[],
  p_chunks jsonb,
  p_entities jsonb
)
returns table (
  result text,
  source_id uuid,
  document_id uuid,
  version integer,
  chunk_count integer
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_owner_id uuid := auth.uid();
  v_source_id uuid;
  v_document_id uuid;
  v_current_document_id uuid;
  v_current_version integer;
  v_next_version integer;
  v_chunk_count integer;
  v_existing_chunk_count integer;
  v_brand_ids uuid[] := coalesce(p_brand_ids, '{}'::uuid[]);
  v_brand_count integer;
  v_existing_source boolean := false;
  v_entity_id uuid;
  v_entity record;
  v_canonical_exists boolean;
begin
  if v_owner_id is null then
    raise exception 'knowledge ingestion requires an authenticated user';
  end if;

  if coalesce(btrim(p_source_title), '') = '' or coalesce(btrim(p_document_title), '') = '' then
    raise exception 'source and document titles are required';
  end if;

  if p_chunks is null or jsonb_typeof(p_chunks) <> 'array' or jsonb_array_length(p_chunks) = 0 then
    raise exception 'chunks must be a non-empty array';
  end if;
  v_chunk_count := jsonb_array_length(p_chunks);

  if (
    select count(*) <> v_chunk_count
        or count(distinct chunk_index) <> v_chunk_count
        or min(chunk_index) <> 0
        or max(chunk_index) <> v_chunk_count - 1
    from jsonb_to_recordset(p_chunks) as chunk_row(chunk_index integer, content text, content_hash text)
  ) then
    raise exception 'chunks must have unique contiguous indexes starting at zero';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_chunks) as chunk_row(chunk_index integer, content text, content_hash text)
    where coalesce(btrim(content), '') = ''
       or content_hash !~ '^[0-9a-f]{64}$'
  ) then
    raise exception 'chunks must contain non-empty content and SHA-256 hashes';
  end if;

  if ((p_source_ref_type is not null and p_source_ref_id is not null)::integer
      + (nullif(btrim(p_source_external_key), '') is not null)::integer
      + (nullif(btrim(p_origin_url), '') is not null)::integer) <> 1
     or (p_source_ref_type is null) <> (p_source_ref_id is null) then
    raise exception 'exactly one complete source identity is required';
  end if;

  if p_source_type = 'manual_note' and nullif(btrim(p_source_external_key), '') is null then
    raise exception 'manual_note requires source_external_key';
  end if;

  if exists (select 1 from unnest(v_brand_ids) as brand_id where brand_id is null)
     or (select count(distinct brand_id) from unnest(v_brand_ids) as brand_id) <> cardinality(v_brand_ids) then
    raise exception 'brand IDs must be unique and non-null';
  end if;

  select count(*) into v_brand_count from public.brands where id = any(v_brand_ids);
  if v_brand_count <> cardinality(v_brand_ids) then
    raise exception 'one or more supplied brand IDs do not exist';
  end if;

  if (p_brand_scope_type = 'global' and cardinality(v_brand_ids) <> 0)
     or (p_brand_scope_type = 'brand' and cardinality(v_brand_ids) <> 1)
     or (p_brand_scope_type = 'multi_brand' and cardinality(v_brand_ids) < 2)
     or p_brand_scope_type not in ('global', 'brand', 'multi_brand') then
    raise exception 'brand scope does not match supplied brand IDs';
  end if;

  if p_entities is null or jsonb_typeof(p_entities) <> 'array' then
    raise exception 'entities must be an array';
  end if;

  -- Validate every canonical pointer before changing knowledge state. Reads
  -- are fixed to the allowed operating tables; no dynamic SQL is used.
  for v_entity in
    select * from jsonb_to_recordset(p_entities)
      as entity_row(entity_type text, canonical_type text, canonical_id uuid, display_name text)
  loop
    if v_entity.entity_type not in (
      'Brand', 'Person', 'Organization', 'Project', 'ProjectTask', 'Deal',
      'Offer', 'System', 'Integration', 'Metric', 'Decision', 'Topic',
      'Concept', 'ExternalEntity'
    ) then
      raise exception 'invalid entity type';
    end if;

    if v_entity.canonical_type is null then
      if v_entity.canonical_id is not null or coalesce(btrim(v_entity.display_name), '') = '' then
        raise exception 'native entities require display_name only';
      end if;
      continue;
    end if;

    if v_entity.canonical_id is null then
      raise exception 'canonical entities require canonical_id';
    end if;

    case v_entity.canonical_type
      when 'brands' then select exists (select 1 from public.brands where id = v_entity.canonical_id) into v_canonical_exists;
      when 'organizations' then select exists (select 1 from public.organizations where id = v_entity.canonical_id) into v_canonical_exists;
      when 'contacts' then select exists (select 1 from public.contacts where id = v_entity.canonical_id) into v_canonical_exists;
      when 'projects' then select exists (select 1 from public.projects where id = v_entity.canonical_id) into v_canonical_exists;
      when 'project_tasks' then select exists (select 1 from public.project_tasks where id = v_entity.canonical_id) into v_canonical_exists;
      when 'deals' then select exists (select 1 from public.deals where id = v_entity.canonical_id) into v_canonical_exists;
      when 'integration_connections' then select exists (select 1 from public.integration_connections where id = v_entity.canonical_id) into v_canonical_exists;
      when 'metric_definitions' then select exists (select 1 from public.metric_definitions where id = v_entity.canonical_id) into v_canonical_exists;
      when 'strategic_moves' then select exists (select 1 from public.strategic_moves where id = v_entity.canonical_id) into v_canonical_exists;
      else raise exception 'invalid canonical entity table';
    end case;

    if not v_canonical_exists then
      raise exception 'canonical entity does not exist';
    end if;
  end loop;

  if p_source_ref_type is not null then
    select id into v_source_id
    from public.knowledge_sources
    where owner_user_id = v_owner_id
      and source_type = p_source_type
      and source_ref_type = p_source_ref_type
      and source_ref_id = p_source_ref_id
    for update;
  elsif nullif(btrim(p_source_external_key), '') is not null then
    select id into v_source_id
    from public.knowledge_sources
    where owner_user_id = v_owner_id
      and source_type = p_source_type
      and source_external_key = btrim(p_source_external_key)
    for update;
  else
    select id into v_source_id
    from public.knowledge_sources
    where owner_user_id = v_owner_id
      and source_type = p_source_type
      and origin_url = btrim(p_origin_url)
    for update;
  end if;

  if v_source_id is null then
    if p_source_ref_type is not null then
      insert into public.knowledge_sources (
        owner_user_id, source_type, source_ref_type, source_ref_id, title, origin_url,
        authority_level, source_created_at, source_updated_at
      ) values (
        v_owner_id, p_source_type, p_source_ref_type, p_source_ref_id, p_source_title, p_origin_url,
        p_authority_level, p_source_created_at, p_source_updated_at
      ) on conflict (owner_user_id, source_type, source_ref_type, source_ref_id)
        where source_ref_type is not null and source_ref_id is not null
        do nothing
        returning id into v_source_id;
    elsif nullif(btrim(p_source_external_key), '') is not null then
      insert into public.knowledge_sources (
        owner_user_id, source_type, source_external_key, title, origin_url,
        authority_level, source_created_at, source_updated_at
      ) values (
        v_owner_id, p_source_type, btrim(p_source_external_key), p_source_title, p_origin_url,
        p_authority_level, p_source_created_at, p_source_updated_at
      ) on conflict (owner_user_id, source_type, source_external_key)
        where source_external_key is not null
        do nothing
        returning id into v_source_id;
    else
      insert into public.knowledge_sources (
        owner_user_id, source_type, title, origin_url, authority_level,
        source_created_at, source_updated_at
      ) values (
        v_owner_id, p_source_type, p_source_title, btrim(p_origin_url), p_authority_level,
        p_source_created_at, p_source_updated_at
      ) on conflict (owner_user_id, source_type, origin_url)
        where origin_url is not null
        do nothing
        returning id into v_source_id;
    end if;

    if v_source_id is null then
      v_existing_source := true;
      if p_source_ref_type is not null then
        select id into v_source_id from public.knowledge_sources
        where owner_user_id = v_owner_id and source_type = p_source_type
          and source_ref_type = p_source_ref_type and source_ref_id = p_source_ref_id
        for update;
      elsif nullif(btrim(p_source_external_key), '') is not null then
        select id into v_source_id from public.knowledge_sources
        where owner_user_id = v_owner_id and source_type = p_source_type
          and source_external_key = btrim(p_source_external_key)
        for update;
      else
        select id into v_source_id from public.knowledge_sources
        where owner_user_id = v_owner_id and source_type = p_source_type
          and origin_url = btrim(p_origin_url)
        for update;
      end if;
    end if;
  else
    v_existing_source := true;
  end if;

  update public.knowledge_sources
  set title = p_source_title,
      authority_level = p_authority_level,
      source_created_at = p_source_created_at,
      source_updated_at = p_source_updated_at
  where id = v_source_id;

  select id, version into v_current_document_id, v_current_version
  from public.knowledge_documents
  where source_id = v_source_id and is_current
  for update;

  if v_current_document_id is not null then
    select count(*) into v_existing_chunk_count
    from public.knowledge_content
    where document_id = v_current_document_id;

    if v_existing_chunk_count = v_chunk_count and not exists (
      select 1
      from jsonb_to_recordset(p_chunks) as incoming(chunk_index integer, content text, content_hash text)
      left join public.knowledge_content existing
        on existing.document_id = v_current_document_id
       and existing.chunk_index = incoming.chunk_index
      where existing.id is null or existing.content_hash <> incoming.content_hash
    ) then
      return query select 'UNCHANGED', v_source_id, v_current_document_id, v_current_version, v_chunk_count;
      return;
    end if;
  end if;

  v_next_version := coalesce(v_current_version, 0) + 1;
  if v_current_document_id is not null then
    update public.knowledge_documents set is_current = false where id = v_current_document_id;
  end if;

  insert into public.knowledge_documents (
    source_id, title, content_type, brand_scope_type, version, supersedes_document_id
  ) values (
    v_source_id, p_document_title, p_content_type, p_brand_scope_type, v_next_version, v_current_document_id
  ) returning id into v_document_id;

  insert into public.knowledge_document_brands (document_id, brand_id)
  select v_document_id, brand_id from unnest(v_brand_ids) as brand_id;

  insert into public.knowledge_content (document_id, chunk_index, content, content_hash)
  select v_document_id, chunk_index, content, content_hash
  from jsonb_to_recordset(p_chunks) as chunk_row(chunk_index integer, content text, content_hash text);

  for v_entity in
    select * from jsonb_to_recordset(p_entities)
      as entity_row(entity_type text, canonical_type text, canonical_id uuid, display_name text)
  loop
    if v_entity.canonical_type is not null then
      insert into public.knowledge_entities (owner_user_id, entity_type, canonical_type, canonical_id)
      values (v_owner_id, v_entity.entity_type, v_entity.canonical_type, v_entity.canonical_id)
      on conflict (owner_user_id, canonical_type, canonical_id)
        where canonical_type is not null
        do update set entity_type = public.knowledge_entities.entity_type
      returning id into v_entity_id;
    else
      select id into v_entity_id
      from public.knowledge_entities
      where owner_user_id = v_owner_id
        and canonical_type is null
        and entity_type = v_entity.entity_type
        and display_name = v_entity.display_name
      limit 1;

      if v_entity_id is null then
        insert into public.knowledge_entities (owner_user_id, entity_type, display_name)
        values (v_owner_id, v_entity.entity_type, v_entity.display_name)
        returning id into v_entity_id;
      end if;
    end if;

    insert into public.knowledge_content_entities (content_id, entity_id)
    select id, v_entity_id from public.knowledge_content where document_id = v_document_id
    on conflict do nothing;
  end loop;

  insert into public.knowledge_citations (content_id, source_id, document_id, source_locator)
  select id, v_source_id, v_document_id, jsonb_build_object('chunk_index', chunk_index)
  from public.knowledge_content
  where document_id = v_document_id;

  return query select
    case when v_existing_source then 'UPDATED' else 'NEW' end,
    v_source_id,
    v_document_id,
    v_next_version,
    v_chunk_count;
end;
$$;

revoke all on function public.ingest_knowledge_v1(
  text, text, uuid, text, text, text, text, timestamptz, timestamptz,
  text, text, text, uuid[], jsonb, jsonb
) from public;
grant execute on function public.ingest_knowledge_v1(
  text, text, uuid, text, text, text, text, timestamptz, timestamptz,
  text, text, text, uuid[], jsonb, jsonb
) to authenticated;

commit;