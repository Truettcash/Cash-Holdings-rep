from __future__ import annotations

import re
from typing import Any, Iterable, Mapping

INTENT_OPERATING = "OPERATING"
INTENT_EVIDENCE = "EVIDENCE"
INTENT_INTELLIGENCE = "INTELLIGENCE"
INTENT_DIAGNOSTIC = "DIAGNOSTIC"

OPERATING_KEYWORDS = (
    "project",
    "projects",
    "active project",
    "active projects",
    "pipeline",
    "what happened",
    "recent activity",
    "status",
    "current status",
    "operating",
    "workflow",
)

EVIDENCE_KEYWORDS = (
    "what do we know",
    "what evidence",
    "what evidence supports",
    "where did this come from",
    "source",
    "supporting evidence",
    "observed evidence",
    "document",
    "know about",
    "evidence",
)

INTELLIGENCE_KEYWORDS = (
    "signal",
    "signals",
    "construct",
    "constructs",
    "intelligence",
    "tracking intelligence",
    "what intelligence",
    "current intelligence",
    "derived intelligence",
)

DIAGNOSTIC_KEYWORDS = (
    "pattern",
    "patterns",
    "recurring",
    "constraint",
    "constraints",
    "diagnose",
    "diagnostic",
    "counterevidence",
    "what does this resemble",
    "what is limiting",
    "missing state",
    "separate observed evidence from derived intelligence",
    "what are we currently seeing",
    "likely constraint",
    "recurring structure",
    "reasoning trace",
    "resemble",
    "structure",
    "diagnosis",
)


def classify_intent(query: str) -> str:
    text = _normalize(query)
    if not text:
        return INTENT_EVIDENCE
    if ("pattern" in text or "patterns" in text) and ("available" in text or "models" in text or "library" in text):
        return INTENT_INTELLIGENCE
    if any(keyword in text for keyword in DIAGNOSTIC_KEYWORDS):
        return INTENT_DIAGNOSTIC
    if any(keyword in text for keyword in OPERATING_KEYWORDS):
        return INTENT_OPERATING
    if any(keyword in text for keyword in EVIDENCE_KEYWORDS):
        return INTENT_EVIDENCE
    if any(keyword in text for keyword in INTELLIGENCE_KEYWORDS):
        return INTENT_INTELLIGENCE
    return INTENT_EVIDENCE


def _normalize(value: str) -> str:
    return re.sub(r"[^a-z0-9\s]", " ", (value or "").lower()).strip()


def tool_plan_for_intent(intent: str) -> list[str]:
    if intent == INTENT_OPERATING:
        return ["cash_list_active_projects", "cash_get_project", "cash_get_pipeline", "cash_get_recent_activity"]
    if intent == INTENT_EVIDENCE:
        return ["knowledge_search", "knowledge_get_context", "knowledge_get_document"]
    if intent == INTENT_INTELLIGENCE:
        return ["intelligence_list_constructs", "intelligence_get_construct", "intelligence_get_signal", "intelligence_get_context"]
    if intent == INTENT_DIAGNOSTIC:
        return [
            "knowledge_search",
            "knowledge_get_context",
            "intelligence_get_context",
            "intelligence_get_construct",
            "intelligence_get_signal",
            "intelligence_match_patterns",
            "intelligence_get_reasoning_trace",
        ]
    return []


