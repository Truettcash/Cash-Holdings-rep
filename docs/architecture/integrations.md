# Integrations Architecture

This document describes the frontend integration socket architecture for Cash Holdings.

Core concepts:

- Brand → Channel → Integration Connection → External Account → Sync Runs → Metrics/Events
- Frontend receives only safe connection metadata (never tokens/secrets).
- All integration providers are registered in a provider registry (`src/features/integrations/registry.ts`).
- Integration sockets are provider-neutral interfaces used by agents and UI.

Files added:

- `src/features/integrations/*` — provider registry, types, schemas, hooks, API abstraction, and minimal components.

OAuth, credentials, sync execution, and server adapters are server-side responsibilities. The frontend treats providers as capability metadata and safe views only.
