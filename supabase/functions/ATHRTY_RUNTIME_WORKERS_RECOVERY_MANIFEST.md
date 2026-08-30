# ATHRTY Runtime Workers Recovery Manifest

Recovery pass: `athrty-runtime-workers-v1`
Observed production project: `ldijllskwwmyhhbzspmb`
Recovery mode: source/control-topology recovery only. No provider call, outbound send, mailbox read, preview build, deployment, DDL/DML, cron mutation, secret rotation, or runtime invocation was performed by this pass.

## Recovered functions

| Function | Live version | verify_jwt | Production deployment SHA | Recovery posture |
|---|---:|---|---|---|
| `prospect-batch-intake` | 26 | true | `b054e07c5b270d1d44545659e1560b7f293916013ac2fa1d259eae45e59ef2ad` | source parity |
| `prospect-provider-ingest` | 27 | true | `e0391c74f1b07b8cbda7eaddbb5146282d7792d32a2ab0fc15a56b1aeb9d3cd8` | source parity |
| `prospect-enrichment-runner` | 25 | true | `8b511bcc83c93a5f37c5b3dfc00bd68685d34656da19bcd4225429e2fbe92da4` | source parity |
| `prospect-discover-web` | 26 | true | `a495627a69dedc2c261893f53b95a95e76525f0fe715a88ec3cb1f617bf1f321` | source parity |
| `prospect-watch-cycle` | 24 | true | `c4ce786f448678ab9f4d13dc9a11d34299e52243a596a9b8128ae0a4a47778a1` | source parity |
| `athrty-learning-trigger` | 24 | false | `4049b8131289066f1d6191ed9a1e06842c0bc9972b0d62362634a0c2aecb5343` | runtime verifier redacted |
| `athrty-outbound-discovery-trigger` | 28 | false | `5c790da2e1819144a72e71c9e49a90a639845fbe61c41aa85f4f3f68801beafb` | runtime verifier redacted |
| `athrty-outbound-seed-runner` | 36 | false | `5c21569da8c9a8c1d60e83d15ec7e995d68ced1fe6f5d19b9523e8b6797e5b75` | runtime verifier redacted |
| `athrty-outreach-health` | 27 | false | `76490b18d6412dca589255cf2420ee5a2f5a0f3c9ede43a17eae42552a05983c` | runtime verifier redacted |
| `athrty-outbound-launch` | 26 | false | `78ceecb0eb4f2690eab698f4d93a28dffad6c342f81bcb9b82497b0f391de316` | runtime verifier redacted |

Production deployment SHAs are recorded as identity evidence. They are not assumed to equal Git blob hashes.

## Deliberate public-repository sanitization

Several scheduler-facing Edge Functions run with Supabase platform JWT verification disabled and instead validate an `x-athrty-runtime-token` against a live SHA-256 verifier embedded in production source.

The live verifier is intentionally **not** committed to this public repository. Those recovered files contain the explicit placeholder:

`__RECOVERY_REDACTED_RUNTIME_TOKEN_SHA256__`

The scheduler snapshot also replaces live owner/brand identifiers and endpoint-specific configuration with recovery placeholders/config settings.

Therefore these sanitized recovery files are **not deployable as-is**. A future deployment path must inject/rotate scheduler authentication through secret configuration rather than copying production verifier material into Git.

## Recovered worker flow

```text
batch intake / discovery trigger
  -> Google Places or OpenAI web discovery
  -> discovery candidate queue
  -> seed runner lease
  -> authenticated runtime session
  -> research pipeline
  -> enrichment / scoring / account intelligence
  -> compose + red-team + deterministic quality gate
  -> follow-up refinement
  -> human approval remains external/manual
  -> outbound launch selects only approved + due rows
  -> recipient-local prime-time window
  -> prospect-outreach send_one
  -> watch cycle re-researches dormant accounts and creates change triggers
  -> learning trigger reconciles operating outcomes
```

## Provider-spend boundaries preserved

- `prospect-enrichment-runner` enforces a monthly research budget before paid requests.
- Google Places has a tracked monthly soft-cap path.
- DataForSEO has a monthly soft-spend cap and a final request-cost budget check.
- provider ingest records observed actual cost into provider snapshot metadata.
- no provider request was executed during recovery.

## Send safety preserved

The recovered send worker:

- explicitly rejects automated review approval requests;
- selects only rows already in `approved` / `scheduled` states;
- requires `policy_passed=true` and `human_approved_at` before selection;
- holds suppressed profiles;
- holds unknown recipient time zones;
- only releases within recipient-local weekday prime-time windows;
- delegates the actual send to `prospect-outreach`, which still has the database/runtime release gates recovered in earlier passes.

## Scheduler topology observed

Active production cadence observed from `cron.job`:

- learning reconciliation: daily
- outbound seed runner: every 15 minutes
- outbound send worker: every 15 minutes, offset from seed
- preview factory: every 10 minutes
- reply ingestion: every 5 minutes
- commercial cohort capture: hourly

The recovery repository records the cadence and dispatch contracts but does not invoke `cron.schedule`.

## Concurrency control

The seed runner uses a private lease table plus `try_claim_athrty_runtime_lease` / `release_athrty_runtime_lease` so overlapping scheduler executions coalesce instead of processing the same batch concurrently. The table shape and RPCs are recovered with no runtime data.

## Remaining live-only dependencies after this pass

The following are intentionally left for the next recovery lane:

- `athrty-preview-factory-proof-once`
- `athrty-preview-asset-harvest`
- `athrty-preview-telemetry`
- `athrty-preview-checkout`
- `ATHRTY-stripe-webhook`
- `athrty-mail-alias-test` reply/customer-service worker
- `athrty-signal-intake`
- customer-service/revision tables used by mailbox-driven site changes
- preview asset tables/storage contracts
- commerce/checkout/webhook tables and payment lineage
- any remaining private dispatcher/helper dependencies referenced by those surfaces

## Recovery rule

Do not deploy these snapshots, restore redacted verifier material, enable additional sends, increase provider budgets, schedule cron jobs, mutate mail permissions, or change review gates as part of this recovery PR. Runtime hardening and deployment must be separate reviewed changes.