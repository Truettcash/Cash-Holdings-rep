"""Static Knowledge MCP contract and fail-closed argument validation."""
from __future__ import annotations

import re
from typing import Any

UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$", re.I)
SOURCE_TYPES = {"manual_note", "chatgpt_thread", "document", "crm", "project", "email", "meeting", "research_url", "system_generated"}
AUTHORITIES = {"canonical", "primary", "supporting", "unverified"}

TOOL_ACTIONS = {
    "knowledge.search": "search",
    "knowledge.get_document": "get_document",
    "knowledge.get_context": "get_context",
    "knowledge.get_sources": "get_sources",
}
TOOL_ALIASES = {name: name.replace(".", "_") for name in TOOL_ACTIONS}
ALIAS_TO_CANONICAL = {alias: name for name, alias in TOOL_ALIASES.items()}
CANONICAL_TOOLS = tuple(TOOL_ACTIONS)
TOOL_DESCRIPTIONS = {
    "knowledge.search": "Search current source-backed organizational knowledge with citations.",
    "knowledge.get_document": "Read one owner-visible knowledge document with chunks and citations.",
    "knowledge.get_context": "Assemble bounded source-backed evidence only; never recommendations or strategy.",
    "knowledge.get_sources": "List owner-visible knowledge-source metadata without document bodies.",
}
UUID_SCHEMA = {"type": "string", "pattern": UUID_RE.pattern}
LIMIT_SCHEMA = {"type": "integer", "minimum": 1, "maximum": 50}
TOOL_SCHEMAS = {
    "knowledge.search": {"type": "object", "properties": {"query": {"type": "string", "minLength": 1}, "brand_id": UUID_SCHEMA, "entity_id": UUID_SCHEMA, "source_type": {"type": "string", "enum": sorted(SOURCE_TYPES)}, "authority_level": {"type": "string", "enum": sorted(AUTHORITIES)}, "limit": LIMIT_SCHEMA}, "required": ["query"], "additionalProperties": False},
    "knowledge.get_document": {"type": "object", "properties": {"document_id": UUID_SCHEMA}, "required": ["document_id"], "additionalProperties": False},
    "knowledge.get_context": {"type": "object", "properties": {"query": {"type": "string", "minLength": 1}, "brand_id": UUID_SCHEMA, "entity_ids": {"type": "array", "items": UUID_SCHEMA, "maxItems": 20}, "limit": LIMIT_SCHEMA}, "required": ["query"], "additionalProperties": False},
    "knowledge.get_sources": {"type": "object", "properties": {"brand_id": UUID_SCHEMA, "source_type": {"type": "string", "enum": sorted(SOURCE_TYPES)}, "authority_level": {"type": "string", "enum": sorted(AUTHORITIES)}, "current_only": {"type": "boolean"}, "limit": LIMIT_SCHEMA}, "additionalProperties": False},
}

class ContractError(ValueError): pass
def canonical_tool_name(name: str) -> str:
    if name in TOOL_ACTIONS: return name
    if name in ALIAS_TO_CANONICAL: return ALIAS_TO_CANONICAL[name]
    raise ContractError("unknown Knowledge MCP tool")
def _uuid(value: Any, field: str) -> str:
    if not isinstance(value, str) or not UUID_RE.fullmatch(value.strip()): raise ContractError(f"{field} must be a UUID")
    return value.strip()
def validate_arguments(name: str, arguments: Any) -> dict[str, Any]:
    canonical = canonical_tool_name(name)
    if not isinstance(arguments, dict): raise ContractError("arguments must be an object")
    allowed = set(TOOL_SCHEMAS[canonical]["properties"])
    extra = set(arguments) - allowed
    if extra: raise ContractError(f"unexpected argument: {sorted(extra)[0]}")
    result = dict(arguments)
    if canonical in {"knowledge.search", "knowledge.get_context"}:
        if not isinstance(result.get("query"), str) or not result["query"].strip(): raise ContractError("query is required")
        result["query"] = result["query"].strip()
    if canonical == "knowledge.get_document": result["document_id"] = _uuid(result.get("document_id"), "document_id")
    for field in ("brand_id", "entity_id"):
        if field in result: result[field] = _uuid(result[field], field)
    if "entity_ids" in result:
        if not isinstance(result["entity_ids"], list) or len(result["entity_ids"]) > 20: raise ContractError("entity_ids must contain at most 20 UUIDs")
        result["entity_ids"] = [_uuid(value, "entity_ids") for value in result["entity_ids"]]
    if "source_type" in result and result["source_type"] not in SOURCE_TYPES: raise ContractError("invalid source_type")
    if "authority_level" in result and result["authority_level"] not in AUTHORITIES: raise ContractError("invalid authority_level")
    if "current_only" in result and not isinstance(result["current_only"], bool): raise ContractError("current_only must be boolean")
    if "limit" in result and (not isinstance(result["limit"], int) or isinstance(result["limit"], bool) or not 1 <= result["limit"] <= 50): raise ContractError("limit must be an integer from 1 through 50")
    return result