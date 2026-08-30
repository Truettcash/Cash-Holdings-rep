# ATHRTY Preview + Revenue Recovery Manifest

Recovery pass: `athrty-preview-revenue-v1`
Observed production project: `ldijllskwwmyhhbzspmb`
Recovery mode: source/control-substrate recovery only. No preview build, asset harvest, telemetry event, lead submission, storage upload, Stripe API request, webhook invocation, payment mutation, outbound mutation, M365 onboarding email, deployment, or DDL/DML was executed by this pass.

## Recovered functions

| Function | Live version | verify_jwt | Production deployment SHA | Role |
|---|---:|---|---|---|
| `athrty-preview-asset-harvest` | 11 | true | `1b641e41a6fd7c2689ddc1d04c651292bdd6590849abf453039248ff21b99360` | first-party image evidence harvesting |
| `athrty-preview-telemetry` | 11 | false | `c0e729077d29a997a43a67be89861b6bf1c7026fa3520dd3e08080f2ad4b93a4` | public preview interaction + lead telemetry |
| `athrty-preview-checkout` | 13 | false | `0d2859f4831791e3bbd6c9e6e5290c383be9242a89eb38402d059cb9d5e58558` | public contractor intake + Stripe Checkout creation |
| `ATHRTY-stripe-webhook` | 53 | false | `1ee5894b06e355d4554501f143c207978dc5157fe345746dd4bd81394c948abd` | signed Stripe event processing, sale reconciliation, onboarding |
| `athrty-preview-factory-proof-once` | production wrapper | false | recorded in production Edge Function inventory | scheduler-to-user-session preview/publisher wrapper |

The preview proof wrapper is recovered with its live custom runtime-token verifier replaced by `__RECOVERY_REDACTED_RUNTIME_TOKEN_SHA256__`; it is intentionally non-deployable as-is in the public repository.

## Recovered relational / storage substrate

- `buyer_inquiries`
- `commerce_orders`
- `payments`
- `stripe_events`
- `prospect_preview_assets`
- `prospect_preview_events`
- `athrty_contractor_lead_submissions`
- critical checkout/payment/event idempotency indexes
- `process_stripe_event(event jsonb)` reconciliation RPC
- public `athrty-client-assets` bucket contract: 10 MiB max; JPEG/PNG/WebP/GIF

No live object rows, uploaded assets, payment payloads, customer data, Stripe secrets, M365 secrets, webhook secrets, service-role keys, or runtime verifier material are stored in this recovery package.

## Preview asset boundary

`athrty-preview-asset-harvest`:

- requires authenticated user invocation;
- starts from the prospect's first-party website;
- rejects obvious logos/icons/favicon/sprites/avatars/payment/tracking/SVG assets;
- probes candidate images before use;
- records `source_kind=company_website` and `rights_status=company_owned`;
- caps the usable preview set;
- updates the preview render payload only after candidate probing.

This is evidence harvesting, not a license inference engine. `company_owned` is production's current operational label and should be reviewed before a broader public-content acquisition strategy.

## Public preview telemetry boundary

`athrty-preview-telemetry` is intentionally public (`verify_jwt=false`) because generated preview sites need to post browser events without a user session. Its production controls include:

- explicit event allowlist;
- preview must be `published`, `sold`, or `ready`;
- IP + User-Agent visitor hashing rather than raw IP persistence in the event row;
- 15-minute visitor rate cap;
- bounded metadata keys/lengths;
- honeypot on lead submission;
- contact + project-detail validation;
- deterministic lead scoring / follow-up SLA;
- lead routing into `engagements` + `engagement_events`, which then feeds the recovered event-attribution bridge.

## Checkout boundary

`athrty-preview-checkout` is intentionally public because prospects reach it from public previews. Before commercial checkout it requires:

- known offer ID;
- known preview ID;
- preview QA score >= 88;
- preview state `published` or `ready`;
- contractor-lead-page offer/preview match for that product lane.

The function creates a `commerce_orders` row before Stripe Checkout, passes deterministic `order_id` and preview/profile lineage through Stripe metadata, and stores the returned Checkout Session ID back on the order.

The contractor lead-page intake path is separate from payment checkout. It accepts up to five image files, enforces image MIME + per-file size checks in the function, stores accepted images in `athrty-client-assets`, and records a structured `athrty_contractor_lead_submissions` row.

## Stripe webhook / payment ledger boundary

`ATHRTY-stripe-webhook`:

- verifies the Stripe webhook signature using `STRIPE_WEBHOOK_SECRET`;
- records/processes events through `process_stripe_event` before side-effect reconciliation;
- reconciles paid preview orders to `prospect_preview_sites.status='sold'` and `prospect_profiles.outreach_status='converted'`;
- cancels active future outreach after conversion;
- sends paid-customer onboarding only after a valid paid `checkout.session.completed` event.

`process_stripe_event` provides the central payment ledger contract:

- Stripe event ID first-write ledger in `stripe_events`;
- duplicate event IDs return idempotently;
- unsupported event types are ignored explicitly;
- supported payment events require deterministic `metadata.order_id`;
- order and payment state are reconciled for checkout completion, async payment, payment intent, refund and dispute events;
- processing state is recorded as `received` / `processing` / `processed` / `failed` / `ignored`.

## Confirmed production drift: Stripe UPSERT target naming

The production `process_stripe_event` function contains:

- `ON CONFLICT ON CONSTRAINT payments_stripe_checkout_session_uidx`
- `ON CONFLICT ON CONSTRAINT payments_stripe_payment_intent_uidx`

A direct `pg_constraint` audit of `public.payments` confirms those names are **not table constraints**. They exist as standalone partial UNIQUE INDEXES in `pg_indexes`.

PostgreSQL `ON CONFLICT ON CONSTRAINT` resolves constraint names, not arbitrary standalone index names. This is therefore a real reconciliation-path defect candidate and must be tested/fixed in a separate payment-hardening PR before declaring the Stripe ledger fully rebuildable/green.

This recovery pass deliberately preserves production source and records the defect instead of silently changing payment semantics during backup/convergence work.

## Storage posture observed

Bucket `athrty-client-assets`:

- public: `true`
- max file size: `10,485,760` bytes
- allowed MIME types: `image/jpeg`, `image/png`, `image/webp`, `image/gif`

No bucket-specific `storage.objects` RLS policy rows were returned by the recovery policy query. The snapshot therefore does not invent policies. A rebuild must explicitly re-audit storage access before applying this bucket contract.

## Remaining final inbound recovery lane

Not included in this PR:

- `athrty-mail-alias-test` mailbox/reply/customer-service runtime
- `athrty-signal-intake`
- `athrty_signal_sessions`
- `athrty_signal_events`
- `athrty_customer_service_cases`
- `athrty_site_change_requests`
- mailbox-driven image attachment/revision execution path
- any adjacent customer-service/revision helper functions not yet represented in Git

## Recovery rule

Do not deploy this branch, execute checkout, process a webhook, upload an asset, send onboarding mail, change prices, change QA thresholds, change storage visibility, alter payment reconciliation, or fix the confirmed Stripe conflict-target defect inside this recovery PR. Runtime hardening belongs in a separate reviewed change with an isolated test plan and rollback.