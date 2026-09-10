# Cash Holdings Local CLI

This is the first cut of the Cash Holdings local execution plane.

## Boundary

Supabase remains the canonical state plane: Postgres, RLS, auth, durable queues, evidence, and webhook-facing state stay cloud-side. Bounded compute and operator maintenance can move to this CLI.

This first pass moves two useful classes of work off Edge Functions:

1. **Prospect scoring** — the `prospect-score-v2` routing/economics math now has a pure Python implementation. A compact service-only RPC supplies the input bundle in one request and a second RPC applies the result transactionally.
2. **Storage cleanup** — object deletion is performed through Supabase Storage API from the local machine, so legacy buckets can be cleaned without consuming another Edge Function slot or deleting `storage.objects` rows directly.

It also adds a single compact `status` RPC so operator health checks do not fan out across a dozen tables.

## Requirements

- Python 3.10+
- No pip packages are required.
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Do **not** commit the service-role key. Keep it in the local shell or an OS-level secret store.

## Database bridge

Before using `status` or local prospect scoring, deploy the reviewed SQL in:

`supabase/runtime/cash_cli_bridge_v1.sql`

The bridge RPCs are explicitly service-role-only. The SQL does not disable any existing cron or Edge Function; cutover should happen only after local parity is proven.

## Windows / PowerShell

```powershell
cd tools\cash_cli
$env:SUPABASE_URL="https://<project-ref>.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="<local-secret>"

.\cash.ps1 status
```

### Local prospect scoring

Dry-run one prospect:

```powershell
.\cash.ps1 prospects score --id <prospect-profile-uuid>
```

Dry-run a bounded batch:

```powershell
.\cash.ps1 prospects score --limit 25
```

Persist the batch only after the dry-run looks correct:

```powershell
.\cash.ps1 prospects score --limit 25 --apply
```

Default behavior is non-mutating. `--apply` is required to write scores or enqueue paid enrichment.

### Finish legacy SRC Storage cleanup locally

Inspect the migrated engine-catalog prefix first:

```powershell
.\cash.ps1 storage purge-prefix --bucket athrty-client-assets --prefix src-engine-catalog
```

Then remove it through the supported Storage API:

```powershell
.\cash.ps1 storage purge-prefix --bucket athrty-client-assets --prefix src-engine-catalog --apply
```

For the migrated LMS bucket, use the root prefix only after confirming the dry-run contains only the retired SRC objects:

```powershell
.\cash.ps1 storage purge-prefix --bucket src-lms-assets --prefix ""
.\cash.ps1 storage purge-prefix --bucket src-lms-assets --prefix "" --apply
```

## Validation

From `tools/cash_cli`:

```powershell
python -m unittest discover -s tests -v
python cash.py --help
```

## Cutover sequence

1. Review/deploy `cash_cli_bridge_v1.sql`.
2. Run scorer dry-runs against representative A/B/C/hold prospects.
3. Compare local outputs against `prospect-score-v2` without writing.
4. Run a small `--apply` batch and verify downstream account/outreach behavior.
5. Only then disable the cloud scorer path / scheduler that the local worker replaces.
6. Move the next compute-heavy stage local (dossier/enrichment orchestration), keeping public webhooks and auth-facing functions cloud-side.

The objective is not “run Supabase on the laptop.” The objective is fewer network round trips and fewer permanent Edge Functions while preserving Supabase as the governed source of truth.
