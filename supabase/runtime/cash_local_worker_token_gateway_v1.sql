-- Cash Holdings local worker token gateway v1
--
-- Purpose:
--   Allow the local Cash worker to use the project's public publishable API key
--   plus a high-entropy worker capability token, instead of storing a project-wide
--   Supabase service_role/secret key on the workstation.
--
-- Security model:
--   - The worker token itself is never stored in Postgres; only its SHA-256 hash
--     is stored in private.runtime_config under cash_local_worker_token_sha256.
--   - The token is supplied on x-cash-worker-token and is available only through
--     PostgREST request headers.
--   - Existing cash_cli_* functions remain service_role-only.
--   - Only narrow cash_worker_* wrappers are executable by anon, and every wrapper
--     validates the worker token before delegating.
--   - Score input/apply wrappers additionally require a live queue lease owned by
--     the calling worker id, preventing arbitrary profile mutation with the token.
--
-- Provisioning is intentionally separate from this migration. After deployment,
-- an authorized human/process must set private.runtime_config
-- cash_local_worker_token_sha256 to the 64-character lowercase SHA-256 token hash.

create or replace function private.cash_local_worker_assert()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_headers jsonb := '{}'::jsonb;
  v_token text;
  v_expected_hash text;
  v_actual_hash text;
begin
  begin
    v_headers := coalesce(
      nullif(current_setting('request.headers', true), '')::jsonb,
      '{}'::jsonb
    );
  exception when others then
    v_headers := '{}'::jsonb;
  end;

  v_token := nullif(v_headers ->> 'x-cash-worker-token', '');
  if v_token is null then
    raise insufficient_privilege using message = 'cash worker token required';
  end if;

  select lower(nullif(btrim(c.value), ''))
  into v_expected_hash
  from private.runtime_config c
  where c.key = 'cash_local_worker_token_sha256';

  if v_expected_hash is null or length(v_expected_hash) <> 64 then
    raise insufficient_privilege using message = 'cash worker token is not provisioned';
  end if;

  v_actual_hash := encode(
    extensions.digest(convert_to(v_token, 'UTF8'), 'sha256'),
    'hex'
  );

  if v_actual_hash <> v_expected_hash then
    raise insufficient_privilege using message = 'invalid cash worker token';
  end if;
end;
$$;

revoke all on function private.cash_local_worker_assert()
  from public, anon, authenticated;


