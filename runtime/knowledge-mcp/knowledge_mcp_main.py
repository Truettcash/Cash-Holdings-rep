"""Knowledge MCP entry point using the existing bound Cash user session."""
from __future__ import annotations
import sys
from pathlib import Path
ROOT=Path(__file__).parents[1] / "cash-mcp"
sys.path.insert(0,str(ROOT))
from cash_auth_provider import TokenProvider
from cash_auth_transport import SupabaseUserAuthTransport
from resolve_config import resolve_config
from knowledge_gateway import KnowledgeGateway
from knowledge_mcp_server import KnowledgeMcpServer, serve_lines
def main() -> None:
    config=resolve_config(); transport=SupabaseUserAuthTransport(config.supabase_url,config.publishable_key)
    token=TokenProvider(config.bound_user_id,state_root="~/.cash-mcp",refresh=transport.refresh)
    gateway=KnowledgeGateway(f"{config.supabase_url.rstrip('/')}/functions/v1/knowledge-mcp-read",config.publishable_key)
    serve_lines(KnowledgeMcpServer(gateway,token))
if __name__ == "__main__": main()