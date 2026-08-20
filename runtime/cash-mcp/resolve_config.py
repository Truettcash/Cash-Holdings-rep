"""Resolve non-secret Cash MCP runtime configuration.

Reads only project identifiers and the bound user id from the environment or
from a non-secret private config file. Never reads or resolves passwords,
access tokens, refresh tokens, or service-role keys.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path

_ENV_URL = "CASH_MCP_SUPABASE_URL"
_ENV_KEY = "CASH_MCP_SUPABASE_PUBLISHABLE_KEY"
_ENV_ENDPOINT = "CASH_MCP_GATEWAY_ENDPOINT"
_ENV_BOUND_USER = "CASH_MCP_BOUND_USER_ID"


class ConfigError(RuntimeError):
    """Raised when a required non-secret configuration field is missing."""


@dataclass(frozen=True)
class CashMcpConfig:
    supabase_url: str
    publishable_key: str
    gateway_endpoint: str
    bound_user_id: str


def _load_private_config(state_root: Path) -> dict:
    config_path = state_root / "config.json"
    if not config_path.is_file():
        return {}
    try:
        data = json.loads(config_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ConfigError(f"unreadable config file: {config_path}") from exc
    return data if isinstance(data, dict) else {}


def resolve_config(state_root: str | os.PathLike[str] = "~/.cash-mcp") -> CashMcpConfig:
    root = Path(state_root).expanduser()
    private = _load_private_config(root)

    def field(env_name: str, config_key: str) -> str:
        value = os.environ.get(env_name) or private.get(config_key)
        if not value:
            raise ConfigError(
                f"missing required configuration: set {env_name} or "
                f"'{config_key}' in {root / 'config.json'}"
            )
        return str(value)

    supabase_url = field(_ENV_URL, "supabase_url")
    publishable_key = field(_ENV_KEY, "publishable_key")
    gateway_endpoint = os.environ.get(_ENV_ENDPOINT) or private.get("gateway_endpoint")
    if not gateway_endpoint:
        gateway_endpoint = f"{supabase_url.rstrip('/')}/functions/v1/cash-mcp-read"
    bound_user_id = field(_ENV_BOUND_USER, "bound_user_id")

    return CashMcpConfig(
        supabase_url=supabase_url,
        publishable_key=publishable_key,
        gateway_endpoint=str(gateway_endpoint),
        bound_user_id=bound_user_id,
    )
