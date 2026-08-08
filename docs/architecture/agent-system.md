# Agent System Architecture (Frontend Design)

This document describes the frontend-side architecture for the Cash Holdings Agent system. It is intentionally descriptive and safe by design — no production credentials, no DB migrations, no model SDKs, and no autonomous execution are implemented here.

Overview (high-level flow)

Cash Holdings UI
↓
AgentDock / AgentComposer (UI)
↓
React Query hooks (useCreateAgentRun, useAgentRun, ...)
↓
AgentApi interface (frontend abstraction; fail-closed by default)
↓
Agent Gateway [future server-side]
↓
Agent definition (registry)
↓
Model runtime (server)
↓
Tool registry (read/draft/write/sensitive)
↓
Policy layer (risk & approval)
↓
Approval / Operator
↓
Authorized systems

Current frontend implementation (files)

- `src/features/agents/api.ts` — AgentApi interface, default fail-closed implementation, `configureAgentApi()`.
- `src/features/agents/query.ts` — React Query hooks layered on top of `AgentApi`.
- `src/features/agents/hooks.ts` — UI context for AgentDock / composer and `AgentUIProvider`.
- `src/features/agents/context.ts` — `AgentContext` builder: scoped references only.
- `src/features/agents/registry.ts` — Agent and tool registry (definitions, capabilities).
- `src/features/agents/permissions.ts` — static permission metadata for tools/modes.
- `src/features/agents/schemas.ts` — Zod schemas for runs, approvals, errors, context.
- `src/features/agents/types.ts` — Type definitions and utility helpers.
- `src/features/agents/components/` — Presentational components: `AgentDock`, `AgentComposer`, `AgentRunPanel`, `AgentStepList`, `ApprovalCard`, `AgentArtifactCard`, `AgentRunHistory`, etc.

Execution modes

- `suggest` — Low-risk suggestions, safe to run client-side as a prompt; no side-effects.
- `draft` — Creates artifacts (e.g., email draft) but must NOT mutate external systems.
- `execute_with_approval` — Intent to perform writes; requires server-side approval workflow before any mutation.

Explicitly absent

- `execute_autonomously` — Autonomous execution is not available in the frontend and must never be enabled by default.

Agent definitions (conceptual)

The system provides configurable agent definitions that map to roles or playbooks over a shared runtime. These are NOT separate model providers.

- Research Agent — Gather public signals, summarize account-level research, produce a research artifact. Capabilities: `read` and `draft` (research artifacts). No writes.
- Sales Agent — Assist with outreach, propose next steps, draft messages. Capabilities: `read`, `draft`, may propose `write` actions that require approval (e.g., schedule follow-up).
- CRM Analyst — Provide data analysis of CRM records, recommend segmentation and cleanup. Capabilities: `read`, `draft`.
- Operations Analyst — Operational tasks like data quality checks and import planning; may propose `write` actions but requires human approval and server-side validation.

These definitions are configuration over a shared model runtime: instructions, tool permissions, and step sequencing are server-resolved in the gateway.

Tool risk model

Tools are classified by risk: `READ`, `DRAFT`, `WRITE`, `SENSITIVE_WRITE`.

Policy guidance:

- `READ` — Server-authorized execution may read data; may be allowed to run automatically depending on server policy.
- `DRAFT` — May create artifacts (email drafts, reports) but cannot mutate external systems.
- `WRITE` — Mutating actions require operator approval; the server must create an approval request and not execute until approved.
- `SENSITIVE_WRITE` — Same as `WRITE` but with stricter server-side authorization checks and audit logging.

Examples:

- `crm.get_lead` → READ
- `crm.summarize_lead` → READ
- `crm.draft_outreach` → DRAFT
- `crm.schedule_follow_up` → WRITE
- `communications.send_email` → SENSITIVE_WRITE

Important: Production CRM import is NOT a generic agent tool. Imports and large-scale mutations require explicit operations outside of agent tooling.

Approval architecture (future)

Future flow (server-side authoritative):

1. Agent proposes a tool call.
2. Server validates the tool and the request shape.
3. Server determines tool risk from policy.
4. For `WRITE`/`SENSITIVE_WRITE` a server-side approval request is created.
5. Operator UI renders an `ApprovalCard` (rendering does not execute anything).
6. Operator approves or rejects explicitly.
7. Server revalidates authorization and executes the mutation if approved.
8. Server records the result and returns a structured `AgentRun` object.

