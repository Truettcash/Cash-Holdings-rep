"""Real Supabase user-scoped auth transport for TokenProvider.refresh.

Only grant types used: refresh_token (recurring) and password (one-time
bootstrap). No service-role, no CASH_SUPABASE_ACCESS_TOKEN, no logging of
credential or token values.
"""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from typing import Any, Callable


class AuthTransportError(RuntimeError):
    def __init__(self, status: int, code: str, message: str) -> None:
        self.status = status
        self.code = code
        super().__init__(f"Supabase auth request failed ({status}): {code}")


class SupabaseUserAuthTransport:
    """Narrow Supabase GoTrue client for user-scoped grants only."""

    def __init__(
        self,
        supabase_url: str,
        publishable_key: str,
        *,
        timeout: float = 15.0,
        opener: Callable[..., Any] | None = None,
    ) -> None:
        if not supabase_url or not supabase_url.startswith("https://"):
            raise ValueError("Supabase URL must be HTTPS")
        if not publishable_key:
            raise ValueError("Supabase publishable key is required")
        self.supabase_url = supabase_url.rstrip("/")
        self.publishable_key = publishable_key
        self.timeout = timeout
        self._opener = opener or urllib.request.urlopen

    def _post(self, grant_type: str, body: dict[str, Any]) -> dict[str, Any]:
        url = f"{self.supabase_url}/auth/v1/token?grant_type={grant_type}"
        request = urllib.request.Request(
            url,
            data=json.dumps(body).encode("utf-8"),
            method="POST",
            headers={
                "apikey": self.publishable_key,
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
        )
        try:
            with self._opener(request, timeout=self.timeout) as response:
                status = int(response.status)
                raw = response.read()
        except urllib.error.HTTPError as exc:
            raw = exc.read()
            payload = self._json(raw)
            raise AuthTransportError(exc.code, self._error_code(payload), "grant rejected") from exc
        except urllib.error.URLError as exc:
            raise AuthTransportError(599, "NETWORK_ERROR", str(exc.reason)) from exc
        payload = self._json(raw)
        if payload is None or status < 200 or status >= 300:
            raise AuthTransportError(status, self._error_code(payload), "grant response invalid")
        return payload

    @staticmethod
    def _error_code(payload: Any) -> str:
        if isinstance(payload, dict):
            code = payload.get("error_code") or payload.get("error") or payload.get("code")
            if isinstance(code, str):
                return code
        return "UNKNOWN_ERROR"

    @staticmethod
    def _json(raw: bytes) -> Any:
        try:
            return json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            return None

    @staticmethod
    def _session_from_payload(payload: dict[str, Any]) -> dict[str, Any]:
        access_token = payload.get("access_token")
        refresh_token = payload.get("refresh_token")
        expires_at = payload.get("expires_at")
        user = payload.get("user")
        user_id = user.get("id") if isinstance(user, dict) else None
        if not all(
            [
                isinstance(access_token, str) and access_token,
                isinstance(refresh_token, str) and refresh_token,
                isinstance(expires_at, (int, float)),
                isinstance(user_id, str) and user_id,
            ]
        ):
            raise AuthTransportError(502, "INVALID_SESSION", "session payload is incomplete")
        return {
            "user_id": user_id,
            "access_token": access_token,
            "refresh_token": refresh_token,
            "expires_at": expires_at,
        }

    def refresh(self, refresh_token: str) -> dict[str, Any]:
        """Exchange a refresh token for a rotated session. Used by TokenProvider."""
        if not refresh_token:
            raise ValueError("refresh_token is required")
        payload = self._post("refresh_token", {"refresh_token": refresh_token})
        return self._session_from_payload(payload)

    def password_grant(self, email: str, password: str) -> dict[str, Any]:
        """One-time bootstrap grant. Caller must never persist the password."""
        if not email or not password:
            raise ValueError("email and password are required")
        payload = self._post("password", {"email": email, "password": password})
        return self._session_from_payload(payload)
