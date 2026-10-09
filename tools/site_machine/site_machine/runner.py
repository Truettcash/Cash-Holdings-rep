from __future__ import annotations

import json
import os
import shlex
import shutil
import subprocess
from pathlib import Path
from typing import Any

from .client import SiteMachineError


def _resolve_command(argv: list[str]) -> list[str]:
    if not argv:
        return argv

    executable = shutil.which(argv[0])
    if executable:
        argv = [executable, *argv[1:]]

    # Windows cannot CreateProcess a .cmd/.bat launcher directly with shell=False.
    # Run those through cmd.exe while preserving argument boundaries.
    if os.name == "nt" and argv and str(argv[0]).lower().endswith((".cmd", ".bat")):
        cmd = os.environ.get("COMSPEC") or shutil.which("cmd.exe") or r"C:\Windows\System32\cmd.exe"
        quoted = subprocess.list2cmdline(argv)
        return [cmd, "/d", "/s", "/c", quoted]

    return argv


def _run(
    argv: list[str],
    *,
    cwd: str | None = None,
    timeout: int = 1800,
    input_text: str | None = None,
) -> dict[str, Any]:
    resolved = _resolve_command(argv)
    try:
        proc = subprocess.run(
            resolved,
            cwd=cwd,
            capture_output=True,
            text=True,
            timeout=timeout,
            shell=False,
            input=input_text,
        )
        return {
            "ok": proc.returncode == 0,
            "exitCode": proc.returncode,
            "stdout": proc.stdout[-30000:],
            "stderr": proc.stderr[-30000:],
            "command": resolved,
        }
    except FileNotFoundError as exc:
        raise SiteMachineError(
            f"Local agent executable could not be launched: {resolved[0] if resolved else argv[0]}"
        ) from exc


def _agent_command() -> list[str]:
    configured = os.environ.get("SITE_MACHINE_AGENT_CMD", "").strip()
    if configured:
        return shlex.split(configured)

    codex = shutil.which("codex")
    claude = shutil.which("claude")

    if codex:
        return [codex, "exec"]
    if claude:
        return [claude, "-p"]
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
- Treat this machine as a multi-site factory, not a single-site assistant.
- Read the workspace AGENTS.md and site-factory/SYSTEM.md before broad site work.
- Resolve the target site from the local site registry before editing.
- Reuse patterns only when context matches; preserve site-specific identity.
- Record material new patterns, variants, QA observations, and failures into the site-factory workspace.
- Never propagate a pattern across sites without per-site review and QA.
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

    exe_name = Path(command[0]).name.lower() if command else ""
    if exe_name.startswith("claude"):
        result = _run(command + [prompt], cwd=str(Path(workspace_root)))
    elif exe_name.startswith("codex"):
        # Codex explicitly supports '-' as the stdin prompt sentinel.
        # This avoids Windows cmd.exe quoting/parsing of multiline prompts.
        # The Site Machine workspace is intentionally not a Git repo; skip that guard
        # because project identity/versioning is enforced by the Site Factory + provider.
        result = _run(
            command + ["--skip-git-repo-check", "-"],
            cwd=str(Path(workspace_root)),
            input_text=prompt,
        )
    else:
        result = _run(command + [str(prompt_file)], cwd=str(Path(workspace_root)))

    result["workspace"] = str(working)
    result["taskFile"] = str(prompt_file)
    return result
