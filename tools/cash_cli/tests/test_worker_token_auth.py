import os
import unittest
from unittest.mock import patch

from cash_cli.client import CashCliError, SupabaseConfig


class WorkerTokenAuthTests(unittest.TestCase):
    def test_worker_mode_requires_publishable_token_and_worker_id(self):
        env = {
            "SUPABASE_URL": "https://example.supabase.co",
            "SUPABASE_PUBLISHABLE_KEY": "sb_publishable_example",
            "CASH_WORKER_TOKEN": "worker-token",
            "CASH_WORKER_ID": "test-worker",
        }
        with patch.dict(os.environ, env, clear=True):
            config = SupabaseConfig.from_env()

        self.assertTrue(config.worker_mode)
        self.assertFalse(config.elevated)
        self.assertEqual(config.api_key, "sb_publishable_example")
        self.assertEqual(config.worker_token, "worker-token")
        self.assertEqual(config.worker_id, "test-worker")
        self.assertIsNone(config.bearer_token)

    def test_worker_mode_rejects_missing_worker_id(self):
        env = {
            "SUPABASE_URL": "https://example.supabase.co",
            "SUPABASE_PUBLISHABLE_KEY": "sb_publishable_example",
            "CASH_WORKER_TOKEN": "worker-token",
        }
        with patch.dict(os.environ, env, clear=True):
            with self.assertRaisesRegex(CashCliError, "CASH_WORKER_ID"):
                SupabaseConfig.from_env()

    def test_elevated_mode_takes_precedence_when_explicitly_supplied(self):
        env = {
            "SUPABASE_URL": "https://example.supabase.co",
            "SUPABASE_SECRET_KEY": "sb_secret_example",
            "SUPABASE_PUBLISHABLE_KEY": "sb_publishable_example",
            "CASH_WORKER_TOKEN": "worker-token",
            "CASH_WORKER_ID": "test-worker",
        }
        with patch.dict(os.environ, env, clear=True):
            config = SupabaseConfig.from_env()

        self.assertFalse(config.worker_mode)
        self.assertTrue(config.elevated)
        self.assertEqual(config.api_key, "sb_secret_example")
        self.assertIsNone(config.bearer_token)


if __name__ == "__main__":
    unittest.main()
