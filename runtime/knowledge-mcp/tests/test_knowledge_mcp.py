from __future__ import annotations
import sys, unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parents[1]))
from knowledge_mcp_server import KnowledgeMcpServer
from knowledge_project import CANONICAL_TOOLS, TOOL_ALIASES, ContractError, canonical_tool_name, validate_arguments
class Token: 
    def access_token(self): return "user-token"
class Gateway:
    def __init__(self): self.calls=[]
    def call(self, action, arguments, token): self.calls.append((action,arguments,token)); return {"ok":True,"action":f"knowledge.{action}","data":{"hits":[{"citation":{"content_id":"x","document_id":"d","source_id":"s","source_locator":{"chunk_index":0}}}]}}
def rpc(method, params=None): return {"jsonrpc":"2.0","id":1,"method":method,"params":params or {}}
class Tests(unittest.TestCase):
    def setUp(self): self.gateway=Gateway(); self.server=KnowledgeMcpServer(self.gateway,Token())
    def test_aliases_are_exactly_four_provider_safe_names(self):
        names=[tool["name"] for tool in self.server.handle(rpc("tools/list"))["result"]["tools"]]
        self.assertEqual(names,[TOOL_ALIASES[name] for name in CANONICAL_TOOLS]); self.assertEqual(len(names),4); self.assertTrue(all("." not in name for name in names))
    def test_alias_maps_to_canonical_action_and_provenance_is_preserved(self):
        response=self.server.handle(rpc("tools/call",{"name":"knowledge_search","arguments":{"query":"ATHRTY CRM"}}))
        self.assertFalse(response["result"]["isError"]); self.assertEqual(self.gateway.calls[0],("search",{"query":"ATHRTY CRM"},"user-token")); self.assertIn("citation",response["result"]["structuredContent"]["data"]["hits"][0])
    def test_strict_validation_rejects_bad_inputs_and_extra_fields(self):
        for args in ({},{"query":""},{"query":"x","limit":51},{"query":"x","owner_user_id":"nope"}):
            with self.assertRaises(ContractError): validate_arguments("knowledge.search",args)
        with self.assertRaises(ContractError): validate_arguments("knowledge.get_document",{"document_id":"bad"})
    def test_protocol_initialize_and_unknown_tool(self):
        self.assertEqual(self.server.handle(rpc("initialize"))["result"]["serverInfo"]["name"],"knowledge-mcp")
        self.assertEqual(self.server.handle(rpc("tools/call",{"name":"knowledge.search","arguments":{"query":"x","extra":1}}))["error"]["code"],-32602)
if __name__ == "__main__": unittest.main()