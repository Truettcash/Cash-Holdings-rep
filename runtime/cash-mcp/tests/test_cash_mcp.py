from __future__ import annotations

import io
import json
import os
import sys
import tempfile
import unittest
import urllib.error
from pathlib import Path
from unittest.mock import Mock

sys.path.insert(0, str(Path(__file__).parents[1]))

from cash_auth_provider import AuthError, TokenProvider
from cash_gateway import GatewayClient, GatewayError
from cash_mcp_server import CashMcpServer, serve_lines
from cash_project import (
    ALIAS_TO_CANONICAL,
    CANONICAL_TOOLS,
    TOOL_ACTIONS,
    TOOL_ALIASES,
    ContractError,
    canonical_tool_name,
    validate_arguments,
)


class FakeToken:
    def __init__(self, token: str = "access"):
        self.token = token

    def access_token(self) -> str:
        return self.token


class FakeGateway:
    def __init__(self, result=None):
        self.calls = []
        self.result = result or {"ok": True, "data": {"count": 0}}

    def call(self, action, arguments, bearer_token):
        self.calls.append((action, arguments, bearer_token))
        return self.result


def rpc(method, request_id=1, params=None):
    return {"jsonrpc": "2.0", "id": request_id, "method": method, "params": params or {}}


class ProjectContractTests(unittest.TestCase):
    def test_exact_six_names_aliases_and_actions(self):
        self.assertEqual(len(CANONICAL_TOOLS), 6)
        self.assertEqual(len(TOOL_ALIASES), 6)
        self.assertEqual(len(TOOL_ACTIONS), 6)
        self.assertEqual(set(ALIAS_TO_CANONICAL.values()), set(CANONICAL_TOOLS))
        self.assertNotIn("list_brands", CANONICAL_TOOLS)

    def test_each_canonical_tool_maps_to_its_gateway_action(self):
        gateway = FakeGateway()
        server = CashMcpServer(gateway, FakeToken())
        arguments = {
            "cash.list_brands": {},
            "cash.get_brand": {"slug": "vera-inc"},
            "cash.list_active_projects": {},
            "cash.get_project": {"project_id": "11111111-1111-4111-8111-111111111111"},
            "cash.get_pipeline": {},
            "cash.get_recent_activity": {},
        }
        for index, canonical in enumerate(CANONICAL_TOOLS, 1):
            server.handle(rpc("tools/call", index, {"name": canonical, "arguments": arguments[canonical]}))
        self.assertEqual([call[0] for call in gateway.calls], [TOOL_ACTIONS[name] for name in CANONICAL_TOOLS])

    def test_aliases_resolve_but_raw_actions_do_not(self):
        for canonical, alias in TOOL_ALIASES.items():
            self.assertEqual(canonical_tool_name(alias), canonical)
            self.assertEqual(canonical_tool_name(canonical), canonical)
        with self.assertRaises(ContractError):
            canonical_tool_name("list_brands")

    def test_argument_rules(self):
        self.assertEqual(validate_arguments("cash.list_brands", {}), {})
        self.assertEqual(validate_arguments("cash.get_brand", {"slug": "vera-inc"}), {"slug": "vera-inc"})
        self.assertEqual(validate_arguments("cash.get_recent_activity", {"limit": 1}), {"limit": 1})
        self.assertEqual(validate_arguments("cash.get_recent_activity", {"limit": 100}), {"limit": 100})
        for args in ({}, {"brand_id": "bad", "slug": "vera-inc"}, {"slug": "bad slug"}):
            with self.assertRaises(ContractError):
                validate_arguments("cash.get_brand", args)
        for args in ({}, {"project_id": "bad"}, {"project_id": "11111111-1111-4111-8111-111111111111", "extra": 1}):
            with self.assertRaises(ContractError):
                validate_arguments("cash.get_project", args)
        for limit in (0, 101, True, "1"):
            with self.assertRaises(ContractError):
                validate_arguments("cash.get_recent_activity", {"limit": limit})


class ProtocolTests(unittest.TestCase):
    def setUp(self):
        self.gateway = FakeGateway()
        self.server = CashMcpServer(self.gateway, FakeToken())

    def test_initialize_and_notification(self):
        response = self.server.handle(rpc("initialize", 7, {"protocolVersion": "2025-03-26"}))
        self.assertEqual(response["id"], 7)
        self.assertEqual(response["result"]["protocolVersion"], "2025-03-26")
        self.assertIsNone(self.server.handle({"jsonrpc": "2.0", "method": "notifications/initialized", "params": {}}))

    def test_tools_list_exposes_provider_safe_aliases(self):
        response = self.server.handle(rpc("tools/list", 2))
        names = [tool["name"] for tool in response["result"]["tools"]]
        self.assertEqual(names, [TOOL_ALIASES[name] for name in CANONICAL_TOOLS])
        self.assertEqual(len(names), 6)
        self.assertNotIn("list_brands", names)
        self.assertNotIn("cash.list_brands", names)

    def test_tools_call_preserves_id_and_maps_gateway_action(self):
        response = self.server.handle(rpc("tools/call", "abc", {"name": "cash.get_project", "arguments": {"project_id": "11111111-1111-4111-8111-111111111111"}}))
        self.assertEqual(response["id"], "abc")
        self.assertFalse(response["result"]["isError"])
        self.assertEqual(self.gateway.calls[0], ("get_project", {"project_id": "11111111-1111-4111-8111-111111111111"}, "access"))

    def test_alias_call_is_supported_without_expanding_tools(self):
        self.server.handle(rpc("tools/call", 3, {"name": "cash_list_brands", "arguments": {}}))
        self.assertEqual(self.gateway.calls[0][0], "list_brands")

    def test_bad_method_and_params_are_json_rpc_errors(self):
        self.assertEqual(self.server.handle(rpc("nope", 4))["error"]["code"], -32601)
        self.assertEqual(self.server.handle(rpc("tools/call", 5, {"name": "list_brands"}))["error"]["code"], -32602)

    def test_stdio_is_protocol_only_and_notifications_do_not_reply(self):
        stdin = io.StringIO(json.dumps(rpc("initialize", 1)) + "\n" + json.dumps({"jsonrpc": "2.0", "method": "notifications/initialized"}) + "\n" + "not-json\n")
        stdout = io.StringIO()
        stderr = io.StringIO()
        serve_lines(self.server, stdin, stdout)
        lines = stdout.getvalue().splitlines()
        self.assertEqual(len(lines), 2)
        for line in lines:
            parsed = json.loads(line)
            self.assertEqual(parsed["jsonrpc"], "2.0")
        self.assertEqual(stderr.getvalue(), "")