Important rule: Rendering `ApprovalCard` never performs the mutation. Approval must be a distinct, explicit action.

Future Agent Gateway (edge-functions/agent-gateway/) — responsibilities

- Authenticate request (JWT) and resolve user.
- Verify owner/role and server-side authorization.
- Validate request input and context.
- Resolve agent definition and server-side instructions.
- Invoke model runtime (provider-specific) with controlled prompts.
- Validate any proposed tool calls against the registry.
- Enforce risk/approval policy.
- Execute read tools as allowed; create approval entries for writes.
- Execute approved writes after revalidation.
- Return structured `AgentRun` with steps, tool calls, artifacts, approvals, and audit fields.

This gateway is intentionally NOT implemented in the frontend. Do NOT deploy it in this pass.

Proposed database model (document-only)

Tables:

- `agent_runs`
- `agent_steps`
- `agent_tool_calls`
- `agent_approvals`
- `agent_artifacts`

Relationship:

agent_runs
├── agent_steps
├── agent_tool_calls
├── agent_approvals
└── agent_artifacts

Suggested fields (documentation only) — see design doc for details.

Observability

Collect structured telemetry per run but avoid storing secrets or private model reasoning by default. Suggested fields:

- `run_id`, `agent_key`, `status`, `duration`, `tool_key`, `tool_duration`, `approval_status`, `error_code`, `model_provider`, `token_usage`, `estimated_cost`.

Do NOT store:

- credentials, tokens, raw private PII, or full chain-of-thought by default.

Context model (browser ↔ server)

- `AgentContext` contains explicit scoped references (IDs only): `route`, `engagementId`, `organizationId`, `contactId`, `brandKey`, `activeFilters`, `dateRange`.
- Browser supplies identifiers only. Server validates authorization and fetches authoritative records.
- Do NOT trust arbitrary browser-provided record contents as authoritative.

Developer notes

- The frontend includes a guarded dev adapter (`src/features/agents/dev-api.ts`) that proxies to local MSW test fixtures. It is only enabled when `import.meta.env.DEV` is true and the runtime feature flag is enabled.
- Default frontend AgentApi is fail-closed: `AgentGatewayNotConfiguredError`. Production builds must not use MSW or dev adapter.

End of document.

# Agent System Architecture — Cash Holdings UI

This document describes the frontend-side agent architecture implemented in the Cash Holdings UI (documentation only). It intentionally documents the current frontend scaffolding, the intended server/gateway contract, the risk/approval model, and the development-only simulated runtime used for local testing.

Top-level flow (logical):

Cash Holdings UI
↓
AgentDock / AgentComposer (UI)
↓
React Query hooks (`src/features/agents/query.ts`)
↓
AgentApi interface (`src/features/agents/api.ts`) — fail-closed by default
↓
Agent Gateway [future server-side] (NOT implemented here)
↓
Agent definition (registry/config)
↓
Model runtime (server-side model invocation)
↓
Tool registry (tools with risk metadata)
↓
Policy layer (risk classification + authorization)
↓
Approval (human-in-the-loop where required)
↓
Authorized systems (CRM, communications, schedulers)

Important: The frontend never holds model credentials and never executes writes directly in production. All mutating operations must go through a server-side, authenticated gateway which performs validation and enforcement.

Current frontend implementation (files and roles)

- `src/features/agents/api.ts` — AgentApi interface and fail-closed default implementation (`AgentGatewayNotConfiguredError`). Provides `configureAgentApi()` to plug a runtime adapter.
- `src/features/agents/query.ts` — React Query hooks that call the `AgentApi` (createRun, getRun, getRunHistory, cancelRun, approve/reject actions).
- `src/features/agents/hooks.ts` — UI-level state (`AgentUIProvider`, `useAgentUI`) for the dock/composer and a small `AgentContext` helper.
- `src/features/agents/context.ts` — `AgentContext` model and `buildAgentContext()` Zod validation wrapper.
- `src/features/agents/registry.ts` — agent definitions and tool registry (read/draft tools only in UI registry by default).
- `src/features/agents/permissions.ts` — formalizes permission metadata (canRead/canDraft/canWrite) used by UI affordances.
- `src/features/agents/schemas.ts` — Zod schemas for definitions, tool calls, results, approvals, and context.
- `src/features/agents/types.ts` — TypeScript types used across UI components.
- `src/features/agents/dev-api.ts` — development-only adapter that talks to locally-mocked MSW endpoints (added for dev/testing only).
- `src/features/agents/components/` — presentational and container components: `AgentDock`, `AgentComposer`, `AgentRunPanel`, `AgentStepList`, `ToolCallCard`, `ApprovalCard`, `AgentArtifactCard`, `AgentStatusBadge`, `AgentEmptyState`, and `AgentRunHistory` (UI only; server interactions are via the `AgentApi`).

