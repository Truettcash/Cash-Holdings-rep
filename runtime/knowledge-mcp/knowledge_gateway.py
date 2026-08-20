"""Fixed authenticated HTTPS adapter for the deployed Knowledge read gateway."""
from __future__ import annotations
import json
import urllib.error
import urllib.request
from typing import Any

class GatewayError(RuntimeError):
    def __init__(self, status: int, payload: Any): self.status, self.payload = status, payload; super().__init__(f"Knowledge gateway HTTP {status}")
class KnowledgeGateway:
    def __init__(self, endpoint: str, publishable_key: str, timeout: float = 15.0):
        if not endpoint.startswith("https://") or not publishable_key: raise ValueError("HTTPS endpoint and publishable key are required")
        self.endpoint, self.publishable_key, self.timeout = endpoint, publishable_key, timeout
    def call(self, action: str, arguments: dict[str, Any], bearer_token: str) -> dict[str, Any]:
        request = urllib.request.Request(self.endpoint, data=json.dumps({"action": action, **arguments}).encode(), method="POST", headers={"Content-Type":"application/json","Accept":"application/json","apikey":self.publishable_key,"Authorization":f"Bearer {bearer_token}"})
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response: status, raw = int(response.status), response.read()
        except urllib.error.HTTPError as exc: raise GatewayError(exc.code, self._json(exc.read())) from exc
        except urllib.error.URLError as exc: raise GatewayError(599, {"error":{"code":"NETWORK_ERROR","message":str(exc.reason)}}) from exc
        payload=self._json(raw)
        if not isinstance(payload,dict) or not 200 <= status < 300: raise GatewayError(status,{"error":{"code":"INVALID_RESPONSE","message":"gateway response is invalid"}})
        return payload
    @staticmethod
    def _json(raw: bytes) -> Any:
        try: return json.loads(raw.decode())
        except (UnicodeDecodeError,json.JSONDecodeError): return None