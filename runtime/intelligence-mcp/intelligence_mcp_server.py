"""Read-only OpenJarvis-compatible Intelligence MCP JSON-RPC server."""
from __future__ import annotations

import json
import sys
from typing import Any, TextIO

from intelligence_project import (
    CANONICAL_TOOLS,
    TOOL_ACTIONS,
    TOOL_ALIASES,
    TOOL_DESCRIPTIONS,
    TOOL_SCHEMAS,
    ContractError,
    canonical_tool_name,
    validate_arguments,
)
from pattern_engine import DEFAULT_PATTERN_ENGINE, build_athrty_fixture

PARSE_ERROR = -32700
INVALID_REQUEST = -32600
METHOD_NOT_FOUND = -32601
INVALID_PARAMS = -32602
INTERNAL_ERROR = -32603


def _response(request_id: Any, result: Any = None, error: dict[str, Any] | None = None) -> dict[str, Any]:
    message = {"jsonrpc": "2.0", "id": request_id}
    if error is None:
        message["result"] = result
    else:
        message["error"] = error
    return message


class IntelligenceMcpServer:
    def __init__(self, gateway: Any, token_provider: Any, stderr: TextIO | None = None) -> None:
        self.gateway = gateway
        self.token_provider = token_provider
        self.stderr = stderr or sys.stderr

    def handle(self, message: Any) -> dict[str, Any] | None:
        if not isinstance(message, dict) or message.get("jsonrpc") != "2.0" or not isinstance(message.get("method"), str):
            return _response(message.get("id") if isinstance(message, dict) else None, error={"code": INVALID_REQUEST, "message": "Invalid Request"})

        request_id = message.get("id")
        method = message["method"]
        if request_id is None:
            if method == "notifications/initialized":
                return None
            return None

        params = message.get("params", {})
        if not isinstance(params, dict):
            return _response(request_id, error={"code": INVALID_PARAMS, "message": "params must be an object"})

        try:
            if method == "initialize":
                return _response(request_id, {
                    "protocolVersion": "2025-03-26",
                    "capabilities": {"tools": {}},
                    "serverInfo": {"name": "intelligence-mcp", "version": "1.0.0"},
                })
            if method == "tools/list":
                return _response(request_id, {"tools": [
                    {"name": TOOL_ALIASES[name], "description": TOOL_DESCRIPTIONS[name], "inputSchema": TOOL_SCHEMAS[name]}
                    for name in CANONICAL_TOOLS
                ]})
            if method != "tools/call":
                return _response(request_id, error={"code": METHOD_NOT_FOUND, "message": "Method not found"})

            name = params.get("name")
            if not isinstance(name, str):
                raise ContractError("tools/call requires a tool name")
            canonical = canonical_tool_name(name)
            arguments = validate_arguments(canonical, params.get("arguments", {}))

            if canonical == "intelligence.list_patterns":
                result = {"patterns": DEFAULT_PATTERN_ENGINE.list_patterns()}
            elif canonical == "intelligence.get_pattern":
                result = {"pattern": DEFAULT_PATTERN_ENGINE.get_pattern(arguments["pattern_key"]) }
            elif canonical == "intelligence.match_patterns":
                problem = arguments["problem"]
                matches = DEFAULT_PATTERN_ENGINE.match_patterns(problem)
                result = {"matches": [match.to_dict() for match in matches[: int(arguments.get("limit", 5))]]}
            elif canonical == "intelligence.list_constraints":
                result = {"constraints": DEFAULT_PATTERN_ENGINE.list_constraints()}
            elif canonical == "intelligence.get_constraint":
                result = {"constraint": DEFAULT_PATTERN_ENGINE.get_constraint(arguments["constraint_id"]) }
            elif canonical == "intelligence.get_reasoning_trace":
                result = {"trace": DEFAULT_PATTERN_ENGINE.get_reasoning_trace(arguments["problem"]) }
            else:
                token = self.token_provider.access_token()
                result = self.gateway.call(TOOL_ACTIONS[canonical], arguments, token)

            return _response(request_id, {
                "content": [{"type": "text", "text": json.dumps(result, sort_keys=True)}],
                "structuredContent": result,
                "isError": False,
            })
        except ContractError as exc:
            return _response(request_id, error={"code": INVALID_PARAMS, "message": str(exc)})
        except Exception as exc:  # pragma: no cover - defensive protocol boundary
            self.stderr.write(f"intelligence-mcp internal error: {type(exc).__name__}\n")
            return _response(request_id, error={"code": INTERNAL_ERROR, "message": "Internal error"})


def serve_lines(server: IntelligenceMcpServer, stdin: TextIO = sys.stdin, stdout: TextIO = sys.stdout) -> None:
    for line in stdin:
        try:
            message = json.loads(line)
        except json.JSONDecodeError:
            response = _response(None, error={"code": PARSE_ERROR, "message": "Parse error"})
        else:
            response = server.handle(message)
        if response is not None:
            stdout.write(json.dumps(response, separators=(",", ":")) + "\n")
            stdout.flush()


def main() -> None:  # pragma: no cover - process wiring
    raise SystemExit("Configure GatewayClient and TokenProvider in bootstrap before running intelligence-mcp")


if __name__ == "__main__":
    main()
