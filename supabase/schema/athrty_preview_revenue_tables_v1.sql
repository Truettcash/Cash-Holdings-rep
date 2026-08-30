-- ATHRTY preview / revenue current-state table snapshot.
-- Recovery-only; no DDL was applied by this pass.

CREATE TABLE IF NOT EXISTS public.buyer_inquiries (
  id uuid NOT NULL DEFAULT gen_random_uuid(), organization_id uuid, contact_id uuid, engagement_id uuid,
  first_name text, last_name text, company_name text, email text NOT NULL, phone text, message text,
  purchase_timeline text, quantity_total integer, status text NOT NULL DEFAULT 'new'::text,
  source_system text NOT NULL, source_type text NOT NULL DEFAULT 'buyer_inquiry'::text, source_url text, referrer text,
  utm_source text, utm_medium text, utm_campaign text, utm_content text, utm_term text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(), buyer_name text, business_name text, website text,
  CONSTRAINT buyer_inquiries_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL,
  CONSTRAINT buyer_inquiries_engagement_id_fkey FOREIGN KEY (engagement_id) REFERENCES public.engagements(id) ON DELETE SET NULL,
  CONSTRAINT buyer_inquiries_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE SET NULL,
  CONSTRAINT buyer_inquiries_pkey PRIMARY KEY (id),
  CONSTRAINT buyer_inquiries_quantity_total_check CHECK (quantity_total IS NULL OR quantity_total > 0),
  CONSTRAINT buyer_inquiries_status_check CHECK (status = ANY (ARRAY['new'::text,'reviewing'::text,'qualified'::text,'quoted'::text,'closed_won'::text,'closed_lost'::text]))
);

CREATE TABLE IF NOT EXISTS public.commerce_orders (
  id uuid NOT NULL DEFAULT gen_random_uuid(), brand_key text NOT NULL, organization_id uuid, contact_id uuid,
  engagement_id uuid, buyer_inquiry_id uuid, status text NOT NULL DEFAULT 'draft'::text, currency text NOT NULL DEFAULT 'usd'::text,
  subtotal_amount bigint, discount_amount bigint, tax_amount bigint, total_amount bigint, stripe_customer_id text,
  stripe_checkout_session_id text, stripe_payment_intent_id text, source_system text, metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(), updated_at timestamp with time zone NOT NULL DEFAULT now(),
  paid_at timestamp with time zone, fulfilled_at timestamp with time zone,
  CONSTRAINT commerce_orders_buyer_inquiry_id_fkey FOREIGN KEY (buyer_inquiry_id) REFERENCES public.buyer_inquiries(id) ON DELETE SET NULL,
  CONSTRAINT commerce_orders_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL,
  CONSTRAINT commerce_orders_engagement_id_fkey FOREIGN KEY (engagement_id) REFERENCES public.engagements(id) ON DELETE SET NULL,
  CONSTRAINT commerce_orders_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE SET NULL,
  CONSTRAINT commerce_orders_pkey PRIMARY KEY (id),
  CONSTRAINT commerce_orders_status_check CHECK (status = ANY (ARRAY['draft'::text,'checkout_created'::text,'payment_pending'::text,'paid'::text,'fulfilled'::text,'cancelled'::text,'refunded'::text,'partially_refunded'::text,'disputed'::text]))
);

CREATE TABLE IF NOT EXISTS public.payments (
  id uuid NOT NULL DEFAULT gen_random_uuid(), order_id uuid, organization_id uuid, contact_id uuid,
  provider text NOT NULL DEFAULT 'stripe'::text, provider_customer_id text, provider_payment_id text,
  stripe_payment_intent_id text, stripe_charge_id text, stripe_checkout_session_id text,
  amount bigint NOT NULL, currency text NOT NULL DEFAULT 'usd'::text, status text NOT NULL,
  payment_method_type text, refunded_amount bigint NOT NULL DEFAULT 0, failure_code text, failure_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(), succeeded_at timestamp with time zone, failed_at timestamp with time zone,
  CONSTRAINT payments_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL,
  CONSTRAINT payments_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.commerce_orders(id) ON DELETE SET NULL,
  CONSTRAINT payments_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE SET NULL,
  CONSTRAINT payments_pkey PRIMARY KEY (id),
  CONSTRAINT payments_status_check CHECK (status = ANY (ARRAY['pending'::text,'processing'::text,'succeeded'::text,'failed'::text,'cancelled'::text,'refunded'::text,'partially_refunded'::text,'disputed'::text]))
);

CREATE TABLE IF NOT EXISTS public.stripe_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(), stripe_event_id text NOT NULL, event_type text NOT NULL, stripe_object_id text,
  api_version text, livemode boolean, payload jsonb NOT NULL, processing_status text NOT NULL DEFAULT 'received'::text,
  processing_attempts integer NOT NULL DEFAULT 0, error_message text, received_at timestamp with time zone NOT NULL DEFAULT now(),
  processed_at timestamp with time zone,
  CONSTRAINT stripe_events_pkey PRIMARY KEY (id),
  CONSTRAINT stripe_events_processing_status_check CHECK (processing_status = ANY (ARRAY['received'::text,'processing'::text,'processed'::text,'failed'::text,'ignored'::text])),
  CONSTRAINT stripe_events_stripe_event_id_key UNIQUE (stripe_event_id)
);

