# ATHRTY Discovery & Enrichment Recovery Manifest

Recovery pass: `athrty-discovery-v1`
Observed production project: `ldijllskwwmyhhbzspmb`
Recovery mode: source-parity only. No Supabase deploy, database mutation, provider call, outbound send, Framer publish, secret rotation, or policy change was performed by this recovery pass.

## Recovered functions

| Function | Live version | verify_jwt | Production `ezbr_sha256` | Role |
|---|---:|---|---|---|
| `prospect-intelligence-crawl` | 25 | true | `6739adb5e4ebc85d5bb3221a30971d41d2d6bee90b1ffe6a7abfd9ee617d6cb1` | first-party website crawl and evidence extraction |
| `prospect-channel-scan` | 24 | true | `a939617bc57788270511a16e86c84de9b45e7d0b789d9305d62e96dacee63d45` | public channel discovery from first-party evidence |
| `prospect-profile-enrich` | 25 | true | `9713e09d9ca1673b76cf12a92e56470080d171e90d04dbf6d84b311005fb5bc5` | contact, channel, evidence, and market-signal consolidation |
| `prospect-brand-dossier` | 24 | true | `ab190421bd595688b96c0c70efa93f25b35efcd75b1367c6b93c32039d2d9adf` | evidence-constrained semantic business dossier |
| `prospect-discover-google` | 27 | true | `51bd597d6ba0a07e085b9f089155f289353c6dd8fc0a43d19b30830ec15f9da7` | Google Places prospect discovery with cost cap |

The production hash is Supabase deployment metadata and is recorded as deployment identity evidence. It is not assumed to equal the Git blob SHA or a local source-file SHA-256.

## Recovered discovery path

```text
Google Places candidate discovery
  -> first-party website crawl
  -> public website evidence + contact extraction
  -> public channel discovery
  -> evidence/contact/channel enrichment
  -> evidence-constrained semantic dossier
  -> score / account intelligence / outbound spine
```

## Safety and evidence boundaries preserved

- all five production functions require verified JWT invocation at the Supabase platform boundary
- user-facing paths validate the authenticated user before service-role-backed database access
- Google Places discovery supports a bounded internal service-role path that requires an explicit owner UUID
- Google Places usage is constrained by a tracked monthly soft cap from research policy
- candidates without a website are skipped from the normal website-led research path
- the website crawler limits page count, response size, and fetch timeout
- public contacts are derived from published business sources; generic inboxes are scored below named decision-makers
- channel scan records presence only unless stronger provider-backed metrics exist
- semantic dossier instructions explicitly prohibit inventing revenue, employee count, traffic, software, owners, problems, or decision-makers
- semantic evidence claims and named people are validated against fetched page text before promotion
- enrichment can make existing outreach drafts less sendable by forcing reevaluation after new evidence

## Source-control convergence state after this pass

Once merged, the primary discovery dependencies named by `ATHRTY_OUTBOUND_RECOVERY_MANIFEST.md` are represented in Git alongside the previously recovered critical outbound spine.

This still does **not** mean all production dependencies are recovered. Remaining convergence work includes, among other surfaces:

- paid provider ingest/enrichment adapters and runners
- outbound discovery triggers / seed runners / batch intake
- preview asset harvesting and checkout handlers
- design-learning and release-gate database RPC definitions
- watch-cycle / nurture automation
- event, lifecycle, attribution, and commerce database contracts
- canonical database migrations / RLS / grants required to rebuild production

## Recovery rule

Do not refactor, deploy, change research thresholds, increase provider spend, enable automated sends, or alter database/auth policy as part of this recovery commit. Runtime hardening and optimization belong in separate reviewed changes after source-control coverage and schema parity are established.
