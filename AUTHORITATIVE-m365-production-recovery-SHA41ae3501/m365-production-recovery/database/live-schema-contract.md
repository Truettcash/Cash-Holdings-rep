# Live M365 Production Schema Contract

Source: production Supabase project `ldijllskwwmyhhbzspmb`, inspected read-only.
Purpose: source-parity recovery for the Microsoft 365 / SharePoint integration. This file is descriptive evidence, not an instruction to mutate production.

## Runtime integration connection

- id: `f304a30c-b8c4-4d94-9860-e8634efe6b1f`
- provider: `microsoft_365`
- authentication_type: `client_credentials`
- credential_ref: `supabase_env:m365_athrty_client_credentials`
- connection_status: `connected`
- sync_enabled: `true`

## SharePoint source identity

- site id: `athrtysys.sharepoint.com,50b59472-e861-4e4f-8bcc-81ec8d302646,f619fbc4-04ca-47de-bd86-e6f2aab02a73`
- list: `ATHRTY Outbound`
- list id: `6aae0aa7-a978-4d0d-a67e-ffbbd5a11108`

## Brand routing

- `Truett Cash` -> `truett-cash`
- `Authority Systems` -> `authority-systems`
- `ATHRTY.SYS` -> `authority-systems`

## public.integration_connections

RLS: enabled, not forced.

Columns in production order:
1. id uuid NOT NULL DEFAULT gen_random_uuid()
2. channel_id uuid NOT NULL
3. provider text NOT NULL
4. environment text NOT NULL DEFAULT 'production'
5. authentication_type text NOT NULL DEFAULT 'oauth'
6. connection_status text NULL
7. provider_external_account_id text NULL
8. granted_scopes text[] NULL
9. credential_ref text NOT NULL
10. access_token_expires_at timestamptz NULL
11. refresh_token_expires_at timestamptz NULL
12. sync_enabled boolean NULL
13. last_sync_attempt_at timestamptz NULL
14. last_successful_sync_at timestamptz NULL
15. next_scheduled_sync_at timestamptz NULL
16. last_error_code text NULL
17. last_error_message text NULL
18. provider_metadata jsonb NULL
19. created_at timestamptz NOT NULL DEFAULT now()
20. updated_at timestamptz NOT NULL DEFAULT now()
21. archived_at timestamptz NULL

Indexes / constraints:
- primary key: `integration_connections_pkey (id)`
- index: `idx_integration_connections_channel_id (channel_id)`
- partial unique index: `integration_connections_unique_channel_provider_active_uq (channel_id, provider) WHERE archived_at IS NULL`
- FK: `channel_id -> channels(id) ON UPDATE CASCADE ON DELETE RESTRICT`

RLS policy:
- `integration_connections_owner_select` for authenticated SELECT, scoped through channel -> brand ownership (`brands.owner_user_id = auth.uid()`).

Trigger:
- `trg_integration_connections_updated_at` BEFORE UPDATE -> `set_updated_at()`

Observed grants:
- authenticated: SELECT
- service_role: full table privileges

## public.integration_sync_runs

RLS: enabled, not forced.

Columns in production order:
1. id uuid NOT NULL DEFAULT gen_random_uuid()
2. integration_connection_id uuid NOT NULL
3. sync_type text NOT NULL
4. status text NOT NULL
5. requested_at timestamptz NOT NULL DEFAULT now()
6. started_at timestamptz NULL
7. completed_at timestamptz NULL
8. records_read bigint NOT NULL DEFAULT 0
9. records_written bigint NOT NULL DEFAULT 0
10. records_skipped bigint NOT NULL DEFAULT 0
11. retry_count integer NOT NULL DEFAULT 0
12. provider_cursor jsonb NULL
13. error_code text NULL
14. error_message text NULL
15. execution_metadata jsonb NULL
16. created_at timestamptz NOT NULL DEFAULT now()

Indexes / constraints:
- primary key: `integration_sync_runs_pkey (id)`
- index: `idx_integration_sync_runs_integration_connection_id (integration_connection_id)`
- FK: `integration_connection_id -> integration_connections(id) ON UPDATE CASCADE ON DELETE RESTRICT`

RLS policy:
- `integration_sync_runs_owner_select` for authenticated SELECT, scoped through integration connection -> channel -> brand ownership.

Observed grants:
- authenticated: SELECT
- service_role: full table privileges

## public.integration_source_records

RLS: enabled, not forced.

Columns in production order:
1. id uuid NOT NULL DEFAULT gen_random_uuid()
2. integration_connection_id uuid NOT NULL
3. provider text NOT NULL
4. resource_type text NOT NULL
5. external_site_id text NOT NULL
6. external_list_id text NOT NULL
7. external_item_id text NOT NULL
8. external_account_id text NULL
9. external_lead_id text NULL
10. external_dedup_key text NULL
11. external_etag text NULL
12. external_created_at timestamptz NULL
13. external_modified_at timestamptz NULL
14. source_hash text NULL
15. source_payload jsonb NULL
16. brand_key text NULL
17. organization_id uuid NULL
18. contact_id uuid NULL
19. engagement_id uuid NULL
20. deal_id uuid NULL
21. mapping_status text NOT NULL DEFAULT 'unmapped'
22. mapping_error_code text NULL
23. first_seen_at timestamptz NOT NULL DEFAULT now()
24. last_seen_at timestamptz NULL
25. last_synced_at timestamptz NULL
26. created_at timestamptz NOT NULL DEFAULT now()
27. updated_at timestamptz NOT NULL DEFAULT now()

Identity / idempotency constraint:
- `integration_source_records_idempotent_uniq`
- UNIQUE (`integration_connection_id`, `resource_type`, `external_site_id`, `external_list_id`, `external_item_id`)

Indexes:
- `integration_source_records_external_account_id_idx`
- `integration_source_records_external_lead_id_idx`
- `integration_source_records_external_dedup_key_idx`
- `integration_source_records_organization_id_idx`
- `integration_source_records_contact_id_idx`
- `integration_source_records_engagement_id_idx`
- `integration_source_records_deal_id_idx`
- primary key `integration_source_records_pkey (id)`

Foreign keys:
- integration_connection_id -> integration_connections(id) ON DELETE RESTRICT
- organization_id -> organizations(id) ON DELETE SET NULL
- contact_id -> contacts(id) ON DELETE SET NULL
- engagement_id -> engagements(id) ON DELETE SET NULL
- deal_id -> deals(id) ON DELETE SET NULL

RLS policies:
- `integration_source_records_owner_select` authenticated SELECT through connection/channel/brand ownership
- `integration_source_records_owner_update` authenticated UPDATE using + with-check through connection/channel/brand ownership
- `integration_source_records_owner_upsert` authenticated INSERT with-check through connection/channel/brand ownership

Observed grants at inspection time:
- authenticated: broad table ACL present
- anon: broad table ACL present
- service_role: full table privileges

Important: preserve current production behavior during source-parity recovery. Do not silently “fix” grants/RLS in the recovery commit; any security hardening should be a separate reviewed change.

## Writer RPC

Canonical production definition is supplied separately as:
`database/sync_m365_sharepoint_athrty_outbound_v1.sql`

Signature:
`public.sync_m365_sharepoint_athrty_outbound_v1(uuid,jsonb,jsonb)`

The writer uses:
- integration_sync_runs
- integration_source_records
- organizations
- contacts
- engagements

It enforces the specific production integration connection, SharePoint site/list identity, allowed brand keys, idempotent source anchoring, and transactional domain mapping.
