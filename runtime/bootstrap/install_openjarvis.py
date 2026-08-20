"""Install exactly OpenJarvis 1.0.3 into an isolated, deterministic environment.

Generated installation lives outside this repository checkout. This module
never upgrades to a different version and fails closed on any hash mismatch.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

from verify_artifact import ArtifactVerificationError, acquire_and_verify, load_lock

DEFAULT_INSTALL_PREFIX = Path("~/.local/share/openjarvis/1.0.3").expanduser()
DEFAULT_LAUNCHER_DIR = Path("~/.local/bin").expanduser()


class InstallError(RuntimeError):
    pass


def install(
    install_prefix: Path = DEFAULT_INSTALL_PREFIX,
    *,
    lock=None,
    downloader=None,
    run=subprocess.run,
) -> Path:
    """Verify the pinned artifact, then install it into an isolated venv.

    Returns the path to the venv's ``jarvis`` console script.
    """
    lock = lock or load_lock()
    if lock["version"] != "1.0.3":
        raise InstallError("lock file no longer pins version 1.0.3; refusing to install")

    install_prefix.mkdir(parents=True, exist_ok=True)
    artifact_path = install_prefix / lock["source_artifact"]
    try:
        acquire_and_verify(artifact_path, lock=lock, downloader=downloader)
    except ArtifactVerificationError:
        raise

    venv_dir = install_prefix / "venv"
    result = run([sys.executable, "-m", "venv", str(venv_dir)], capture_output=True, text=True)
    if result.returncode != 0:
        raise InstallError(f"venv creation failed: {result.stderr}")

    venv_python = venv_dir / "bin" / "python"
    result = run(
        [str(venv_python), "-m", "pip", "install", "--no-input", str(artifact_path)],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise InstallError(f"pip install failed: {result.stderr}")

    jarvis_script = venv_dir / "bin" / "jarvis"
    if not jarvis_script.exists():
        raise InstallError("installed environment has no jarvis console script")
    return jarvis_script
