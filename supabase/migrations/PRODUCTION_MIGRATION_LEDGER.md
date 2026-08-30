# Production Migration Ledger

Observed project: `ldijllskwwmyhhbzspmb`
Source: production Supabase migration ledger.

This file records migration provenance only. The Supabase connector exposes migration version/name metadata but not the original SQL bodies through `list_migrations`. Current-state schema/RPC recovery therefore remains necessary until canonical migration SQL is reconstructed in Git.

## Agent / learning / Jarvis foundation

- `20260825201143_add_agent_control_plane_and_learning_loop`
- `20260825201259_harden_learning_decision_lineage`
- `20260825201624_make_call_learning_event_driven`
- `20260825201801_fix_learning_signal_source_contract`
- `20260825201922_allow_automatic_learning_decision_source`
- `20260825202136_allow_call_intelligence_as_operating_evidence_v2`
- `20260825202206_extend_evidence_canonical_table_check_for_calls`
- `20260825202447_lock_down_agent_learning_internal_functions`
- `20260825203440_jarvis_decision_execution_bridge`

## Prospect / outbound intelligence foundation

- `20260825204815_add_prospect_intelligence_and_outreach_control_plane`
- `20260825205105_add_prospect_pipeline_sections_view`
- `20260825205154_harden_prospect_pipeline_sections_view`
- `20260825205444_enhance_curated_prospect_intelligence`
- `20260825205735_curated_outreach_quality_gate_and_crm_profile`
- `20260825210010_enforce_premium_outreach_state_guard`
- `20260825211252_add_prospect_provider_intelligence_adapter`
- `20260825212442_rebuild_prospect_stack_for_cost_efficiency_v2`
- `20260825212508_add_cost_aware_prospect_scoring_metadata`
- `20260825212535_add_prospect_score_v2_agent_definition_v2`
- `20260825212543_add_prospect_tier_constraints`
- `20260825212839_harden_outreach_gate_for_cost_aware_scoring`
- `20260825212914_set_low_cost_provider_ladder`
- `20260825212936_add_provider_config_block_state`
- `20260825213028_add_google_places_discovery_layer`
- `20260825213455_add_prospect_acquisition_management_views`
- `20260825213548_add_full_public_business_identity_to_prospect_profiles_v2`
- `20260825213603_promote_discovery_identity_into_prospect_profile`
- `20260825213628_gate_ai_dossier_by_preliminary_fit`
- `20260825214209_add_ss_plus_acquisition_intelligence`
- `20260825214303_seed_ss_plus_agents_fixed`
- `20260825214349_wire_ss_plus_experiment_lineage`
- `20260825214402_add_ss_plus_account_model_version`
- `20260825214623_enforce_ss_plus_outreach_gate`
- `20260825214800_make_acquisition_playbooks_self_learning`
- `20260825214919_add_ss_plus_response_and_attention_layer_fixed`
- `20260825215501_add_ss_plus_ui_read_models`

## ATHRTY automated runtime

- `20260826132731_activate_athrty_inbound_learning_runtime`
- `20260826132950_activate_athrty_outbound_discovery_runtime`
- `20260826133217_harden_athrty_runtime_dispatch_helpers`
- `20260826133647_activate_athrty_outbound_seed_runner`
- `20260826133803_pause_unconfigured_external_prospect_discovery`
- `20260826135315_accelerate_athrty_outbound_seed_runner`
- `20260826140446_add_athrty_outbound_backfill_dispatch`
- `20260826140616_add_athrty_outreach_health_dispatch`
- `20260826141944_normalize_athrty_outreach_signoff`
- `20260826142836_fix_prospect_outreach_idempotency_conflict`
- `20260826155618_create_athrty_signal_intake`

## Preview / customer service / revenue / lifecycle

- `20260828003645_add_athrty_preview_runtime`
- `20260828003653_harden_athrty_preview_runtime`
- `20260828114711_athrty_customer_service_control_plane`
- `20260828120111_sync_preview_slug_into_render_payload`
- `20260828140838_athrty_revenue_loop_v1`
- `20260828141005_athrty_negotiation_policy_refine_v1`
- `20260828141241_athrty_revenue_loop_v1_1`
- `20260828143429_athrty_state_machine_contract_v1`
- `20260828143650_athrty_lead_router_v1`
- `20260828145505_athrty_event_attribution_and_qa_firewall_v1`
- `20260828145759_athrty_qa_firewall_enforcement_v1_1`
- `20260828145844_athrty_preview_event_identity_payload_v1`

