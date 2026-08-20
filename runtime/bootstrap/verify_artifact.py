"""Verify the pinned OpenJarvis source artifact against runtime/openjarvis-version.lock.toml."""

from __future__ import annotations

import hashlib
import tomllib
import urllib.request
from pathlib import Path
from typing import Callable

_LOCK_PATH = Path(__file__).resolve().parents[1] / "openjarvis-version.lock.toml"
_PYPI_ARTIFACT_URL = (
    "https://files.pythonhosted.org/packages/source/o/openjarvis/openjarvis-1.0.3.tar.gz"
)


class ArtifactVerificationError(RuntimeError):
    """Raised when the downloaded artifact does not match the pinned identity."""


def load_lock(lock_path: Path = _LOCK_PATH) -> dict:
    with lock_path.open("rb") as handle:
        return tomllib.load(handle)


def sha256_of(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def verify_bytes(data: bytes, lock: dict | None = None) -> dict:
    """Raise ArtifactVerificationError unless the bytes match the pinned SHA-256."""
    lock = lock or load_lock()
    expected = lock["source_artifact_sha256"]
    actual = sha256_of(data)
    if actual != expected:
        raise ArtifactVerificationError(
            f"SHA-256 mismatch: expected {expected}, got {actual}"
        )
    return lock


def acquire_and_verify(
    dest_path: Path,
    *,
    lock: dict | None = None,
    downloader: Callable[[str], bytes] | None = None,
) -> Path:
    """Download the pinned artifact to dest_path only if its hash verifies.

    ``downloader`` is injectable for tests; defaults to a real HTTPS GET of
    the pinned PyPI URL. The artifact is written only after verification.
    """
    lock = lock or load_lock()
    fetch = downloader or _default_download
    data = fetch(_PYPI_ARTIFACT_URL)
    verify_bytes(data, lock)
    dest_path.parent.mkdir(parents=True, exist_ok=True)
    dest_path.write_bytes(data)
    return dest_path


def _default_download(url: str) -> bytes:  # pragma: no cover - network wiring
    with urllib.request.urlopen(url, timeout=60) as response:
        return response.read()
