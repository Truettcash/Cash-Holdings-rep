from __future__ import annotations

import os
import platform
import shutil
from pathlib import Path
from typing import Any


def _exists_any(paths: list[str]) -> bool:
    return any(Path(os.path.expandvars(path)).exists() for path in paths)


def detect_capabilities() -> tuple[list[str], dict[str, Any]]:
    caps: set[str] = {"LOCAL_FILES", "GITHUB"}
    detail: dict[str, Any] = {}

    framer_paths = [
        r"%LOCALAPPDATA%\Programs\Framer\Framer.exe",
        r"%LOCALAPPDATA%\Framer\Framer.exe",
        r"%PROGRAMFILES%\Framer\Framer.exe",
    ]
    framer_desktop = _exists_any(framer_paths)
    if framer_desktop:
        caps.add("FRAMER_DESKTOP")
    detail["framerDesktop"] = framer_desktop

    node = shutil.which("node")
    npx = shutil.which("npx")
    if node:
        caps.add("NODE")
    if npx:
        caps.add("NPX")
        caps.add("FRAMER_AGENT")
    detail["node"] = node
    detail["npx"] = npx

    claude = shutil.which("claude")
    codex = shutil.which("codex")
    if claude:
        caps.add("CLAUDE_CODE")
    if codex:
        caps.add("CODEX")
    detail["claude"] = claude
    detail["codex"] = codex

    rive = shutil.which("rive")
    if rive:
        caps.add("RIVE")
    detail["rive"] = rive

    git = shutil.which("git")
    if git:
        caps.add("GIT")
    detail["git"] = git

    browsers = {
        "chrome": shutil.which("chrome") or shutil.which("google-chrome"),
        "edge": shutil.which("msedge"),
        "firefox": shutil.which("firefox"),
    }
    if any(browsers.values()):
        caps.add("BROWSER_QA")
    detail["browsers"] = browsers

    detail["platform"] = platform.platform()
    detail["python"] = platform.python_version()
    return sorted(caps), detail
