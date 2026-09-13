import unittest

from cash_cli.scoring import score_prospect


class RoutedPolicyTests(unittest.TestCase):
    def test_uses_policy_for_computed_routed_brand(self):
        bundle = {
            "profile": {
                "confidence": 0.95,
                "evidence_quality_score": 92,
                "source_coverage_count": 4,
                "signals": {
                    "has_quote_or_estimate_cta": True,
                    "has_form": True,
                    "service_mentions": 10,
                    "location_mentions": 3,
                },
                "operations_complexity_score": 95,
                "conversion_gap_score": 80,
                "website_quality_score": 45,
                "brand_maturity_score": 55,
                "contactability_score": 95,
                "market_visibility_score": 70,
                "best_fit": "athrty",
            },
            "contacts": [
                {
                    "contact_quality_score": 95,
                    "decision_maker_score": 90,
                }
            ],
            "provider_keys": [],
            "policies": {
                "authority-systems": {
                    "provider_order": ["dataforseo", "google_places"],
                    "paid_enrichment_min_priority": 0,
                    "paid_enrichment_min_uncertainty": 0,
                    "paid_enrichment_max_uncertainty": 100,
                },
                "truett-cash": {
                    "provider_order": ["google_places", "dataforseo"],
                    "paid_enrichment_min_priority": 100,
                    "paid_enrichment_min_uncertainty": 100,
                    "paid_enrichment_max_uncertainty": 100,
                },
            },
        }

        result = score_prospect(bundle)

        self.assertEqual(
            result.explanation["routing"]["brand_key"],
            "authority-systems",
        )
        self.assertEqual(
            result.explanation["economics"]["provider_ladder"],
            ["dataforseo", "google_places"],
        )
        self.assertEqual(result.research["next_provider"], "dataforseo")


if __name__ == "__main__":
    unittest.main()
