"""One-time fresh dedicated Cash user session bootstrap.

Run this manually in a local terminal:

    python runtime/bootstrap/bootstrap_cash_session.py --email you@example.com

The password is read with getpass (non-echoing) and is never logged, never
passed as a CLI argument, never written to disk, and never printed. Only the
minimum refresh-capable state is persisted, via TokenProvider's atomic
0700/0600 writer. The access token is never persisted.
"""

from __future__ import annotations

import argparse
import getpass
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[1] / "cash-mcp"))

from cash_auth_provider import TokenProvider
from cash_auth_transport import AuthTransportError, SupabaseUserAuthTransport
from resolve_config import ConfigError, _load_private_config, resolve_config


def bootstrap(
    email: str,
    state_root: str = "~/.cash-mcp",
    *,
    password_reader=lambda prompt: getpass.getpass(prompt),
    transport_factory=SupabaseUserAuthTransport,
) -> str:
    """Perform the password grant and persist only refresh-capable state.

    Returns the bound user id on success. Raises on any failure; never
    prints the password or any token value. ``password_reader`` and
    ``transport_factory`` are injectable so tests never touch a real
    terminal or network.
    """
    try:
        config = resolve_config(state_root)
    except ConfigError:
        # Bound user id is not yet known before bootstrap; require only the
        # project fields, from env or the same private config.json resolve_config uses.
        import os

        private = _load_private_config(Path(state_root).expanduser())
        supabase_url = os.environ.get("CASH_MCP_SUPABASE_URL") or private.get("supabase_url")
        publishable_key = os.environ.get("CASH_MCP_SUPABASE_PUBLISHABLE_KEY") or private.get("publishable_key")
        if not supabase_url or not publishable_key:
            raise ConfigError(
                "set CASH_MCP_SUPABASE_URL and CASH_MCP_SUPABASE_PUBLISHABLE_KEY, "
                "or add 'supabase_url'/'publishable_key' to "
                f"{Path(state_root).expanduser() / 'config.json'}"
            )
    else:
        supabase_url, publishable_key = config.supabase_url, config.publishable_key

    password = password_reader(f"Cash password for {email}: ")
    transport = transport_factory(supabase_url, publishable_key)
    try:
        session = transport.password_grant(email, password)
    finally:
        password = None  # noqa: F841 - drop reference as early as possible

    provider = TokenProvider(session["user_id"], state_root=state_root)
    provider._accept_refresh(session)  # persists refresh state; access token stays memory-only
    return session["user_id"]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--email", required=True)
    parser.add_argument("--state-root", default="~/.cash-mcp")
    args = parser.parse_args()

    try:
        user_id = bootstrap(args.email, args.state_root)
    except (AuthTransportError, ConfigError) as exc:
        print(f"Bootstrap failed: {exc}", file=sys.stderr)
        raise SystemExit(1)

    print(f"Cash session bootstrapped for bound user id: {user_id}")
    print("Set CASH_MCP_BOUND_USER_ID to this value for cash-mcp-main.")


if __name__ == "__main__":
    main()
