# Runtime Reconstruction

This directory is the Git-controlled reconstruction specification for the Cash
Operator runtime. It contains definitions and immutable source identities, not
generated OpenJarvis state.

## Layout

- `openjarvis/` pins the exact PyPI source artifact and installation contract.
- `contracts/` records the verified Cash MCP gateway protocol.
- `agents/` defines the canonical Cash Operator and its prompt.
- `scheduler/` records scheduling intent without selecting a runtime operator.
- `cash-mcp/` and `bootstrap/` are reserved for the next implementation phase.

Git definitions remain under `repo/runtime/`. OpenJarvis 1.0.3 resolves
generated state through `OPENJARVIS_HOME`, so the future bootstrap will use
`~/.openjarvis` (outside the checkout); installation is under
`~/.local/share/openjarvis/1.0.3`. Private Cash MCP state is under
`~/.cash-mcp` with restrictive permissions. No generated state or credential
belongs under `runtime/`.

## Verified OpenJarvis 1.0.3 trace

The inspected source distribution is `openjarvis-1.0.3.tar.gz` with SHA-256
`99a8beb3300289846ea7106132f3f20b144ac39659f6c6f59b053c839297d627`. The
distribution exposes no upstream VCS commit, so its versioned archive and hash
are the immutable identity.

Relevant source paths and functions:

- CLI entry point: `src/openjarvis/cli/__init__.py:main`; managed-agent CLI:
  `src/openjarvis/cli/agent_cmd.py`; generic task CLI:
  `src/openjarvis/cli/scheduler_cmd.py`.
- Managed-agent persistence and lookup:
  `src/openjarvis/agents/manager.py:AgentManager`, including `get_agent`,
  `get_agent_by_name`, `create_agent`, and the SQLite-backed agent store.
- Managed-agent invocation:
  `src/openjarvis/agents/executor.py:AgentExecutor.execute_tick` loads the
  persisted record, then `_invoke_agent` uses its config, model, system prompt,
  and tools.
- Per-agent tool filtering: `AgentExecutor._invoke_agent` resolves the
  persisted `config["tools"]` against the system tool pool.
- Native managed-agent scheduling:
  `src/openjarvis/agents/scheduler.py:AgentScheduler.register_agent` stores an
  agent ID and `_check_due_agents` dispatches that same ID to
  `AgentExecutor.execute_tick`.
- Generic scheduler persistence and execution:
  `src/openjarvis/scheduler/store.py:SchedulerStore` stores task `agent` as a
  string selector; `src/openjarvis/cli/scheduler_cmd.py:scheduler_run_task`
  resolves the task and calls `system.ask(match.prompt, agent=match.agent)`.
- MCP composition: `src/openjarvis/system/builder.py:_resolve_tools` and
  `_discover_external_mcp` configure stdio/HTTP MCP clients; per-server
  filtering is applied from MCP configuration. Agent tool selection is then
  applied by `AgentExecutor._invoke_agent`.

The old `agent = monitor_operative` defect occurred on the generic
`SchedulerStore`/`scheduler_run_task` path. It passed a registry/operator
selector to `system.ask`, rather than dispatching the persisted managed-agent
record by ID through `AgentScheduler` and `AgentExecutor`.

## State boundary

OpenJarvis installation, managed-agent records, generated IDs, scheduler DB and
history, caches, sessions, access tokens, and refresh tokens are runtime/private
state. They must never be reconstructed from uncommitted Codespace files or
committed to Git. The historical ID is recorded only in the operator spec as
provenance.

Bootstrap remains blocked until Cash MCP is clean-room reconstructed from the
gateway contract, its tests pass, the verified OpenJarvis artifact is installed,
a fresh user session is bootstrapped, the operator is instantiated from Git,
the six-tool/zero-native-tool proof succeeds, CloudEngine/gpt-4o-mini live read
proof succeeds, the generated agent ID is bound through `AgentScheduler`, and
one scheduled run is proven. No schedule is enabled by this specification.

## R2B implementation

The clean-room Cash MCP source is under `cash-mcp/`. Its local test command is:

```text
python -m unittest discover -s runtime/cash-mcp/tests -p 'test_*.py'
```

Tests use fake auth, HTTP, and protocol streams only. No live credentials are
stored. R2C remains required for exact OpenJarvis installation and fresh
dedicated-user session bootstrap.