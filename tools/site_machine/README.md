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
