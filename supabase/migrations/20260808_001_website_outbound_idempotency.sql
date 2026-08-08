-- 20260808_001_website_outbound_idempotency.sql
-- Add idempotency indexes for website-outbound CRM integrations

-- NOTE: This file represents already-approved, manually-applied changes in production.
-- It is added here for source control and must NOT be executed against production from CI without explicit approval.

CREATE UNIQUE INDEX IF NOT EXISTS engagements_website_outbound_crm_lead_id_uniq
ON public.engagements (
  (metadata #>> '{website_outbound_crm,lead_id}')
)
WHERE
  (metadata #>> '{website_outbound_crm,lead_id}') IS NOT NULL
  AND btrim(metadata #>> '{website_outbound_crm,lead_id}') <> '';

CREATE UNIQUE INDEX IF NOT EXISTS engagement_events_website_outbound_idempotency_key_uniq
ON public.engagement_events (
  (metadata #>> '{idempotency_key}')
)
WHERE
  (metadata #>> '{idempotency_key}') IS NOT NULL
  AND btrim(metadata #>> '{idempotency_key}') <> ''
  AND (metadata #>> '{idempotency_key}') LIKE 'website-outbound-crm:%';
