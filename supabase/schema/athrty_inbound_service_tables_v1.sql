-- ATHRTY inbound/customer-service current-state recovery snapshot.
-- Recovery only. Do not apply directly to production without dependency review.
-- Depends on previously recovered: engagements, contacts, prospect_preview_sites.

CREATE TABLE IF NOT EXISTS public.athrty_signal_sessions (
  session_id text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  last_event text,
  constraint_key text,
  failure_mode text,
  frequency text,
  result_type text,
  result_headline text,
  fix_intent boolean NOT NULL DEFAULT false,
  contact_method text,
  contact_value text,
  campaign_name text,
  page_url text,
  referrer text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  gclid text,
  fbclid text,
  engagement_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT athrty_signal_sessions_pkey PRIMARY KEY (session_id),
  CONSTRAINT athrty_signal_sessions_engagement_id_fkey FOREIGN KEY (engagement_id) REFERENCES public.engagements(id) ON DELETE SET NULL,
  CONSTRAINT athrty_signal_constraint_check CHECK (constraint_key IS NULL OR constraint_key = ANY (ARRAY['sales_followup'::text,'estimates_paperwork'::text,'scheduling'::text,'customer_communication'::text,'team_handoffs'::text,'data_reporting'::text,'other'::text])),
  CONSTRAINT athrty_signal_contact_method_check CHECK (contact_method IS NULL OR contact_method = ANY (ARRAY['email'::text,'phone'::text])),
  CONSTRAINT athrty_signal_failure_mode_check CHECK (failure_mode IS NULL OR failure_mode = ANY (ARRAY['missed'::text,'chasing'::text,'duplicate_entry'::text,'delay'::text,'no_visibility'::text,'person_dependency'::text])),
  CONSTRAINT athrty_signal_frequency_check CHECK (frequency IS NULL OR frequency = ANY (ARRAY['daily'::text,'weekly'::text,'sometimes'::text]))
);

CREATE TABLE IF NOT EXISTS public.athrty_signal_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  session_id text NOT NULL,
  event_type text NOT NULL,
  constraint_key text,
  failure_mode text,
  frequency text,
  result_type text,
  fix_intent boolean,
  contact_method text,
  campaign_name text,
  page_url text,
  referrer text,
  tracking jsonb NOT NULL DEFAULT '{}'::jsonb,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT athrty_signal_events_pkey PRIMARY KEY (id),
  CONSTRAINT athrty_signal_events_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.athrty_signal_sessions(session_id) ON DELETE CASCADE,
  CONSTRAINT athrty_signal_event_type_check CHECK (event_type = ANY (ARRAY['page_view'::text,'cta_click'::text,'form_start'::text,'form_submit'::text,'phone_click'::text,'email_click'::text,'booking_click'::text,'checkout_click'::text,'signal_started'::text,'constraint_selected'::text,'failure_mode_selected'::text,'frequency_selected'::text,'result_viewed'::text,'fix_intent'::text,'contact_submitted'::text]))
);

CREATE TABLE IF NOT EXISTS public.athrty_customer_service_cases (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL,
  organization_id uuid,
  contact_id uuid,
  preview_site_id uuid,
  source text NOT NULL DEFAULT 'email'::text,
  source_message_id text,
  case_type text NOT NULL,
  status text NOT NULL DEFAULT 'new'::text,
  priority integer NOT NULL DEFAULT 50,
  subject text,
  request_text text NOT NULL,
  normalized_request jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_of_truth jsonb NOT NULL DEFAULT '{}'::jsonb,
  proposed_actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  execution_result jsonb NOT NULL DEFAULT '{}'::jsonb,
  requires_human_approval boolean NOT NULL DEFAULT true,
  customer_reply_draft text,
  idempotency_key text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  resolved_at timestamp with time zone,
  CONSTRAINT athrty_customer_service_cases_pkey PRIMARY KEY (id),
  CONSTRAINT athrty_customer_service_cases_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE SET NULL,
  CONSTRAINT athrty_customer_service_cases_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL,
  CONSTRAINT athrty_customer_service_cases_preview_site_id_fkey FOREIGN KEY (preview_site_id) REFERENCES public.prospect_preview_sites(id) ON DELETE SET NULL,
  CONSTRAINT athrty_customer_service_cases_case_type_check CHECK (case_type = ANY (ARRAY['domain_setup'::text,'site_change'::text,'question'::text,'billing'::text,'handoff'::text,'other'::text])),
  CONSTRAINT athrty_customer_service_cases_priority_check CHECK (priority >= 0 AND priority <= 100),
  CONSTRAINT athrty_customer_service_cases_status_check CHECK (status = ANY (ARRAY['new'::text,'triaged'::text,'waiting_customer'::text,'ready_to_execute'::text,'executing'::text,'qa'::text,'resolved'::text,'escalated'::text,'failed'::text]))
);

CREATE TABLE IF NOT EXISTS public.athrty_site_change_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL,
  preview_site_id uuid NOT NULL,
  requested_change jsonb NOT NULL,
  before_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  proposed_patch jsonb NOT NULL DEFAULT '{}'::jsonb,
  applied_patch jsonb NOT NULL DEFAULT '{}'::jsonb,
  qa_result jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'proposed'::text,
  deployment_id text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT athrty_site_change_requests_pkey PRIMARY KEY (id),
  CONSTRAINT athrty_site_change_requests_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.athrty_customer_service_cases(id) ON DELETE CASCADE,
  CONSTRAINT athrty_site_change_requests_preview_site_id_fkey FOREIGN KEY (preview_site_id) REFERENCES public.prospect_preview_sites(id) ON DELETE CASCADE,
  CONSTRAINT athrty_site_change_requests_status_check CHECK (status = ANY (ARRAY['proposed'::text,'approved'::text,'applied'::text,'qa_passed'::text,'qa_failed'::text,'rolled_back'::text,'rejected'::text]))
);

CREATE INDEX IF NOT EXISTS athrty_signal_sessions_created_at_idx ON public.athrty_signal_sessions (created_at DESC);
CREATE INDEX IF NOT EXISTS athrty_signal_sessions_campaign_idx ON public.athrty_signal_sessions (campaign_name, created_at DESC);
CREATE INDEX IF NOT EXISTS athrty_signal_sessions_constraint_idx ON public.athrty_signal_sessions (constraint_key, failure_mode, frequency);
CREATE INDEX IF NOT EXISTS athrty_signal_sessions_contact_idx ON public.athrty_signal_sessions (contact_method, contact_value) WHERE contact_value IS NOT NULL;
CREATE INDEX IF NOT EXISTS athrty_signal_events_session_idx ON public.athrty_signal_events (session_id, created_at);
CREATE INDEX IF NOT EXISTS athrty_signal_events_type_idx ON public.athrty_signal_events (event_type, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS athrty_customer_service_cases_idem_uq ON public.athrty_customer_service_cases (owner_user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS athrty_customer_service_cases_queue_idx ON public.athrty_customer_service_cases (owner_user_id, status, priority DESC, created_at);

ALTER TABLE public.athrty_signal_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.athrty_signal_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.athrty_customer_service_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.athrty_site_change_requests ENABLE ROW LEVEL SECURITY;

-- Production catalog observation at recovery time:
-- all four tables have RLS enabled and no pg_policies rows.
-- They are therefore intended to be accessed through trusted service/RPC/function boundaries,
-- not opened directly to authenticated clients by this recovery snapshot.
