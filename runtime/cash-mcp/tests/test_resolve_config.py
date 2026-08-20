from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[1]))

from resolve_config import ConfigError, resolve_config


class ResolveConfigTests(unittest.TestCase):
    def test_resolves_from_env(self, monkeypatch=None):
        import os

        with tempfile.TemporaryDirectory() as tmp:
            env = {
                "CASH_MCP_SUPABASE_URL": "https://proj.supabase.co",
                "CASH_MCP_SUPABASE_PUBLISHABLE_KEY": "publishable",
                "CASH_MCP_BOUND_USER_ID": "user-1",
            }
            old = {key: os.environ.get(key) for key in env}
            os.environ.update(env)
            try:
                config = resolve_config(tmp)
            finally:
                for key, value in old.items():
                    if value is None:
                        os.environ.pop(key, None)
                    else:
                        os.environ[key] = value
            self.assertEqual(config.supabase_url, "https://proj.supabase.co")
            self.assertEqual(config.gateway_endpoint, "https://proj.supabase.co/functions/v1/cash-mcp-read")
            self.assertEqual(config.bound_user_id, "user-1")

    def test_resolves_from_private_file_and_missing_field_raises(self):
        import os

        for key in ("CASH_MCP_SUPABASE_URL", "CASH_MCP_SUPABASE_PUBLISHABLE_KEY", "CASH_MCP_BOUND_USER_ID"):
            os.environ.pop(key, None)

        with tempfile.TemporaryDirectory() as tmp:
            Path(tmp, "config.json").write_text(
                json.dumps({"supabase_url": "https://proj.supabase.co", "publishable_key": "key"})
            )
            with self.assertRaises(ConfigError):
                resolve_config(tmp)


if __name__ == "__main__":
    unittest.main()
