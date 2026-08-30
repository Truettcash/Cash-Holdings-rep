-- ATHRTY critical production index snapshot.
-- Recovery-only source parity.

CREATE UNIQUE INDEX IF NOT EXISTS brands_key_unique_idx ON public.brands USING btree (key);
CREATE INDEX IF NOT EXISTS idx_brands_key ON public.brands USING btree (key);
CREATE INDEX IF NOT EXISTS idx_brands_owner_user_id ON public.brands USING btree (owner_user_id);
CREATE INDEX IF NOT EXISTS organizations_name_lookup_idx ON public.organizations USING btree (lower(name));
CREATE INDEX IF NOT EXISTS contacts_email_lookup_idx ON public.contacts USING btree (lower(email)) WHERE email IS NOT NULL;

CREATE INDEX IF NOT EXISTS engagements_brand_key ON public.engagements USING btree (brand_key);
CREATE INDEX IF NOT EXISTS engagements_created_at_desc ON public.engagements USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS engagements_lower_email ON public.engagements USING btree (lower(email));
CREATE INDEX IF NOT EXISTS engagements_pipeline_stage ON public.engagements USING btree (pipeline_stage);
CREATE INDEX IF NOT EXISTS engagements_status ON public.engagements USING btree (status);
CREATE INDEX IF NOT EXISTS engagements_submission_type ON public.engagements USING btree (submission_type);
CREATE INDEX IF NOT EXISTS engagements_qualification_score_desc ON public.engagements USING btree (qualification_score DESC);
CREATE INDEX IF NOT EXISTS engagements_metadata_gin ON public.engagements USING gin (metadata);
CREATE INDEX IF NOT EXISTS engagements_operational_brief_json_gin ON public.engagements USING gin (operational_brief_json);
CREATE INDEX IF NOT EXISTS engagements_qualification_details_gin ON public.engagements USING gin (qualification_details);
CREATE INDEX IF NOT EXISTS engagements_raw_submission_gin ON public.engagements USING gin (raw_submission);
CREATE INDEX IF NOT EXISTS idx_engagements_booking_confirmed_true ON public.engagements USING btree (created_at) WHERE booking_confirmed = true;

CREATE INDEX IF NOT EXISTS engagement_events_actor_lookup_idx ON public.engagement_events USING btree (engagement_id, event_type, actor_id);
CREATE INDEX IF NOT EXISTS engagement_events_created_at_desc ON public.engagement_events USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS engagement_events_engagement_id ON public.engagement_events USING btree (engagement_id);
CREATE INDEX IF NOT EXISTS engagement_events_event_type ON public.engagement_events USING btree (event_type);
CREATE INDEX IF NOT EXISTS engagement_events_to_status ON public.engagement_events USING btree (to_status);