CREATE TABLE IF NOT EXISTS public.prospect_preview_assets (
  id uuid NOT NULL DEFAULT gen_random_uuid(), preview_site_id uuid NOT NULL, asset_type text NOT NULL, source_url text,
  public_url text, source_kind text, rights_status text NOT NULL DEFAULT 'unknown'::text, alt_text text,
  sort_order integer NOT NULL DEFAULT 0, metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT prospect_preview_assets_pkey PRIMARY KEY (id),
  CONSTRAINT prospect_preview_assets_preview_site_id_fkey FOREIGN KEY (preview_site_id) REFERENCES public.prospect_preview_sites(id) ON DELETE CASCADE,
  CONSTRAINT prospect_preview_assets_rights_status_check CHECK (rights_status = ANY (ARRAY['approved'::text,'company_owned'::text,'licensed'::text,'client_supplied'::text,'unknown'::text,'blocked'::text]))
);

CREATE TABLE IF NOT EXISTS public.prospect_preview_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(), preview_site_id uuid NOT NULL, organization_id uuid, event_type text NOT NULL,
  session_id text, visitor_hash text, metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT prospect_preview_events_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE SET NULL,
  CONSTRAINT prospect_preview_events_pkey PRIMARY KEY (id),
  CONSTRAINT prospect_preview_events_preview_site_id_fkey FOREIGN KEY (preview_site_id) REFERENCES public.prospect_preview_sites(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.athrty_contractor_lead_submissions (
  id uuid NOT NULL DEFAULT gen_random_uuid(), preview_site_id uuid NOT NULL, prospect_profile_id uuid, organization_id uuid,
  job_type text, customer_name text, email text, phone text, address_or_zip text, job_description text,
  desired_timeframe text, preferred_contact_method text, budget_range text,
  photo_urls jsonb NOT NULL DEFAULT '[]'::jsonb, attribution jsonb NOT NULL DEFAULT '{}'::jsonb,
  submission_mode text NOT NULL DEFAULT 'preview_demo'::text, status text NOT NULL DEFAULT 'new'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(), updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT athrty_contractor_lead_submissions_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE SET NULL,
  CONSTRAINT athrty_contractor_lead_submissions_pkey PRIMARY KEY (id),
  CONSTRAINT athrty_contractor_lead_submissions_preview_site_id_fkey FOREIGN KEY (preview_site_id) REFERENCES public.prospect_preview_sites(id) ON DELETE CASCADE,
  CONSTRAINT athrty_contractor_lead_submissions_prospect_profile_id_fkey FOREIGN KEY (prospect_profile_id) REFERENCES public.prospect_profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_prospect_preview_assets_site ON public.prospect_preview_assets(preview_site_id,sort_order);
CREATE INDEX IF NOT EXISTS idx_prospect_preview_events_site_time ON public.prospect_preview_events(preview_site_id,occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_prospect_preview_events_type ON public.prospect_preview_events(event_type);
CREATE INDEX IF NOT EXISTS prospect_preview_events_org_idx ON public.prospect_preview_events(organization_id);
CREATE INDEX IF NOT EXISTS athrty_contractor_lead_submissions_org_idx ON public.athrty_contractor_lead_submissions(organization_id,created_at DESC);
CREATE INDEX IF NOT EXISTS athrty_contractor_lead_submissions_preview_idx ON public.athrty_contractor_lead_submissions(preview_site_id,created_at DESC);

CREATE INDEX IF NOT EXISTS commerce_orders_status_idx ON public.commerce_orders(status);
CREATE INDEX IF NOT EXISTS commerce_orders_organization_id_idx ON public.commerce_orders(organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS commerce_orders_stripe_checkout_session_uidx ON public.commerce_orders(stripe_checkout_session_id) WHERE stripe_checkout_session_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS commerce_orders_stripe_payment_intent_uidx ON public.commerce_orders(stripe_payment_intent_id) WHERE stripe_payment_intent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS payments_order_id_idx ON public.payments(order_id);
CREATE INDEX IF NOT EXISTS payments_status_idx ON public.payments(status);
CREATE UNIQUE INDEX IF NOT EXISTS payments_stripe_charge_uidx ON public.payments(stripe_charge_id) WHERE stripe_charge_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS payments_stripe_checkout_session_uidx ON public.payments(stripe_checkout_session_id) WHERE stripe_checkout_session_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS payments_stripe_payment_intent_uidx ON public.payments(stripe_payment_intent_id) WHERE stripe_payment_intent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS stripe_events_event_type_idx ON public.stripe_events(event_type);
CREATE INDEX IF NOT EXISTS stripe_events_processing_status_idx ON public.stripe_events(processing_status);
CREATE INDEX IF NOT EXISTS stripe_events_received_at_desc_idx ON public.stripe_events(received_at DESC);
CREATE INDEX IF NOT EXISTS stripe_events_stripe_object_id_idx ON public.stripe_events(stripe_object_id);
