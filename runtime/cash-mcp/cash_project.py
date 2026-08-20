"""Static Cash MCP contract and validation helpers."""

from __future__ import annotations

import re
from typing import Any

UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
    re.IGNORECASE,
)
SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$", re.IGNORECASE)

TOOL_ACTIONS = {
    "cash.list_brands": "list_brands",
    "cash.get_brand": "get_brand",
    "cash.list_active_projects": "list_active_projects",
    "cash.get_project": "get_project",
    "cash.get_pipeline": "get_pipeline",
    "cash.get_recent_activity": "get_recent_activity",
}

TOOL_ALIASES = {
    "cash.list_brands": "cash_list_brands",
    "cash.get_brand": "cash_get_brand",
    "cash.list_active_projects": "cash_list_active_projects",
    "cash.get_project": "cash_get_project",
    "cash.get_pipeline": "cash_get_pipeline",
    "cash.get_recent_activity": "cash_get_recent_activity",
}

ALIAS_TO_CANONICAL = {alias: name for name, alias in TOOL_ALIASES.items()}

_PROPERTIES = {
    "brand_id": {"type": "string", "pattern": UUID_RE.pattern},
    "slug": {"type": "string", "pattern": SLUG_RE.pattern},
    "project_id": {"type": "string", "pattern": UUID_RE.pattern},
    "limit": {"type": "integer", "minimum": 1, "maximum": 100},
}

TOOL_SCHEMAS = {
    "cash.list_brands": {"type": "object", "properties": {}, "additionalProperties": False},
    "cash.get_brand": {
        "type": "object",
        "properties": {"brand_id": _PROPERTIES["brand_id"], "slug": _PROPERTIES["slug"]},
        "additionalProperties": False,
    },
    "cash.list_active_projects": {
        "type": "object", "properties": {"brand_id": _PROPERTIES["brand_id"]}, "additionalProperties": False,
    },
    "cash.get_project": {
        "type": "object", "properties": {"project_id": _PROPERTIES["project_id"]},
        "required": ["project_id"], "additionalProperties": False,
    },
    "cash.get_pipeline": {
        "type": "object", "properties": {"brand_id": _PROPERTIES["brand_id"]}, "additionalProperties": False,
    },
    "cash.get_recent_activity": {
        "type": "object",
        "properties": {"brand_id": _PROPERTIES["brand_id"], "limit": _PROPERTIES["limit"]},
        "additionalProperties": False,
    },
}

TOOL_DESCRIPTIONS = {
    "cash.list_brands": "List Cash Holdings brands visible to the authenticated user.",
    "cash.get_brand": "Read one Cash Holdings brand by UUID or slug.",
    "cash.list_active_projects": "List active Cash Holdings projects, optionally by brand.",
    "cash.get_project": "Read one Cash Holdings project and its task summary.",
    "cash.get_pipeline": "Read the Cash Holdings pipeline summary, optionally by brand.",
    "cash.get_recent_activity": "Read recent Cash Holdings activity, optionally by brand.",
}

CANONICAL_TOOLS = tuple(TOOL_ACTIONS)


class ContractError(ValueError):
    """Raised when tool arguments violate the gateway contract."""


def canonical_tool_name(name: str) -> str:
    if name in TOOL_ACTIONS:
        return name
    if name in ALIAS_TO_CANONICAL:
        return ALIAS_TO_CANONICAL[name]
    raise ContractError("unknown Cash MCP tool")


def _uuid(value: Any, field: str) -> str:
    if not isinstance(value, str) or not UUID_RE.fullmatch(value.strip()):
        raise ContractError(f"{field} must be a UUID")
    return value.strip()


def _optional_uuid(args: dict[str, Any], field: str) -> None:
    if field in args:
        args[field] = _uuid(args[field], field)


def validate_arguments(tool_name: str, arguments: Any) -> dict[str, Any]:
    canonical = canonical_tool_name(tool_name)
    if arguments is None:
        arguments = {}
    if not isinstance(arguments, dict):
        raise ContractError("arguments must be an object")

    allowed = {
        "cash.list_brands": set(),
        "cash.get_brand": {"brand_id", "slug"},
        "cash.list_active_projects": {"brand_id"},
        "cash.get_project": {"project_id"},
        "cash.get_pipeline": {"brand_id"},
        "cash.get_recent_activity": {"brand_id", "limit"},
    }[canonical]
    unexpected = set(arguments) - allowed
    if unexpected:
        raise ContractError(f"unexpected argument: {sorted(unexpected)[0]}")
    result = dict(arguments)

    if canonical == "cash.get_brand":
        has_id = "brand_id" in result
        has_slug = "slug" in result
        if has_id == has_slug:
            raise ContractError("get_brand requires exactly one of brand_id or slug")
        if has_id:
            result["brand_id"] = _uuid(result["brand_id"], "brand_id")
        else:
            if not isinstance(result["slug"], str) or not SLUG_RE.fullmatch(result["slug"].strip()):
                raise ContractError("slug must be a hyphenated slug")
            result["slug"] = result["slug"].strip()
    elif canonical == "cash.get_project":
        if "project_id" not in result:
            raise ContractError("project_id is required")
        result["project_id"] = _uuid(result["project_id"], "project_id")
    else:
        _optional_uuid(result, "brand_id")

    if canonical == "cash.get_recent_activity" and "limit" in result:
        limit = result["limit"]
        if not isinstance(limit, int) or isinstance(limit, bool) or not 1 <= limit <= 100:
            raise ContractError("limit must be an integer from 1 through 100")
    return result