-- ATHRTY production trigger topology snapshot.
-- Recovery-only source parity. Do not apply directly without dependency-ordered schema/RPC restoration.

-- Immutable operating evidence.
CREATE TRIGGER athrty_event_envelopes_immutable_trg
BEFORE DELETE OR UPDATE ON public.athrty_event_envelopes
FOR EACH ROW EXECUTE FUNCTION public.athrty_event_envelopes_immutable();

CREATE TRIGGER athrty_lifecycle_events_immutable
BEFORE DELETE OR UPDATE ON public.athrty_lifecycle_events
FOR EACH ROW EXECUTE FUNCTION public.athrty_block_lifecycle_event_mutation();

-- QA / release firewall.
CREATE TRIGGER athrty_sync_preview_release_gate_trg
AFTER INSERT OR UPDATE OF hard_block_count, commercial_block_count, total_score, checks, viewport_results, status
ON public.athrty_site_qa_runs
FOR EACH ROW EXECUTE FUNCTION public.athrty_sync_preview_release_gate();

CREATE TRIGGER trg_capture_athrty_site_qa_learning
AFTER INSERT ON public.athrty_site_qa_runs
FOR EACH ROW EXECUTE FUNCTION private.capture_athrty_site_qa_learning();

CREATE TRIGGER athrty_preview_release_guard_trg
BEFORE UPDATE OF status, published_at, internal_metadata
ON public.prospect_preview_sites
FOR EACH ROW EXECUTE FUNCTION public.athrty_preview_release_guard();

-- Preview normalization / learning / publication linkage.
CREATE TRIGGER athrty_sync_preview_event_identity_trg
BEFORE INSERT OR UPDATE OF render_payload, slug
ON public.prospect_preview_sites
FOR EACH ROW EXECUTE FUNCTION public.athrty_sync_preview_event_identity();

CREATE TRIGGER trg_apply_athrty_site_learning_strategy
BEFORE INSERT OR UPDATE OF render_payload, template_family, industry, internal_metadata
ON public.prospect_preview_sites
FOR EACH ROW EXECUTE FUNCTION private.apply_athrty_site_learning_strategy();

CREATE TRIGGER trg_athrty_normalize_preview_render_payload
BEFORE INSERT OR UPDATE OF render_payload
ON public.prospect_preview_sites
FOR EACH ROW EXECUTE FUNCTION public.athrty_normalize_preview_render_payload();

CREATE TRIGGER trg_link_published_preview_to_outreach
AFTER INSERT OR UPDATE OF status, preview_url, qa_score
ON public.prospect_preview_sites
FOR EACH ROW EXECUTE FUNCTION private.link_published_preview_to_outreach();

CREATE TRIGGER trg_normalize_athrty_preview_host
BEFORE INSERT OR UPDATE OF preview_url
ON public.prospect_preview_sites
FOR EACH ROW EXECUTE FUNCTION public.normalize_athrty_outreach_and_preview_contract();

CREATE TRIGGER trg_normalize_preview_site_status
BEFORE INSERT OR UPDATE OF status
ON public.prospect_preview_sites
FOR EACH ROW EXECUTE FUNCTION private.normalize_preview_site_status();

CREATE TRIGGER trg_record_preview_preflight_qa_hold
AFTER INSERT OR UPDATE OF status, qa_score, internal_metadata
ON public.prospect_preview_sites
FOR EACH ROW EXECUTE FUNCTION private.record_preview_preflight_qa_hold();

CREATE TRIGGER trg_sync_prospect_preview_slug_into_payload
BEFORE INSERT OR UPDATE OF slug, render_payload
ON public.prospect_preview_sites
FOR EACH ROW EXECUTE FUNCTION public.sync_prospect_preview_slug_into_payload();

-- Existing generic updated_at helper dependency is intentionally not recovered in this file.
CREATE TRIGGER trg_touch_prospect_preview_sites
BEFORE UPDATE ON public.prospect_preview_sites
FOR EACH ROW EXECUTE FUNCTION public.touch_prospect_preview_sites_updated_at();

-- Outreach policy / normalization / release controls.
CREATE TRIGGER prospect_outreach_policy_guard_trg
BEFORE INSERT OR UPDATE ON public.prospect_outreach_queue
FOR EACH ROW EXECUTE FUNCTION public.prospect_outreach_policy_guard();

CREATE TRIGGER trg_athrty_outreach_release_gate
BEFORE UPDATE OF state ON public.prospect_outreach_queue
FOR EACH ROW EXECUTE FUNCTION public.athrty_enforce_outreach_release_gate();

CREATE TRIGGER trg_normalize_athrty_followup_evidence_copy
BEFORE INSERT OR UPDATE OF body, metadata, evidence_claim, sequence_step
ON public.prospect_outreach_queue
FOR EACH ROW EXECUTE FUNCTION private.normalize_athrty_followup_evidence_copy();

CREATE TRIGGER trg_normalize_athrty_outreach_body
BEFORE INSERT OR UPDATE OF body
ON public.prospect_outreach_queue
FOR EACH ROW EXECUTE FUNCTION private.normalize_athrty_outreach_body();

CREATE TRIGGER trg_normalize_athrty_outreach_contract
BEFORE INSERT OR UPDATE OF body, evidence_url, metadata
ON public.prospect_outreach_queue
FOR EACH ROW EXECUTE FUNCTION public.normalize_athrty_outreach_and_preview_contract();

CREATE TRIGGER sync_prospect_outreach_experiment_trg
AFTER INSERT OR UPDATE ON public.prospect_outreach_queue
FOR EACH ROW EXECUTE FUNCTION public.sync_prospect_outreach_experiment();

CREATE TRIGGER athrty_outreach_event_to_envelope_trg
AFTER UPDATE OF sent_at, replied_at ON public.prospect_outreach_queue
FOR EACH ROW EXECUTE FUNCTION public.athrty_outreach_event_to_envelope();

-- CRM event attribution.
CREATE TRIGGER athrty_engagement_event_to_envelope_trg
AFTER INSERT ON public.engagement_events
FOR EACH ROW EXECUTE FUNCTION public.athrty_engagement_event_to_envelope();

-- Response / commercial-loop helpers.
CREATE TRIGGER trg_athrty_log_negotiation_response
AFTER INSERT OR UPDATE OF metadata ON public.prospect_response_events
FOR EACH ROW EXECUTE FUNCTION public.athrty_log_negotiation_from_response();

CREATE TRIGGER trg_athrty_offer_ladder_response
BEFORE INSERT OR UPDATE OF response_class, positive_intent, opt_out, wrong_person, not_now, snippet
ON public.prospect_response_events
FOR EACH ROW EXECUTE FUNCTION public.athrty_apply_offer_ladder_from_response();

CREATE TRIGGER trg_athrty_queue_nurture_response
AFTER INSERT OR UPDATE OF response_class, opt_out
ON public.prospect_response_events
FOR EACH ROW EXECUTE FUNCTION public.athrty_queue_nurture_from_response();
