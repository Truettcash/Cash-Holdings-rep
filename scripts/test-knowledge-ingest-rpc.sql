\set ON_ERROR_STOP on

create or replace function public.test_ingest(
  p_key text,
  p_content text,
  p_scope text default 'global',
  p_brand_ids uuid[] default '{}'::uuid[],
  p_entities jsonb default '[]'::jsonb
)
returns table (result text, source_id uuid, document_id uuid, version integer, chunk_count integer)
language sql
security invoker
as $$
  select *
  from public.ingest_knowledge_v1(
    'manual_note', null, null, p_key, 'Test source', null, 'supporting', null, null,
    'Test document', 'text', p_scope, p_brand_ids,
    jsonb_build_array(jsonb_build_object(
      'chunk_index', 0,
      'content', p_content,
      'content_hash', repeat(md5(p_content), 2)
    )),
    p_entities
  );
$$;

do $$
begin
  if has_function_privilege('public', 'public.ingest_knowledge_v1(text,text,uuid,text,text,text,text,timestamp with time zone,timestamp with time zone,text,text,text,uuid[],jsonb,jsonb)', 'EXECUTE') then
    raise exception 'PUBLIC must not execute ingest_knowledge_v1';
  end if;
  if not has_function_privilege('authenticated', 'public.ingest_knowledge_v1(text,text,uuid,text,text,text,text,timestamp with time zone,timestamp with time zone,text,text,text,uuid[],jsonb,jsonb)', 'EXECUTE') then
    raise exception 'authenticated must execute ingest_knowledge_v1';
  end if;
  if (select prosecdef from pg_proc where oid = 'public.ingest_knowledge_v1(text,text,uuid,text,text,text,text,timestamp with time zone,timestamp with time zone,text,text,text,uuid[],jsonb,jsonb)'::regprocedure) then
    raise exception 'ingest_knowledge_v1 must be SECURITY INVOKER';
  end if;
end;
$$;

set role authenticated;
select set_config('request.jwt.claim.sub', '', false);
do $$
begin
  begin
    perform * from public.test_ingest('unauthenticated', 'no write');
    raise exception 'unauthenticated call unexpectedly succeeded';
  exception when others then
    if position('authenticated user' in sqlerrm) = 0 then
      raise;
    end if;
  end;
end;
$$;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', false);

select * from public.test_ingest('external-note-1', 'first evidence');
do $$
begin
  if (select count(*) from public.knowledge_sources where source_external_key = 'external-note-1') <> 1 then
    raise exception 'external identity did not create exactly one source';
  end if;
  if (select owner_user_id from public.knowledge_sources where source_external_key = 'external-note-1') <> auth.uid() then
    raise exception 'source owner did not derive from auth.uid()';
  end if;
end;
$$;

select * from public.test_ingest('external-note-1', 'first evidence');
do $$
begin
  if (select count(*) from public.knowledge_documents d join public.knowledge_sources s on s.id = d.source_id where s.source_external_key = 'external-note-1') <> 1 then
    raise exception 'unchanged re-ingestion created another document';
  end if;
end;
$$;

select * from public.test_ingest('external-note-1', 'changed evidence');
do $$
begin
  if (select max(d.version) from public.knowledge_documents d join public.knowledge_sources s on s.id = d.source_id where s.source_external_key = 'external-note-1') <> 2
     or (select count(*) from public.knowledge_documents d join public.knowledge_sources s on s.id = d.source_id where s.source_external_key = 'external-note-1' and d.is_current) <> 1 then
    raise exception 'updated re-ingestion did not produce one current version 2';
  end if;
end;
$$;

-- Simulate the losing side of a concurrent source insert: the unique index
-- already owns this identity before the RPC begins. The RPC must resolve that
-- same source rather than creating a second ownership root.
insert into public.knowledge_sources (
  owner_user_id, source_type, source_external_key, title, authority_level
) values (
  auth.uid(), 'manual_note', 'simulated-conflict', 'Pre-existing source', 'supporting'
);
select * from public.test_ingest('simulated-conflict', 'conflict evidence');
do $$
begin
  if (select count(*) from public.knowledge_sources where source_external_key = 'simulated-conflict') <> 1 then
    raise exception 'simulated identity conflict created a duplicate source';
  end if;
end;
$$;

select * from public.ingest_knowledge_v1(
  'project', 'projects', '00000000-0000-4000-8000-000000000101', null,
  'Canonical source', null, 'primary', null, null, 'Canonical document', 'text', 'global', '{}',
  '[{"chunk_index":0,"content":"canonical source","content_hash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}]',
  '[]'
);

select * from public.ingest_knowledge_v1(
  'research_url', null, null, null, 'URL source', 'https://example.test/source', 'supporting', null, null,
  'URL document', 'text', 'global', '{}',
  '[{"chunk_index":0,"content":"url source","content_hash":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}]',
  '[]'
);

