# ATHRTY Substrate Recovery Manifest

Recovery pass: `athrty-substrate-v1`
Observed production project: `ldijllskwwmyhhbzspmb`
Recovery mode: catalog/source-parity only. No migration, DDL, DML, provider request, deploy, send, publish, secret rotation, or policy change was executed by this pass.

## Objective

Recover the database control substrate that makes the previously recovered ATHRTY Edge Function spine enforceable and rebuildable:

- release / QA firewall RPCs
- lifecycle state-machine RPCs
- event attribution envelope RPCs
- outbound release and policy guards
- preview/outreach trigger topology
- design-learning capture and strategy hooks
- current RLS posture
- migration provenance and convergence gaps

## Current production relational surface

The production catalog contains RLS-enabled ATHRTY/prospect/agent/lifecycle tables spanning CRM, acquisition, discovery, evidence, scoring, account intelligence, preview production, outreach, response intelligence, design learning, event attribution, lifecycle state, and agent learning.

The critical runtime tables inspected in this pass include:

- `organizations`
- `contacts`
- `brands`
- `deals`
- `engagements`
- `engagement_events`
- `prospect_profiles`
- `prospect_contact_candidates`
- `prospect_opportunity_theses`
- `prospect_account_models`
- `prospect_outreach_policies`
- `prospect_outreach_queue`
- `prospect_response_events`
- `prospect_preview_sites`
- `athrty_site_qa_runs`
- `athrty_design_critiques`
- `athrty_site_learning_events`
- `athrty_site_learning_patterns`
- `athrty_design_skills`
- `athrty_event_envelopes`
- `athrty_lifecycle_events`
- `athrty_lifecycle_state`
- `athrty_transition_policies`

## Enforced production control path

```text
public evidence / CRM input
  -> prospect + account intelligence
  -> preview build
  -> formal QA run
  -> release-gate evaluation
  -> preview publish guard
  -> published preview linkage
  -> outreach policy guard
  -> red-team + deterministic message gate
  -> human approval
  -> send-state release guard
  -> sent / reply events
  -> immutable event envelope
  -> lifecycle / experiment / learning updates
```

## Trigger-enforced boundaries recovered

The live database currently enforces, among other controls:

- immutable `athrty_event_envelopes`
- immutable `athrty_lifecycle_events`
- QA-run -> preview release-gate synchronization
- preview publish blocking when release gate is not `release`
- preview event-identity synchronization
- preview payload normalization
- site-learning strategy application before preview writes
- published-preview linkage into active outreach rows
- outreach normalization and evidence-copy normalization
- outreach policy calculation before queue writes
- outbound release gate before state enters `sending` / `sent`
- sent/replied outreach -> event envelope conversion
- engagement events -> event envelope conversion
- response events -> offer / nurture / negotiation logic
- QA results -> recursive design-learning capture

## RLS posture observed

Every inspected table reports row-level security enabled.

Two access patterns are present:

1. owner-scoped authenticated policies (`owner_user_id = auth.uid()` or equivalent) for user-facing prospect/design tables;
2. no authenticated policy on internal control tables such as QA, lifecycle, event envelopes, transition policy and preview runtime tables, leaving normal access to service-role / SECURITY DEFINER RPC paths.

This pass records that posture and does not broaden access.

## Portability / drift findings to resolve in a separate change

1. A legacy `athrty_preview_publish_gate` function checks `native-three-breakpoint-v1`, while the recovered Framer publisher currently emits `native-three-breakpoint-autosize-v2`. The active factory path uses `athrty_evaluate_release_gate`, so this is recorded as likely stale/legacy contract drift, not changed here.
2. Some design-learning trigger helpers are bound to a single owner UUID in production. That preserves current behavior but is not portable multi-owner infrastructure.
3. The Git repository still lacks canonical executable table DDL / migration SQL for the full production schema. This pass recovers control definitions and topology; dependency-ordered relational DDL remains the next convergence layer.
4. Several trigger functions call additional private/public helpers outside this pass. They are enumerated in the trigger topology so unresolved runtime dependencies remain explicit.

## Safety rule

Do not use this recovery pass as authorization to deploy, apply migrations, loosen RLS, change QA thresholds, change human-send requirements, alter provider spend, refactor owner scoping, or modify lifecycle policy. All runtime changes must be separate PRs with explicit validation and rollback.