CREATE INDEX IF NOT EXISTS prospect_profiles_fit_idx ON public.prospect_profiles USING btree (owner_user_id, best_fit, outreach_status, overall_score DESC);
CREATE INDEX IF NOT EXISTS prospect_profiles_google_place_idx ON public.prospect_profiles USING btree (owner_user_id, google_place_id) WHERE google_place_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS prospect_profiles_org_idx ON public.prospect_profiles USING btree (organization_id);
CREATE INDEX IF NOT EXISTS prospect_profiles_owner_score_idx ON public.prospect_profiles USING btree (owner_user_id, overall_score DESC, updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS prospect_profiles_owner_user_id_canonical_domain_key ON public.prospect_profiles USING btree (owner_user_id, canonical_domain);
CREATE INDEX IF NOT EXISTS prospect_profiles_readiness_idx ON public.prospect_profiles USING btree (owner_user_id, outreach_eligibility, commercial_priority_score DESC, outreach_readiness_score DESC);

CREATE UNIQUE INDEX IF NOT EXISTS prospect_account_models_prospect_profile_id_key ON public.prospect_account_models USING btree (prospect_profile_id);
CREATE INDEX IF NOT EXISTS prospect_account_models_decision_idx ON public.prospect_account_models USING btree (owner_user_id, decision_state, why_now_score DESC);
CREATE UNIQUE INDEX IF NOT EXISTS prospect_outreach_policies_owner_user_id_brand_key_key ON public.prospect_outreach_policies USING btree (owner_user_id, brand_key);

CREATE UNIQUE INDEX IF NOT EXISTS prospect_outreach_idempotency_uniq ON public.prospect_outreach_queue USING btree (owner_user_id, idempotency_key);
CREATE INDEX IF NOT EXISTS prospect_outreach_policy_idx ON public.prospect_outreach_queue USING btree (owner_user_id, policy_passed, state, created_at DESC);
CREATE INDEX IF NOT EXISTS prospect_outreach_profile_idx ON public.prospect_outreach_queue USING btree (prospect_profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS prospect_outreach_queue_contact_idx ON public.prospect_outreach_queue USING btree (contact_candidate_id);
CREATE INDEX IF NOT EXISTS prospect_outreach_queue_engagement_idx ON public.prospect_outreach_queue USING btree (engagement_id);
CREATE INDEX IF NOT EXISTS prospect_outreach_ready_idx ON public.prospect_outreach_queue USING btree (owner_user_id, state, send_after, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS uq_prospect_outreach_active_touch ON public.prospect_outreach_queue USING btree (owner_user_id, prospect_profile_id, brand_key, sequence_key, sequence_step) WHERE state = ANY (ARRAY['sending'::text, 'sent'::text]);

CREATE INDEX IF NOT EXISTS prospect_response_events_contact_idx ON public.prospect_response_events USING btree (contact_candidate_id);
CREATE UNIQUE INDEX IF NOT EXISTS prospect_response_events_owner_user_id_provider_provider_me_key ON public.prospect_response_events USING btree (owner_user_id, provider, provider_message_id);
CREATE INDEX IF NOT EXISTS prospect_response_events_profile_fk_idx ON public.prospect_response_events USING btree (prospect_profile_id);
CREATE INDEX IF NOT EXISTS prospect_response_events_queue_idx ON public.prospect_response_events USING btree (outreach_queue_id);
CREATE INDEX IF NOT EXISTS prospect_response_profile_idx ON public.prospect_response_events USING btree (owner_user_id, prospect_profile_id, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_prospect_preview_sites_org ON public.prospect_preview_sites USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_prospect_preview_sites_profile ON public.prospect_preview_sites USING btree (prospect_profile_id);
CREATE INDEX IF NOT EXISTS idx_prospect_preview_sites_status ON public.prospect_preview_sites USING btree (status);
CREATE UNIQUE INDEX IF NOT EXISTS prospect_preview_sites_slug_key ON public.prospect_preview_sites USING btree (slug);

CREATE INDEX IF NOT EXISTS athrty_site_qa_runs_preview_created_idx ON public.athrty_site_qa_runs USING btree (preview_site_id, created_at DESC);
CREATE INDEX IF NOT EXISTS athrty_design_critiques_preview_idx ON public.athrty_design_critiques USING btree (preview_site_id, created_at DESC);
CREATE INDEX IF NOT EXISTS athrty_design_critiques_qa_run_idx ON public.athrty_design_critiques USING btree (qa_run_id);
CREATE UNIQUE INDEX IF NOT EXISTS athrty_design_skills_owner_user_id_skill_key_key ON public.athrty_design_skills USING btree (owner_user_id, skill_key);
CREATE INDEX IF NOT EXISTS athrty_design_skills_rank_idx ON public.athrty_design_skills USING btree (owner_user_id, domain, confidence DESC, sample_size DESC);

CREATE INDEX IF NOT EXISTS athrty_site_learning_events_org_idx ON public.athrty_site_learning_events USING btree (organization_id);
CREATE INDEX IF NOT EXISTS athrty_site_learning_events_pattern_idx ON public.athrty_site_learning_events USING btree (owner_user_id, industry, template_family, event_type, observed_at DESC);
CREATE INDEX IF NOT EXISTS athrty_site_learning_events_preview_idx ON public.athrty_site_learning_events USING btree (preview_site_id);
CREATE INDEX IF NOT EXISTS athrty_site_learning_events_profile_idx ON public.athrty_site_learning_events USING btree (prospect_profile_id);
CREATE UNIQUE INDEX IF NOT EXISTS athrty_site_learning_events_source_uidx ON public.athrty_site_learning_events USING btree (source_table, source_row_id, event_type) WHERE source_row_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS athrty_site_learning_patterns_owner_user_id_scope_key_signa_key ON public.athrty_site_learning_patterns USING btree (owner_user_id, scope_key, signal_key);
CREATE INDEX IF NOT EXISTS athrty_site_learning_patterns_rank_idx ON public.athrty_site_learning_patterns USING btree (owner_user_id, industry, confidence DESC, sample_size DESC);

CREATE INDEX IF NOT EXISTS athrty_event_envelopes_attribution_gin ON public.athrty_event_envelopes USING gin (attribution);
CREATE INDEX IF NOT EXISTS athrty_event_envelopes_engagement_time_idx ON public.athrty_event_envelopes USING btree (engagement_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS athrty_event_envelopes_event_time_idx ON public.athrty_event_envelopes USING btree (event_name, occurred_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS athrty_event_envelopes_idempotency_key_key ON public.athrty_event_envelopes USING btree (idempotency_key);
CREATE INDEX IF NOT EXISTS athrty_event_envelopes_org_time_idx ON public.athrty_event_envelopes USING btree (organization_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS athrty_event_envelopes_preview_time_idx ON public.athrty_event_envelopes USING btree (preview_site_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS athrty_lifecycle_events_entity_idx ON public.athrty_lifecycle_events USING btree (entity_type, entity_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS athrty_lifecycle_events_idempotency_key_key ON public.athrty_lifecycle_events USING btree (idempotency_key);
CREATE INDEX IF NOT EXISTS athrty_lifecycle_events_source_event_idx ON public.athrty_lifecycle_events USING btree (source_event_id) WHERE source_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS athrty_transition_policies_lookup_idx ON public.athrty_transition_policies USING btree (entity_type, from_state, to_state, trigger_key) WHERE is_active = true;
CREATE UNIQUE INDEX IF NOT EXISTS athrty_transition_policies_policy_version_entity_type_from__key ON public.athrty_transition_policies USING btree (policy_version, entity_type, from_state, to_state, trigger_key);
