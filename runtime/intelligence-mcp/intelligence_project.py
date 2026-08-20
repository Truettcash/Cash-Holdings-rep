"""Static Intelligence MCP contract and fail-closed argument validation."""
from __future__ import annotations

import re
from typing import Any

UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
    re.IGNORECASE,
)

TOOL_ACTIONS = {
    "intelligence.list_constructs": "list_constructs",
    "intelligence.get_construct": "get_construct",
    "intelligence.get_signal": "get_signal",
    "intelligence.get_context": "get_context",
    "intelligence.list_patterns": "list_patterns",
    "intelligence.get_pattern": "get_pattern",
    "intelligence.match_patterns": "match_patterns",
    "intelligence.list_constraints": "list_constraints",
    "intelligence.get_constraint": "get_constraint",
    "intelligence.get_reasoning_trace": "get_reasoning_trace",
}

TOOL_ALIASES = {name: name.replace(".", "_") for name in TOOL_ACTIONS}
ALIAS_TO_CANONICAL = {alias: name for name, alias in TOOL_ALIASES.items()}
CANONICAL_TOOLS = tuple(TOOL_ACTIONS)

TOOL_DESCRIPTIONS = {
    "intelligence.list_constructs": "List the current active constructs visible to the authenticated user.",
    "intelligence.get_construct": "Read one construct and the signals it currently supports.",
    "intelligence.get_signal": "Read one signal and its evidence references.",
    "intelligence.get_context": "Assemble the linked construct/signal evidence context without creating new intelligence.",
    "intelligence.list_patterns": "Browse available pattern definitions. Use for library discovery only. Do not use as the primary tool for diagnosing a specific situation.",
    "intelligence.get_pattern": "Retrieve one known pattern definition by pattern key.",
    "intelligence.match_patterns": "Compare a specific evidence-backed situation against known structural patterns. Use when asked what something resembles, whether a recurring pattern exists, or which patterns fit the current state.",
    "intelligence.list_constraints": "Browse available constraint definitions. Use for taxonomy discovery only.",
    "intelligence.get_constraint": "Retrieve one identified constraint definition by ID.",
    "intelligence.get_reasoning_trace": "Run the read-only diagnostic reasoning path for a specific evidence-backed situation. Use when asked to diagnose structure, identify likely patterns or constraints, evaluate counterevidence, or distinguish known from missing state.",
}

UUID_SCHEMA = {"type": "string", "pattern": UUID_RE.pattern}
LIMIT_SCHEMA = {"type": "integer", "minimum": 1, "maximum": 50}

TOOL_SCHEMAS = {
    "intelligence.list_constructs": {
        "type": "object",
        "properties": {"limit": LIMIT_SCHEMA},
        "additionalProperties": False,
    },
    "intelligence.get_construct": {
        "type": "object",
        "properties": {"construct_id": UUID_SCHEMA},
        "required": ["construct_id"],
        "additionalProperties": False,
    },
    "intelligence.get_signal": {
        "type": "object",
        "properties": {"signal_id": UUID_SCHEMA},
        "required": ["signal_id"],
        "additionalProperties": False,
    },
    "intelligence.get_context": {
        "type": "object",
        "properties": {
            "construct_id": UUID_SCHEMA,
            "signal_id": UUID_SCHEMA,
            "query": {"type": "string", "minLength": 1},
            "limit": LIMIT_SCHEMA,
        },
        "additionalProperties": False,
    },
    "intelligence.list_patterns": {
        "type": "object",
        "properties": {},
        "additionalProperties": False,
    },
    "intelligence.get_pattern": {
        "type": "object",
        "properties": {"pattern_key": {"type": "string", "minLength": 1}},
        "required": ["pattern_key"],
        "additionalProperties": False,
    },
    "intelligence.match_patterns": {
        "type": "object",
        "properties": {
            "problem": {"type": "object"},
            "limit": LIMIT_SCHEMA,
        },
        "required": ["problem"],
        "additionalProperties": False,
    },
    "intelligence.list_constraints": {
        "type": "object",
        "properties": {},
        "additionalProperties": False,
    },
    "intelligence.get_constraint": {
        "type": "object",
        "properties": {"constraint_id": {"type": "string", "minLength": 1}},
        "required": ["constraint_id"],
        "additionalProperties": False,
    },
    "intelligence.get_reasoning_trace": {
        "type": "object",
        "properties": {
            "problem": {"type": "object"},
        },
        "required": ["problem"],
        "additionalProperties": False,
    },
}


class ContractError(ValueError):
    """Raised when the client sends an invalid Intelligence MCP request."""


def canonical_tool_name(name: str) -> str:
    if name in TOOL_ACTIONS:
        return name
    if name in ALIAS_TO_CANONICAL:
        return ALIAS_TO_CANONICAL[name]
    raise ContractError("unknown Intelligence MCP tool")


def _uuid(value: Any, field: str) -> str:
    if not isinstance(value, str) or not UUID_RE.fullmatch(value.strip()):
        raise ContractError(f"{field} must be a UUID")
    return value.strip()


def validate_arguments(name: str, arguments: Any) -> dict[str, Any]:
    canonical = canonical_tool_name(name)
    if arguments is None:
        arguments = {}
    if not isinstance(arguments, dict):
        raise ContractError("arguments must be an object")

    allowed = set(TOOL_SCHEMAS[canonical]["properties"])
    extra = set(arguments) - allowed
    if extra:
        raise ContractError(f"unexpected argument: {sorted(extra)[0]}")

    result = dict(arguments)
    if "construct_id" in result:
        result["construct_id"] = _uuid(result["construct_id"], "construct_id")
    if "signal_id" in result:
        result["signal_id"] = _uuid(result["signal_id"], "signal_id")
    if "query" in result:
        if not isinstance(result["query"], str) or not result["query"].strip():
            raise ContractError("query must be a non-empty string")
        result["query"] = result["query"].strip()
    if "pattern_key" in result:
        if not isinstance(result["pattern_key"], str) or not result["pattern_key"].strip():
            raise ContractError("pattern_key must be a non-empty string")
        result["pattern_key"] = result["pattern_key"].strip()
    if "constraint_id" in result:
        if not isinstance(result["constraint_id"], str) or not result["constraint_id"].strip():
            raise ContractError("constraint_id must be a non-empty string")
        result["constraint_id"] = result["constraint_id"].strip()
    if "problem" in result:
        if not isinstance(result["problem"], dict):
            raise ContractError("problem must be an object")
    if "limit" in result:
        limit = result["limit"]
        if not isinstance(limit, int) or isinstance(limit, bool) or not 1 <= limit <= 50:
            raise ContractError("limit must be an integer from 1 through 50")
        result["limit"] = limit

    if canonical == "intelligence.get_construct" and "construct_id" not in result:
        raise ContractError("construct_id is required")
    if canonical == "intelligence.get_signal" and "signal_id" not in result:
        raise ContractError("signal_id is required")
    if canonical == "intelligence.get_pattern" and "pattern_key" not in result:
        raise ContractError("pattern_key is required")
    if canonical == "intelligence.get_constraint" and "constraint_id" not in result:
        raise ContractError("constraint_id is required")
    if canonical == "intelligence.match_patterns" and "problem" not in result:
        raise ContractError("problem is required")
    if canonical == "intelligence.get_reasoning_trace" and "problem" not in result:
        raise ContractError("problem is required")
    return result
