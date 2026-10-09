from __future__ import annotations

import os
import platform
import shutil
import subprocess
from pathlib import Path
from typing import Any


def _expand(path: str) -> str:
    return os.path.expanduser(os.path.expandvars(path))


def _first_existing(paths: list[str]) -> str | None:
    for path in paths:
        expanded = _expand(path)
        if Path(expanded).exists():
            return expanded
    return None


def _which_or_paths(commands: list[str], paths: list[str]) -> str | None:
    for command in commands:
        found = shutil.which(command)
        if found:
            return found
    return _first_existing(paths)


def _command_ok(argv: list[str], timeout: int = 5) -> bool:
    try:
        result = subprocess.run(argv, capture_output=True, text=True, timeout=timeout, shell=False)
        return result.returncode == 0
    except Exception:
        return False


def detect_capabilities() -> tuple[list[str], dict[str, Any]]:
    caps: set[str] = {"LOCAL_FILES"}
    detail: dict[str, Any] = {}

    framer = _which_or_paths(
        ["Framer"],
        [
            r"%LOCALAPPDATA%\Programs\Framer\Framer.exe",
            r"%LOCALAPPDATA%\Framer\Framer.exe",
            r"%PROGRAMFILES%\Framer\Framer.exe",
        ],
    )
    if framer:
        caps.add("FRAMER_DESKTOP")
    detail["framerDesktop"] = framer

    node = shutil.which("node")
    npx = shutil.which("npx")
    if node:
        caps.add("NODE")
    if npx:
        caps.add("NPX")
        # Setup may still require approval inside the harness; this means the local prerequisite exists.
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

    rive = _which_or_paths(
        ["rive"],
        [
            r"%USERPROFILE%\.rive\bin\rive.exe",
            r"%USERPROFILE%\.local\bin\rive.exe",
            r"%LOCALAPPDATA%\rive\rive.exe",
        ],
    )
    if rive:
        caps.add("RIVE")
    detail["rive"] = rive

    git = shutil.which("git")
    if git:
        caps.add("GIT")
    detail["git"] = git

    gh = shutil.which("gh")
    github_authenticated = bool(gh and _command_ok([gh, "auth", "status"]))
    if github_authenticated:
        caps.add("GITHUB")
    detail["github"] = {"cli": gh, "authenticated": github_authenticated}

    browsers = {
        "chrome": _which_or_paths(
            ["chrome", "google-chrome"],
            [
                r"%PROGRAMFILES%\Google\Chrome\Application\chrome.exe",
                r"%PROGRAMFILES(X86)%\Google\Chrome\Application\chrome.exe",
                r"%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe",
            ],
        ),
        "edge": _which_or_paths(
            ["msedge"],
            [
                r"%PROGRAMFILES(X86)%\Microsoft\Edge\Application\msedge.exe",
                r"%PROGRAMFILES%\Microsoft\Edge\Application\msedge.exe",
                r"%LOCALAPPDATA%\Microsoft\Edge\Application\msedge.exe",
            ],
        ),
        "firefox": _which_or_paths(
            ["firefox"],
            [
                r"%PROGRAMFILES%\Mozilla Firefox\firefox.exe",
                r"%PROGRAMFILES(X86)%\Mozilla Firefox\firefox.exe",
            ],
        ),
    }
    if any(browsers.values()):
        caps.add("BROWSER_QA")
    detail["browsers"] = browsers

    detail["platform"] = platform.platform()
    detail["python"] = platform.python_version()
    return sorted(caps), detail
