# Control Spine Production Manifest

Recovered from active Supabase project `ldijllskwwmyhhbzspmb` on 2026-08-30.

Purpose: source-control convergence only. This manifest records the live deployment metadata observed at recovery time. It is **not** a deployment instruction and this recovery pass performs no Supabase mutation.

| Function | Git path | Live version | `verify_jwt` | Live deployment `ezbr_sha256` | Capability |
|---|---|---:|---|---|---|
| `agent-control-plane` | `supabase/functions/agent-control-plane/index.ts` | 24 | `true` | `2c11d1fd1a02cbc8472e0da690a64fab6fd69f89f2e93efd4ecf668029aacd74` | authenticated agent registry, routing, runs and events |
| `learning-cycle` | `supabase/functions/learning-cycle/index.ts` | 25 | `true` | `d2ed0e196127573f6e08e9c7b814ec45faf7bbe178038a1a6d8938e83caf5d0d` | constraint classification, learning reconciliation and decision generation |
| `jarvis-operating-feed` | `supabase/functions/jarvis-operating-feed/index.ts` | 25 | `false` | `0c922210dc5472d913f14157502b78807fab568a14d9d6e35927e571df086781` | scoped read feed for learning, decisions, agents and execution queue |
| `jarvis-decision-command` | `supabase/functions/jarvis-decision-command/index.ts` | 24 | `false` | `74d497b2e604e41578298844433a09323470dd683d2d6a5bfaef988f21e4fce9` | scoped decision review, delegation, execution and outcome writes |

## Authentication contracts observed

### `agent-control-plane`

Platform JWT verification is enabled. The function additionally validates the bearer token through `auth.getUser()` and scopes all service-role database operations to the authenticated `owner_user_id`.

### `learning-cycle`

Platform JWT verification is enabled. Normal callers are validated through `auth.getUser()`. The function also recognizes the service-role token as an internal caller and requires an explicit owner UUID in that mode.

### `jarvis-operating-feed`

Platform JWT verification is disabled because the function implements its own dual authentication contract:

- scoped `x-cash-agent-key`, hashed and matched against active `agent_service_keys` with `operating_feed:read`; or
- bearer user token validated through `auth.getUser()`.

The custom authorization boundary is therefore materially different from the current `m365-connection-health` finding, which is why `verify_jwt=false` is not itself classified as a defect here.

### `jarvis-decision-command`

Platform JWT verification is disabled because the function implements scoped service-key or authenticated-user authorization. Service keys are checked against action-specific scopes including:

- `decision:review`
- `execution:write`
- `outcome:write`
- `operating_feed:read`

## Parity rule

`ezbr_sha256` is Supabase deployment metadata for the deployed function bundle. It must not be represented as the SHA-256 of the single `index.ts` file unless independently proven.

During source-recovery work:

1. preserve recovered source without refactoring;
2. preserve the observed `verify_jwt` state in this manifest;
3. do not redeploy merely to make formatting or layout cleaner;
4. treat any subsequent code modification as a new reviewed change, not recovery parity;
5. update deployment metadata only after a deliberately approved deployment and verification pass.

## Recovery state

- live source retrieved: **yes**
- source copied into Git: **yes**
- production redeployed: **no**
- database mutated: **no**
- auth behavior changed: **no**
- next step: recover adjacent ATHRTY/outbound execution functions and database contracts in separate bounded passes.
