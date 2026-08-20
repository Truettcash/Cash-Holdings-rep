"""Live entry point invoked by the generated ~/.local/bin/cash-mcp launcher.

Wires GatewayClient + TokenProvider + CashMcpServer from resolved runtime
configuration and private auth state. Contains no business logic — that
remains in cash_project.py / cash_gateway.py / cash_mcp_server.py.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from cash_auth_provider import TokenProvider
from cash_auth_transport import SupabaseUserAuthTransport
from cash_gateway import GatewayClient
from cash_mcp_server import CashMcpServer, serve_lines
from resolve_config import ConfigError, resolve_config


def build_server(state_root: str = "~/.cash-mcp") -> CashMcpServer:
    config = resolve_config()
    transport = SupabaseUserAuthTransport(config.supabase_url, config.publishable_key)
    token_provider = TokenProvider(
        config.bound_user_id,
        state_root=state_root,
        refresh=transport.refresh,
    )
    gateway = GatewayClient(config.gateway_endpoint, config.publishable_key)
    return CashMcpServer(gateway, token_provider)


def main() -> None:
    try:
        server = build_server()
    except ConfigError as exc:
        sys.stderr.write(f"cash-mcp configuration error: {exc}\n")
        raise SystemExit(2)
    serve_lines(server)


if __name__ == "__main__":
    main()
