from __future__ import annotations

import json
import os
import shlex
import subprocess
from pathlib import Path
from typing import Any

from .client import SiteMachineError


def _run(argv: list[str], *, cwd: str | None = None, timeout: int = 1800) -> dict[str, Any]:
    proc = subprocess.run(
        argv,
        cwd=cwd,
        capture_output=True,
        text=True,
        timeout=timeout,
        shell=False,
    )
    return {
        "ok": proc.returncode == 0,
        "exitCode": proc.returncode,
        "stdout": proc.stdout[-30000:],
        "stderr": proc.stderr[-30000:],
    }


def _agent_command() -> list[str]:
    configured = os.environ.get("SITE_MACHINE_AGENT_CMD", "").strip()
    if configured:
        return shlex.split(configured)

    from shutil import which

    if which("claude"):
        return ["claude", "-p"]
    if which("codex"):
        return ["codex", "exec"]
    raise SiteMachineError(
        "No local AI harness found. Install Claude Code/Codex or set SITE_MACHINE_AGENT_CMD."
    )


def _render_prompt(job: dict[str, Any]) -> str:
    payload = job.get("payload") or {}
    task = payload.get("input") or {}
    agent = str(payload.get("agent") or "")
    provider = str(payload.get("provider") or "")
    authority = str(payload.get("authority") or "")
    build_id = str(job.get("build_id") or payload.get("buildId") or "")
    task_id = str(job.get("task_id") or payload.get("taskId") or "")

    return f"""# CASH SITE MACHINE TASK

You are executing one bounded task from Cash Site OS.

Build ID: {build_id}
Task ID: {task_id}
Agent role: {agent}
Provider: {provider}
Authority: {authority}

Task input:
{json.dumps(task, indent=2)}

Execution rules:
- Work only inside the supplied task scope.
- Use the Framer External Agent connection when the task targets Framer.
- Framer changes must stay on an agent branch. Do not publish production unless authority is RELEASE_REQUIRED and explicit release approval is present.
- Inspect the actual mounted/rendered source before changing a visible component.
- Preserve requested elements exactly.
- Use local tools, files, GitHub, Rive, Figma or other configured providers only when relevant.
- Run verification/typecheck/QA appropriate to the change.
- Return concise structured evidence: files/nodes/assets changed, validation performed, preview/branch references, blockers, and recommended next action.
- Never expose credentials in output.
"""


def run_agent_task(job: dict[str, Any], workspace_root: str) -> dict[str, Any]:
    prompt = _render_prompt(job)
    command = _agent_command()

    build_id = str(job.get("build_id") or "unknown")
    task_id = str(job.get("task_id") or "unknown")
    working = Path(workspace_root) / "runs" / build_id / task_id.replace(":", "_")
    working.mkdir(parents=True, exist_ok=True)

    prompt_file = working / "task.md"
    prompt_file.write_text(prompt, encoding="utf-8")

    if command[:2] == ["claude", "-p"]:
        result = _run(command + [prompt], cwd=str(working))
    elif command[:2] == ["codex", "exec"]:
        result = _run(command + [prompt], cwd=str(working))
    else:
        result = _run(command + [str(prompt_file)], cwd=str(working))

    result["workspace"] = str(working)
    result["taskFile"] = str(prompt_file)
    return result
