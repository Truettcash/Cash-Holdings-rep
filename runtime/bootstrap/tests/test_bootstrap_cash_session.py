from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[1]))
sys.path.insert(0, str(Path(__file__).parents[2] / "cash-mcp"))

from bootstrap_cash_session import bootstrap


class FakeTransport:
    def __init__(self, supabase_url, publishable_key):
        self.supabase_url = supabase_url
        self.publishable_key = publishable_key

    def password_grant(self, email, password):
        assert password == "super-secret-password"
        return {
            "user_id": "user-42",
            "access_token": "live-access-token",
            "refresh_token": "live-refresh-token",
            "expires_at": 9999999999,
        }


class BootstrapCashSessionTests(unittest.TestCase):
    def test_bootstrap_persists_only_refresh_state_never_password_or_access_token(self):
        import os

        env = {
            "CASH_MCP_SUPABASE_URL": "https://proj.supabase.co",
            "CASH_MCP_SUPABASE_PUBLISHABLE_KEY": "publishable",
        }
        old = {key: os.environ.get(key) for key in env}
        os.environ.update(env)
        try:
            with tempfile.TemporaryDirectory() as tmp:
                user_id = bootstrap(
                    "owner@example.com",
                    state_root=tmp,
                    password_reader=lambda prompt: "super-secret-password",
                    transport_factory=FakeTransport,
                )
                self.assertEqual(user_id, "user-42")
                stored = json.loads((Path(tmp) / "session.json").read_text())
                self.assertEqual(stored["refresh_token"], "live-refresh-token")
                self.assertNotIn("access_token", stored)
                self.assertNotIn("password", stored)
                self.assertNotIn("super-secret-password", json.dumps(stored))
        finally:
            for key, value in old.items():
                if value is None:
                    os.environ.pop(key, None)
                else:
                    os.environ[key] = value

    def test_bootstrap_requires_project_config_when_unresolved(self):
        with tempfile.TemporaryDirectory() as tmp:
            import os

            os.environ.pop("CASH_MCP_SUPABASE_URL", None)
            os.environ.pop("CASH_MCP_SUPABASE_PUBLISHABLE_KEY", None)
            os.environ.pop("CASH_MCP_BOUND_USER_ID", None)
            from resolve_config import ConfigError

            with self.assertRaises(ConfigError):
                bootstrap(
                    "owner@example.com",
                    state_root=tmp,
                    password_reader=lambda prompt: "x",
                    transport_factory=FakeTransport,
                )


if __name__ == "__main__":
    unittest.main()
