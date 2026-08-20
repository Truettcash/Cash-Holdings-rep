"""Read-only OpenJarvis-compatible Knowledge MCP JSON-RPC server."""
from __future__ import annotations
import json, sys
from typing import Any, TextIO
from knowledge_project import CANONICAL_TOOLS, TOOL_ACTIONS, TOOL_ALIASES, TOOL_DESCRIPTIONS, TOOL_SCHEMAS, ContractError, canonical_tool_name, validate_arguments
PARSE_ERROR, INVALID_REQUEST, METHOD_NOT_FOUND, INVALID_PARAMS, INTERNAL_ERROR = -32700, -32600, -32601, -32602, -32603
def _response(request_id: Any, result: Any = None, error: dict[str, Any] | None = None) -> dict[str, Any]:
    output = {"jsonrpc": "2.0", "id": request_id}; output["error" if error else "result"] = error if error else result; return output
class KnowledgeMcpServer:
    def __init__(self, gateway: Any, token_provider: Any, stderr: TextIO | None = None): self.gateway, self.token_provider, self.stderr = gateway, token_provider, stderr or sys.stderr
    def handle(self, message: Any) -> dict[str, Any] | None:
        if not isinstance(message, dict) or message.get("jsonrpc") != "2.0" or not isinstance(message.get("method"), str): return _response(message.get("id") if isinstance(message, dict) else None, error={"code": INVALID_REQUEST, "message": "Invalid Request"})
        request_id, method, params = message.get("id"), message["method"], message.get("params", {})
        if request_id is None: return None
        if not isinstance(params, dict): return _response(request_id, error={"code": INVALID_PARAMS, "message": "params must be an object"})
        try:
            if method == "initialize": return _response(request_id, {"protocolVersion": "2025-03-26", "capabilities": {"tools": {}}, "serverInfo": {"name": "knowledge-mcp", "version": "1.0.0"}})
            if method == "tools/list": return _response(request_id, {"tools": [{"name": TOOL_ALIASES[name], "description": TOOL_DESCRIPTIONS[name], "inputSchema": TOOL_SCHEMAS[name]} for name in CANONICAL_TOOLS]})
            if method != "tools/call": return _response(request_id, error={"code": METHOD_NOT_FOUND, "message": "Method not found"})
            canonical = canonical_tool_name(params.get("name")); arguments = validate_arguments(canonical, params.get("arguments", {})); result = self.gateway.call(TOOL_ACTIONS[canonical], arguments, self.token_provider.access_token())
            return _response(request_id, {"content": [{"type": "text", "text": json.dumps(result, sort_keys=True)}], "structuredContent": result, "isError": False})
        except ContractError as exc: return _response(request_id, error={"code": INVALID_PARAMS, "message": str(exc)})
        except Exception as exc:
            self.stderr.write(f"knowledge-mcp error: {type(exc).__name__}\n"); return _response(request_id, error={"code": INTERNAL_ERROR, "message": "Internal error"})
def serve_lines(server: KnowledgeMcpServer, stdin: TextIO = sys.stdin, stdout: TextIO = sys.stdout) -> None:
    for line in stdin:
        try: response = server.handle(json.loads(line))
        except json.JSONDecodeError: response = _response(None, error={"code": PARSE_ERROR, "message": "Parse error"})
        if response is not None: stdout.write(json.dumps(response, separators=(",", ":")) + "\n"); stdout.flush()