select * from public.test_ingest(
  'one-brand', 'brand evidence', 'brand', array['00000000-0000-4000-8000-000000000201'::uuid]
);
select * from public.test_ingest(
  'two-brands', 'multi brand evidence', 'multi_brand', array[
    '00000000-0000-4000-8000-000000000201'::uuid,
    '00000000-0000-4000-8000-000000000202'::uuid
  ]
);
do $$
begin
  if (select count(*) from public.knowledge_document_brands db join public.knowledge_documents d on d.id = db.document_id join public.knowledge_sources s on s.id = d.source_id where s.source_external_key = 'one-brand') <> 1 then
    raise exception 'one-brand transaction did not commit its brand link';
  end if;
  if (select count(*) from public.knowledge_document_brands db join public.knowledge_documents d on d.id = db.document_id join public.knowledge_sources s on s.id = d.source_id where s.source_external_key = 'two-brands') <> 2 then
    raise exception 'multi-brand transaction did not commit its brand links';
  end if;
end;
$$;

do $$
begin
  begin
    perform * from public.test_ingest('invalid-brand', 'must roll back', 'brand', array['00000000-0000-4000-8000-000000000299'::uuid]);
    raise exception 'invalid brand unexpectedly succeeded';
  exception when others then
    if position('brand IDs do not exist' in sqlerrm) = 0 then
      raise;
    end if;
  end;
  if exists (select 1 from public.knowledge_sources where source_external_key = 'invalid-brand') then
    raise exception 'invalid brand left a source row behind';
  end if;
end;
$$;

do $$
begin
  begin
    perform * from public.test_ingest('invalid-cardinality', 'must roll back', 'brand', '{}'::uuid[]);
    raise exception 'invalid cardinality unexpectedly succeeded';
  exception when others then
    if position('brand scope does not match' in sqlerrm) = 0 then
      raise;
    end if;
  end;
  if exists (select 1 from public.knowledge_sources where source_external_key = 'invalid-cardinality') then
    raise exception 'invalid cardinality left a source row behind';
  end if;
end;
$$;

select * from public.test_ingest(
  'canonical-entity', 'entity evidence', 'global', '{}'::uuid[],
  '[{"entity_type":"Brand","canonical_type":"brands","canonical_id":"00000000-0000-4000-8000-000000000201"}]'
);
do $$
begin
  if not exists (select 1 from public.knowledge_content_entities) then
    raise exception 'canonical entity was not linked';
  end if;
  begin
    perform * from public.test_ingest(
      'missing-entity', 'must roll back', 'global', '{}'::uuid[],
      '[{"entity_type":"Brand","canonical_type":"brands","canonical_id":"00000000-0000-4000-8000-000000000299"}]'
    );
    raise exception 'missing canonical entity unexpectedly succeeded';
  exception when others then
    if position('canonical entity does not exist' in sqlerrm) = 0 then
      raise;
    end if;
  end;
  if exists (select 1 from public.knowledge_sources where source_external_key = 'missing-entity') then
    raise exception 'missing canonical entity left a source row behind';
  end if;
end;
$$;

reset role;
create or replace function public.test_reject_citation()
returns trigger language plpgsql as $$ begin raise exception 'citation test failure'; end; $$;
create trigger trg_test_reject_citation before insert on public.knowledge_citations
for each row execute function public.test_reject_citation();
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', false);
do $$
begin
  begin
    perform * from public.test_ingest('citation-rollback', 'must roll back');
    raise exception 'citation failure unexpectedly succeeded';
  exception when others then
    if position('citation test failure' in sqlerrm) = 0 then
      raise;
    end if;
  end;
  if exists (select 1 from public.knowledge_sources where source_external_key = 'citation-rollback') then
    raise exception 'citation failure did not roll back source/document/content';
  end if;
end;
$$;
reset role;
drop trigger trg_test_reject_citation on public.knowledge_citations;
drop function public.test_reject_citation();

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', false);
select * from public.test_ingest('owner-b', 'owner B evidence');
do $$
declare v_owner_a_content uuid; v_owner_b_entity uuid;
begin
  select c.id into v_owner_a_content
  from public.knowledge_content c
  join public.knowledge_documents d on d.id = c.document_id
  join public.knowledge_sources s on s.id = d.source_id
  where s.owner_user_id = '00000000-0000-4000-8000-000000000001'
  limit 1;
  insert into public.knowledge_entities (owner_user_id, entity_type, display_name)
  values (auth.uid(), 'Topic', 'Owner B topic') returning id into v_owner_b_entity;
  begin
    insert into public.knowledge_content_entities (content_id, entity_id)
    values (v_owner_a_content, v_owner_b_entity);
    raise exception 'cross-owner content/entity link unexpectedly succeeded';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

reset role;
do $$
declare v_brand_count integer; v_project_count integer;
begin
  select count(*) into v_brand_count from public.brands;
  select count(*) into v_project_count from public.projects;
  if v_brand_count <> 2 or v_project_count <> 1 then
    raise exception 'ingestion mutated operating tables';
  end if;
end;
$$;

select 'RPC_VALIDATION_PASS' as result;