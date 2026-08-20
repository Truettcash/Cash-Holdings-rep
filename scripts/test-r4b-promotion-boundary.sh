#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTAINER="${CONTAINER:-r4b6h-disposable-proof}"
DB_NAME="postgres"

cleanup() {
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
}
trap cleanup EXIT

cleanup

docker run --detach --rm --name "$CONTAINER" \
  --env POSTGRES_PASSWORD=postgres \
  pgvector/pgvector:pg16 >/dev/null

until docker exec "$CONTAINER" pg_isready --host 127.0.0.1 --username postgres --dbname "$DB_NAME" >/dev/null 2>&1; do
  :
done

# Strict bootstrap only in the same disposable database target.
docker exec --user postgres "$CONTAINER" psql -d "$DB_NAME" -v ON_ERROR_STOP=1 <<'SQL'
create extension if not exists pgcrypto;
create schema if not exists auth;
create schema if not exists extensions;

create table if not exists auth.users (id uuid primary key);

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
SQL

for role in anon authenticated service_role; do
  if ! docker exec --user postgres "$CONTAINER" psql -d "$DB_NAME" -At -c "select 1 from pg_roles where rolname = '$role';" | grep -q 1; then
    docker exec --user postgres "$CONTAINER" psql -d "$DB_NAME" -v ON_ERROR_STOP=1 -c "create role $role nologin;"
  fi
done

docker exec --user postgres "$CONTAINER" psql -d "$DB_NAME" -v ON_ERROR_STOP=1 <<'SQL'
grant usage on schema auth to authenticated;
grant select on auth.users to authenticated;
SQL

docker exec --user postgres "$CONTAINER" psql -d "$DB_NAME" -v ON_ERROR_STOP=1 <<'SQL'
select current_database() as database_name;
select current_user as database_user;
select to_regnamespace('auth') as auth_schema;
select to_regclass('auth.users') as auth_users;
select to_regprocedure('auth.uid()') as auth_uid_function;
select exists (select 1 from pg_roles where rolname = 'anon') as anon_role;
select exists (select 1 from pg_roles where rolname = 'authenticated') as authenticated_role;
select exists (select 1 from pg_roles where rolname = 'service_role') as service_role;
do $$
begin
  if to_regnamespace('auth') is null then
    raise exception 'BOOTSTRAP_ERROR: auth schema missing before migration';
  end if;
  if to_regclass('auth.users') is null then
    raise exception 'BOOTSTRAP_ERROR: auth.users missing before migration';
  end if;
  if to_regprocedure('auth.uid()') is null then
    raise exception 'BOOTSTRAP_ERROR: auth.uid() missing before migration';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    raise exception 'BOOTSTRAP_ERROR: anon role missing before migration';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    raise exception 'BOOTSTRAP_ERROR: authenticated role missing before migration';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    raise exception 'BOOTSTRAP_ERROR: service_role missing before migration';
  end if;
end $$;
SQL

echo "DATABASE=$DB_NAME"
echo "AUTH_SCHEMA=PASS"
echo "AUTH_USERS=PASS"
echo "AUTH_UID=PASS"
echo "ANON_ROLE=PASS"
echo "AUTHENTICATED_ROLE=PASS"
echo "SERVICE_ROLE=PASS"

baseline="$ROOT/supabase/migrations/20260628040048_ea438a51-ddfb-42db-91a5-edc35d7338da.sql"
name="$(basename "$baseline")"
echo "BASELINE=$name"
docker cp "$baseline" "$CONTAINER":/tmp/"$name"
docker exec --user postgres "$CONTAINER" psql -d "$DB_NAME" -v ON_ERROR_STOP=1 -f "/tmp/$name"
docker exec --user postgres "$CONTAINER" psql -d "$DB_NAME" -At -v ON_ERROR_STOP=1 <<'SQL'
select 'BASELINE_BRANDS=PASS' where to_regclass('public.brands') is not null;
SQL

for f in \
  "$ROOT/supabase/migrations/20260815_001_knowledge_sources_and_documents.sql" \
  "$ROOT/supabase/migrations/20260815_002_knowledge_content_and_entities.sql" \
  "$ROOT/supabase/migrations/20260815_003_knowledge_relationships_and_citations.sql" \
  "$ROOT/supabase/migrations/20260815_004_knowledge_indexes_and_search.sql" \
  "$ROOT/supabase/migrations/20260815_005_atomic_knowledge_ingestion.sql" \
  "$ROOT/supabase/migrations/20260816_001_r4b_intelligence_foundation.sql" \
  "$ROOT/supabase/migrations/20260816_002_r4b_decisions_outcomes_lessons.sql" \
  "$ROOT/supabase/migrations/20260816_003_r4b_security_indexes_rls.sql" \
  "$ROOT/supabase/migrations/20260816_004_r4b_promotion_boundaries.sql"; do
  name="$(basename "$f")"
  echo "MIGRATION=$name"
  docker exec --user postgres "$CONTAINER" psql -d "$DB_NAME" -v ON_ERROR_STOP=1 <<'SQL'
create schema if not exists auth;
create schema if not exists extensions;
create table if not exists auth.users (id uuid primary key);
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
SQL

  for role in anon authenticated service_role; do
    if ! docker exec --user postgres "$CONTAINER" psql -d "$DB_NAME" -At -c "select 1 from pg_roles where rolname = '$role';" | grep -q 1; then
      docker exec --user postgres "$CONTAINER" psql -d "$DB_NAME" -v ON_ERROR_STOP=1 -c "create role $role nologin;"
    fi
  done

  docker exec --user postgres "$CONTAINER" psql -d "$DB_NAME" -v ON_ERROR_STOP=1 <<'SQL'
grant usage on schema auth to authenticated;
grant select on auth.users to authenticated;
SQL

  docker cp "$f" "$CONTAINER":/tmp/"$name"
  docker exec --user postgres "$CONTAINER" psql -d "$DB_NAME" -v ON_ERROR_STOP=1 -f "/tmp/$name"
  echo "MIGRATION=$name PASS"
done

docker exec --user postgres "$CONTAINER" psql -d "$DB_NAME" -v ON_ERROR_STOP=1 <<'SQL'
select to_regclass('public.intelligence_review_events') as intelligence_review_events;
select to_regclass('public.pattern_observations') as pattern_observations;
select to_regclass('public.accepted_constraints') as accepted_constraints;
select to_regclass('public.evidence_requests') as evidence_requests;
select relrowsecurity from pg_class where oid = 'public.intelligence_review_events'::regclass;
select relrowsecurity from pg_class where oid = 'public.pattern_observations'::regclass;
select relrowsecurity from pg_class where oid = 'public.accepted_constraints'::regclass;
select relrowsecurity from pg_class where oid = 'public.evidence_requests'::regclass;
SQL

# Seed owner identities in the same auth.users relation expected by migrations.
docker exec --user postgres "$CONTAINER" psql -d "$DB_NAME" -v ON_ERROR_STOP=1 <<'SQL'
insert into auth.users (id)
values
  ('00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000002')
on conflict do nothing;
SQL

docker exec --user postgres "$CONTAINER" psql -d "$DB_NAME" -v ON_ERROR_STOP=1 <<'SQL'
select auth.uid() as auth_uid_context;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);
select auth.uid() as owner_a_uid;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);
select auth.uid() as owner_b_uid;
SQL

echo 'BOOTSTRAP=PASS'