## Design system / promotion firewall

- `20260828195302_create_framer_pattern_variant_registry`
- `20260828195632_add_framer_pattern_assets`
- `20260828195806_add_pattern_source_urls`
- `20260828195830_add_pattern_asset_framer_refs`
- `20260828200135_reject_generic_framer_pattern_sources`
- `20260828201619_add_canonical_promotion_firewall_audit`
- `20260828203645_create_framer_pattern_decision_ledger`

## Commercial analytics / runtime convergence

- `20260829163729_extend_athrty_signal_event_types_for_attribution`
- `20260829172316_commercial_analytics_control_plane_v1`
- `20260829172811_commercial_analytics_event_sanitizer_v1_1`
- `20260829172928_allow_openai_web_search_discovery_provider`
- `20260829174021_activate_athrty_outbound_send_worker`
- `20260829175124_add_athrty_outbound_refresh_dispatch`
- `20260829180249_map_athrty_ga4_property`
- `20260829182155_add_commercial_ga4_service_rpcs`
- `20260829184147_fix_acquisition_playbook_grouping`
- `20260829185045_athrty_commercial_ladder_routing_v1`
- `20260829185113_athrty_nurture_draft_routing_v1`
- `20260829185339_enhance_athrty_offer_routing_v2`
- `20260829203314_fix_agent_runs_idempotency_conflict_contract`
- `20260829203459_normalize_outbound_and_preview_state_contracts`
- `20260829203946_repair_agent_runs_idempotency_contract`
- `20260829204609_automate_athrty_preview_factory`
- `20260829205006_normalize_followup_evidence_copy`
- `20260829205027_link_published_previews_to_outreach`
- `20260829205116_record_preview_preflight_qa_holds`
- `20260829210012_schedule_athrty_reply_ingestion`
- `20260829211706_wire_site_build_learning_loop`
- `20260829211741_site_learning_adaptive_strategy_and_client_assets`
- `20260829211948_fix_site_learning_signal_types`
- `20260829212026_allow_client_supplied_preview_assets`
- `20260829212129_enhance_recursive_site_learning_v2`
- `20260829212249_athrty_design_critique_skill_loop_v1`
- `20260829233838_harden_athrty_outreach_release_and_idempotency`
- `20260829233954_normalize_athrty_preview_render_contract`

## Latest loop / product / compliance hardening

- `20260830001350_athrty_commercial_cohort_monitor`
- `20260830001711_athrty_seed_runner_concurrency_lock`
- `20260830001817_grant_service_role_private_lease_usage`
- `20260830004802_athrty_loop_audit_hardening`
- `20260830005138_athrty_loop_function_search_path_hardening`
- `20260830005342_harden_athrty_runtime_api_surface`
- `20260830012911_normalize_outreach_text_and_framer_preview_host`
- `20260830044427_gate_preview_factory_to_qualified_prospects`
- `20260830050749_add_contractor_lead_page_product_lane`
- `20260830050832_tighten_contractor_lead_page_fit_v2`
- `20260830050847_add_athrty_commercial_product_router`
- `20260830051136_add_contractor_lead_page_submissions`
- `20260830051406_add_contractor_lead_page_preview_factory`
- `20260830051430_fix_contractor_lead_page_preview_factory_jsonb`
- `20260830081651_harden_outreach_compliance_gate`
- `20260830101557_align_outreach_eligibility_with_ss_plus_account_gates`
- `20260830125230_prevent_release_quality_preview_rebuild_churn`
- `20260830150234_commercial_analytics_measurement_health`
- `20260830150437_optimize_integration_rls_auth_initplan`

## Convergence rule

A migration name is not a backup of its SQL. Until original migration bodies are reconstructed, production recovery depends on current-state catalog/RPC snapshots. Future production schema changes should be migration-first in Git and only then applied through reviewed deployment paths.