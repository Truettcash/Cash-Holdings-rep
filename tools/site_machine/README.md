# Jarvis Main — Cash Site Machine

This package is the persistent local execution node for Cash Site OS.

It converges multiple demand sources onto one shared website build stack:

- outbound site machine
- site generator
- direct site edits
- revisions
- maintenance

Those sources can create different SiteIntent inputs, but after normalization they share the same WebsiteBuild, pattern intelligence, creative direction, implementation strategy, agents, assets, QA, preview, and release gates.

## Local capabilities

Jarvis Main is intended to expose capabilities that are awkward or impossible in the cloud:

- Framer Desktop
- Framer External Agent
- Claude Code or Codex
- Git / GitHub
- local files
- Rive CLI
- browser QA
- local render/capture
- asset processing

## Framer bridge

Use Framer's native External Agent setup:

    npx -y @framer/agent setup

Then open Claude Code or Codex inside the Site Machine workspace and run:

    /framer

Authorize every Framer project this node should control once through the browser.

External-agent changes should remain on Framer branches for review before production publishing.

## Install on Jarvis Main

From PowerShell:

    cd tools\site_machine
    .\install-jarvis-main.ps1

Required environment:

- SUPABASE_URL
- SUPABASE_SECRET_KEY (preferred) or SUPABASE_SERVICE_ROLE_KEY

Optional environment:

- SITE_MACHINE_NODE_ID=jarvis-main
- SITE_MACHINE_WORKSPACE=C:\Users\<you>\CashSiteMachine
- SITE_MACHINE_AGENT_CMD=claude -p
- SITE_MACHINE_POLL_SECONDS=15
- SITE_MACHINE_HEARTBEAT_SECONDS=30
- SITE_MACHINE_MAX_CONCURRENCY=1

## Runtime behavior

The daemon:

1. detects and heartbeats its capabilities
2. claims only tasks whose required capabilities it satisfies
3. writes one bounded task prompt
4. invokes the configured local AI harness
5. uses Framer External Agent, GitHub, Rive, files, or browser tooling as needed
6. returns structured evidence
7. marks the shared SiteBuild task complete or retryable-failed
8. unlocks the next dependency in Cash Site OS

The local PC is an execution node. Supabase remains the canonical state and orchestration plane.


## Multi-site recursive factory

The installed workspace now contains a durable `site-factory/` intelligence layer.

It is designed to:
- register and inspect many current sites
- build new sites from prompts
- extract reusable patterns from existing sites
- store pattern context, anti-contexts, variants, and evidence
- generate multiple candidate variants when uncertainty is material
- learn from QA, revisions, and outcomes
- promote proven patterns
- propose eligible cross-site improvements without blindly making every site identical

The workspace contract lives at:

    C:\Users\<you>\CashSiteMachine\AGENTS.md
    C:\Users\<you>\CashSiteMachine\site-factory\SYSTEM.md

The factory is intentionally platform-aware. Framer External Agents can inspect and modify authorized projects, but some project-container settings are not exposed. New Framer sites should therefore begin from a blank/template project container when necessary, then the Site Machine can generate the editable site inside it.

Production publishing remains human-gated.


## V2 closed-loop commands

After reinstalling the package:

    cash-site-machine factory-status

Create a new site intent/build:

    cash-site-machine new-site --name "Acme HVAC" --prompt "Build a premium commercial HVAC lead-gen site" --platform framer --industry "commercial HVAC"

Attach an existing Framer project container at creation time:

    cash-site-machine new-site --name "Acme HVAC" --prompt "..." --platform framer --project-url "https://framer.com/projects/..."

Responsive browser QA:

    cash-site-machine qa-url --url "https://preview.example.com" --name "acme-hvac"

Record outcome evidence:

    cash-site-machine record-outcome --site-key acme-hvac --signal human_approved --pattern hero-industrial-proof-v3

Run the recursive pattern cycle:

    cash-site-machine pattern-cycle

Review eligible cross-site applications:

    cash-site-machine propagation-candidates --pattern-id hero-industrial-proof-v3

### Automatic project containers

Set `SITE_MACHINE_CONTAINER_CMD` to a trusted local provisioner that:
1. accepts one JSON request on stdin,
2. creates or clones the provider project,
3. returns JSON containing at least `projectUrl`.

Until a provider is configured, Framer builds without a project URL remain safely `waiting_for_container`; the machine does not fabricate project creation.
