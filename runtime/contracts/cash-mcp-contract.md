# Cash MCP Contract

This contract is derived from the protected `edge-functions/cash-mcp-read`
gateway and its tests. It defines exactly six read operations. No additional
operation is authorized by this specification.

## Transport and authentication

- Future adapter transport: stdio JSON-RPC.
- Gateway transport: authenticated HTTP `POST` with a JSON body.
- The adapter injects a dedicated user-scoped bearer token at the gateway
  boundary.
- The gateway validates the user with Supabase Auth and preserves RLS.
- No service-role key, service-role token, or `CASH_SUPABASE_ACCESS_TOKEN` is
  allowed.
- Protocol messages go to stdout; diagnostics go to stderr only.

## Operations

| Tool | Input | Result |
|---|---|---|
| `list_brands` | `{ action }` | `data.brands`, `data.count` |
| `get_brand` | `{ action, brand_id }` or `{ action, slug }` | `data.brand` |
| `list_active_projects` | `{ action, brand_id? }` | `data.projects`, `data.count` |
| `get_project` | `{ action, project_id }` | `data.project`, `data.task_summary` |
| `get_pipeline` | `{ action, brand_id? }` | `data.pipeline`, `data.totals`, `data.count` |
| `get_recent_activity` | `{ action, brand_id?, limit? }` | `data.activities`, `data.count` |

`brand_id` and `project_id` are UUIDs. `slug` is a lowercase hyphenated slug.
`limit` is an integer from 1 through 100; the gateway default is 20.

## Error contract

- `AUTH_REQUIRED`: missing bearer header, HTTP 401
- `AUTH_INVALID`: invalid user session, HTTP 401
- `INVALID_ACTION`: unknown tool, HTTP 400
- `INVALID_INPUT`: malformed input or unexpected fields, HTTP 400
- `NOT_FOUND`: requested entity absent, HTTP 404
- `QUERY_FAILED`: Supabase query failure, HTTP 502
- `INTERNAL_SERVER_ERROR`: unexpected failure, HTTP 500

Responses are JSON, non-cacheable, and contain no unsanitized database rows.

## Required tests

The future Cash MCP implementation must test all six operation schemas,
authentication failure, unknown actions, extra-field rejection, UUID/slug/
limit validation, sanitized output, query errors, and stdout/stderr protocol
separation. It must prove that no write operation or service-role credential is
reachable through the adapter.