-- ATHRTY private runtime control substrate snapshot.
-- Secret VALUES are deliberately absent.

CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE IF NOT EXISTS private.runtime_config (
  key text NOT NULL,
  value text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT runtime_config_pkey PRIMARY KEY (key)
);

CREATE TABLE IF NOT EXISTS private.athrty_runtime_leases (
  lease_key text NOT NULL,
  owner_token uuid NOT NULL,
  acquired_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone NOT NULL,
  CONSTRAINT athrty_runtime_leases_pkey PRIMARY KEY (lease_key)
);

CREATE OR REPLACE FUNCTION public.try_claim_athrty_runtime_lease(p_lease_key text, p_owner_token uuid, p_ttl_seconds integer DEFAULT 180)
RETURNS boolean
LANGUAGE plpgsql
SET search_path TO 'public', 'private'
AS $function$
declare v_rows integer := 0;
begin
  insert into private.athrty_runtime_leases(lease_key, owner_token, acquired_at, expires_at)
  values (p_lease_key, p_owner_token, now(), now() + make_interval(secs => greatest(30, p_ttl_seconds)))
  on conflict (lease_key) do update
    set owner_token=excluded.owner_token,
        acquired_at=excluded.acquired_at,
        expires_at=excluded.expires_at
  where private.athrty_runtime_leases.expires_at < now();
  get diagnostics v_rows = row_count;
  return v_rows = 1;
end;
$function$;

CREATE OR REPLACE FUNCTION public.release_athrty_runtime_lease(p_lease_key text, p_owner_token uuid)
RETURNS boolean
LANGUAGE plpgsql
SET search_path TO 'public', 'private'
AS $function$
declare v_rows integer := 0;
begin
  delete from private.athrty_runtime_leases
  where lease_key=p_lease_key and owner_token=p_owner_token;
  get diagnostics v_rows = row_count;
  return v_rows = 1;
end;
$function$;
