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
    api_key: str
    bearer_token: str | None = None
    worker_token: str | None = None
    worker_id: str | None = None

    @property
    def worker_mode(self) -> bool:
        return bool(self.worker_token)

    @property
    def elevated(self) -> bool:
        return not self.worker_mode

    @classmethod
    def from_env(cls) -> "SupabaseConfig":
        url = os.environ.get("SUPABASE_URL", "").rstrip("/")
        auth_mode = os.environ.get("CASH_AUTH_MODE", "").strip()
        elevated_key = (
            os.environ.get("SUPABASE_SECRET_KEY", "")
            or os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
        ).strip()
        publishable_key = os.environ.get("SUPABASE_PUBLISHABLE_KEY", "").strip()
        worker_token = os.environ.get("CASH_WORKER_TOKEN", "").strip()
        worker_id = os.environ.get("CASH_WORKER_ID", "").strip()

        if not url:
            raise CashCliError("Missing required environment variable: SUPABASE_URL")

        # An installed worker config explicitly selects worker-token auth. Honor
        # that choice before looking at elevated variables so a stale user/machine
        # service-role key cannot shadow the narrow local capability credential.
        if auth_mode == "worker_token_v1":
            if not publishable_key:
                raise CashCliError(
                    "Worker-token mode requires SUPABASE_PUBLISHABLE_KEY."
                )
            if not publishable_key.startswith("sb_publishable_"):
                raise CashCliError(
                    "Worker-token mode requires a modern sb_publishable_ key."
                )
            if not worker_token:
                raise CashCliError("Worker-token mode requires CASH_WORKER_TOKEN.")
            if not worker_id:
                raise CashCliError("Worker-token mode requires CASH_WORKER_ID.")

            return cls(
                url=url,
                api_key=publishable_key,
                worker_token=worker_token,
                worker_id=worker_id,
            )

        if elevated_key:
            if elevated_key.startswith("sb_publishable_"):
                raise CashCliError(
                    "Cash CLI elevated mode requires an sb_secret_ key or legacy "
                    "service_role key, not a publishable key."
                )

            legacy_role = _decode_legacy_role(elevated_key)
            if legacy_role == "anon":
                raise CashCliError(
                    "Cash CLI elevated mode requires an sb_secret_ key or legacy "
                    "service_role key, not the legacy anon key."
                )
            if legacy_role and legacy_role != "service_role":
                raise CashCliError(
                    f"Unsupported legacy Supabase JWT role: {legacy_role}."
                )

            bearer = None if elevated_key.startswith("sb_secret_") else elevated_key
            return cls(
                url=url,
                api_key=elevated_key,
                bearer_token=bearer,
            )

        if publishable_key or worker_token:
            if not publishable_key:
                raise CashCliError(
                    "Worker-token mode requires SUPABASE_PUBLISHABLE_KEY."
                )
            if not publishable_key.startswith("sb_publishable_"):
                raise CashCliError(
                    "Worker-token mode requires a modern sb_publishable_ key."
                )
            if not worker_token:
                raise CashCliError("Worker-token mode requires CASH_WORKER_TOKEN.")
            if not worker_id:
                raise CashCliError("Worker-token mode requires CASH_WORKER_ID.")

            return cls(
                url=url,
                api_key=publishable_key,
                worker_token=worker_token,
                worker_id=worker_id,
            )

        raise CashCliError(
            "Missing Supabase credentials. Use SUPABASE_SECRET_KEY or "
            "SUPABASE_SERVICE_ROLE_KEY for elevated mode, or "
            "SUPABASE_PUBLISHABLE_KEY + CASH_WORKER_TOKEN + CASH_WORKER_ID "
            "for local worker mode."
        )


class SupabaseClient:
    def __init__(self, config: SupabaseConfig, timeout: int = 60):
        self.config = config
        self.timeout = timeout

    def require_elevated(self, operation: str) -> None:
        if self.config.worker_mode:
            raise CashCliError(
                f"{operation} requires elevated Supabase credentials and is not "
                "available through the local worker capability token."
            )

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
        merged = {
            "apikey": self.config.api_key,
            "Accept": "application/json",
        }
        if self.config.bearer_token:
            merged["Authorization"] = f"Bearer {self.config.bearer_token}"
        if self.config.worker_mode:
            merged["x-cash-worker-token"] = self.config.worker_token or ""
            merged["x-cash-worker-id"] = self.config.worker_id or ""
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
        self.require_elevated("Direct table selection")
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
        self.require_elevated("Storage listing")
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
        self.require_elevated("Storage deletion")
        return self._request(
            "DELETE",
            f"/storage/v1/object/{urllib.parse.quote(bucket)}",
            {"prefixes": paths},
        )
