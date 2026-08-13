"""Dependency-injectable, fail-closed Cash user session token provider."""

from __future__ import annotations

import json
import os
import stat
import tempfile
import time
from pathlib import Path
from typing import Any, Callable


class AuthError(RuntimeError):
    """Raised when private Cash auth state is absent or invalid."""


Refresh = Callable[[str], dict[str, Any]]


class TokenProvider:
    """Load a user-bound refresh token and keep access tokens memory-only."""

    def __init__(
        self,
        expected_user_id: str,
        *,
        state_root: str | os.PathLike[str] = "~/.cash-mcp",
        refresh: Refresh | None = None,
        clock: Callable[[], float] = time.time,
        refresh_skew_seconds: int = 30,
    ) -> None:
        if not expected_user_id:
            raise ValueError("expected_user_id is required")
        self.expected_user_id = expected_user_id
        self.state_root = Path(state_root).expanduser()
        self.state_file = self.state_root / "session.json"
        self._refresh = refresh
        self._clock = clock
        self._skew = refresh_skew_seconds
        self._access_token: str | None = None
        self._expires_at: float = 0

    def access_token(self) -> str:
        state = self._read_state()
        if self._access_token and self._clock() < self._expires_at - self._skew:
            return self._access_token
        if self._refresh is None:
            raise AuthError("session access token is unavailable")
        refreshed = self._refresh(str(state["refresh_token"]))
        self._accept_refresh(refreshed)
        return self._access_token or self._fail("refresh returned no access token")

    def _read_state(self) -> dict[str, Any]:
        if not self.state_file.is_file():
            raise AuthError("Cash session state is missing")
        try:
            state = json.loads(self.state_file.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise AuthError("Cash session state is unreadable") from exc
        if not isinstance(state, dict) or state.get("user_id") != self.expected_user_id:
            raise AuthError("Cash session identity mismatch")
        refresh_token = state.get("refresh_token")
        if not isinstance(refresh_token, str) or not refresh_token:
            raise AuthError("Cash refresh token is missing")
        return state

    def _accept_refresh(self, refreshed: dict[str, Any]) -> None:
        if not isinstance(refreshed, dict) or refreshed.get("user_id") != self.expected_user_id:
            raise AuthError("refreshed session identity mismatch")
        access = refreshed.get("access_token")
        refresh = refreshed.get("refresh_token")
        expires_at = refreshed.get("expires_at")
        if not isinstance(access, str) or not access or not isinstance(refresh, str) or not refresh:
            raise AuthError("refreshed session is incomplete")
        if not isinstance(expires_at, (int, float)) or expires_at <= self._clock():
            raise AuthError("refreshed session is expired")
        self._atomic_write({"user_id": self.expected_user_id, "refresh_token": refresh, "expires_at": expires_at})
        self._access_token = access
        self._expires_at = float(expires_at)

    def _atomic_write(self, state: dict[str, Any]) -> None:
        self.state_root.mkdir(parents=True, exist_ok=True)
        os.chmod(self.state_root, stat.S_IRWXU)
        fd, temp_name = tempfile.mkstemp(prefix="session.", suffix=".tmp", dir=self.state_root)
        try:
            os.fchmod(fd, stat.S_IRUSR | stat.S_IWUSR)
            with os.fdopen(fd, "w", encoding="utf-8") as handle:
                json.dump(state, handle, separators=(",", ":"))
                handle.write("\n")
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(temp_name, self.state_file)
            os.chmod(self.state_file, stat.S_IRUSR | stat.S_IWUSR)
        finally:
            if os.path.exists(temp_name):
                os.unlink(temp_name)

    @staticmethod
    def _fail(message: str) -> str:
        raise AuthError(message)