from __future__ import annotations

import base64
import json
import os
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any


class SiteMachineError(RuntimeError):
    pass


def _decode_legacy_role(key: str) -> str | None:
    parts = key.split(".")
    if len(parts) != 3:
        return None
    try:
        payload = parts[1] + ("=" * (-len(parts[1]) % 4))
        decoded = base64.urlsafe_b64decode(payload.encode("ascii"))
        data = json.loads(decoded.decode("utf-8"))
    except Exception:
        return None
    role = data.get("role") if isinstance(data, dict) else None
    return str(role) if role else None


@dataclass(frozen=True)
class SupabaseConfig:
    url: str
    key: str

    @classmethod
    def from_env(cls) -> "SupabaseConfig":
        url = os.environ.get("SUPABASE_URL", "").rstrip("/")
        key = (
            os.environ.get("SUPABASE_SECRET_KEY", "")
            or os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
        ).strip()
        if not url or not key:
            raise SiteMachineError(
                "SUPABASE_URL and SUPABASE_SECRET_KEY/SUPABASE_SERVICE_ROLE_KEY are required"
            )
        if key.startswith("sb_publishable_"):
            raise SiteMachineError("Site Machine requires a backend Supabase key")
        role = _decode_legacy_role(key)
        if role == "anon":
            raise SiteMachineError("Site Machine cannot use the anon key")
        return cls(url=url, key=key)


class SupabaseClient:
    def __init__(self, config: SupabaseConfig, timeout: int = 90):
        self.config = config
        self.timeout = timeout

    def _request(self, method: str, path: str, body: Any = None) -> Any:
        payload = None if body is None else json.dumps(body).encode("utf-8")
        headers = {"apikey": self.config.key, "Accept": "application/json"}
        if not self.config.key.startswith("sb_secret_"):
            headers["Authorization"] = f"Bearer {self.config.key}"
        if payload is not None:
            headers["Content-Type"] = "application/json"

        req = urllib.request.Request(
            f"{self.config.url}{path}", data=payload, headers=headers, method=method
        )
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                raw = resp.read()
                return None if not raw else json.loads(raw.decode("utf-8"))
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")[:3000]
            raise SiteMachineError(f"Supabase HTTP {exc.code}: {detail}") from exc
        except urllib.error.URLError as exc:
            raise SiteMachineError(f"Supabase request failed: {exc.reason}") from exc

    def rpc(self, name: str, body: dict[str, Any] | None = None) -> Any:
        return self._request(
            "POST",
            f"/rest/v1/rpc/{urllib.parse.quote(name)}",
            body or {},
        )
