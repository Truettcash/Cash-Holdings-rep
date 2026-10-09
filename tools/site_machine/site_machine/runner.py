from __future__ import annotations

import json
import os
import shlex
import shutil
import subprocess
import threading
from collections import deque
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
    stdout_tail: deque[str] = deque(maxlen=1200)
    stderr_tail: deque[str] = deque(maxlen=1200)

    try:
        proc = subprocess.Popen(
            resolved,
            cwd=cwd,
            stdin=subprocess.PIPE if input_text is not None else None,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            errors="replace",
            bufsize=1,
            shell=False,
        )
    except FileNotFoundError as exc:
        raise SiteMachineError(
            f"Local agent executable could not be launched: {resolved[0] if resolved else argv[0]}"
        ) from exc

    def pump(stream: Any, target: deque[str], prefix: str) -> None:
        if stream is None:
            return
        for line in iter(stream.readline, ""):
            target.append(line)
            # Surface progress in real time so orchestration never looks frozen.
            print(f"{prefix}{line}", end="", flush=True)
        stream.close()

    out_thread = threading.Thread(target=pump, args=(proc.stdout, stdout_tail, ""), daemon=True)
    err_thread = threading.Thread(target=pump, args=(proc.stderr, stderr_tail, "[agent] "), daemon=True)
    out_thread.start()
    err_thread.start()

    if input_text is not None and proc.stdin is not None:
        proc.stdin.write(input_text)
        proc.stdin.close()

    try:
        proc.wait(timeout=timeout)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait(timeout=10)
        raise SiteMachineError(
            f"Local agent exceeded {timeout}s timeout. Last stderr: {''.join(stderr_tail)[-2000:]}"
        )
    finally:
        out_thread.join(timeout=5)
        err_thread.join(timeout=5)

    return {
        "ok": proc.returncode == 0,
        "exitCode": proc.returncode,
        "stdout": "".join(stdout_tail)[-30000:],
        "stderr": "".join(stderr_tail)[-30000:],
        "command": resolved,
    }


def _agent_command(agent: str = "", provider: str = "") -> list[str]:
    configured = os.environ.get("SITE_MACHINE_AGENT_CMD", "").strip()
    if configured:
        return shlex.split(configured)

    codex = shutil.which("codex")
    claude = shutil.which("claude")

    # Codex is the primary Site Machine harness for every role, including Framer.
    if codex:
        return [codex, "exec"]
    if claude:
        return [claude, "-p"]

    raise SiteMachineError(
        "No local AI harness found. Install Codex or set SITE_MACHINE_AGENT_CMD."
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
- Use the already-installed Framer External Agent connection when the task targets Framer.
- Do NOT rerun `npx @framer/agent setup` inside a build task; setup is installer-owned.
- Obey the supplied authority exactly.
- If authority is BRANCH_ONLY, Framer changes must stay on an agent branch.
- If authority is MAIN_EDIT_ALLOWED, direct edits to the proved generated project main canvas are permitted, but production publishing remains forbidden.
- Never publish production unless authority is RELEASE_REQUIRED and explicit release approval is present.
- Inspect the actual mounted/rendered source before changing a visible component.
- Preserve requested elements exactly.
- Use local tools, files, GitHub, Rive, Figma or other configured providers only when relevant.
- Run verification/typecheck/QA appropriate to the change.
- Return concise structured evidence: files/nodes/assets changed, validation performed, preview/branch references, blockers, and recommended next action.
- Never expose credentials in output.
"""


def run_agent_task(job: dict[str, Any], workspace_root: str) -> dict[str, Any]:
    prompt = _render_prompt(job)
    payload = job.get("payload") or {}
    command = _agent_command(
        agent=str(payload.get("agent") or ""),
        provider=str(payload.get("provider") or ""),
    )

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
        # On Windows, Codex's inner sandbox/helper can fail before shell/MCP tools start.
        # Site Machine already enforces target-project, branch, and release gates, so for
        # unattended Framer execution we bypass Codex's inner sandbox and approvals.
        # This also allows MCP/External Agent calls in codex exec.
        result = _run(
            [
                command[0],
                "exec",
                "--dangerously-bypass-approvals-and-sandbox",
                "--skip-git-repo-check",
                "-",
            ],
            cwd=str(Path(workspace_root)),
            input_text=prompt,
        )
    else:
        result = _run(command + [str(prompt_file)], cwd=str(Path(workspace_root)))

    result["workspace"] = str(working)
    result["taskFile"] = str(prompt_file)
    return result