create or replace function private.cash_local_worker_assert_identity(p_worker_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_headers jsonb := '{}'::jsonb;
  v_header_worker_id text;
  v_worker_id text := nullif(btrim(p_worker_id), '');
begin
  perform private.cash_local_worker_assert();

  if v_worker_id is null then
    raise invalid_parameter_value using message = 'worker id is required';
  end if;

  begin
    v_headers := coalesce(
      nullif(current_setting('request.headers', true), '')::jsonb,
      '{}'::jsonb
    );
  exception when others then
    v_headers := '{}'::jsonb;
  end;

  v_header_worker_id := nullif(v_headers ->> 'x-cash-worker-id', '');
  if v_header_worker_id is null or v_header_worker_id <> v_worker_id then
    raise insufficient_privilege using message = 'cash worker identity mismatch';
  end if;
end;
$$;

revoke all on function private.cash_local_worker_assert_identity(text)
  from public, anon, authenticated;


create or replace function private.cash_local_worker_assert_job(
  p_worker_id text,
  p_prospect_profile_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.cash_local_worker_assert_identity(p_worker_id);

  if not exists (
    select 1
    from private.cash_local_jobs j
    where j.job_type = 'prospect_score'
      and j.subject_type = 'prospect_profile'
      and j.subject_id = p_prospect_profile_id
      and j.state = 'running'
      and j.claimed_by = p_worker_id
      and j.lease_expires_at is not null
      and j.lease_expires_at > now()
  ) then
    raise insufficient_privilege using message = 'prospect score job is not leased to this worker';
  end if;
end;
$$;

revoke all on function private.cash_local_worker_assert_job(text, uuid)
  from public, anon, authenticated;


create or replace function public.cash_worker_local_status_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.cash_local_worker_assert();
  return public.cash_cli_local_worker_status();
end;
$$;

revoke all on function public.cash_worker_local_status_v1() from public, authenticated;
grant execute on function public.cash_worker_local_status_v1() to anon;


create or replace function public.cash_worker_heartbeat_v1(
  p_worker_id text,
  p_version text,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.cash_local_worker_assert_identity(p_worker_id);
  return public.cash_cli_worker_heartbeat(p_worker_id, p_version, p_metadata);
end;
$$;

revoke all on function public.cash_worker_heartbeat_v1(text, text, jsonb) from public, authenticated;
grant execute on function public.cash_worker_heartbeat_v1(text, text, jsonb) to anon;


create or replace function public.cash_worker_enqueue_prospect_score_v1(
  p_prospect_profile_id uuid,
  p_reason text default 'manual',
  p_priority integer default 50
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.cash_local_worker_assert();
  return public.cash_cli_enqueue_prospect_score(
    p_prospect_profile_id,
    p_reason,
    p_priority
  );
end;
$$;

revoke all on function public.cash_worker_enqueue_prospect_score_v1(uuid, text, integer)
  from public, authenticated;
grant execute on function public.cash_worker_enqueue_prospect_score_v1(uuid, text, integer)
  to anon;


create or replace function public.cash_worker_claim_jobs_v1(
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
begin
  perform private.cash_local_worker_assert_identity(p_worker_id);
  return public.cash_cli_claim_jobs(
    p_worker_id,
    p_job_type,
    p_limit,
    p_lease_seconds
  );
end;
$$;

revoke all on function public.cash_worker_claim_jobs_v1(text, text, integer, integer)
  from public, authenticated;
grant execute on function public.cash_worker_claim_jobs_v1(text, text, integer, integer)
  to anon;


create or replace function public.cash_worker_prospect_score_input_v1(
  p_worker_id text,
  p_prospect_profile_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.cash_local_worker_assert_job(p_worker_id, p_prospect_profile_id);
  return public.cash_cli_prospect_score_input(p_prospect_profile_id);
end;
$$;

revoke all on function public.cash_worker_prospect_score_input_v1(text, uuid)
  from public, authenticated;
grant execute on function public.cash_worker_prospect_score_input_v1(text, uuid)
  to anon;


create or replace function public.cash_worker_apply_prospect_score_v1(
  p_worker_id text,
  p_prospect_profile_id uuid,
  p_score jsonb,
  p_explanation jsonb,
  p_research jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.cash_local_worker_assert_job(p_worker_id, p_prospect_profile_id);
  return public.cash_cli_apply_prospect_score(
    p_prospect_profile_id,
    p_score,
    p_explanation,
    p_research
  );
end;
$$;

revoke all on function public.cash_worker_apply_prospect_score_v1(text, uuid, jsonb, jsonb, jsonb)
  from public, authenticated;
grant execute on function public.cash_worker_apply_prospect_score_v1(text, uuid, jsonb, jsonb, jsonb)
  to anon;


create or replace function public.cash_worker_complete_job_v1(
  p_job_id uuid,
  p_worker_id text,
  p_result jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.cash_local_worker_assert_identity(p_worker_id);
  return public.cash_cli_complete_job(p_job_id, p_worker_id, p_result);
end;
$$;

revoke all on function public.cash_worker_complete_job_v1(uuid, text, jsonb)
  from public, authenticated;
grant execute on function public.cash_worker_complete_job_v1(uuid, text, jsonb)
  to anon;


create or replace function public.cash_worker_fail_job_v1(
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
begin
  perform private.cash_local_worker_assert_identity(p_worker_id);
  return public.cash_cli_fail_job(
    p_job_id,
    p_worker_id,
    p_error,
    p_retry_delay_seconds
  );
end;
$$;

revoke all on function public.cash_worker_fail_job_v1(uuid, text, jsonb, integer)
  from public, authenticated;
grant execute on function public.cash_worker_fail_job_v1(uuid, text, jsonb, integer)
  to anon;
