import unittest

from cash_cli.scoring import score_prospect


class ScoreProspectTests(unittest.TestCase):
    def test_routes_operationally_complex_prospect_to_authority(self):
        bundle = {
            "profile": {
                "confidence": 0.9,
                "evidence_quality_score": 90,
                "source_coverage_count": 4,
                "signals": {
                    "has_quote_or_estimate_cta": True,
                    "has_form": True,
                    "service_mentions": 8,
                    "location_mentions": 2,
                },
                "operations_complexity_score": 92,
                "conversion_gap_score": 78,
                "website_quality_score": 42,
                "brand_maturity_score": 55,
                "contactability_score": 92,
                "market_visibility_score": 70,
                "best_fit": "athrty",
            },
            "contacts": [
                {
                    "contact_quality_score": 93,
                    "decision_maker_score": 88,
                }
            ],
            "provider_keys": [],
            "policy": {
                "provider_order": ["google_places", "dataforseo"],
                "paid_enrichment_min_priority": 72,
                "paid_enrichment_min_uncertainty": 25,
                "paid_enrichment_max_uncertainty": 70,
            },
        }
        result = score_prospect(bundle)
        self.assertEqual(
            result.explanation["routing"]["brand_key"],
            "authority-systems",
        )
        self.assertGreater(
            result.update["athrty_fit_score"],
            result.update["truett_fit_score"],
        )
        self.assertIn(
            result.update["prospect_tier"],
            {"A", "B", "C", "hold"},
        )
        self.assertEqual(
            result.update["score_version"],
            "cashos-prospect-v2-local",
        )

    def test_semrush_marks_premium_cost_tier(self):
        bundle = {
            "profile": {
                "confidence": 0.5,
                "evidence_quality_score": 50,
                "source_coverage_count": 1,
                "signals": {},
            },
            "contacts": [],
            "provider_keys": ["semrush"],
            "policy": {},
        }
        result = score_prospect(bundle)
        self.assertEqual(
            result.update["research_cost_tier"],
            "premium_optional",
        )

    def test_empty_input_never_produces_nan(self):
        result = score_prospect(
            {
                "profile": {},
                "contacts": [],
                "provider_keys": [],
                "policy": {},
            }
        )
        for key in (
            "athrty_fit_score",
            "truett_fit_score",
            "overall_score",
            "commercial_priority_score",
            "data_sufficiency_score",
        ):
            self.assertIsInstance(result.update[key], float)
            self.assertGreaterEqual(result.update[key], 0)
            self.assertLessEqual(result.update[key], 100)


if __name__ == "__main__":
    unittest.main()
