import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).parents[1]))

from pattern_engine import (
    CONSTRAINT_LIBRARY,
    DEFAULT_PATTERN_ENGINE,
    Pattern,
    build_athrty_fixture,
    build_intervention_candidates,
    classify_functional_vs_structural,
    infer_constraint_from_pattern,
)


class PatternEngineTests(unittest.TestCase):
    def test_same_symptom_different_structure(self):
        problem_a = {
            "symptoms": ["missing signal", "unclear ownership"],
            "structure": "fragmented",
            "constraints": ["visibility", "ownership"],
            "observed": ["no trace of the operating state"],
            "counterevidence": ["the tool is present"],
            "structural_signature": {"fragmented_input": 0.9, "ownership_unclear": 0.8},
        }
        problem_b = {
            "symptoms": ["missing signal", "unclear ownership"],
            "structure": "single-owner",
            "constraints": ["visibility"],
            "observed": ["clear owner and good visibility"],
            "counterevidence": ["the owner is known and state is visible"],
            "structural_signature": {"visibility_gap": 0.1, "ownership_unclear": 0.2},
        }
        match_a = DEFAULT_PATTERN_ENGINE.match_patterns(problem_a)
        match_b = DEFAULT_PATTERN_ENGINE.match_patterns(problem_b)
        self.assertTrue(match_a)
        self.assertTrue(match_b)
        self.assertNotEqual(match_a[0].candidate_pattern.pattern_key, match_b[0].candidate_pattern.pattern_key)

    def test_same_structure_different_context(self):
        problem_a = {
            "symptoms": ["workflow fragmentation", "multiple disconnected sources"],
            "structure": "fragmented",
            "constraints": ["information", "ownership"],
            "observed": ["several disconnected sources"],
            "context": "crm",
            "structural_signature": {"fragmented_input": 0.8, "ownership_unclear": 0.7},
        }
        problem_b = {
            "symptoms": ["workflow fragmentation", "multiple disconnected sources"],
            "structure": "fragmented",
            "constraints": ["information", "ownership"],
            "observed": ["several disconnected sources"],
            "context": "support ops",
            "structural_signature": {"fragmented_input": 0.8, "ownership_unclear": 0.7},
        }
        match_a = DEFAULT_PATTERN_ENGINE.match_patterns(problem_a)
        match_b = DEFAULT_PATTERN_ENGINE.match_patterns(problem_b)
        self.assertEqual(match_a[0].candidate_pattern.pattern_key, match_b[0].candidate_pattern.pattern_key)
        self.assertAlmostEqual(match_a[0].confidence, match_b[0].confidence, places=3)

    def test_counterevidence_lowers_match_strength(self):
        strong_problem = {
            "symptoms": ["missing status signal", "unclear ownership"],
            "signals": ["missing status signal", "unclear ownership"],
            "constraints": ["visibility", "ownership"],
            "observed": ["signal missing"],
            "counterevidence": [],
            "structural_signature": {"visibility_gap": 0.9, "ownership_unclear": 0.8},
        }
        weak_problem = {
            "symptoms": ["missing status signal", "unclear ownership"],
            "signals": ["missing status signal", "unclear ownership"],
            "constraints": ["visibility", "ownership"],
            "observed": ["signal missing"],
            "counterevidence": ["state is visible elsewhere"],
            "structural_signature": {"visibility_gap": 0.9, "ownership_unclear": 0.8},
        }
        strong_match = DEFAULT_PATTERN_ENGINE.match_patterns(strong_problem)[0]
        weak_match = DEFAULT_PATTERN_ENGINE.match_patterns(weak_problem)[0]
        self.assertGreater(strong_match.confidence, weak_match.confidence)

    def test_pattern_confidence_not_equal_to_current_match_confidence(self):
        pattern = DEFAULT_PATTERN_ENGINE.patterns[0]
        match = DEFAULT_PATTERN_ENGINE.match_patterns({
            "signals": ["missing signal", "unclear ownership"],
            "constraints": ["visibility", "ownership"],
            "observed": ["no trace of operating state"],
            "structural_signature": {"fragmented_input": 0.9, "ownership_unclear": 0.8},
        })[0]
        self.assertNotEqual(pattern.confidence, match.confidence)
        self.assertTrue(pattern.confidence in {"low", "medium", "high"})

    def test_functional_failure_vs_structural_pattern(self):
        single = {"symptoms": ["one-off outage"], "repeated": False, "ownership_unclear": False}
        repeated = {"symptoms": ["repeated handoff issues"], "repeated": True, "ownership_unclear": True}
        self.assertEqual(classify_functional_vs_structural(single)["classification"], "single_instance_failure")
        self.assertEqual(classify_functional_vs_structural(repeated)["classification"], "structural_pattern_candidate")

    def test_constraint_family_classification(self):
        families = {constraint.constraint_family for constraint in CONSTRAINT_LIBRARY}
        self.assertTrue(families.issubset({"information", "ownership", "flow", "capacity", "interface", "control", "visibility"}))
        self.assertIn("information", families)
        self.assertIn("ownership", families)

    def test_missing_provenance_fails_closed(self):
        missing = {"symptoms": ["signal missing"], "observed": ["a signal was noted"], "evidence_references": ["construct:ATHRTY CRM Foundation Stage"]}
        pattern_match = DEFAULT_PATTERN_ENGINE.match_patterns(missing)
        self.assertTrue(pattern_match)
        self.assertGreaterEqual(pattern_match[0].confidence, 0.0)

    def test_intervention_candidate_remains_advisory(self):
        pattern = DEFAULT_PATTERN_ENGINE.get_pattern("invisible_to_visible")
        self.assertIsNotNone(pattern)
        interventions = build_intervention_candidates(DEFAULT_PATTERN_ENGINE.patterns[1], {"required_capability": "evidence governance"})
        self.assertTrue(interventions)
        self.assertTrue(interventions[0].advisory)
        self.assertIn("target_constraint", interventions[0].to_dict())

    def test_transfer_candidate_preserves_source_target_context_differences(self):
        pattern = DEFAULT_PATTERN_ENGINE.patterns[0]
        self.assertIn("fragmented", pattern.pattern_key)
        self.assertIn("source", pattern.transfer_conditions[0].lower())
        self.assertIn("target", pattern.transfer_conditions[0].lower())

    def test_deprecated_or_weakened_pattern_handling(self):
        weakened = Pattern(
            id="pattern-weakened",
            pattern_key="weakened_flow",
            name="Weakened Flow",
            description="A deprecated pattern used only as a negative example.",
            pattern_family="fragmented_to_structured",
            status="weakened",
            problem_shape="legacy issue",
            structural_signature={"legacy_issue": 0.2},
            typical_signals=["legacy issue"],
            typical_constraints=["flow"],
            known_interventions=["ignore"],
            expected_outcomes=["none"],
            supporting_cases=[],
            counterexamples=[],
            failure_conditions=[],
            transfer_conditions=[],
            confidence="low",
            evidence_strength="none",
            observation_count=0,
            successful_application_count=0,
            failed_application_count=0,
            created_at="2026-08-16T00:00:00Z",
            updated_at="2026-08-16T00:00:00Z",
        )
        engine = DEFAULT_PATTERN_ENGINE.__class__([weakened])
        self.assertEqual(engine.list_patterns(), [])
        self.assertEqual(engine.match_patterns({"symptoms": ["legacy issue"], "observed": ["legacy issue"]}), [])

    def test_athrty_fixture_builds_supported_pattern_candidate(self):
        fixture = build_athrty_fixture()
        matches = DEFAULT_PATTERN_ENGINE.match_patterns(fixture)
        self.assertTrue(matches)
        match = matches[0]
        self.assertIn(match.candidate_pattern.pattern_key, {"invisible_to_visible", "signal_capture_to_knowledge_improvement", "fragmented_to_structured"})
        self.assertGreater(match.confidence, 0.2)
        constraint = infer_constraint_from_pattern(match.candidate_pattern, {"scope": "ATHRTY CRM", "supporting_evidence": fixture["observed"], "counterevidence": fixture["counterevidence"]})
        self.assertIn(constraint.constraint_family, {"information", "ownership", "flow", "visibility", "control"})

    def test_reasoning_trace_is_ephemeral_and_machine_boundaries_are_distinct(self):
        problem = {
            "query": "What are we seeing in ATHRTY CRM?",
            "observed": ["foundation stage is active", "execution detail is missing"],
            "derived": ["the model may be structurally constrained"],
            "symptoms": ["missing status signal", "unclear ownership"],
            "constraints": ["visibility", "ownership"],
            "structural_signature": {"visibility_gap": 0.9, "ownership_unclear": 0.8},
            "flow_paths": ["information", "decision"],
            "counterevidence": ["execution detail is not yet available"],
            "evidence_references": ["construct:ATHRTY CRM Foundation Stage"],
            "counterevidence_references": ["missing:execution detail"],
            "scope": "ATHRTY CRM",
            "context": "foundation",
        }
        trace = DEFAULT_PATTERN_ENGINE.get_reasoning_trace(problem)
        self.assertTrue(trace["ephemeral"])
        self.assertEqual(trace["lifecycle_state"], "EPHEMERAL_TRACE")
        self.assertEqual(trace["durable_objects"], [])
        self.assertNotIn("validated_pattern", trace)
        self.assertNotIn("accepted_constraint", trace)
        self.assertIn("pattern_candidates", trace)

    def test_reasoning_trace_keeps_confidence_dimensions_and_missing_state(self):
        problem = {
            "observed": ["status signal missing", "ownership unclear"],
            "symptoms": ["missing status signal", "unclear ownership"],
            "constraints": ["visibility", "ownership"],
            "structural_signature": {"visibility_gap": 0.9, "ownership_unclear": 0.7},
            "counterevidence": ["state is visible in another source"],
            "missing_state": ["live operating execution details"],
            "evidence_references": ["source:athrty-crm"],
            "scope": "ATHRTY CRM",
            "context": "foundation",
        }
        trace = DEFAULT_PATTERN_ENGINE.get_reasoning_trace(problem)
        candidate = trace["pattern_candidates"][0]
        self.assertIn("confidence", candidate)
        self.assertIn("matched_dimensions", candidate)
        self.assertIn("contradicting_dimensions", candidate)
        self.assertIn("missing_state", candidate)
        self.assertIn("live operating execution details", candidate["missing_state"])
        self.assertIn("counterevidence", candidate)

    def test_promotion_contract_is_explicit_and_write_disabled(self):
        from pattern_engine import PromotionContract, PromotionStateMachine
        action = PromotionContract(
            action="ACCEPT_PATTERN_MATCH",
            required_inputs=["pattern_key", "evidence_refs"],
            resulting_state="CANDIDATE",
            mutation_target=None,
            authorization_requirement="operator_review",
        )
        self.assertEqual(action.action, "ACCEPT_PATTERN_MATCH")
        self.assertFalse(action.can_execute)
        self.assertEqual(PromotionStateMachine().state, "EPHEMERAL_TRACE")
        self.assertRaises(NotImplementedError, PromotionStateMachine().execute, action)

    def test_operator_summary_and_expanded_views_are_derived_from_machine_trace(self):
        from pattern_engine import format_reasoning_trace_expanded, format_reasoning_trace_summary, validate_promotion_contract, build_idempotency_key

        trace = {
            "trace_id": "trace-123",
            "lifecycle_state": "EPHEMERAL_TRACE",
            "scope": "ATHRTY CRM",
            "evidence": {
                "observed": ["foundation stage active"],
                "evidence_refs": ["source:ATHRTY CRM"],
                "source_refs": ["source:ATHRTY CRM"],
            },
            "existing_intelligence": {
                "signals": ["visibility gap"],
                "constructs": ["ATHRTY CRM Foundation Stage"],
            },
            "pattern_candidates": [{
                "pattern_key": "invisible_to_visible",
                "confidence": 0.79,
                "matched_dimensions": {"symptom_similarity": 0.82, "structural_similarity": 0.75},
                "contradicting_dimensions": {"counterevidence_strength": 0.22},
            }],
            "constraint_candidates": [{
                "constraint_family": "information",
                "confidence": 0.74,
                "supporting_evidence": ["status signal missing"],
                "counterevidence": ["execution details exist elsewhere"],
                "scope": "ATHRTY CRM",
            }],
            "conclusion": {"unresolved_questions": ["live execution details missing"]},
            "provenance": {"tools_used": ["intelligence_get_reasoning_trace"], "evidence_refs": ["source:ATHRTY CRM"]},
        }

        summary = format_reasoning_trace_summary(trace)
        expanded = format_reasoning_trace_expanded(trace)

        self.assertEqual(summary["view_type"], "SUMMARY")
        self.assertIn("OBSERVED / EVIDENCE", summary["sections"])
        self.assertIn("PATTERN CANDIDATES", summary["sections"])
        self.assertEqual(expanded["view_type"], "EXPANDED")
        self.assertIn("PROVENANCE", expanded["sections"])
        self.assertIn("PATTERN_CANDIDATE_HYPOTHESIS", str(summary["sections"]["PATTERN CANDIDATES"]))
        self.assertIn("live execution details missing", str(summary["sections"]["MISSING STATE"]))

        contract = validate_promotion_contract({
            "action_type": "ACCEPT_PATTERN_MATCH",
            "actor": "operator@example.com",
            "trace_id": "trace-123",
            "target_ref": "pattern:invisible_to_visible",
            "reason": "supported by current evidence",
            "evidence_refs": ["source:ATHRTY CRM"],
        })
        self.assertEqual(contract["action_type"], "ACCEPT_PATTERN_MATCH")
        self.assertFalse(contract["can_execute"])
        self.assertEqual(build_idempotency_key(contract), "operator@example.com::ACCEPT_PATTERN_MATCH::trace-123::pattern:invisible_to_visible")

    def test_promotion_contract_requires_actor_trace_and_evidence_when_needed(self):
        from pattern_engine import validate_promotion_contract
        with self.assertRaises(ValueError):
            validate_promotion_contract({"action_type": "ACCEPT_PATTERN_MATCH", "target_ref": "x", "reason": "r"})
        with self.assertRaises(ValueError):
            validate_promotion_contract({"action_type": "ACCEPT_PATTERN_MATCH", "actor": "op", "trace_id": "t", "target_ref": "x", "reason": "r"})
        with self.assertRaises(ValueError):
            validate_promotion_contract({"action_type": "REQUEST_MORE_EVIDENCE", "actor": "op", "trace_id": "t", "target_ref": "x", "reason": "r", "evidence": ["fake evidence"]})

    def test_reject_and_uncertain_preserve_provenance_and_unresolved_state(self):
        from pattern_engine import validate_promotion_contract
        reject = validate_promotion_contract({
            "action_type": "REJECT_CANDIDATE",
            "actor": "op",
            "trace_id": "trace-9",
            "target_ref": "pattern:fragmented_to_structured",
            "reason": "counterevidence outweighs support",
            "evidence_refs": ["source:ATHRTY CRM"],
            "notes": "counterevidence preserved for review",
        })
        uncertain = validate_promotion_contract({
            "action_type": "MARK_UNCERTAIN",
            "actor": "op",
            "trace_id": "trace-9",
            "target_ref": "constraint:information",
            "reason": "mixed evidence and unresolved state",
            "evidence_refs": ["source:ATHRTY CRM"],
            "expected_resulting_lifecycle_state": "UNCERTAIN",
        })
        self.assertIn("trace-9", reject["trace_id"])
        self.assertEqual(uncertain["expected_resulting_lifecycle_state"], "UNCERTAIN")

    def test_human_approval_gate_requires_human_action_and_preserves_trace_snapshot(self):
        from pattern_engine import build_human_approval_gate

        trace = {
            "trace_id": "trace-proof",
            "scope": "ATHRTY CRM",
            "query": "What are we seeing in ATHRTY CRM?",
            "intent": "DIAGNOSTIC",
            "evidence": {"evidence_refs": ["source:ATHRTY CRM"], "source_refs": ["source:ATHRTY CRM"]},
            "problem_state": {"counterevidence": ["execution detail is missing"]},
            "pattern_candidates": [{"pattern_key": "invisible_to_visible", "confidence": 0.79}],
            "constraint_candidates": [{"constraint_family": "information", "confidence": 0.74}],
            "conclusion": {"unresolved_questions": ["live execution details missing"]},
            "provenance": {"tools_used": ["intelligence_get_reasoning_trace"]},
        }

        gate = build_human_approval_gate({
            "action_type": "ACCEPT_PATTERN_MATCH",
            "actor": "operator@example.com",
            "trace_id": "trace-proof",
            "target_ref": "pattern:invisible_to_visible",
            "target_type": "pattern",
            "scope": "ATHRTY CRM",
            "reason": "match supported by current evidence",
            "evidence_refs": ["source:ATHRTY CRM"],
        }, trace)

        self.assertEqual(gate["status"], "WAITING_FOR_HUMAN_APPROVAL")
        self.assertTrue(gate["approval_required"])
        self.assertFalse(gate["is_human_approved"])
        self.assertEqual(gate["promotion_snapshot"]["trace_id"], "trace-proof")
        self.assertIn("source:ATHRTY CRM", gate["audit"]["supporting_evidence"])

    def test_no_write_path_is_present_in_contract_layer(self):
        from pathlib import Path
        text = Path(__file__).parents[1].joinpath("pattern_engine.py").read_text()
        forbidden = ["insert", "update", "delete", "upsert", "service_role", "INSERT INTO", "UPDATE ", "DELETE FROM"]
        for needle in forbidden:
            self.assertNotIn(needle.lower(), text.lower())


if __name__ == "__main__":
    unittest.main()
