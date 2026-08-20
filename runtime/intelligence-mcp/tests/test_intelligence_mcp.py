from __future__ import annotations
import sys, unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[1]))

from intelligence_mcp_server import IntelligenceMcpServer
from intelligence_project import CANONICAL_TOOLS, TOOL_ALIASES, ContractError, canonical_tool_name, validate_arguments


class Token:
    def access_token(self):
        return "user-token"


class Gateway:
    def __init__(self):
        self.calls = []

    def call(self, action, arguments, token):
        self.calls.append((action, arguments, token))
        return {
            "ok": True,
            "action": f"intelligence.{action}",
            "data": {
                "constructs": [{"id": "11111111-1111-4111-8111-111111111111", "title": "ATHRTY CRM Foundation Stage"}],
                "signal": {"id": "22222222-2222-4222-8222-222222222222", "summary": "ATHRTY CRM foundation is established."},
            },
        }


def rpc(method, params=None):
    return {"jsonrpc": "2.0", "id": 1, "method": method, "params": params or {}}


class Tests(unittest.TestCase):
    def setUp(self):
        self.gateway = Gateway()
        self.server = IntelligenceMcpServer(self.gateway, Token())

    def test_aliases_are_exactly_provider_safe_names(self):
        names = [tool["name"] for tool in self.server.handle(rpc("tools/list"))["result"]["tools"]]
        self.assertEqual(names, [TOOL_ALIASES[name] for name in CANONICAL_TOOLS])
        self.assertEqual(len(names), 10)
        self.assertTrue(all("." not in name for name in names))

    def test_tool_alias_maps_to_canonical_action_and_preserves_results(self):
        response = self.server.handle(rpc("tools/call", {"name": "intelligence_list_constructs", "arguments": {"limit": 5}}))
        self.assertFalse(response["result"]["isError"])
        self.assertEqual(self.gateway.calls[0], ("list_constructs", {"limit": 5}, "user-token"))
        self.assertIn("constructs", response["result"]["structuredContent"]["data"])

    def test_strict_validation_rejects_bad_inputs_and_extra_fields(self):
        for args in ({}, {"construct_id": "bad"}, {"owner_user_id": "11111111-1111-4111-8111-111111111111"}, {"limit": 0}, {"limit": 51}):
            with self.assertRaises(ContractError):
                validate_arguments("intelligence.get_construct", args)
        with self.assertRaises(ContractError):
            validate_arguments("intelligence.get_signal", {"signal_id": "bad"})
        with self.assertRaises(ContractError):
            validate_arguments("intelligence.get_context", {"extra": 1})

    def test_protocol_initialize_and_unknown_tool(self):
        self.assertEqual(self.server.handle(rpc("initialize"))["result"]["serverInfo"]["name"], "intelligence-mcp")
        self.assertEqual(self.server.handle(rpc("tools/call", {"name": "intelligence.unknown", "arguments": {}}))["error"]["code"], -32602)


if __name__ == "__main__":
    unittest.main()
