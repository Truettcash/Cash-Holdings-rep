from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[1]))

from cash_operator_router import (
    INTENT_DIAGNOSTIC,
    INTENT_EVIDENCE,
    INTENT_INTELLIGENCE,
    INTENT_OPERATING,
    build_problem_object,
    classify_intent,
    run_diagnostic_workflow,
)


class RouterTests(unittest.TestCase):
    def test_operating_classification(self):
        self.assertEqual(classify_intent("What projects are currently active?"), INTENT_OPERATING)

    def test_evidence_classification(self):
        self.assertEqual(classify_intent("What do we know about ATHRTY CRM?"), INTENT_EVIDENCE)

    def test_intelligence_classification(self):
        self.assertEqual(classify_intent("What intelligence are we tracking about ATHRTY CRM?"), INTENT_INTELLIGENCE)

    def test_diagnostic_classification(self):
        self.assertEqual(classify_intent("What recurring pattern and likely constraint do we see in ATHRTY CRM?"), INTENT_DIAGNOSTIC)

    def test_ambiguous_factual_query_not_diagnostic(self):
        self.assertNotEqual(classify_intent("What is the schema for the CRM record?"), INTENT_DIAGNOSTIC)

    def test_diagnostic_requires_evidence_before_pattern_call(self):
        result = run_diagnostic_workflow("Diagnose this.", {}, diagnostic_primitive=lambda problem: True)
        self.assertFalse(result["finalize"])
        self.assertEqual(result["status"], "DIAGNOSTIC_INSUFFICIENT_EVIDENCE")

    def test_diagnostic_problem_assembled_from_retrieved_evidence_only(self):
        evidence = {
            "observed": ["ATHRTY CRM has a foundation stage"],
            "derived": ["Foundation is established"],
            "constraints": ["visibility"],
            "structural_signature": {"visibility_gap": 0.9},
            "scope": "ATHRTY CRM",
        }
        problem = build_problem_object(evidence)
        self.assertEqual(problem["observed"], ["ATHRTY CRM has a foundation stage"])
        self.assertEqual(problem["constraints"], ["visibility"])
        self.assertIn("structural_signature", problem)

    def test_diagnostic_finish_requires_pattern_primitive(self):
        evidence = {"observed": ["State is unclear", "No trace exists"]}
        result = run_diagnostic_workflow("Diagnose this.", evidence, diagnostic_primitive=None)
        self.assertFalse(result["finalize"])
        self.assertFalse(result["pattern_diagnostic_executed"])

    def test_operating_query_does_not_call_pattern_engine(self):
        result = run_diagnostic_workflow("What projects are currently active?", {"observed": ["project data"]}, diagnostic_primitive=lambda _: True)
        self.assertEqual(result["intent"], INTENT_OPERATING)
        self.assertFalse(result["pattern_diagnostic_executed"])

    def test_library_discovery_stays_separate(self):
        self.assertEqual(classify_intent("What pattern models are available in Cash Intelligence?"), INTENT_INTELLIGENCE)
        self.assertIn("intelligence_list_patterns", " ".join(["intelligence_list_patterns"]))


if __name__ == "__main__":
    unittest.main()
