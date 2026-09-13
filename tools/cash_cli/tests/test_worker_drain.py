import argparse
import unittest
from unittest.mock import patch

from cash_cli import main


class FakeClient:
    def __init__(self):
        self.calls = []

    def rpc(self, name, body):
        self.calls.append((name, body))
        if name == "cash_cli_worker_heartbeat":
            return {"ok": True}
        if name == "cash_cli_claim_jobs":
            return [
                {
                    "id": "11111111-1111-1111-1111-111111111111",
                    "subject_id": "22222222-2222-2222-2222-222222222222",
                    "job_type": "prospect_score",
                }
            ]
        if name == "cash_cli_prospect_score_input":
            return {
                "profile": {
                    "confidence": 0.9,
                    "evidence_quality_score": 90,
                    "source_coverage_count": 4,
                    "signals": {"has_quote_or_estimate_cta": True},
                    "operations_complexity_score": 90,
                    "conversion_gap_score": 70,
                    "website_quality_score": 45,
                    "brand_maturity_score": 55,
                    "contactability_score": 90,
                    "market_visibility_score": 60,
                    "best_fit": "athrty",
                },
                "contacts": [
                    {
                        "contact_quality_score": 90,
                        "decision_maker_score": 85,
                    }
                ],
                "provider_keys": [],
                "policies": {
                    "authority-systems": {
                        "provider_order": ["google_places", "dataforseo"],
                        "paid_enrichment_min_priority": 72,
                        "paid_enrichment_min_uncertainty": 25,
                        "paid_enrichment_max_uncertainty": 70,
                    }
                },
            }
        if name == "cash_cli_apply_prospect_score":
            return {"ok": True, "execution_plane": "local_cli"}
        if name == "cash_cli_complete_job":
            return {"ok": True, "state": "succeeded"}
        raise AssertionError(f"unexpected rpc: {name}")


class WorkerDrainTests(unittest.TestCase):
    def test_claims_scores_applies_and_completes_job(self):
        client = FakeClient()
        args = argparse.Namespace(
            limit=1,
            lease_seconds=300,
            retry_delay_seconds=60,
        )

        with patch.object(main, "_client", return_value=client), patch.object(
            main, "_worker_id", return_value="test-worker"
        ):
            exit_code = main.cmd_worker_drain(args)

        self.assertEqual(exit_code, 0)
        names = [name for name, _ in client.calls]
        self.assertEqual(names[0], "cash_cli_worker_heartbeat")
        self.assertEqual(names[1], "cash_cli_claim_jobs")
        self.assertIn("cash_cli_apply_prospect_score", names)
        self.assertIn("cash_cli_complete_job", names)
        self.assertNotIn("cash_cli_fail_job", names)


if __name__ == "__main__":
    unittest.main()
