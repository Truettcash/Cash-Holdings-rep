# Cash Holdings Local CLI

Cash Holdings uses Supabase as the canonical state plane and this CLI as the first local execution plane.

## Boundary

Supabase keeps Postgres, RLS, auth, durable state, evidence, webhook-facing state, and the local-job hand-off queue. Bounded compute and operator maintenance can execute on a Windows machine through this CLI.

The current local surfaces are:

1. **Prospect scoring** — pure Python port of `prospect-score-v2` routing/economics math.
2. **Durable local worker queue** — lease/claim/retry/dead-letter semantics for `prospect_score` jobs.
3. **Worker heartbeat** — proves a local execution machine is actually alive before cloud cutover.
4. **Storage cleanup** — supported Supabase Storage API deletion for retired legacy assets.
5. **Compact status** — one RPC instead of dashboard-style fan-out across many tables.

The cloud scorer remains available until a real local worker heartbeat and a bounded applied batch are proven.

## Requirements

- Windows PowerShell 5.1+ or PowerShell 7+
- Python 3.10+
- No pip packages are required
- Cash Holdings Supabase service-role key entered **locally** during setup

Never commit or paste the service-role key into source control. `install-worker.ps1` stores it using Windows DPAPI under the current Windows user.

## Database bridge

Production database support is split into reviewed SQL units:

- `supabase/runtime/cash_cli_bridge_v1.sql` — bundled scorer read + governed score apply + status
- `supabase/runtime/cash_cli_bridge_v2.sql` — routed-policy / durable `agent_runs` parity
- `supabase/runtime/cash_local_worker_queue_v1.sql` — local queue, leases, retry/dead-letter, heartbeat

All CLI RPCs are service-role-only. No anonymous or authenticated execution is intended.

## Windows setup

From the repository:

```powershell
cd tools\cash_cli
.\install-worker.ps1 -StartNow
```

The installer:

1. prompts for the Cash Holdings service-role key as a `SecureString`;
2. encrypts it with Windows DPAPI for the current user;
3. validates the credential against Cash Holdings;
4. publishes a worker heartbeat;
5. installs a current-user Startup launcher unless `-NoStartup` is supplied;
6. optionally starts the worker immediately with `-StartNow`.

No administrator rights are required for the current-user Startup launcher.

Encrypted local configuration lives under:

```text
%LOCALAPPDATA%\CashHoldings\cash-cli\
```

The service-role key is not written there in plaintext.

## Operator commands

Runtime status:

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

Dry-run one prospect without writing:

```powershell
.\cash.ps1 prospects score --id <prospect-profile-uuid>
```

Apply one prospect score directly:

```powershell
.\cash.ps1 prospects score --id <prospect-profile-uuid> --apply
```

Queue one prospect for the local worker:

```powershell
.\cash.ps1 prospects enqueue --id <prospect-profile-uuid> --priority 80 --reason parity_probe
```

Drain a bounded queue batch immediately:

```powershell
.\cash.ps1 worker drain --limit 10
```

The background runner uses the same command every five minutes and does nothing expensive when no work is queued.

## Legacy SRC Storage cleanup

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

## Cutover gate

Do **not** remove the cloud `prospect-score-v2` call merely because the local code exists. The seed runner currently calls the cloud scorer during reevaluation.

The cutover gate is:

1. local queue schema deployed;
2. Windows worker installed and heartbeat fresh;
3. one explicitly queued prospect completes locally;
4. a small local batch completes with scorer lineage recorded;
5. score/routing/economics parity remains green;
6. only then patch the cloud producer to enqueue local score work, initially behind a fallback switch;
7. measure Supabase egress slope before moving enrichment/account-intelligence stages local.

The objective is not to run Supabase on the laptop. The objective is to make Supabase remember and govern the work while the machine does the work.
