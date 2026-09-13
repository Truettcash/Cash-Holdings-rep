from __future__ import annotations

import base64
import json
import os
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any


class CashCliError(RuntimeError):
    pass


def _decode_legacy_role(key: str) -> str | None:
    """Best-effort role read for legacy Supabase JWT API keys.

    This does not verify the JWT signature; it only improves local operator
    feedback before the request reaches Supabase.
    """
    parts = key.split(".")
    if len(parts) != 3:
        return None
    try:
        payload = parts[1] + ("=" * (-len(parts[1]) % 4))
        decoded = base64.urlsafe_b64decode(payload.encode("ascii"))
        data = json.loads(decoded.decode("utf-8"))
    except (ValueError, UnicodeDecodeError, json.JSONDecodeError):
        return None
    role = data.get("role") if isinstance(data, dict) else None
    return str(role) if role else None


@dataclass(frozen=True)
class SupabaseConfig:
    url: str
    service_role_key: str

    @classmethod
    def from_env(cls) -> "SupabaseConfig":
        url = os.environ.get("SUPABASE_URL", "").rstrip("/")
        key = (
            os.environ.get("SUPABASE_SECRET_KEY", "")
            or os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
        ).strip()
        missing = [
            name
            for name, value in (
                ("SUPABASE_URL", url),
                ("SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY", key),
            )
            if not value
        ]
        if missing:
            raise CashCliError(
                f"Missing required environment variables: {', '.join(missing)}"
            )

        if key.startswith("sb_publishable_"):
            raise CashCliError(
                "Cash CLI requires an elevated Supabase backend key, not the "
                "sb_publishable_ key. Use an sb_secret_ key (preferred) or the "
                "legacy service_role key for the Cash Holdings project."
            )

        legacy_role = _decode_legacy_role(key)
        if legacy_role == "anon":
            raise CashCliError(
                "Cash CLI requires an elevated Supabase backend key, not the "
                "legacy anon key. Use an sb_secret_ key (preferred) or the "
                "legacy service_role key for the Cash Holdings project."
            )
        if legacy_role and legacy_role != "service_role":
            raise CashCliError(
                f"Unsupported legacy Supabase JWT role: {legacy_role}. "
                "Use an sb_secret_ key or service_role key."
            )

        return cls(url=url, service_role_key=key)


class SupabaseClient:
    def __init__(self, config: SupabaseConfig, timeout: int = 60):
        self.config = config
        self.timeout = timeout

    def _request(
        self,
        method: str,
        path: str,
        body: Any = None,
        headers: dict[str, str] | None = None,
    ) -> Any:
        payload = (
            None
            if body is None
            else json.dumps(body, separators=(",", ":")).encode("utf-8")
        )
        key = self.config.service_role_key
        merged = {
            "apikey": key,
            "Accept": "application/json",
        }
        # New Supabase sb_secret_ keys are opaque API keys, not JWTs. Sending
        # them as Bearer tokens causes downstream JWT parsing failures. The API
        # gateway promotes a valid secret key to service_role when it arrives
        # in the apikey header. Legacy service_role keys remain JWTs and still
        # need the Authorization header.
        if not key.startswith("sb_secret_"):
            merged["Authorization"] = f"Bearer {key}"
        if payload is not None:
            merged["Content-Type"] = "application/json"
        if headers:
            merged.update(headers)
        request = urllib.request.Request(
            f"{self.config.url}{path}",
            data=payload,
            headers=merged,
            method=method,
        )
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                raw = response.read()
                if not raw:
                    return None
                return json.loads(raw.decode("utf-8"))
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")[:2000]
            raise CashCliError(f"Supabase HTTP {exc.code}: {detail}") from exc
        except urllib.error.URLError as exc:
            raise CashCliError(f"Supabase request failed: {exc.reason}") from exc

    def rpc(self, name: str, body: dict[str, Any]) -> Any:
        return self._request(
            "POST",
            f"/rest/v1/rpc/{urllib.parse.quote(name)}",
            body,
        )

    def select(self, table: str, params: dict[str, str]) -> Any:
        query = urllib.parse.urlencode(params, safe="(),.*:")
        return self._request(
            "GET",
            f"/rest/v1/{urllib.parse.quote(table)}?{query}",
        )

    def storage_list(
        self,
        bucket: str,
        prefix: str = "",
        limit: int = 1000,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        body = {
            "prefix": prefix,
            "limit": limit,
            "offset": offset,
            "sortBy": {"column": "name", "order": "asc"},
        }
        data = self._request(
            "POST",
            f"/storage/v1/object/list/{urllib.parse.quote(bucket)}",
            body,
        )
        return data if isinstance(data, list) else []

    def storage_remove(self, bucket: str, paths: list[str]) -> Any:
        return self._request(
            "DELETE",
            f"/storage/v1/object/{urllib.parse.quote(bucket)}",
            {"prefixes": paths},
        )
