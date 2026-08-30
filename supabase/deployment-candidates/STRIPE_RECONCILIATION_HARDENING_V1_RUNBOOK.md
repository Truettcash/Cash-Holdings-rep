# Stripe Reconciliation Hardening V1 — Deployment Runbook

## Status

**Prepared only. Not authorized for production execution.**

Deployment candidate:

`supabase/deployment-candidates/stripe_reconciliation_hardening_v1.sql`

Source of truth:

`supabase/schema/athrty_process_stripe_event_v1.sql`

Regression contracts:

- `supabase/tests/athrty_stripe_conflict_target_contract.sql`
- `supabase/tests/athrty_stripe_payment_intent_contract.sql`
- `supabase/tests/athrty_stripe_refund_contract.sql`

## Change set

The candidate combines three already-reviewed source hardening passes:

1. Correct partial unique-index conflict inference for Stripe checkout-session and PaymentIntent identities.
2. Remove invalid/unused PaymentIntent epoch-to-timestamptz assignments.
3. Make refund/dispute reconciliation cumulative-safe and derive order refund status from persisted payment totals.

No pricing, checkout offer, webhook signature verification, event allowlist, schema, index, credential, provider configuration, or outreach behavior is part of this deployment candidate.

## Authority boundary

Do not apply this candidate until the operator explicitly authorizes a production migration.

Do not treat approval to merge this runbook as approval to:

- execute the SQL against production,
- replay any existing failed Stripe event,
- invoke the Stripe webhook,
- create a checkout session,
- issue a refund,
- create or alter an order/payment row,
- rotate secrets.

## Preflight — read only

Run immediately before any approved deployment.

### 1. Capture the live rollback definition

Save the exact output as a release artifact before changing the function:

```sql
select pg_get_functiondef('public.process_stripe_event(jsonb)'::regprocedure);
```

A deployment must not proceed unless the pre-deploy function definition has been captured and is available for rollback.

### 2. Confirm expected partial unique indexes

```sql
select indexname, indexdef
from pg_indexes
where schemaname='public'
  and tablename='payments'
  and indexname in (
    'payments_stripe_checkout_session_uidx',
    'payments_stripe_payment_intent_uidx'
  )
order by indexname;
```

Expected contract:

- both are `CREATE UNIQUE INDEX` objects,
- checkout index targets `stripe_checkout_session_id` with `WHERE ... IS NOT NULL`,
- PaymentIntent index targets `stripe_payment_intent_id` with `WHERE ... IS NOT NULL`.

### 3. Capture current commerce/event cardinality

```sql
select
  (select count(*) from public.commerce_orders) as commerce_orders,
  (select count(*) from public.payments) as payments,
  (select count(*) from public.stripe_events) as stripe_events,
  (select count(*) from public.stripe_events where processing_status='failed') as failed_events,
  (select count(*) from public.stripe_events where event_type='charge.refunded') as refund_events,
  (select count(*) from public.stripe_events where event_type='charge.dispute.created') as dispute_events;
```

Do not assume the zero-state observed during source hardening is still true at deployment time.

### 4. Identify failed events without replaying them

```sql
select stripe_event_id, event_type, processing_status, processing_attempts, received_at, processed_at
from public.stripe_events
where processing_status='failed'
order by received_at;
```

**Read only. Do not replay failed events as part of the function deployment.** Any replay requires a separate review because event payloads can mutate financial state.

## Recommended validation order

Before production application, prefer this sequence:

1. validate the candidate in a disposable/non-production Supabase database,
2. run all three regression contracts,
3. inspect function definition and catalog objects,
4. only then request production-apply approval.

A disposable branch/database is especially useful because the regression files introspect the installed function rather than only static source text.

## Production apply — requires separate explicit approval

When approved, apply the exact candidate as one named migration. Do not hand-edit it in the SQL editor during deployment.

Suggested migration name:

`athrty_stripe_reconciliation_hardening_v1`

The migration changes one function definition only.

## Postflight — read only

### 1. Verify conflict-target contract

The installed function must include:

```sql
ON CONFLICT (stripe_checkout_session_id) WHERE stripe_checkout_session_id IS NOT NULL
```

and:

```sql
ON CONFLICT (stripe_payment_intent_id) WHERE stripe_payment_intent_id IS NOT NULL
```

It must not contain either invalid `ON CONFLICT ON CONSTRAINT payments_stripe_*_uidx` pattern.

### 2. Verify PaymentIntent coercion removal

The installed function must not declare or assign `v_succeeded_at` or `v_failed_at`.

### 3. Verify refund semantics

The installed function must:

- reconcile cumulative `amount_refunded` with `GREATEST(existing, provider_total)`,
- not add the cumulative provider value to the existing value,
- derive `commerce_orders.status` from aggregate payment/refund totals,
- scope charge mutation to the matching PaymentIntent when available.

### 4. Run regression contracts in non-production

Run:

- `athrty_stripe_conflict_target_contract.sql`
- `athrty_stripe_payment_intent_contract.sql`
- `athrty_stripe_refund_contract.sql`

For production, prefer catalog/function-definition verification rather than synthetic financial-event mutation unless a separately approved test strategy exists.

### 5. Recheck event ledger health

```sql
select event_type, processing_status, count(*)
from public.stripe_events
group by event_type, processing_status
order by event_type, processing_status;
```

Deployment success does **not** imply that historical failed events have been repaired. They remain a separate reconciliation decision.

## Rollback

If postflight function-definition checks fail, or the deployment introduces an immediate reconciliation regression:

1. stop; do not replay events,
2. apply the exact preflight-captured `pg_get_functiondef(...)` output as the rollback migration,
3. rerun the read-only postflight/catalog checks,
4. record the deployment and rollback SHAs/migration versions,
5. investigate in a non-production database before attempting another production deployment.

Rollback restores code only. It does not reverse financial rows already changed by events processed after deployment. Any data correction requires a separate evidence-backed reconciliation plan.

## Go / no-go gate

Production apply is **NO-GO** unless all are true:

- candidate equals the hardened source contract in Git,
- Hermes QA is green,
- pre-deploy live function definition is captured,
- expected partial unique indexes are present,
- current event/order/payment cardinality is reviewed,
- failed historical events are identified but not automatically replayed,
- non-production validation is complete or explicitly waived by the operator,
- explicit production migration approval is given.
