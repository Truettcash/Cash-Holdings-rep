# Cash Holdings Architecture

## System model

Cash Holdings is an operating system composed of domain services, shared intelligence, data infrastructure and brand-specific execution surfaces.

The intended control flow is:

`external source / operator input -> integration or intake -> normalized data -> domain workflow -> agent/system action -> commercial outcome -> telemetry -> learning layer`

GitHub should become the authoritative source for executable code and database migrations. Supabase should be treated as the production runtime, not the only copy of production logic.

## Control plane

### GitHub

Responsibilities:

- source of truth for code and migrations
- branch isolation
- pull-request review
- Hermes QA firewall
- secret/credential checks
- production-change evidence
- rollback history
- learning documentation

Production code should not originate only inside a live runtime.

### Supabase

Responsibilities:

- PostgreSQL system of record
- Edge Function runtime
- authentication / authorization
- storage and realtime where used
- integration credentials through environment secrets
- operational logs and runtime health

Production project: `ldijllskwwmyhhbzspmb`.

## Runtime domains observed

### Integrations

Examples: Microsoft 365, Google/Analytics/Ads, Instagram, eBay, Stripe and other provider connectors.

Boundary rule: provider credentials stay in runtime secrets. Git contains schemas, auth contracts and source — never secret values.

### ATHRTY commercial engine

Observed capabilities include prospect discovery, enrichment, scoring, research, outreach composition, red-team review, response intelligence, lifecycle signals, previews, checkout and commercial routing.

Target flow:

`prospect discovery -> research/enrichment -> qualification -> product match -> preview/build -> QA -> outreach -> response -> sales lifecycle -> revenue -> learning`

### Framer / preview factory

Observed capabilities include Framer publishing/probing/inspection, preview asset harvesting, preview generation, responsive/visual upgrades and preview telemetry.

Target rule: generated site work must remain reproducible from source-controlled contracts, prompts/configuration and versioned component logic wherever technically possible.

### Voice / Retell / call intelligence

Observed capabilities include phone dialing, Retell webhooks/configuration, transcription, analysis, call intelligence feed and booking workflows.

Boundary rule: webhook endpoints may legitimately disable platform JWT verification, but each must implement its provider-specific signature or secret verification explicitly.

### Commerce

Observed capabilities include buyer inquiry, Stripe webhook, products/prices/orders and preview checkout.

Boundary rule: payment-provider webhooks require provider signature verification; client-facing commerce reads/writes require explicit RLS or controlled RPC/Edge Function boundaries.

### Throttle Kings / eBay

Observed capabilities include marketplace control, listing maintenance, SEO optimization and eBay operations/integrations.

### Agent / intelligence layer

Observed capabilities include agent control plane, learning cycle, Jarvis operating feed/decision command, knowledge/intelligence MCP reads and promotion/write paths.

Boundary rule: read tools and write tools must be separated. Autonomous agents should not receive unrestricted service-role mutation rights.

## M365 integration — current recovered architecture

### Source

SharePoint site -> `ATHRTY Outbound` list.

### Read / inspect

- `m365-connection-health`
- `m365-sharepoint-discovery`
- `m365-sync-sharepoint-dryrun`

### Write path

`m365-sync-sharepoint` -> service-role Supabase client -> `sync_m365_sharepoint_athrty_outbound_v1(...)` -> integration source records + organizations + contacts + engagements.

### Identity / idempotency

The writer anchors source records using the integration connection plus SharePoint resource/site/list/item identity. Brand routing is deterministic for Truett Cash / Authority Systems aliases.

## Repository target layout

The current recovery folder should remain immutable evidence. New recovered/maintained production source should converge toward a structure similar to:

```text
.github/
  workflows/
docs/
  architecture/
  audits/
supabase/
  functions/
    integrations/
    athrty/
    framer/
    voice/
    commerce/
    throttle-kings/
    intelligence/
  migrations/
  contracts/
recovery/
  snapshots/
```

Exact layout may change after full source extraction; the principle is domain separation plus a clear difference between active maintained source and immutable recovery evidence.

## Production-change contract

Every production-changing task should produce:

1. objective and bounded scope;
2. current-production evidence;
3. branch with minimal diff;
4. automated validation;
5. risk classification;
6. rollback method;
7. human approval for sensitive surfaces;
8. deployment verification;
9. outcome/learning capture.

## Non-negotiable boundaries

- no secrets committed to Git
- no direct autonomous merge to `main`
- no service-role use without an explicit authorization boundary
- no unauthenticated write endpoint without a verifiable provider/internal signature
- no production refactor during source-recovery work
- no security-advisor remediation by blanket rule; preserve intentionally public APIs while removing accidental privilege exposure
