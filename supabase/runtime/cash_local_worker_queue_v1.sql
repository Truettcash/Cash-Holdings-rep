-- Cash Holdings local worker queue v1
--
-- Supabase remains the canonical state/evidence plane. This queue is the
-- durable hand-off boundary for bounded work that executes on a local worker.
-- No cloud producer is switched to this queue by this migration alone.

create schema if not exists private;

create table if not exists private.cash_local_jobs (
  id uuid primary key default gen_random_uuid(),
  job_type text not null,
  subject_type text not null,
  subject_id uuid not null,
  state text not null default 'queued',
  payload jsonb not null default '{}'::jsonb,
  priority integer not null default 50,
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  available_at timestamptz not null default now(),
  claimed_by text,
  claimed_at timestamptz,
  lease_expires_at timestamptz,
  completed_at timestamptz,
  result jsonb not null default '{}'::jsonb,
  error jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cash_local_jobs_state_check
    check (state in ('queued','running','succeeded','failed','dead')),
  constraint cash_local_jobs_priority_check
    check (priority between 0 and 100),
  constraint cash_local_jobs_attempts_check
    check (attempts >= 0 and max_attempts between 1 and 20)
);

create unique index if not exists cash_local_jobs_active_subject_uidx
  on private.cash_local_jobs(job_type, subject_id)
  where state in ('queued','running');

create index if not exists cash_local_jobs_claim_idx
  on private.cash_local_jobs(job_type, state, available_at, priority desc, created_at)
  where state = 'queued';

create index if not exists cash_local_jobs_lease_idx
  on private.cash_local_jobs(lease_expires_at)
  where state = 'running';

alter table private.cash_local_jobs enable row level security;

