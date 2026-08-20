#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTAINER="cash-knowledge-ingest-rpc-test"

cleanup() {
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
}
trap cleanup EXIT

cleanup
docker run --detach --rm --name "$CONTAINER" \
  --env POSTGRES_PASSWORD=postgres \
  --volume "$ROOT:/workspace:ro" \
  pgvector/pgvector:pg16 >/dev/null

until docker exec "$CONTAINER" pg_isready --host 127.0.0.1 --username postgres --dbname postgres >/dev/null 2>&1; do
  :
done

docker exec --interactive "$CONTAINER" psql --host 127.0.0.1 --username postgres --dbname postgres --set ON_ERROR_STOP=1 <<'SQL'
create extension if not exists pgcrypto;
create schema auth;
create schema extensions;
create extension if not exists vector with schema extensions;
create table auth.users (id uuid primary key);
create or replace function auth.uid()
returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin; exception when duplicate_object then null; end $$;
grant authenticated to postgres;
grant usage on schema auth to authenticated;
grant select on auth.users to authenticated;

create table public.brands (id uuid primary key, name text not null default 'Brand');
create table public.organizations (id uuid primary key);
create table public.contacts (id uuid primary key);
create table public.projects (id uuid primary key);
create table public.project_tasks (id uuid primary key);
create table public.deals (id uuid primary key);
create table public.integration_connections (id uuid primary key);
create table public.metric_definitions (id uuid primary key);
create table public.strategic_moves (id uuid primary key);
grant select on public.brands, public.organizations, public.contacts, public.projects,
  public.project_tasks, public.deals, public.integration_connections,
  public.metric_definitions, public.strategic_moves to authenticated;
insert into auth.users values
  ('00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000002');
insert into public.brands values
  ('00000000-0000-4000-8000-000000000201', 'Brand one'),
  ('00000000-0000-4000-8000-000000000202', 'Brand two');
insert into public.projects values ('00000000-0000-4000-8000-000000000101');
SQL

for migration in \
  20260815_001_knowledge_sources_and_documents.sql \
  20260815_002_knowledge_content_and_entities.sql \
  20260815_003_knowledge_relationships_and_citations.sql \
  20260815_004_knowledge_indexes_and_search.sql \
  20260815_005_atomic_knowledge_ingestion.sql; do
  docker exec "$CONTAINER" psql --host 127.0.0.1 --username postgres --dbname postgres --set ON_ERROR_STOP=1 \
    --file "/workspace/supabase/migrations/$migration" >/dev/null
done

docker exec --interactive "$CONTAINER" psql --host 127.0.0.1 --username postgres --dbname postgres \
  --file /workspace/scripts/test-knowledge-ingest-rpc.sql