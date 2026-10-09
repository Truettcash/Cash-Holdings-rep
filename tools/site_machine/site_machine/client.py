from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any


class SiteMachineError(RuntimeError):
    pass


class CashSessionClient:
    """Owner-authenticated Site Machine client.

    Reuses the existing Cash MCP user session under ~/.cash-mcp. No service-role
    key is stored on Jarvis Main.
    """

    def __init__(self, state_root: str | os.PathLike[str] = "~/.cash-mcp", timeout: int = 90):
        self.root = Path(state_root).expanduser()
        self.timeout = timeout
        self.config = self._load_json(self.root / "config.json", "Cash MCP config")
        self.state = self._load_json(self.root / "session.json", "Cash MCP session")
        self.supabase_url = str(
            os.environ.get("CASH_MCP_SUPABASE_URL")
            or self.config.get("supabase_url")
            or ""
        ).rstrip("/")
        self.publishable_key = str(
            os.environ.get("CASH_MCP_SUPABASE_PUBLISHABLE_KEY")
            or self.config.get("publishable_key")
            or ""
        ).strip()
        self.gateway_url = str(
            os.environ.get("SITE_MACHINE_GATEWAY_URL")
            or self.config.get("site_machine_gateway_url")
            or (
                f"{self.supabase_url}/functions/v1/athrty-framer-probe-once"
                if self.supabase_url
                else ""
            )
        )
        if not self.supabase_url or not self.publishable_key:
            raise SiteMachineError(
                "Cash MCP config is missing supabase_url/publishable_key in ~/.cash-mcp/config.json"
            )
        self._access_token: str | None = None
        self._expires_at: float = 0

    @staticmethod
    def _load_json(path: Path, label: str) -> dict[str, Any]:
        if not path.is_file():
            raise SiteMachineError(f"{label} is missing: {path}")
        try:
            value = json.loads(path.read_text(encoding="utf-8"))
        except Exception as exc:
            raise SiteMachineError(f"{label} is unreadable: {path}") from exc
        if not isinstance(value, dict):
            raise SiteMachineError(f"{label} must be a JSON object: {path}")
        return value

    def _request(
        self,
        method: str,
        url: str,
        body: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
    ) -> Any:
        payload = None if body is None else json.dumps(body).encode("utf-8")
        merged = {"Accept": "application/json", "apikey": self.publishable_key}
        if payload is not None:
            merged["Content-Type"] = "application/json"
        if headers:
            merged.update(headers)
        req = urllib.request.Request(url, data=payload, headers=merged, method=method)
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as response:
                raw = response.read()
                return None if not raw else json.loads(raw.decode("utf-8"))
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")[:3000]
            raise SiteMachineError(f"HTTP {exc.code}: {detail}") from exc
        except urllib.error.URLError as exc:
            raise SiteMachineError(f"Request failed: {exc.reason}") from exc

    def _refresh(self) -> str:
        refresh_token = str(self.state.get("refresh_token") or "").strip()
        if not refresh_token:
            raise SiteMachineError(
                "Cash MCP refresh session is missing. Re-bootstrap the existing Cash MCP user session."
            )

        data = self._request(
            "POST",
            f"{self.supabase_url}/auth/v1/token?grant_type=refresh_token",
            {"refresh_token": refresh_token},
        )
        access = str((data or {}).get("access_token") or "").strip()
        refresh = str((data or {}).get("refresh_token") or refresh_token).strip()
        expires_in = int((data or {}).get("expires_in") or 3600)
        user_id = str(((data or {}).get("user") or {}).get("id") or self.state.get("user_id") or "")

        if not access or not refresh or not user_id:
            raise SiteMachineError("Cash MCP session refresh returned incomplete auth state")

        self.state = {
            "user_id": user_id,
            "refresh_token": refresh,
            "expires_at": int(time.time()) + expires_in,
        }
        self.root.mkdir(parents=True, exist_ok=True)
        session_path = self.root / "session.json"
        temp = self.root / "session.site-machine.tmp"
        temp.write_text(json.dumps(self.state, separators=(",", ":")) + "\n", encoding="utf-8")
        os.replace(temp, session_path)

        self._access_token = access
        self._expires_at = time.time() + expires_in
        return access

    def access_token(self) -> str:
        if self._access_token and time.time() < self._expires_at - 30:
            return self._access_token
        return self._refresh()

    def action(self, action: str, **payload: Any) -> Any:
        token = self.access_token()
        data = self._request(
            "POST",
            self.gateway_url,
            {"action": action, **payload},
            {"Authorization": f"Bearer {token}"},
        )
        if not isinstance(data, dict) or data.get("ok") is not True:
            raise SiteMachineError(
                f"Site Machine gateway failed: {json.dumps(data, default=str)[:2000]}"
            )
        return data.get("data")