create table if not exists private.cash_local_workers (
  worker_id text primary key,
  version text not null,
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table private.cash_local_workers enable row level security;

revoke all on table private.cash_local_jobs from public, anon, authenticated;
revoke all on table private.cash_local_workers from public, anon, authenticated;

insert into private.runtime_config(key, value, updated_at)
values
  ('cash_local_worker_enabled', 'false', now()),
  ('cash_local_worker_required_freshness_seconds', '900', now())
on conflict (key) do nothing;

create or replace function public.cash_cli_worker_heartbeat(
  p_worker_id text,
  p_version text,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_worker_id text := nullif(btrim(p_worker_id), '');
  v_version text := nullif(btrim(p_version), '');
begin
  if v_worker_id is null then
    raise exception 'worker id is required' using errcode = '22023';
  end if;

  if v_version is null then
    raise exception 'worker version is required' using errcode = '22023';
  end if;

  insert into private.cash_local_workers(
    worker_id, version, metadata, started_at, last_seen_at, updated_at
  ) values (
    v_worker_id, v_version, coalesce(p_metadata, '{}'::jsonb), now(), now(), now()
  )
  on conflict (worker_id) do update
  set version = excluded.version,
      metadata = excluded.metadata,
      last_seen_at = now(),
      updated_at = now();

  return jsonb_build_object(
    'ok', true,
    'worker_id', v_worker_id,
    'observed_at', now()
  );
end;
$$;

revoke all on function public.cash_cli_worker_heartbeat(text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.cash_cli_worker_heartbeat(text, text, jsonb)
  to service_role;


create or replace function public.cash_cli_enqueue_prospect_score(
  p_prospect_profile_id uuid,
  p_reason text default 'manual',
  p_priority integer default 50
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job private.cash_local_jobs%rowtype;
  v_priority integer := greatest(0, least(coalesce(p_priority, 50), 100));
begin
  if not exists (
    select 1
    from public.prospect_profiles p
    where p.id = p_prospect_profile_id
  ) then
    raise exception 'prospect profile not found: %', p_prospect_profile_id
      using errcode = 'P0002';
  end if;

  insert into private.cash_local_jobs(
    job_type,
    subject_type,
    subject_id,
    state,
    payload,
    priority,
    available_at
  ) values (
    'prospect_score',
    'prospect_profile',
    p_prospect_profile_id,
    'queued',
    jsonb_build_object('reason', coalesce(nullif(btrim(p_reason), ''), 'manual')),
    v_priority,
    now()
  )
  on conflict (job_type, subject_id)
    where state in ('queued','running')
  do update
    set priority = greatest(private.cash_local_jobs.priority, excluded.priority),
        payload = private.cash_local_jobs.payload || excluded.payload,
        updated_at = now()
  returning * into v_job;

  return jsonb_build_object(
    'ok', true,
    'job_id', v_job.id,
    'job_type', v_job.job_type,
    'subject_id', v_job.subject_id,
    'state', v_job.state,
    'priority', v_job.priority,
    'created_at', v_job.created_at
  );
end;
$$;

revoke all on function public.cash_cli_enqueue_prospect_score(uuid, text, integer)
  from public, anon, authenticated;
grant execute on function public.cash_cli_enqueue_prospect_score(uuid, text, integer)
  to service_role;


create or replace function public.cash_cli_claim_jobs(
  p_worker_id text,
  p_job_type text default 'prospect_score',
  p_limit integer default 10,
  p_lease_seconds integer default 300
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_worker_id text := nullif(btrim(p_worker_id), '');
  v_job_type text := nullif(btrim(p_job_type), '');
  v_limit integer := greatest(1, least(coalesce(p_limit, 10), 50));
  v_lease_seconds integer := greatest(30, least(coalesce(p_lease_seconds, 300), 3600));
  v_jobs jsonb;
begin
  if v_worker_id is null or v_job_type is null then
    raise exception 'worker id and job type are required' using errcode = '22023';
  end if;

  update private.cash_local_jobs j
  set state = case when j.attempts >= j.max_attempts then 'dead' else 'queued' end,
      available_at = case
        when j.attempts >= j.max_attempts then j.available_at
        else now()
      end,
      claimed_by = null,
      claimed_at = null,
      lease_expires_at = null,
      completed_at = case when j.attempts >= j.max_attempts then now() else null end,
      error = j.error || jsonb_build_object(
        'last_recovery', 'lease_expired',
        'recovered_at', now()
      ),
      updated_at = now()
  where j.state = 'running'
    and j.lease_expires_at is not null
    and j.lease_expires_at < now();

  with candidates as (
    select j.id
    from private.cash_local_jobs j
    where j.job_type = v_job_type
      and j.state = 'queued'
      and j.available_at <= now()
    order by j.priority desc, j.created_at asc
    for update skip locked
    limit v_limit
  ), claimed as (
    update private.cash_local_jobs j
    set state = 'running',
        attempts = j.attempts + 1,
        claimed_by = v_worker_id,
        claimed_at = now(),
        lease_expires_at = now() + make_interval(secs => v_lease_seconds),
        error = '{}'::jsonb,
        updated_at = now()
    from candidates c
    where j.id = c.id
    returning j.id,
              j.job_type,
              j.subject_type,
              j.subject_id,
              j.payload,
              j.priority,
              j.attempts,
              j.max_attempts,
              j.lease_expires_at
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', c.id,
        'job_type', c.job_type,
        'subject_type', c.subject_type,
        'subject_id', c.subject_id,
        'payload', c.payload,
        'priority', c.priority,
        'attempts', c.attempts,
        'max_attempts', c.max_attempts,
        'lease_expires_at', c.lease_expires_at
      )
      order by c.priority desc, c.id
    ),
    '[]'::jsonb
  )
  into v_jobs
  from claimed c;

  insert into private.cash_local_workers(
    worker_id, version, metadata, started_at, last_seen_at, updated_at
  ) values (
    v_worker_id, 'cash-cli-v1', jsonb_build_object('last_action', 'claim'), now(), now(), now()
  )
  on conflict (worker_id) do update
  set last_seen_at = now(),
      updated_at = now(),
      metadata = private.cash_local_workers.metadata || jsonb_build_object('last_action', 'claim');

  return v_jobs;
end;
$$;

revoke all on function public.cash_cli_claim_jobs(text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.cash_cli_claim_jobs(text, text, integer, integer)
  to service_role;


create or replace function public.cash_cli_complete_job(
  p_job_id uuid,
  p_worker_id text,
  p_result jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job private.cash_local_jobs%rowtype;
begin
  update private.cash_local_jobs j
  set state = 'succeeded',
      result = coalesce(p_result, '{}'::jsonb),
      error = '{}'::jsonb,
      completed_at = now(),
      lease_expires_at = null,
      updated_at = now()
  where j.id = p_job_id
    and j.state = 'running'
    and j.claimed_by = p_worker_id
  returning * into v_job;

  if v_job.id is null then
    raise exception 'job is not owned by worker or is not running: %', p_job_id
      using errcode = 'P0002';
  end if;

  update private.cash_local_workers
  set last_seen_at = now(),
      updated_at = now(),
      metadata = metadata || jsonb_build_object('last_action', 'complete')
  where worker_id = p_worker_id;

  return jsonb_build_object(
    'ok', true,
    'job_id', v_job.id,
    'state', v_job.state,
    'completed_at', v_job.completed_at
  );
end;
$$;

revoke all on function public.cash_cli_complete_job(uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.cash_cli_complete_job(uuid, text, jsonb)
  to service_role;


create or replace function public.cash_cli_fail_job(
  p_job_id uuid,
  p_worker_id text,
  p_error jsonb default '{}'::jsonb,
  p_retry_delay_seconds integer default 60
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job private.cash_local_jobs%rowtype;
  v_retry_delay integer := greatest(0, least(coalesce(p_retry_delay_seconds, 60), 3600));
begin
  update private.cash_local_jobs j
  set state = case when j.attempts >= j.max_attempts then 'dead' else 'queued' end,
      error = coalesce(p_error, '{}'::jsonb),
      available_at = case
        when j.attempts >= j.max_attempts then j.available_at
        else now() + make_interval(secs => v_retry_delay)
      end,
      claimed_by = null,
      claimed_at = null,
      lease_expires_at = null,
      completed_at = case when j.attempts >= j.max_attempts then now() else null end,
      updated_at = now()
  where j.id = p_job_id
    and j.state = 'running'
    and j.claimed_by = p_worker_id
  returning * into v_job;

  if v_job.id is null then
    raise exception 'job is not owned by worker or is not running: %', p_job_id
      using errcode = 'P0002';
  end if;

  update private.cash_local_workers
  set last_seen_at = now(),
      updated_at = now(),
      metadata = metadata || jsonb_build_object('last_action', 'fail')
  where worker_id = p_worker_id;

  return jsonb_build_object(
    'ok', true,
    'job_id', v_job.id,
    'state', v_job.state,
    'attempts', v_job.attempts,
    'max_attempts', v_job.max_attempts,
    'available_at', v_job.available_at
  );
end;
$$;

revoke all on function public.cash_cli_fail_job(uuid, text, jsonb, integer)
  from public, anon, authenticated;
grant execute on function public.cash_cli_fail_job(uuid, text, jsonb, integer)
  to service_role;


create or replace function public.cash_cli_local_worker_status()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'ok', true,
    'observed_at', now(),
    'enabled', coalesce((
      select c.value::boolean
      from private.runtime_config c
      where c.key = 'cash_local_worker_enabled'
    ), false),
    'queue', jsonb_build_object(
      'queued', (select count(*) from private.cash_local_jobs where state = 'queued'),
      'running', (select count(*) from private.cash_local_jobs where state = 'running'),
      'succeeded_24h', (
        select count(*)
        from private.cash_local_jobs
        where state = 'succeeded' and completed_at >= now() - interval '24 hours'
      ),
      'dead', (select count(*) from private.cash_local_jobs where state = 'dead')
    ),
    'workers', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'worker_id', w.worker_id,
          'version', w.version,
          'last_seen_at', w.last_seen_at,
          'fresh', w.last_seen_at >= now() - make_interval(
            secs => coalesce((
              select c.value::integer
              from private.runtime_config c
              where c.key = 'cash_local_worker_required_freshness_seconds'
            ), 900)
          )
        )
        order by w.last_seen_at desc
      )
      from private.cash_local_workers w
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.cash_cli_local_worker_status()
  from public, anon, authenticated;
grant execute on function public.cash_cli_local_worker_status()
  to service_role;


create or replace function public.cash_cli_runtime_status()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'ok', true,
    'observed_at', now(),
    'prospects', jsonb_build_object(
      'profiles', (select count(*) from public.prospect_profiles),
      'discovery_candidates_new', (
        select count(*) from public.prospect_discovery_candidates where status = 'new'
      ),
      'enrichment_queued', (
        select count(*) from public.prospect_enrichment_requests where status = 'queued'
      ),
      'outreach_draft_or_review', (
        select count(*) from public.prospect_outreach_queue where state in ('draft', 'review')
      )
    ),
    'runtime', jsonb_build_object(
      'agent_runs_total', (select count(*) from public.agent_runs),
      'agent_runs_24h', (
        select count(*) from public.agent_runs where created_at >= now() - interval '24 hours'
      )
    ),
    'local_worker', jsonb_build_object(
      'enabled', coalesce((
        select c.value::boolean
        from private.runtime_config c
        where c.key = 'cash_local_worker_enabled'
      ), false),
      'queued', (select count(*) from private.cash_local_jobs where state = 'queued'),
      'running', (select count(*) from private.cash_local_jobs where state = 'running'),
      'workers_seen_15m', (
        select count(*)
        from private.cash_local_workers
        where last_seen_at >= now() - interval '15 minutes'
      )
    ),
    'legacy_src', jsonb_build_object(
      'engine_catalog_rows', (select count(*) from public.src_engine_catalog),
      'engine_media_rows', (select count(*) from public.src_engine_media),
      'lms_course_rows', (select count(*) from public.src_lms_courses),
      'storage_objects', (
        select count(*)
        from storage.objects
        where bucket_id in ('athrty-client-assets', 'src-lms-assets')
      ),
      'storage_bytes', (
        select coalesce(sum((metadata ->> 'size')::bigint), 0)
        from storage.objects
        where bucket_id in ('athrty-client-assets', 'src-lms-assets')
      )
    )
  );
$$;

revoke all on function public.cash_cli_runtime_status()
  from public, anon, authenticated;
grant execute on function public.cash_cli_runtime_status()
  to service_role;