Execution modes

- `suggest` — read/analysis oriented. No external mutation. Recommended default for general queries.
- `draft` — produces artifacts (draft emails, summaries). MAY create artifacts but MUST NOT trigger external mutations.
- `execute_with_approval` — tool calls classified as `WRITE` or `SENSITIVE_WRITE` require explicit human approval (approval flow documented below) before server-side execution.

There is NO `execute_autonomously` mode. Autonomous or unsupervised writes are prohibited by policy and the UI intentionally lacks an autonomous execution mode.

Tool risk model (summary)

- `READ` — safe read-only operations; server-authorized reads may be executed automatically.
- `DRAFT` — creates non-mutating artifacts (e.g., draft outreach). No external side-effect.
- `WRITE` — mutating operations; require human approval and server-side authorization.
- `SENSITIVE_WRITE` — high-risk writes (communication sends, billing changes); require human approval and stricter server-side checks and audit logging.

Example tool classifications (UI examples):

- `crm.get_lead` — `READ`
- `crm.summarize_lead` — `READ`
- `crm.draft_outreach` — `DRAFT`
- `crm.schedule_follow_up` — `WRITE`
- `communications.send_email` — `SENSITIVE_WRITE`

Policy notes

- Production CRM import or bulk import is NOT available as a generic agent tool.
- Rendering an `ApprovalCard` in the UI MUST NOT execute the approval action. Approvals are explicit separate operations that require operator input.

Approval architecture (future server flow)

1. Agent proposes a tool call (tool key + input).
2. The browser sends the proposal to the Agent Gateway (server).
3. The gateway validates the tool, determines risk, and performs server-side authorization.
4. If the tool is `WRITE` or `SENSITIVE_WRITE`, the gateway persists an approval request and returns `waiting_for_approval` state.
5. Operator sees `ApprovalCard` and chooses to approve or reject.
6. On approve, the gateway revalidates authorization and executes the mutation; result is recorded.

Important rule: Displaying `ApprovalCard` must NEVER cause side effects; approval is a distinct, user-initiated operation.

Agent Gateway (future)

Planned responsibilities (server-side, not implemented in this repo):

- Authenticate requests (JWT) and resolve user identity.
- Verify ownership and role-based permissions.
- Validate incoming requests and build an authorized context.
- Resolve agent definition and server-side instructions/templates.
- Invoke model providers securely (server-side only).
- Validate proposed tool calls against policy.
- Execute permitted read tools and create approvals for writes.
- Execute approved writes and persist `AgentRun` records.

Data model (future database design — documentation only)

- `agent_runs`
- `agent_steps`
- `agent_tool_calls`
- `agent_approvals`
- `agent_artifacts`

Observability (suggested fields)

- run_id, agent_key, status, duration, tool_key, tool_duration, approval_status, error_code, model/provider, token usage, estimated cost.

Privacy & retention rules

- Do NOT store credentials, raw model tokens, chain-of-thought, or unnecessary PII by default.

Context model (browser → server)

- The browser supplies scoped identifiers (route, engagementId, organizationId, contactId, brandKey, filters, date ranges).
- The server MUST validate and resolve these identifiers to authoritative resource records before providing them to models or executing tools.

Development simulation

- A development-only adapter `src/features/agents/dev-api.ts` is provided to simulate runs using MSW fixtures. Activation is explicit and guarded: `import.meta.env.DEV && features.devAgentRuntime === true`. The default `AgentApi` remains fail-closed for production builds.

This file is documentation only. See the repository files referenced above for implementation details.
