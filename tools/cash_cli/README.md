# Cash Holdings Local CLI

Cash Holdings uses Supabase as the canonical state plane and this CLI as the first local execution plane.

## Boundary

Supabase keeps Postgres, RLS, auth, durable state, evidence, webhook-facing state, and the local-job hand-off queue. Bounded compute and operator maintenance can execute on a Windows machine through this CLI.

The current local surfaces are:

1. **Prospect scoring** — pure Python port of `prospect-score-v2` routing/economics math.
2. **Durable local worker queue** — lease/claim/retry/dead-letter semantics for `prospect_score` jobs.
3. **Worker heartbeat** — proves a local execution machine is actually alive before cloud cutover.
4. **Storage cleanup** — supported Supabase Storage API deletion for retired legacy assets; elevated auth only.
5. **Compact status** — full runtime status remains elevated-only; worker queue status is available through the worker capability gateway.

The cloud scorer remains available until a real local worker heartbeat and a bounded applied batch are proven.

## Requirements

- Windows PowerShell 5.1+ or PowerShell 7+
- Python 3.10+
- No pip packages are required
- A 256-bit Cash local worker token stored locally with Windows DPAPI
- The Cash Holdings public `sb_publishable_...` key in local non-secret config

The workstation does **not** need a project-wide Supabase `service_role` or `sb_secret_` key for normal worker operation.

## Database bridge

Production database support is split into reviewed SQL units:

- `supabase/runtime/cash_cli_bridge_v1.sql` — bundled scorer read + governed score apply + status
- `supabase/runtime/cash_cli_bridge_v2.sql` — routed-policy / durable `agent_runs` parity
- `supabase/runtime/cash_local_worker_queue_v1.sql` — local queue, leases, retry/dead-letter, heartbeat
- `supabase/runtime/cash_local_worker_token_gateway_v1.sql` — token-gated publishable-key worker wrappers

The existing `cash_cli_*` RPCs remain service-role-only. The new `cash_worker_*` wrappers are executable by `anon` only after validating the high-entropy worker token from the `x-cash-worker-token` request header. Score read/write wrappers additionally require a live queue lease owned by the calling worker id.

The worker token itself is never stored in Postgres. Only its lowercase SHA-256 hash is provisioned into `private.runtime_config` under `cash_local_worker_token_sha256` by an authorized deployment step.

## Windows setup

The local token is expected at:

```text
%LOCALAPPDATA%\CashHoldings\cash-cli\worker-token.dpapi
```

From the repository:

```powershell
cd tools\cash_cli
.\install-worker.ps1 -StartNow
```

The installer:

1. verifies the local DPAPI worker token can be decrypted by the current Windows user;
2. writes non-secret Cash Holdings URL/publishable-key/worker-id configuration;
3. validates the token-gated worker status RPC;
4. publishes a worker heartbeat;
5. installs a current-user Startup launcher unless `-NoStartup` is supplied;
6. optionally starts the worker immediately with `-StartNow`.

No administrator rights are required for the current-user Startup launcher.

Local configuration lives under:

```text
%LOCALAPPDATA%\CashHoldings\cash-cli\
```

The worker token is never written there in plaintext.

## Auth modes

Normal local worker operation uses:

```text
SUPABASE_PUBLISHABLE_KEY + CASH_WORKER_TOKEN + CASH_WORKER_ID
```

The CLI still supports explicit elevated operator mode through `SUPABASE_SECRET_KEY` or legacy `SUPABASE_SERVICE_ROLE_KEY`, but the worker installer no longer provisions those credentials.

Worker-token mode intentionally cannot perform direct table scans, Storage operations, full runtime status, or direct prospect score writes outside a leased queue job.

## Operator commands

Full runtime status (elevated auth only):

```powershell
.\cash.ps1 status
```

Worker/queue status:

```powershell
.\cash.ps1 worker status
```

Publish a manual heartbeat:

```powershell
.\cash.ps1 worker heartbeat --mode manual
```

Direct prospect scoring is elevated-only. In worker-token mode, queue the prospect instead:

```powershell
.\cash.ps1 prospects enqueue --id <prospect-profile-uuid> --priority 80 --reason parity_probe
```

Drain a bounded queue batch immediately:

```powershell
.\cash.ps1 worker drain --limit 10
```

The background runner uses the same command every five minutes and does nothing expensive when no work is queued.

## Legacy SRC Storage cleanup

Storage maintenance requires elevated auth and remains outside the worker capability token.

Dry-run the migrated engine-catalog prefix first:

```powershell
.\cash.ps1 storage purge-prefix --bucket athrty-client-assets --prefix src-engine-catalog
```

Then delete only after the dry-run is correct:

```powershell
.\cash.ps1 storage purge-prefix --bucket athrty-client-assets --prefix src-engine-catalog --apply
```

For the retired LMS bucket, inspect the root first:

```powershell
.\cash.ps1 storage purge-prefix --bucket src-lms-assets --prefix ""
```

Only then apply:

```powershell
.\cash.ps1 storage purge-prefix --bucket src-lms-assets --prefix "" --apply
```

## Validation

From `tools/cash_cli`:

```powershell
python -m unittest discover -s tests -v
python -m compileall -q .
python cash.py --help
```

Security validation should also confirm:

- `cash_cli_*` functions remain service-role-only;
- only the intended `cash_worker_*` wrappers are granted to `anon`;
- invalid or missing worker tokens fail closed;
- worker-id header/argument mismatches fail closed;
- score read/write wrappers reject profiles without a live leased job;
- Storage and direct table access remain unavailable in worker-token mode.

## Cutover gate

Do **not** remove the cloud `prospect-score-v2` call merely because the local code exists. The seed runner currently calls the cloud scorer during reevaluation.

The cutover gate is:

1. local queue schema deployed;
2. token gateway deployed and worker-token hash provisioned;
3. Windows worker installed and heartbeat fresh;
4. one explicitly queued prospect completes locally;
5. a small local batch completes with scorer lineage recorded;
6. score/routing/economics parity remains green;
7. only then patch the cloud producer to enqueue local score work, initially behind a fallback switch;
8. measure Supabase egress slope before moving enrichment/account-intelligence stages local.

The objective is not to run Supabase on the laptop. The objective is to make Supabase remember and govern the work while the machine does the work.
