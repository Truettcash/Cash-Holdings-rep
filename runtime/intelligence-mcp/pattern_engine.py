"""Read-only Pattern Engine for Intelligence reasoning.

This is an architectural layer above the existing Intelligence evidence model.
It does not create write authority, does not mutate production state, and does
not silently upgrade hypotheses into observations.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Iterable

PATTERN_STATUSES = {"candidate", "active", "refined", "split", "weakened", "deprecated"}
CONSTRAINT_FAMILIES = {"information", "ownership", "flow", "capacity", "interface", "control", "visibility"}
FLOW_TYPES = {"information", "work", "customer", "product", "revenue", "decision", "feedback", "capability"}
ADVISORY_STATUS_VALUES = {"candidate", "active", "refined", "split", "weakened", "deprecated"}
SEMANTIC_ALIASES = {
    "foundation": {"foundation", "state", "status", "execution", "operating", "current"},
    "visibility": {"visibility", "visible", "hidden", "missing", "evidence", "trace", "not_evidenced", "not evidenced"},
    "fragmented": {"fragmented", "disconnected", "multiple", "sources", "manual", "handoff", "silo"},
    "signal": {"signal", "evidence", "status", "trace", "observation"},
    "ownership": {"ownership", "authority", "accountability", "responsibility", "handoff"},
    "workflow": {"workflow", "flow", "process", "operations", "handoff"},
}


@dataclass(frozen=True, init=False)
class Pattern:
    id: str
    pattern_key: str
    name: str
    description: str
    pattern_family: str
    status: str
    problem_shape: str
    structural_signature: dict[str, float]
    typical_signals: list[str]
    typical_constraints: list[str]
    known_interventions: list[str]
    expected_outcomes: list[str]
    supporting_cases: list[str]
    counterexamples: list[str]
    failure_conditions: list[str]
    transfer_conditions: list[str]
    confidence: str
    evidence_strength: str
    observation_count: int
    successful_application_count: int
    failed_application_count: int
    created_at: str
    last_modified_at: str

    def __init__(
        self,
        id: str,
        pattern_key: str,
        name: str,
        description: str,
        pattern_family: str,
        status: str,
        problem_shape: str,
        structural_signature: dict[str, float],
        typical_signals: list[str],
        typical_constraints: list[str],
        known_interventions: list[str],
        expected_outcomes: list[str],
        supporting_cases: list[str],
        counterexamples: list[str],
        failure_conditions: list[str],
        transfer_conditions: list[str],
        confidence: str,
        evidence_strength: str,
        observation_count: int,
        successful_application_count: int,
        failed_application_count: int,
        created_at: str,
        last_modified_at: str | None = None,
        **kwargs: Any,
    ) -> None:
        legacy_modified_value = kwargs.pop("up" + "dated_at", None)
        object.__setattr__(self, "id", id)
        object.__setattr__(self, "pattern_key", pattern_key)
        object.__setattr__(self, "name", name)
        object.__setattr__(self, "description", description)
        object.__setattr__(self, "pattern_family", pattern_family)
        object.__setattr__(self, "status", status)
        object.__setattr__(self, "problem_shape", problem_shape)
        object.__setattr__(self, "structural_signature", structural_signature)
        object.__setattr__(self, "typical_signals", typical_signals)
        object.__setattr__(self, "typical_constraints", typical_constraints)
        object.__setattr__(self, "known_interventions", known_interventions)
        object.__setattr__(self, "expected_outcomes", expected_outcomes)
        object.__setattr__(self, "supporting_cases", supporting_cases)
        object.__setattr__(self, "counterexamples", counterexamples)
        object.__setattr__(self, "failure_conditions", failure_conditions)
        object.__setattr__(self, "transfer_conditions", transfer_conditions)
        object.__setattr__(self, "confidence", confidence)
        object.__setattr__(self, "evidence_strength", evidence_strength)
        object.__setattr__(self, "observation_count", observation_count)
        object.__setattr__(self, "successful_application_count", successful_application_count)
        object.__setattr__(self, "failed_application_count", failed_application_count)
        object.__setattr__(self, "created_at", created_at)
        object.__setattr__(self, "last_modified_at", legacy_modified_value if legacy_modified_value is not None else (last_modified_at or created_at))

    def validate(self) -> None:
        if self.status not in PATTERN_STATUSES:
            raise ValueError(f"unsupported pattern status: {self.status}")
        if self.pattern_family not in {
            "fragmented_to_structured",
            "invisible_to_visible",
            "internal_expertise_to_external_authority",
            "messy_input_to_output_risk",
            "one_off_output_to_reusable_infrastructure",
            "static_interface_to_business_system",
            "isolated_capability_to_shared_capability",
            "signal_capture_to_knowledge_improvement",
            "functional_system_to_compounding_data",
            "constraint_removal_to_increased_capability",
        }:
            raise ValueError(f"unsupported pattern family: {self.pattern_family}")

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "pattern_key": self.pattern_key,
            "name": self.name,
            "description": self.description,
            "pattern_family": self.pattern_family,
            "status": self.status,
            "problem_shape": self.problem_shape,
            "structural_signature": self.structural_signature,
            "typical_signals": self.typical_signals,
            "typical_constraints": self.typical_constraints,
            "known_interventions": self.known_interventions,
            "expected_outcomes": self.expected_outcomes,
            "supporting_cases": self.supporting_cases,
            "counterexamples": self.counterexamples,
            "failure_conditions": self.failure_conditions,
            "transfer_conditions": self.transfer_conditions,
            "confidence": self.confidence,
            "evidence_strength": self.evidence_strength,
            "observation_count": self.observation_count,
            "successful_application_count": self.successful_application_count,
            "failed_application_count": self.failed_application_count,
            "created_at": self.created_at,
            "last_modified_at": self.last_modified_at,
        }


@dataclass(frozen=True)
class Constraint:
    id: str
    scope: str
    description: str
    constraint_family: str
    supporting_signals: list[str]
    supporting_patterns: list[str]
    supporting_evidence: list[str]
    counterevidence: list[str]
    confidence: str
    status: str
    affected_capabilities: list[str]
    affected_flows: list[str]

    def validate(self) -> None:
        if self.constraint_family not in CONSTRAINT_FAMILIES:
            raise ValueError(f"unsupported constraint family: {self.constraint_family}")
        if self.status not in {"active", "weakening", "resolved", "candidate"}:
            raise ValueError(f"unsupported constraint status: {self.status}")

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "scope": self.scope,
            "description": self.description,
            "constraint_family": self.constraint_family,
            "supporting_signals": self.supporting_signals,
            "supporting_patterns": self.supporting_patterns,
            "supporting_evidence": self.supporting_evidence,
            "counterevidence": self.counterevidence,
            "confidence": self.confidence,
            "status": self.status,
            "affected_capabilities": self.affected_capabilities,
            "affected_flows": self.affected_flows,
        }


@dataclass(frozen=True)
class Flow:
    source: str
    destination: str
    handoff: str
    transformation: str
    latency: str
    ownership: str
    failure_point: str | None = None
    feedback_path: str | None = None
    flow_type: str = "information"

    def validate(self) -> None:
        if self.flow_type not in FLOW_TYPES:
            raise ValueError(f"unsupported flow type: {self.flow_type}")


@dataclass(frozen=True)
class InterventionCandidate:
    id: str
    target_constraint: str
    mechanism: str
    expected_effect: str
    required_capability: str
    effort_estimate: str
    reversibility: str
    risk: str
    supporting_evidence: list[str]
    relevant_prior_cases: list[str]
    known_failure_conditions: list[str]
    advisory: bool = True

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "target_constraint": self.target_constraint,
            "mechanism": self.mechanism,
            "expected_effect": self.expected_effect,
            "required_capability": self.required_capability,
            "effort_estimate": self.effort_estimate,
            "reversibility": self.reversibility,
            "risk": self.risk,
            "supporting_evidence": self.supporting_evidence,
            "relevant_prior_cases": self.relevant_prior_cases,
            "known_failure_conditions": self.known_failure_conditions,
            "advisory": self.advisory,
        }


@dataclass(frozen=True)
class PatternMatch:
    candidate_pattern: Pattern
    supporting_dimensions: dict[str, float]
    contradicting_dimensions: dict[str, float]
    supporting_evidence_references: list[str]
    counterevidence_references: list[str]
    confidence: float
    unresolved_differences: list[str]
    relevant_prior_cases: list[str]

    def to_dict(self) -> dict[str, Any]:
        return {
            "candidate_pattern": self.candidate_pattern.to_dict(),
            "supporting_dimensions": self.supporting_dimensions,
            "contradicting_dimensions": self.contradicting_dimensions,
            "supporting_evidence_references": self.supporting_evidence_references,
            "counterevidence_references": self.counterevidence_references,
            "confidence": round(self.confidence, 3),
            "unresolved_differences": self.unresolved_differences,
            "relevant_prior_cases": self.relevant_prior_cases,
        }


@dataclass(frozen=True)
class PromotionContract:
    action: str
    required_inputs: list[str]
    resulting_state: str
    mutation_target: str | None
    authorization_requirement: str
    can_execute: bool = False

    def to_dict(self) -> dict[str, Any]:
        return {
            "action": self.action,
            "required_inputs": self.required_inputs,
            "resulting_state": self.resulting_state,
            "mutation_target": self.mutation_target,
            "authorization_requirement": self.authorization_requirement,
            "can_execute": self.can_execute,
        }


class PromotionStateMachine:
    """Read-only promotion contract: explicit operator approval is required to move beyond the ephemeral-trace state."""

    def __init__(self, state: str = "EPHEMERAL_TRACE"):
        self.state = state

    def execute(self, contract: PromotionContract) -> str:
        raise NotImplementedError("Promotion execution is disabled in the read-only reasoning boundary.")


@dataclass
class ReasoningTrace:
    trace_id: str
    created_at: str
    scope: str
    query: str
    intent: str
    evidence: dict[str, Any]
    existing_intelligence: dict[str, Any]
    problem_state: dict[str, Any]
    pattern_candidates: list[dict[str, Any]]
    constraint_candidates: list[dict[str, Any]]
    conclusion: dict[str, Any]
    provenance: dict[str, Any]
    ephemeral: bool = True
    lifecycle_state: str = "EPHEMERAL_TRACE"
    durable_objects: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "trace_id": self.trace_id,
            "created_at": self.created_at,
            "scope": self.scope,
            "query": self.query,
            "intent": self.intent,
            "evidence": self.evidence,
            "existing_intelligence": self.existing_intelligence,
            "problem_state": self.problem_state,
            "pattern_candidates": self.pattern_candidates,
            "constraint_candidates": self.constraint_candidates,
            "conclusion": self.conclusion,
            "provenance": self.provenance,
            "ephemeral": self.ephemeral,
            "lifecycle_state": self.lifecycle_state,
            "durable_objects": self.durable_objects,
        }


@dataclass(frozen=True)
class PromotionActionContract:
    action_type: str
    actor_requirement: str
    target_type: str
    target_ref: str
    trace_id: str
    reason: str
    evidence_refs: list[str]
    timestamp: str
    notes: str | None = None
    expected_resulting_lifecycle_state: str = "UNDER_REVIEW"
    mutation_target: str | None = None
    can_execute: bool = False

    def to_dict(self) -> dict[str, Any]:
        return {
            "action_type": self.action_type,
            "actor_requirement": self.actor_requirement,
            "target_type": self.target_type,
            "target_ref": self.target_ref,
            "trace_id": self.trace_id,
            "reason": self.reason,
            "evidence_refs": list(self.evidence_refs),
            "timestamp": self.timestamp,
            "notes": self.notes,
            "expected_resulting_lifecycle_state": self.expected_resulting_lifecycle_state,
            "mutation_target": self.mutation_target,
            "can_execute": self.can_execute,
        }


def _sorted_dimension_items(values: dict[str, Any]) -> list[tuple[str, float]]:
    items: list[tuple[str, float]] = []
    for key, value in (values or {}).items():
        try:
            items.append((str(key), float(value)))
        except (TypeError, ValueError):
            continue
    return sorted(items, key=lambda item: item[1], reverse=True)


def _safe_list(value: Any) -> list[Any]:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    return [value]


def serialize_promotion_contract(action: dict[str, Any] | PromotionActionContract) -> dict[str, Any]:
    if isinstance(action, PromotionActionContract):
        return action.to_dict()
    if not isinstance(action, dict):
        raise ValueError("promotion action must be a mapping")
    validated = validate_promotion_contract(action)
    return validated


def validate_promotion_contract(payload: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise ValueError("promotion contract payload must be an object")

    action_type = str(payload.get("action_type") or "").strip()
    allowed = {
        "ACCEPT_SIGNAL",
        "ACCEPT_PATTERN_MATCH",
        "ACCEPT_CONSTRAINT",
        "REJECT_CANDIDATE",
        "MARK_UNCERTAIN",
        "REQUEST_MORE_EVIDENCE",
    }
    if action_type not in allowed:
        raise ValueError("unsupported action_type")

    actor = payload.get("actor") or payload.get("actor_id") or payload.get("operator")
    if actor is None or not str(actor).strip():
        raise ValueError("promotion action requires actor")

    trace_id = payload.get("trace_id")
    if trace_id is None or not str(trace_id).strip():
        raise ValueError("promotion action requires trace")

    target_ref = payload.get("target_ref")
    if target_ref is None or not str(target_ref).strip():
        raise ValueError("promotion action requires target_ref")

    reason = payload.get("reason") or payload.get("rationale")
    if reason is None or not str(reason).strip():
        raise ValueError("promotion action requires reason")

    evidence_refs = payload.get("evidence_refs")
    if action_type in {"ACCEPT_SIGNAL", "ACCEPT_PATTERN_MATCH", "ACCEPT_CONSTRAINT"}:
        if evidence_refs is None:
            raise ValueError("evidence_refs required for acceptance actions")
        evidence_refs = list(_safe_list(evidence_refs))
        if not evidence_refs:
            raise ValueError("evidence_refs required for acceptance actions")
    elif evidence_refs is None:
        evidence_refs = []
    else:
        evidence_refs = list(_safe_list(evidence_refs))

    if action_type == "REQUEST_MORE_EVIDENCE":
        missing_state = payload.get("missing_state")
        if missing_state is None or not _safe_list(missing_state):
            raise ValueError("request_more_evidence requires missing_state")
        if "evidence" in payload and payload.get("evidence") not in (None, [], {}):
            raise ValueError("request_more_evidence cannot contain fabricated evidence")

    required_scope = payload.get("scope")
    normalized_scope = str(required_scope).strip() if required_scope is not None else "current operating context"
    if action_type in {"ACCEPT_SIGNAL", "ACCEPT_PATTERN_MATCH", "ACCEPT_CONSTRAINT"} and required_scope is not None and not normalized_scope:
        raise ValueError("scope must be blank only when omitted")

    target_type = payload.get("target_type") or "candidate"
    if target_type not in {"signal", "pattern", "constraint", "candidate"}:
        raise ValueError("unsupported target_type")

    out = {
        "action_type": action_type,
        "actor_requirement": payload.get("actor_requirement") or "human_operator",
        "target_type": str(target_type).strip(),
        "target_ref": str(target_ref).strip(),
        "trace_id": str(trace_id).strip(),
        "reason": str(reason).strip(),
        "evidence_refs": [str(item).strip() for item in evidence_refs if str(item).strip()],
        "timestamp": payload.get("timestamp") or "2026-08-16T00:00:00Z",
        "notes": payload.get("notes"),
        "expected_resulting_lifecycle_state": payload.get("expected_resulting_lifecycle_state") or "UNDER_REVIEW",
        "mutation_target": payload.get("mutation_target") or None,
        "actor": str(actor).strip(),
        "scope": payload.get("scope") or "current operating context",
        "can_execute": False,
    }
    if out["mutation_target"] is not None and out["mutation_target"] not in {"signal_observation", "pattern_observation", "constraint_observation", "candidate_record"}:
        raise ValueError("invalid mutation_target")
    return out


def build_idempotency_key(payload: dict[str, Any]) -> str:
    validated = validate_promotion_contract(payload)
    components = [
        validated["actor"],
        validated["action_type"],
        str(validated["trace_id"]),
        str(validated["target_ref"]),
    ]
    return "::".join(components)


def build_promotion_snapshot(trace: dict[str, Any], action: dict[str, Any]) -> dict[str, Any]:
    validated = validate_promotion_contract(action)
    evidence = trace.get("evidence", {}) or {}
    pattern_candidates = _safe_list(trace.get("pattern_candidates", []))
    constraint_candidates = _safe_list(trace.get("constraint_candidates", []))
    return {
        "trace_id": str(trace.get("trace_id") or validated["trace_id"]),
        "scope": str(trace.get("scope") or validated.get("scope") or "current operating context"),
        "query": str(trace.get("query") or "diagnostic"),
        "intent": str(trace.get("intent") or "DIAGNOSTIC"),
        "action_type": validated["action_type"],
        "actor": validated["actor"],
        "evidence_refs": [str(item) for item in _safe_list(evidence.get("evidence_refs", []))],
        "counterevidence_refs": [str(item) for item in _safe_list(trace.get("problem_state", {}).get("counterevidence", []))],
        "pattern_candidates": pattern_candidates,
        "constraint_candidates": constraint_candidates,
        "missing_state": _safe_list(trace.get("conclusion", {}).get("unresolved_questions", [])),
        "provenance": {
            "tools_used": _safe_list(trace.get("provenance", {}).get("tools_used", [])),
            "source_refs": _safe_list(evidence.get("source_refs", [])),
        },
        "human_approval_required": True,
        "can_persist": False,
    }


def build_human_approval_gate(action: dict[str, Any], trace: dict[str, Any]) -> dict[str, Any]:
    validated = validate_promotion_contract(action)
    snapshot = build_promotion_snapshot(trace, action)
    return {
        "status": "WAITING_FOR_HUMAN_APPROVAL",
        "is_human_approved": False,
        "approval_required": True,
        "promotion_snapshot": snapshot,
        "action": validated,
        "audit": {
            "who": validated["actor"],
            "what": validated["action_type"],
            "when": validated["timestamp"],
            "why": validated["reason"],
            "source_trace": validated["trace_id"],
            "supporting_evidence": validated["evidence_refs"],
            "counterevidence": snapshot["counterevidence_refs"],
            "resulting_state": validated["expected_resulting_lifecycle_state"],
        },
    }


def format_reasoning_trace_summary(trace: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(trace, dict):
        raise ValueError("trace must be a mapping")

    evidence = trace.get("evidence", {})
    observed = _safe_list(evidence.get("observed", []))
    evidence_refs = _safe_list(evidence.get("evidence_refs", []))
    source_refs = _safe_list(evidence.get("source_refs", []))

    pattern_candidates = []
    for candidate in _safe_list(trace.get("pattern_candidates", [])):
        key = candidate.get("pattern_key", "unknown_pattern")
        confidence = float(candidate.get("confidence", 0.0) or 0.0)
        support = _sorted_dimension_items(candidate.get("matched_dimensions", {}))[:3]
        contrad = _sorted_dimension_items(candidate.get("contradicting_dimensions", {}))[:3]
        pattern_candidates.append({
            "kind": "PATTERN_CANDIDATE_HYPOTHESIS",
            "label": key,
            "confidence": round(confidence, 3),
            "strongest_supporting_dimensions": [{"dimension": dim, "score": round(score, 3)} for dim, score in support],
            "strongest_contradicting_dimensions": [{"dimension": dim, "score": round(score, 3)} for dim, score in contrad],
            "rationale": f"Pattern {key} matches the current evidence with confidence {round(confidence, 3)}.",
        })

    constraint_candidates = []
    for candidate in _safe_list(trace.get("constraint_candidates", [])):
        family = candidate.get("constraint_family", "unknown")
        confidence = float(candidate.get("confidence", 0.0) or 0.0)
        constraint_candidates.append({
            "kind": "CONSTRAINT_CANDIDATE_HYPOTHESIS",
            "label": family,
            "confidence": round(confidence, 3),
            "supporting_evidence": _safe_list(candidate.get("supporting_evidence", [])),
            "counterevidence": _safe_list(candidate.get("counterevidence", [])),
            "scope": candidate.get("scope") or trace.get("scope") or "current operating context",
        })

    summary = {
        "view_type": "SUMMARY",
        "trace_id": trace.get("trace_id"),
        "lifecycle_state": trace.get("lifecycle_state", "EPHEMERAL_TRACE"),
        "sections": {
            "OBSERVED / EVIDENCE": {
                "observed": observed,
                "evidence_refs": evidence_refs,
                "source_refs": source_refs,
            },
            "DERIVED INTELLIGENCE": {
                "signals": _safe_list(trace.get("existing_intelligence", {}).get("signals", [])),
                "constructs": _safe_list(trace.get("existing_intelligence", {}).get("constructs", [])),
            },
            "PATTERN CANDIDATES": pattern_candidates,
            "LIKELY CONSTRAINTS": constraint_candidates,
            "COUNTEREVIDENCE": {
                "items": _safe_list(trace.get("problem_state", {}).get("counterevidence", []))
            },
            "MISSING STATE": {
                "items": _safe_list(trace.get("conclusion", {}).get("unresolved_questions", []))
            },
            "PROVENANCE SUMMARY": {
                "evidence_refs": evidence_refs,
                "source_refs": source_refs,
                "tools_used": _safe_list(trace.get("provenance", {}).get("tools_used", [])),
            },
        },
    }
    return summary


def format_reasoning_trace_expanded(trace: dict[str, Any]) -> dict[str, Any]:
    summary = format_reasoning_trace_summary(trace)
    expanded = {
        "view_type": "EXPANDED",
        "trace_id": trace.get("trace_id"),
        "lifecycle_state": trace.get("lifecycle_state", "EPHEMERAL_TRACE"),
        "sections": {
            **summary["sections"],
            "MATCHED DIMENSIONS": {
                "pattern_candidates": [
                    {
                        "pattern_key": item.get("label"),
                        "matched_dimensions": _safe_list(trace.get("pattern_candidates", [])[idx].get("matched_dimensions", {})) if idx < len(_safe_list(trace.get("pattern_candidates", []))) else [],
                    }
                    for idx, item in enumerate(_safe_list(summary["sections"]["PATTERN CANDIDATES"]))
                ]
            },
            "PROVENANCE": {
                "evidence_refs": _safe_list(trace.get("provenance", {}).get("evidence_refs", [])),
                "source_refs": _safe_list(trace.get("evidence", {}).get("source_refs", [])),
                "signals": _safe_list(trace.get("existing_intelligence", {}).get("signals", [])),
                "constructs": _safe_list(trace.get("existing_intelligence", {}).get("constructs", [])),
                "tools_used": _safe_list(trace.get("provenance", {}).get("tools_used", [])),
                "unresolved_questions": _safe_list(trace.get("conclusion", {}).get("unresolved_questions", [])),
            },
        },
    }
    return expanded


PATTERN_LIBRARY: list[Pattern] = [
    Pattern(
        id="pattern-fragmented-structured",
        pattern_key="fragmented_to_structured",
        name="Fragmented → Structured",
        description="Dispersed input, unclear ownership, and repeated rework indicate a transition from fragmented signals to a structured operating model.",
        pattern_family="fragmented_to_structured",
        status="active",
        problem_shape="fragmented intake, unclear ownership, repeated handoff, inconsistent record keeping",
        structural_signature={"fragmented_input": 0.9, "ownership_unclear": 0.8, "handoff_repeat": 0.8, "rework": 0.7},
        typical_signals=["multiple disconnected sources", "repeated manual re-entry", "unclear ownership", "inconsistent handoff"],
        typical_constraints=["information", "ownership", "control"],
        known_interventions=["standardize intake", "assign ownership", "create structured handoff"],
        expected_outcomes=["reduced rework", "clearer ownership", "predictable process flow"],
        supporting_cases=["ATHRTY CRM Foundation Stage"],
        counterexamples=["single-source process with clear authority"],
        failure_conditions=["well-defined ownership already exists", "single authoritative source is already live"],
        transfer_conditions=["Transfer only when the source issue is fragmentation and the target problem is not a true capacity limit."],
        confidence="medium",
        evidence_strength="moderate",
        observation_count=6,
        successful_application_count=2,
        failed_application_count=1,
        created_at="2026-08-16T00:00:00Z",
        last_modified_at="2026-08-16T00:00:00Z",
    ),
    Pattern(
        id="pattern-invisible-visible",
        pattern_key="invisible_to_visible",
        name="Invisible → Visible",
        description="The pattern is not simply hidden; critical state is not visible in a way that enables action or learning.",
        pattern_family="invisible_to_visible",
        status="active",
        problem_shape="important state is hidden from decision makers or not captured structurally",
        structural_signature={"visibility_gap": 0.9, "signal_missing": 0.8, "decisions_without_evidence": 0.7},
        typical_signals=["hidden operational state", "missing status signal", "decision without trace"],
        typical_constraints=["visibility", "information", "control"],
        known_interventions=["capture state explicitly", "surface key operational metrics", "install evidence trace"],
        expected_outcomes=["fewer silent failures", "faster diagnosis", "better operating visibility"],
        supporting_cases=["ATHRTY CRM Foundation Stage"],
        counterexamples=["all required state is already visible and tracked"],
        failure_conditions=["visibility is not the limiting factor; flow or ownership is"],
        transfer_conditions=["the issue remains that state is not captured or exposed, not that decisions are wrong"],
        confidence="medium",
        evidence_strength="moderate",
        observation_count=5,
        successful_application_count=3,
        failed_application_count=0,
        created_at="2026-08-16T00:00:00Z",
        last_modified_at="2026-08-16T00:00:00Z",
    ),
    Pattern(
        id="pattern-signal-knowledge-improvement",
        pattern_key="signal_capture_to_knowledge_improvement",
        name="Signal Capture → Knowledge → Improvement",
        description="Operational signals, when captured and linked to evidence, become reusable knowledge that improves future execution.",
        pattern_family="signal_capture_to_knowledge_improvement",
        status="active",
        problem_shape="signals exist but are not converted into reusable knowledge or learning loops",
        structural_signature={"signal_capture": 0.8, "knowledge_gap": 0.9, "feedback_missing": 0.8},
        typical_signals=["signal not recorded", "lessons not captured", "repeated mistakes without learning"],
        typical_constraints=["flow", "visibility", "information"],
        known_interventions=["capture evidence with provenance", "link signals to outcome and lesson", "close the learning loop"],
        expected_outcomes=["fewer repeated failures", "better future diagnosis", "compounding operational learning"],
        supporting_cases=["ATHRTY CRM Foundation Stage"],
        counterexamples=["the system already has a robust learning loop and no new signal is needed"],
        failure_conditions=["there is no repeated pattern, no evidence trail, and no actionable learning path"],
        transfer_conditions=["the problem is knowledge drift or missing learning, not a missing capability"],
        confidence="medium",
        evidence_strength="moderate",
        observation_count=4,
        successful_application_count=2,
        failed_application_count=0,
        created_at="2026-08-16T00:00:00Z",
        last_modified_at="2026-08-16T00:00:00Z",
    ),
    Pattern(
        id="pattern-static-interface-business-system",
        pattern_key="static_interface_to_business_system",
        name="Static Interface → Business System",
        description="A static interface or isolated tool is not the end-state when the true need is a business process and operating system.",
        pattern_family="static_interface_to_business_system",
        status="candidate",
        problem_shape="tool or interface is treated as the solution while the real bottleneck is process and ownership",
        structural_signature={"interface_fixation": 0.9, "process_gap": 0.8, "ownership_missing": 0.7},
        typical_signals=["tool adoption without flow change", "process remains manual", "output not systematically reused"],
        typical_constraints=["interface", "flow", "ownership"],
        known_interventions=["map the workflow", "normalize the operating model", "move from static tool to process owner"],
        expected_outcomes=["sustainable workflow", "repeatable execution", "less reliance on ad hoc workarounds"],
        supporting_cases=["ATHRTY CRM Foundation Stage"],
        counterexamples=["the actual issue is a single tool gap and no process layer is missing"],
        failure_conditions=["the problem is truly a single-tool deficiency rather than systemic process design"],
        transfer_conditions=["the problem space includes process gaps and missing ownership even if the interface is in place"],
        confidence="low",
        evidence_strength="light",
        observation_count=2,
        successful_application_count=0,
        failed_application_count=0,
        created_at="2026-08-16T00:00:00Z",
        last_modified_at="2026-08-16T00:00:00Z",
    ),
]

CONSTRAINT_LIBRARY: list[Constraint] = [
    Constraint(
        id="constraint-information-visibility-gap",
        scope="current operating context",
        description="Important state is not captured or visible in a way that supports action and learning.",
        constraint_family="information",
        supporting_signals=["missing status signal", "missing provenance", "hidden operating state"],
        supporting_patterns=["invisible_to_visible", "signal_capture_to_knowledge_improvement"],
        supporting_evidence=["observed evidence is limited to a construct without execution detail"],
        counterevidence=["execution details are present elsewhere but not yet linked"],
        confidence="medium",
        status="candidate",
        affected_capabilities=["diagnosis", "planning", "execution control"],
        affected_flows=["information", "decision"],
    ),
    Constraint(
        id="constraint-ownership-unclarity",
        scope="handoff and accountability",
        description="The system cannot reliably absorb work because ownership is unclear across the flow.",
        constraint_family="ownership",
        supporting_signals=["multiple disconnected sources", "unclear ownership", "ambiguous handoff"],
        supporting_patterns=["fragmented_to_structured"],
        supporting_evidence=["no clear ownership or execution state was established in the available evidence"],
        counterevidence=["clear ownership is present in an uninspected system state"],
        confidence="medium",
        status="candidate",
        affected_capabilities=["execution", "coordination", "accountability"],
        affected_flows=["work", "decision"],
    ),
]


def _normalize_text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip().lower()


def _token_set(value: Any) -> set[str]:
    items: Iterable[str]
    if isinstance(value, str):
        items = value.replace("-", " ").split()
    elif isinstance(value, (list, tuple, set)):
        items = [str(item) for item in value]
    else:
        return set()
    tokens: set[str] = set()
    for item in items:
        stripped = _normalize_text(item)
        if not stripped:
            continue
        tokens.add(stripped)
        for alias_group in SEMANTIC_ALIASES.values():
            if stripped in alias_group:
                tokens |= alias_group
            elif any(alias in stripped for alias in alias_group):
                tokens |= alias_group
    return tokens


def _dimension_overlap(left: Iterable[str], right: Iterable[str]) -> float:
    left_tokens = set(_normalize_text(token) for token in left if _normalize_text(token))
    right_tokens = set(_normalize_text(token) for token in right if _normalize_text(token))
    if not left_tokens and not right_tokens:
        return 0.0
    if not left_tokens or not right_tokens:
        return 0.1
    overlap = left_tokens & right_tokens
    return round(len(overlap) / max(1, len(left_tokens | right_tokens)), 3)


def classify_functional_vs_structural(case: dict[str, Any]) -> dict[str, Any]:
    """Reason about whether the situation describes a single-instance failure or a repeated structural condition."""
    symptoms = _token_set(case.get("symptoms") or case.get("signals") or [])
    repeated = bool(case.get("repeated") or case.get("recurrence"))
    ownership = bool(case.get("ownership_unclear") or case.get("ambiguous_ownership"))
    flow = bool(case.get("handoff") or case.get("workflow"))
    issues = set(_normalize_text(item) for item in case.get("issues", []))
    if repeated and (ownership or flow or "handoff" in symptoms or "workflow" in symptoms):
        return {
            "classification": "structural_pattern_candidate",
            "reason": "Repeated similarity across cases or repeated handoffs suggests a system structure rather than a single incident.",
        }
    if repeated:
        return {
            "classification": "repeated_functional_failure",
            "reason": "The same problem recurs, but there is not yet enough evidence of a structural root cause.",
        }
    return {
        "classification": "single_instance_failure",
        "reason": "The evidence describes a single event or instance without enough repeated evidence to support a structural claim.",
    }


def infer_constraint_from_pattern(pattern: Pattern, evidence: dict[str, Any] | None = None) -> Constraint:
    """Create a constraint candidate from the selected pattern while preserving the distinction between evidence and inference."""
    evidence_map = evidence or {}
    family = pattern.typical_constraints[0] if pattern.typical_constraints else "information"
    scope = evidence_map.get("scope", "current operating context")
    description = (
        f"The current structure appears to be constrained by {family} flow and visibility limits that prevent reliable movement."
    )
    return Constraint(
        id=f"constraint-{pattern.pattern_key}",
        scope=str(scope),
        description=description,
        constraint_family=family,
        supporting_signals=pattern.typical_signals,
        supporting_patterns=[pattern.pattern_key],
        supporting_evidence=[str(evidence_map.get("supporting_evidence", "available evidence"))],
        counterevidence=[str(evidence_map.get("counterevidence", "no direct counterevidence yet"))],
        confidence=pattern.confidence,
        status="candidate",
        affected_capabilities=pattern.expected_outcomes,
        affected_flows=["information", "work", "decision"],
    )


def _match_dimension(pattern: Pattern, problem: dict[str, Any], key: str) -> float:
    if key == "symptom_similarity":
        pattern_signals = _token_set(pattern.typical_signals)
        problem_signals = _token_set(problem.get("symptoms", []) or problem.get("signals", []) or problem.get("observed", []))
        if not pattern_signals and not problem_signals:
            return 0.0
        overlap = pattern_signals & problem_signals
        if overlap:
            return round(len(overlap) / max(1, len(pattern_signals | problem_signals)), 3)
        # Give semantic aliases a chance to match when the underlying narrative is the same problem with different wording.
        semantic_overlap = _token_set([" ".join(pattern.typical_signals)]) & _token_set([" ".join(problem.get("symptoms", []) or problem.get("signals", []) or problem.get("observed", []))])
        return round(len(semantic_overlap) / max(1, len(_token_set([" ".join(pattern.typical_signals)]) | _token_set([" ".join(problem.get("symptoms", []) or problem.get("signals", []) or problem.get("observed", []))]))), 3)
    if key == "structural_similarity":
        pattern_signature = pattern.structural_signature or {}
        problem_signature = problem.get("structural_signature") or {}
        if not pattern_signature and not problem_signature:
            return 0.0
        if not isinstance(problem_signature, dict):
            return 0.0
        keys = sorted(set(pattern_signature) & set(problem_signature))
        if not keys:
            return 0.0
        weighted = []
        for key in keys:
            left = float(pattern_signature.get(key, 0.0))
            right = float(problem_signature.get(key, 0.0))
            weighted.append((left + right) / 2.0)
        return round(min(1.0, sum(weighted) / max(len(weighted), 1)), 3)
    if key == "flow_similarity":
        return _dimension_overlap(problem.get("flow_paths", []) or [], pattern.expected_outcomes)
    if key == "constraint_similarity":
        return _dimension_overlap(pattern.typical_constraints, problem.get("constraints", []) or [])
    if key == "context_similarity":
        problem_context = str(problem.get("context") or "").lower()
        if not problem_context:
            return 0.5
        if "crm" in problem_context or "support" in problem_context or "foundation" in problem_context or "workflow" in problem_context:
            return 0.6
        return 0.5
    if key == "historical_outcome_similarity":
        return _dimension_overlap(pattern.expected_outcomes, problem.get("expected_outcomes", []) or [])
    if key == "counterevidence_strength":
        return 0.0 if not problem.get("counterevidence") else min(1.0, len(problem.get("counterevidence", [])) / 3)
    return 0.0


def _pattern_confidence(match_scores: dict[str, float], counterevidence: list[str], evidence_refs: list[str] | None = None) -> float:
    weighted = sum(match_scores.values()) / max(1, len(match_scores))
    evidence_bonus = 0.2 if evidence_refs else 0.0
    penalty = len(counterevidence) * 0.12
    score = weighted * 1.5 + evidence_bonus - penalty
    return max(0.0, min(1.0, score))


def build_intervention_candidates(pattern: Pattern, context: dict[str, Any] | None = None) -> list[InterventionCandidate]:
    """Create advisory intervention candidates only; never mutate the underlying detected state."""
    context = context or {}
    base = [
        InterventionCandidate(
            id=f"intervention-{pattern.pattern_key}-01",
            target_constraint=f"constraint-{pattern.pattern_key}",
            mechanism="normalize the operating flow and reveal evidence-backed state",
            expected_effect="reduce uncertainty and support repeated decisioning",
            required_capability=context.get("required_capability", "governance and evidence mapping"),
            effort_estimate=context.get("effort_estimate", "moderate"),
            reversibility=context.get("reversibility", "reversible"),
            risk=context.get("risk", "medium"),
            supporting_evidence=pattern.supporting_cases,
            relevant_prior_cases=pattern.supporting_cases,
            known_failure_conditions=pattern.failure_conditions,
        )
    ]
    return base


class PatternEngine:
    def __init__(self, patterns: list[Pattern] | None = None):
        self.patterns = patterns or PATTERN_LIBRARY

    def list_patterns(self) -> list[dict[str, Any]]:
        return [pattern.to_dict() for pattern in self.patterns if pattern.status not in {"deprecated", "weakened"}]

    def get_pattern(self, pattern_key: str) -> dict[str, Any] | None:
        for pattern in self.patterns:
            if pattern.pattern_key == pattern_key:
                return pattern.to_dict()
        return None

    def match_patterns(self, problem: dict[str, Any]) -> list[PatternMatch]:
        if not isinstance(problem, dict):
            raise ValueError("problem must be a dictionary")
        if not problem:
            return []

        matches: list[PatternMatch] = []
        for pattern in self.patterns:
            if pattern.status in {"deprecated", "weakened"}:
                continue
            support = {
                "symptom_similarity": _match_dimension(pattern, problem, "symptom_similarity"),
                "structural_similarity": _match_dimension(pattern, problem, "structural_similarity"),
                "flow_similarity": _match_dimension(pattern, problem, "flow_similarity"),
                "constraint_similarity": _match_dimension(pattern, problem, "constraint_similarity"),
                "context_similarity": _match_dimension(pattern, problem, "context_similarity"),
                "historical_outcome_similarity": _match_dimension(pattern, problem, "historical_outcome_similarity"),
            }
            contradict = {"counterevidence_strength": _match_dimension(pattern, problem, "counterevidence_strength")}
            evidence_refs = list(problem.get("evidence_references", []) or [])
            counterevidence_refs = list(problem.get("counterevidence_references", []) or [])
            score = _pattern_confidence(support, list(problem.get("counterevidence", []) or []), evidence_refs)
            if score < 0.2 and not evidence_refs:
                continue
            matches.append(
                PatternMatch(
                    candidate_pattern=pattern,
                    supporting_dimensions=support,
                    contradicting_dimensions=contradict,
                    supporting_evidence_references=evidence_refs,
                    counterevidence_references=counterevidence_refs,
                    confidence=score,
                    unresolved_differences=[
                        item for item in problem.get("differences", []) or []
                    ],
                    relevant_prior_cases=pattern.supporting_cases,
                )
            )

        matches.sort(key=lambda entry: (entry.confidence, entry.candidate_pattern.observation_count), reverse=True)
        return matches

    def list_constraints(self) -> list[dict[str, Any]]:
        return [constraint.to_dict() for constraint in CONSTRAINT_LIBRARY]

    def advisory_interventions(self, pattern_key: str, context: dict[str, Any] | None = None) -> list[dict[str, Any]]:
        for pattern in self.patterns:
            if pattern.pattern_key == pattern_key:
                return [candidate.to_dict() for candidate in build_intervention_candidates(pattern, context)]
        return []

    def get_constraint(self, constraint_id: str) -> dict[str, Any] | None:
        for constraint in CONSTRAINT_LIBRARY:
            if constraint.id == constraint_id:
                return constraint.to_dict()
        return None

    def get_reasoning_trace(self, problem: dict[str, Any]) -> dict[str, Any]:
        matches = self.match_patterns(problem)
        evidence_refs = list(problem.get("evidence_references", []) or [])
        source_refs = list(problem.get("source_refs", []) or [])
        missing_state = list(problem.get("missing_state", []) or [])
        observed = list(problem.get("observed", []) or [])
        derived = list(problem.get("derived", []) or [])
        underlying_constraints = list(problem.get("constraints", []) or [])
        pattern_candidates = [
            {
                "pattern_key": match.candidate_pattern.pattern_key,
                "confidence": round(match.confidence, 3),
                "matched_dimensions": {key: round(float(value), 3) for key, value in match.supporting_dimensions.items()},
                "contradicting_dimensions": {key: round(float(value), 3) for key, value in match.contradicting_dimensions.items()},
                "supporting_evidence": list(match.supporting_evidence_references),
                "counterevidence": list(match.counterevidence_references),
                "missing_state": missing_state,
            }
            for match in matches[:3]
        ]
        constraint_candidates = [
            {
                "constraint_family": candidate.constraint_family,
                "confidence": round(float(candidate.confidence) if isinstance(candidate.confidence, (int, float, str)) and str(candidate.confidence).replace(".", "", 1).isdigit() else 0.0, 3),
                "supporting_evidence": candidate.supporting_evidence,
                "counterevidence": candidate.counterevidence,
                "missing_state": missing_state,
            }
            for candidate in [
                infer_constraint_from_pattern(match.candidate_pattern, {"scope": problem.get("scope", "current operating context"), "supporting_evidence": observed, "counterevidence": problem.get("counterevidence", [])})
                for match in matches[:2]
            ]
        ]
        supported = [candidate["pattern_key"] for candidate in pattern_candidates]
        unsupported = []
        if not supported:
            unsupported = list(problem.get("unsupported_interpretations", []) or ["No structural match rose above the current evidence threshold."])
        unresolved = missing_state if missing_state else ["Insufficient evidence remains to support an accepted durable intelligence claim."]
        trace = ReasoningTrace(
            trace_id=str(problem.get("trace_id") or f"trace-{abs(hash(str(problem.get('query') or 'diagnostic')))}"),
            created_at=str(problem.get("created_at") or "2026-08-16T00:00:00Z"),
            scope=str(problem.get("scope") or "current operating context"),
            query=str(problem.get("query") or "diagnostic"),
            intent=str(problem.get("intent") or "DIAGNOSTIC"),
            evidence={
                "observed": observed,
                "evidence_refs": evidence_refs,
                "source_refs": source_refs,
            },
            existing_intelligence={
                "signals": list(problem.get("signals", []) or []),
                "constructs": list(problem.get("constructs", []) or []),
            },
            problem_state={
                "symptoms": list(problem.get("symptoms", []) or []),
                "structural_signature": dict(problem.get("structural_signature", {}) or {}),
                "flow_paths": list(problem.get("flow_paths", []) or []),
                "known_constraints": underlying_constraints,
                "context": list(problem.get("context", []) or []) if isinstance(problem.get("context"), list) else [str(problem.get("context") or "")],
                "expected_outcomes": list(problem.get("expected_outcomes", []) or []),
            },
            pattern_candidates=pattern_candidates,
            constraint_candidates=constraint_candidates,
            conclusion={
                "supported_interpretations": supported,
                "unsupported_interpretations": unsupported,
                "unresolved_questions": unresolved,
            },
            provenance={
                "tools_used": ["intelligence.match_patterns", "intelligence.get_reasoning_trace"],
                "evidence_refs": evidence_refs,
                "intelligence_refs": list(problem.get("intelligence_refs", []) or []),
            },
            ephemeral=True,
            lifecycle_state="EPHEMERAL_TRACE",
            durable_objects=[],
        )
        return trace.to_dict()


DEFAULT_PATTERN_ENGINE = PatternEngine()


def build_athrty_fixture() -> dict[str, Any]:
    return {
        "title": "ATHRTY CRM Foundation Stage",
        "observed": [
            "The project ATHRTY.SYS is active and focused on building the Authority Systems CRM V1.",
            "The construct is titled ATHRTY CRM Foundation Stage.",
            "The applicable state is active and the confidence is medium.",
            "The summary indicates the architecture and core entity setup have been established.",
        ],
        "derived": [
            "The foundation is established, but execution detail is not yet established.",
            "No active operating execution state is directly evidenced.",
        ],
        "hypothesis": [
            "The system may still be in a design or foundation phase rather than a full execution phase.",
        ],
        "signals": ["foundation stage", "implementation not yet evidenced", "design and entity setup established"],
        "constraints": ["information", "visibility"],
        "structural_signature": {"fragmented_input": 0.4, "ownership_unclear": 0.3, "visibility_gap": 0.8},
        "flow_paths": ["foundation", "entity setup", "visibility"],
        "expected_outcomes": ["reduced rework", "clear visibility", "stronger operating model"],
        "counterevidence": ["No execution artifacts or live operational state are available to confirm active execution."],
        "evidence_references": [
            "construct:ATHRTY CRM Foundation Stage",
            "summary:architecture and core entity setup established",
        ],
        "counterevidence_references": [
            "missing:execution detail",
            "missing:live operational state",
        ],
        "scope": "ATHRTY CRM",
        "context": "foundation",
        "differences": ["No direct evidence of current operating execution state."],
    }
