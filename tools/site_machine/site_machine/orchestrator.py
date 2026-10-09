from __future__ import annotations

import json
import os
import re
import subprocess
import time
from pathlib import Path
from typing import Any

from .client import SiteMachineError
from .factory import SiteFactory, _read_json, _write_json
from .qa import browser_qa
from .runner import run_agent_task


def _now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def _extract_json_object(text: str) -> dict[str, Any] | None:
    """Best-effort extraction of the last JSON object emitted by an agent."""
    text = text.strip()
    if not text:
        return None
    starts = [m.start() for m in re.finditer(r"\{", text)]
    for start in reversed(starts):
        candidate = text[start:]
        try:
            value = json.loads(candidate)
            if isinstance(value, dict):
                return value
        except Exception:
            continue
    return None


class BuildOrchestrator:
    def __init__(self, workspace: str):
        self.workspace = Path(workspace)
        self.factory = SiteFactory(workspace)

    def _build_path(self, build_id: str) -> Path:
        return self.factory.builds / f"{build_id}.json"

    def load_build(self, build_id: str) -> dict[str, Any]:
        path = self._build_path(build_id)
        if not path.exists():
            raise SiteMachineError(f"Build not found: {build_id}")
        return _read_json(path)

    def save_build(self, build: dict[str, Any]) -> None:
        build["updatedAt"] = _now()
        _write_json(self._build_path(str(build["buildId"])), build)

    def attach_container(
        self,
        build_id: str,
        project_url: str,
        project_id: str | None = None,
        preview_url: str | None = None,
    ) -> dict[str, Any]:
        project_url = project_url.strip()
        if not project_url.startswith(("https://", "http://")):
            raise SiteMachineError("Project URL must be an absolute http(s) URL.")
        if "..." in project_url or project_url.endswith("/projects/"):
            raise SiteMachineError(
                "Project URL is a placeholder/incomplete URL. Attach the real provider project URL."
            )
        build = self.load_build(build_id)
        site_path = self.factory.sites / f"{build['siteKey']}.json"
        site = _read_json(site_path) if site_path.exists() else {}

        container = dict(build.get("container") or {})
        container.update({
            "provider": build.get("platform") or container.get("provider") or "framer",
            "status": "ready",
            "projectUrl": project_url,
        })
        if project_id:
            container["projectId"] = project_id
        if preview_url:
            container["previewUrl"] = preview_url
        container.pop("reason", None)

        build["container"] = container
        build["status"] = "ready_for_build"
        self.save_build(build)

        if site:
            site["projectUrl"] = project_url
            site["status"] = "registered"
            site["container"] = container
            _write_json(site_path, site)

        return {"build": build, "site": site}

    def provision(self, build_id: str, command: str | None = None) -> dict[str, Any]:
        build = self.load_build(build_id)
        existing = build.get("container") or {}
        if existing.get("projectUrl"):
            return {"ok": True, "alreadyReady": True, "build": build}

        provider_cmd = (command or os.environ.get("SITE_MACHINE_CONTAINER_CMD") or "").strip()
        if not provider_cmd:
            raise SiteMachineError(
                "No project-container provisioner configured. "
                "Set SITE_MACHINE_CONTAINER_CMD or use attach-container."
            )

        request = {
            "buildId": build_id,
            "siteKey": build.get("siteKey"),
            "name": self._site_name(str(build.get("siteKey") or "")),
            "prompt": build.get("prompt"),
            "platform": build.get("platform"),
            "patternCandidates": build.get("patternCandidates") or [],
        }
        proc = subprocess.run(
            provider_cmd,
            input=json.dumps(request),
            capture_output=True,
            text=True,
            timeout=300,
            shell=True,
        )
        if proc.returncode != 0:
            raise SiteMachineError(f"Container provider failed: {proc.stderr[-3000:]}")
        try:
            result = json.loads(proc.stdout)
        except Exception as exc:
            raise SiteMachineError("Container provider did not return JSON") from exc
        project_url = str(result.get("projectUrl") or "").strip()
        if not project_url:
            raise SiteMachineError("Container provider returned no projectUrl")

        attached = self.attach_container(
            build_id,
            project_url=project_url,
            project_id=str(result.get("projectId") or "").strip() or None,
            preview_url=str(result.get("previewUrl") or "").strip() or None,
        )
        attached["providerResult"] = result
        return attached

    def _site_name(self, site_key: str) -> str:
        path = self.factory.sites / f"{site_key}.json"
        if not path.exists():
            return site_key
        return str(_read_json(path).get("displayName") or site_key)

    def _agent_job(
        self,
        build: dict[str, Any],
        task_id: str,
        agent: str,
        instruction: str,
    ) -> dict[str, Any]:
        authority = str(build.get("authority") or "BRANCH_ONLY")
        return {
            "build_id": build["buildId"],
            "task_id": task_id,
            "payload": {
                "buildId": build["buildId"],
                "taskId": task_id,
                "agent": agent,
                "provider": build.get("platform") or "framer",
                "authority": authority,
                "input": {
                    "instruction": instruction,
                    "siteKey": build.get("siteKey"),
                    "project": build.get("container") or {},
                    "prompt": build.get("prompt"),
                    "patternCandidates": build.get("patternCandidates") or [],
                    "releaseGate": "human_required",
                },
            },
        }

    def _run_stage(
        self,
        build: dict[str, Any],
        task_id: str,
        agent: str,
        instruction: str,
    ) -> dict[str, Any]:
        result = run_agent_task(
            self._agent_job(build, task_id, agent, instruction),
            str(self.workspace),
        )
        parsed = _extract_json_object(result.get("stdout") or "")
        if parsed:
            result["structured"] = parsed
        return result

    def run(
        self,
        build_id: str,
        max_passes: int = 3,
        skip_qa: bool = False,
        allow_main: bool = False,
    ) -> dict[str, Any]:
        build = self.load_build(build_id)
        if allow_main:
            if str(build.get("origin") or "") != "generator":
                raise SiteMachineError(
                    "--allow-main is only permitted for generator-origin builds. "
                    "Existing-site revisions remain branch-only."
                )
            build["authority"] = "MAIN_EDIT_ALLOWED"
        else:
            build["authority"] = str(build.get("authority") or "BRANCH_ONLY")
        container = build.get("container") or {}
        if not container.get("projectUrl"):
            raise SiteMachineError(
                f"Build {build_id} has no project container. "
                "Provision or attach a project before build-site."
            )

        build["status"] = "building"
        build["orchestration"] = {
            "startedAt": _now(),
            "maxPasses": max_passes,
            "stages": [],
        }
        self.save_build(build)

        plan = self._run_stage(
            build,
            "01-plan",
            "SITE_PLANNER",
            """Read AGENTS.md, site-factory/SYSTEM.md, the site manifest, and selected pattern files.
Prove the target project identity before any write.
Create a concise implementation strategy and 2-3 materially different design variants when uncertainty is material.
Choose one recommended direction and explain why.
Do not publish.
Missing business facts, credentials, response-time claims, service-area claims, phone numbers, or form destinations must never be fabricated.
Treat missing content facts as RELEASE blockers, not BUILD blockers: use clearly marked placeholders or omit unsupported claims so the implementation can still proceed safely.
End with one JSON object containing:
{"projectIdentityProved":true|false,"recommendedVariant":"...","selectedPatterns":["..."],"buildBlockers":["..."],"releaseBlockers":["..."]}""",
        )
        build["orchestration"]["stages"].append({"stage": "plan", "result": plan})
        plan_structured = plan.get("structured") or {}
        build_blockers = list(plan_structured.get("buildBlockers") or [])
        release_blockers = list(plan_structured.get("releaseBlockers") or [])
        identity_proved = plan_structured.get("projectIdentityProved")
        build["orchestration"]["releaseBlockers"] = release_blockers
        if (not plan.get("ok")) or build_blockers or identity_proved is False:
            build["status"] = "blocked"
            build["orchestration"]["blockers"] = build_blockers or ["Planner did not prove project identity."]
            self.save_build(build)
            return build

        build_result = self._run_stage(
            build,
            "02-build",
            "FRAMER_BUILDER" if str(build.get("platform")).lower() == "framer" else "CODE_AGENT",
            """Implement the selected direction in the attached project.
For Framer, use the installed Framer skill and operate only on the proved target project.
Source-trace any existing rendered component before replacing it.
Use Rive only when motion materially improves the design and keep a non-Rive fallback.
Build responsive desktop/tablet/mobile behavior.
Respect the supplied authority. If authority is BRANCH_ONLY, create/use a branch before edits. If authority is MAIN_EDIT_ALLOWED, direct edits to the proved generated project main canvas are permitted, but publishing production is still forbidden.
Do not publish production.
Do not classify missing business facts, unconnected forms, missing provider preview URLs, pending browser QA, critic review, or human release approval as BUILD blockers after implementation succeeds. Those are RELEASE blockers unless they prevent the implementation itself.
End with one JSON object containing:
{"changed":true|false,"previewUrl":"... or null","projectUrl":"...","filesOrNodes":["..."],"validation":["..."],"buildBlockers":["..."],"releaseBlockers":["..."]}""",
        )
        build["orchestration"]["stages"].append({"stage": "build", "result": build_result})
        structured = build_result.get("structured") or {}
        build_blockers = list(structured.get("buildBlockers") or [])
        builder_release_blockers = list(structured.get("releaseBlockers") or [])

        # Backward compatibility for older builder output. If the build changed
        # successfully, legacy "blockers" that describe QA/release prerequisites
        # should not abort the orchestration loop.
        legacy_blockers = list(structured.get("blockers") or [])
        if legacy_blockers and not build_blockers:
            if structured.get("changed") is True and build_result.get("ok"):
                builder_release_blockers.extend(legacy_blockers)
            else:
                build_blockers.extend(legacy_blockers)

        if builder_release_blockers:
            existing_release = list(build["orchestration"].get("releaseBlockers") or [])
            for item in builder_release_blockers:
                if item not in existing_release:
                    existing_release.append(item)
            build["orchestration"]["releaseBlockers"] = existing_release

        if (not build_result.get("ok")) or build_blockers:
            build["status"] = "blocked"
            build["orchestration"]["blockers"] = build_blockers or ["Builder exited unsuccessfully."]
            self.save_build(build)
            return build

        preview_url = structured.get("previewUrl") or container.get("previewUrl")
        if preview_url:
            build["container"]["previewUrl"] = preview_url
            self.save_build(build)

        qa_result: dict[str, Any] | None = None
        if preview_url and not skip_qa:
            qa_dir = self.workspace / "qa" / build_id
            qa_result = browser_qa(str(preview_url), str(qa_dir))
            build["orchestration"]["stages"].append({"stage": "browser_qa", "result": qa_result})
            build["status"] = "qa"
            self.save_build(build)

        pass_results: list[dict[str, Any]] = []
        needs_fix = False
        for index in range(1, max(1, max_passes) + 1):
            critic = self._run_stage(
                build,
                f"03-critic-{index}",
                "CRITIC_AGENT",
                f"""Critique build {build_id} against the original prompt, selected patterns, source trace, responsive requirements, and available QA evidence.
Treat clipping, overlap, broken responsive behavior, inaccessible contrast, incorrect target-project edits, broken interactions, missing content hierarchy, and regressions as defects.
Return severity as BLOCKING, MAJOR, MINOR, or PASS.
Do not invent visual evidence you cannot inspect.
End with one JSON object containing:
{{"severity":"PASS|MINOR|MAJOR|BLOCKING","issues":[{{"severity":"...","finding":"...","recommendedFix":"..."}}],"readyForHumanReview":true|false}}""",
            )
            entry: dict[str, Any] = {"pass": index, "critic": critic}
            parsed = critic.get("structured") or {}
            severity = str(parsed.get("severity") or "").upper()
            if not severity:
                upper = (critic.get("stdout") or "").upper()
                if "BLOCKING" in upper:
                    severity = "BLOCKING"
                elif "MAJOR" in upper:
                    severity = "MAJOR"
                elif "MINOR" in upper:
                    severity = "MINOR"
                else:
                    severity = "PASS"
            entry["severity"] = severity

            if severity not in {"BLOCKING", "MAJOR"}:
                pass_results.append(entry)
                needs_fix = False
                break

            needs_fix = True
            fix = self._run_stage(
                build,
                f"04-fix-{index}",
                "FRAMER_BUILDER" if str(build.get("platform")).lower() == "framer" else "CODE_AGENT",
                """Fix only the BLOCKING and MAJOR issues identified by the critic.
Do not redesign unrelated areas.
Preserve correct work, re-verify responsive behavior, remain branch/preview safe, and do not publish.
End with one JSON object containing:
{"fixedIssues":["..."],"remainingBlockers":["..."],"previewUrl":"... or null"}""",
            )
            entry["fix"] = fix
            pass_results.append(entry)
            if not fix.get("ok"):
                break

        build["orchestration"]["criticPasses"] = pass_results
        build["orchestration"]["completedAt"] = _now()
        build["status"] = "blocked" if needs_fix else "release_ready"
        build["releaseGate"] = "human_required"
        self.save_build(build)

        observation = {
            "buildId": build_id,
            "siteKey": build.get("siteKey"),
            "capturedAt": _now(),
            "status": build["status"],
            "qa": qa_result,
            "criticPasses": [
                {"pass": p.get("pass"), "severity": p.get("severity")}
                for p in pass_results
            ],
            "automaticProductionRelease": False,
        }
        _write_json(
            self.factory.observations / str(build.get("siteKey")) / f"{build_id}-orchestration.json",
            observation,
        )
        return build