def _flatten(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        return [value]
    if isinstance(value, (list, tuple, set)):
        result: list[str] = []
        for item in value:
            result.extend(_flatten(item))
        return result
    return [str(value)]


def build_problem_object(evidence: Mapping[str, Any] | None) -> dict[str, Any]:
    if not evidence:
        return {}
    problem: dict[str, Any] = {}
    observed = _flatten(evidence.get("observed", []))
    derived = _flatten(evidence.get("derived", []))
    symptoms = _flatten(evidence.get("symptoms", []))
    signals = _flatten(evidence.get("signals", []))
    constraints = _flatten(evidence.get("constraints", []))
    context = evidence.get("context")
    flow_paths = _flatten(evidence.get("flow_paths", []))
    expected_outcomes = _flatten(evidence.get("expected_outcomes", []))
    evidence_refs = _flatten(evidence.get("evidence_references", []))
    counterevidence = _flatten(evidence.get("counterevidence", []))
    counterevidence_refs = _flatten(evidence.get("counterevidence_references", []))
    scope = evidence.get("scope")
    structural_signature = evidence.get("structural_signature")
    if isinstance(structural_signature, Mapping):
        problem["structural_signature"] = dict(structural_signature)
    if observed:
        problem["observed"] = observed
    if derived:
        problem["derived"] = derived
    if symptoms:
        problem["symptoms"] = symptoms
    if signals:
        problem["signals"] = signals
    if constraints:
        problem["constraints"] = constraints
    if flow_paths:
        problem["flow_paths"] = flow_paths
    if expected_outcomes:
        problem["expected_outcomes"] = expected_outcomes
    if evidence_refs:
        problem["evidence_references"] = evidence_refs
    if counterevidence:
        problem["counterevidence"] = counterevidence
    if counterevidence_refs:
        problem["counterevidence_references"] = counterevidence_refs
    if scope:
        problem["scope"] = scope
    if context:
        problem["context"] = context
    return problem


def run_diagnostic_workflow(
    query: str,
    evidence: Mapping[str, Any] | None,
    *,
    diagnostic_primitive: Any | None = None,
) -> dict[str, Any]:
    intent = classify_intent(query)
    if intent != INTENT_DIAGNOSTIC:
        return {
            "intent": intent,
            "pattern_diagnostic_executed": False,
            "finalize": True,
            "status": "OK",
            "tool_calls": tool_plan_for_intent(intent),
        }

    if not evidence:
        return {
            "intent": INTENT_DIAGNOSTIC,
            "pattern_diagnostic_executed": False,
            "finalize": False,
            "status": "DIAGNOSTIC_INSUFFICIENT_EVIDENCE",
            "missing_evidence": ["retrieved context required before pattern diagnosis"],
        }

    problem = build_problem_object(evidence)
    if not problem or not problem.get("observed"):
        return {
            "intent": INTENT_DIAGNOSTIC,
            "pattern_diagnostic_executed": False,
            "finalize": False,
            "status": "DIAGNOSTIC_INSUFFICIENT_EVIDENCE",
            "missing_evidence": ["at least one observed evidence item is required"],
            "problem": {},
        }

    if diagnostic_primitive is None:
        return {
            "intent": INTENT_DIAGNOSTIC,
            "pattern_diagnostic_executed": False,
            "finalize": False,
            "status": "DIAGNOSTIC_INSUFFICIENT_EVIDENCE",
            "missing_evidence": ["pattern diagnostic primitive not executed"],
            "problem": problem,
        }

    invoked = diagnostic_primitive(problem)
    if not invoked:
        return {
            "intent": INTENT_DIAGNOSTIC,
            "pattern_diagnostic_executed": False,
            "finalize": False,
            "status": "DIAGNOSTIC_INSUFFICIENT_EVIDENCE",
            "missing_evidence": ["pattern diagnostic primitive failed"],
            "problem": problem,
        }

    return {
        "intent": INTENT_DIAGNOSTIC,
        "pattern_diagnostic_executed": True,
        "finalize": True,
        "status": "OK",
        "problem": problem,
        "tool_calls": tool_plan_for_intent(INTENT_DIAGNOSTIC),
    }


__all__ = [
    "INTENT_OPERATING",
    "INTENT_EVIDENCE",
    "INTENT_INTELLIGENCE",
    "INTENT_DIAGNOSTIC",
    "classify_intent",
    "tool_plan_for_intent",
    "build_problem_object",
    "run_diagnostic_workflow",
]