class AuthTests(unittest.TestCase):
    def test_missing_and_malformed_state_fail_closed(self):
        with tempfile.TemporaryDirectory() as root:
            provider = TokenProvider("user-1", state_root=root)
            with self.assertRaises(AuthError):
                provider.access_token()
            Path(root, "session.json").write_text("not-json", encoding="utf-8")
            with self.assertRaises(AuthError):
                provider.access_token()

    def test_identity_mismatch_fails_closed(self):
        with tempfile.TemporaryDirectory() as root:
            Path(root, "session.json").write_text(json.dumps({"user_id": "other", "refresh_token": "r"}), encoding="utf-8")
            with self.assertRaises(AuthError):
                TokenProvider("user-1", state_root=root).access_token()

    def test_refresh_rotates_token_atomically_and_does_not_persist_access(self):
        now = [100.0]
        with tempfile.TemporaryDirectory() as root:
            Path(root).mkdir(exist_ok=True)
            Path(root, "session.json").write_text(json.dumps({"user_id": "user-1", "refresh_token": "old", "expires_at": 101}), encoding="utf-8")
            provider = TokenProvider("user-1", state_root=root, clock=lambda: now[0], refresh=lambda token: {"user_id": "user-1", "refresh_token": "new", "access_token": "secret-access", "expires_at": 200})
            self.assertEqual(provider.access_token(), "secret-access")
            stored = json.loads(Path(root, "session.json").read_text(encoding="utf-8"))
            self.assertEqual(stored["refresh_token"], "new")
            self.assertNotIn("access_token", stored)
            self.assertEqual(stat_mode(root), 0o700)
            self.assertEqual(stat_mode(Path(root, "session.json")), 0o600)

    def test_expired_refresh_identity_mismatch_fails(self):
        with tempfile.TemporaryDirectory() as root:
            Path(root, "session.json").write_text(json.dumps({"user_id": "user-1", "refresh_token": "old", "expires_at": 1}), encoding="utf-8")
            provider = TokenProvider("user-1", state_root=root, refresh=lambda _: {"user_id": "other", "refresh_token": "new", "access_token": "a", "expires_at": 1000})
            with self.assertRaises(AuthError):
                provider.access_token()


def stat_mode(path: str | Path) -> int:
    return os.stat(path).st_mode & 0o777


class GatewayTests(unittest.TestCase):
    def test_request_headers_body_and_timeout(self):
        captured = {}

        class Response:
            status = 200
            def read(self):
                return b'{"ok":true}'
            def __enter__(self): return self
            def __exit__(self, *args): pass

        def opener(request, timeout):
            captured["request"] = request
            captured["timeout"] = timeout
            return Response()

        result = GatewayClient("https://example.test/functions/v1/cash-mcp-read", "publishable", timeout=2, opener=opener).call("list_brands", {}, "user-token")
        self.assertEqual(result, {"ok": True})
        self.assertEqual(captured["timeout"], 2)
        self.assertEqual(captured["request"].get_header("Authorization"), "Bearer user-token")
        self.assertEqual(captured["request"].get_header("Apikey"), "publishable")
        self.assertEqual(json.loads(captured["request"].data), {"action": "list_brands"})

    def test_http_errors_and_malformed_json_are_preserved(self):
        def opener(*args, **kwargs):
            raise urllib.error.HTTPError("https://example.test", 401, "Unauthorized", {}, io.BytesIO(b'{"error":{"code":"AUTH_INVALID"}}'))
        with self.assertRaises(GatewayError) as caught:
            GatewayClient("https://example.test", "key", opener=opener).call("list_brands", {}, "token")
        self.assertEqual(caught.exception.status, 401)
        self.assertEqual(caught.exception.payload["error"]["code"], "AUTH_INVALID")

        class BadResponse:
            status = 502
            def read(self): return b"not-json"
            def __enter__(self): return self
            def __exit__(self, *args): pass
        with self.assertRaises(GatewayError) as malformed:
            GatewayClient("https://example.test", "key", opener=lambda *a, **k: BadResponse()).call("list_brands", {}, "token")
        self.assertEqual(malformed.exception.status, 502)
        self.assertEqual(malformed.exception.payload["error"]["code"], "INVALID_RESPONSE")

        class SuccessButBadResponse(BadResponse):
            status = 200
        with self.assertRaises(GatewayError):
            GatewayClient("https://example.test", "key", opener=lambda *a, **k: SuccessButBadResponse()).call("list_brands", {}, "token")


if __name__ == "__main__":
    unittest.main()