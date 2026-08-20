"""Narrow authenticated HTTP adapter for the Cash read gateway."""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from typing import Any, Callable


class GatewayError(RuntimeError):
    def __init__(self, status: int, payload: Any) -> None:
        self.status = status
        self.payload = payload
        super().__init__(f"Cash gateway request failed with HTTP {status}")


class GatewayClient:
    def __init__(
        self,
        endpoint: str,
        publishable_key: str,
        *,
        timeout: float = 15.0,
        opener: Callable[..., Any] | None = None,
    ) -> None:
        if not endpoint or not endpoint.startswith("https://"):
            raise ValueError("Cash gateway endpoint must be HTTPS")
        if not publishable_key:
            raise ValueError("Cash publishable key is required")
        self.endpoint = endpoint
        self.publishable_key = publishable_key
        self.timeout = timeout
        self._opener = opener or urllib.request.urlopen

    def call(self, action: str, arguments: dict[str, Any], bearer_token: str) -> dict[str, Any]:
        if not bearer_token:
            raise ValueError("bearer token is required")
        body = json.dumps({"action": action, **arguments}).encode("utf-8")
        request = urllib.request.Request(
            self.endpoint,
            data=body,
            method="POST",
            headers={
                "Accept": "application/json",
                "Content-Type": "application/json",
                "apikey": self.publishable_key,
                "Authorization": f"Bearer {bearer_token}",
            },
        )
        try:
            with self._opener(request, timeout=self.timeout) as response:
                status = int(response.status)
                raw = response.read()
        except urllib.error.HTTPError as exc:
            raw = exc.read()
            raise GatewayError(exc.code, self._json(raw)) from exc
        except urllib.error.URLError as exc:
            raise GatewayError(599, {"error": {"code": "NETWORK_ERROR", "message": str(exc.reason)}}) from exc
        payload = self._json(raw)
        if payload is None:
            raise GatewayError(status, {"error": {"code": "INVALID_RESPONSE", "message": "gateway response is not valid JSON"}})
        if status < 200 or status >= 300:
            raise GatewayError(status, payload)
        if not isinstance(payload, dict):
            raise GatewayError(status, {"error": {"code": "INVALID_RESPONSE", "message": "gateway response is not an object"}})
        return payload

    @staticmethod
    def _json(raw: bytes) -> Any:
        try:
            return json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            return None