from __future__ import annotations

import json
import re
import subprocess
import time
import uuid
from pathlib import Path
from typing import Any

from .client import SiteMachineError


def _slug(value: str) -> str:
    value = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return value[:64] or f"site-{uuid.uuid4().hex[:8]}"


def _read_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        raise SiteMachineError(f"Could not read JSON: {path}") from exc
    return value if isinstance(value, dict) else {}


def _write_json(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")


class SiteFactory:
    def __init__(self, workspace: str):
        self.workspace = Path(workspace)
        self.root = self.workspace / "site-factory"
        self.sites = self.root / "sites"
        self.patterns = self.root / "patterns"
        self.observations = self.root / "observations"
        self.variants = self.root / "variants"
        self.builds = self.root / "builds"
        for path in (self.sites, self.patterns, self.observations, self.variants, self.builds):
            path.mkdir(parents=True, exist_ok=True)

    def status(self) -> dict[str, Any]:
        build_statuses: dict[str, int] = {}
        for path in self.builds.glob("*.json"):
            build = _read_json(path)
            status = str(build.get("status") or "unknown")
            build_statuses[status] = build_statuses.get(status, 0) + 1
        return {
            "sites": len(list(self.sites.glob("*.json"))),
            "patterns": len(list(self.patterns.glob("*.json"))),
            "observations": len(list(self.observations.rglob("*.json"))),
            "variants": len(list(self.variants.rglob("*.json"))),
            "builds": len(list(self.builds.glob("*.json"))),
            "buildStatuses": build_statuses,
        }

    def rank_patterns(self, text: str, limit: int = 12) -> list[dict[str, Any]]:
        terms = {t for t in re.findall(r"[a-z0-9]+", text.lower()) if len(t) > 2}
        ranked: list[dict[str, Any]] = []
        for path in self.patterns.glob("*.json"):
            pattern = _read_json(path)
            corpus = " ".join([
                str(pattern.get("name") or ""),
                str(pattern.get("category") or ""),
                str(pattern.get("problem") or ""),
                " ".join(pattern.get("contexts") or []),
            ]).lower()
            anti = " ".join(pattern.get("antiContexts") or []).lower()
            hits = sum(1 for t in terms if t in corpus)
            anti_hits = sum(1 for t in terms if t in anti)
            confidence = float(pattern.get("confidence") or 0.0)
            score = hits * 1.0 + confidence * 1.5 - anti_hits * 2.0
            if score > 0:
                ranked.append({
                    "id": pattern.get("id") or path.stem,
                    "score": round(score, 4),
                    "confidence": confidence,
                    "category": pattern.get("category"),
                    "name": pattern.get("name"),
                    "path": str(path),
                })
        ranked.sort(key=lambda x: (x["score"], x["confidence"]), reverse=True)
        return ranked[:limit]

    def new_site(
        self,
        name: str,
        prompt: str,
        platform: str = "framer",
        industry: str | None = None,
        project_url: str | None = None,
        container_cmd: str | None = None,
    ) -> dict[str, Any]:
        site_key = _slug(name)
        now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        pattern_candidates = self.rank_patterns(" ".join(filter(None, [prompt, industry or ""])))

        container: dict[str, Any] = {
            "provider": platform,
            "status": "ready" if project_url else "pending",
            "projectUrl": project_url,
        }

        if not project_url and container_cmd:
            proc = subprocess.run(
                container_cmd,
                input=json.dumps({"siteKey": site_key, "name": name, "prompt": prompt, "platform": platform}),
                capture_output=True,
                text=True,
                timeout=180,
                shell=True,
            )
            if proc.returncode != 0:
                raise SiteMachineError(f"Container provider failed: {proc.stderr[-2000:]}")
            try:
                provisioned = json.loads(proc.stdout)
            except Exception as exc:
                raise SiteMachineError("Container provider did not return JSON") from exc
            project_url = str(provisioned.get("projectUrl") or "").strip() or None
            container.update(provisioned)
            container["status"] = "ready" if project_url else "pending"

        if not project_url and platform == "framer":
            container["reason"] = (
                "No Framer project-container provisioner is configured. "
                "Supply --project-url or configure SITE_MACHINE_CONTAINER_CMD."
            )

        manifest = {
            "siteKey": site_key,
            "displayName": name,
            "platform": platform,
            "projectUrl": project_url,
            "status": "registered" if project_url else "discovered",
            "industry": industry,
            "goals": [],
            "audiences": [],
            "renderModel": "unknown",
            "patternRefs": [p["id"] for p in pattern_candidates[:8]],
            "notes": ["Generated from prompt through Cash Site Factory."],
            "createdAt": now,
            "container": container,
        }
        _write_json(self.sites / f"{site_key}.json", manifest)

        build_id = f"{site_key}-{int(time.time())}"
        build = {
            "buildId": build_id,
            "siteKey": site_key,
            "origin": "generator",
            "prompt": prompt,
            "platform": platform,
            "container": container,
            "patternCandidates": pattern_candidates,
            "status": "ready_for_build" if project_url else "waiting_for_container",
            "createdAt": now,
            "releaseGate": "human_required",
        }
        _write_json(self.builds / f"{build_id}.json", build)
        return {"site": manifest, "build": build}

    def record_outcome(
        self,
        site_key: str,
        signal: str,
        value: float | None,
        pattern_ids: list[str],
        notes: str | None = None,
    ) -> dict[str, Any]:
        allowed = {
            "qa_pass", "qa_fail", "human_approved", "human_rejected",
            "revision_requested", "conversion_up", "conversion_down",
            "performance_up", "performance_down", "client_approved", "client_rejected",
        }
        if signal not in allowed:
            raise SiteMachineError(f"Unsupported outcome signal: {signal}")

        timestamp = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        outcome_id = f"{site_key}-{int(time.time())}-{uuid.uuid4().hex[:6]}"
        record = {
            "id": outcome_id,
            "siteKey": site_key,
            "signal": signal,
            "value": value,
            "patternIds": pattern_ids,
            "notes": notes,
            "capturedAt": timestamp,
        }
        _write_json(self.observations / site_key / f"{outcome_id}.json", record)

        positive = signal in {"qa_pass", "human_approved", "conversion_up", "performance_up", "client_approved"}
        negative = signal in {"qa_fail", "human_rejected", "conversion_down", "performance_down", "client_rejected"}
        delta = 0.025 if positive else (-0.035 if negative else -0.01 if signal == "revision_requested" else 0.0)

        changed: list[dict[str, Any]] = []
        for pattern_id in pattern_ids:
            path = self.patterns / f"{pattern_id}.json"
            if not path.exists():
                continue
            pattern = _read_json(path)
            old = float(pattern.get("confidence") or 0.0)
            new = max(0.05, min(0.95, old + delta))
            pattern["confidence"] = round(new, 4)
            refs = list(pattern.get("observations") or [])
            refs.append(str((self.observations / site_key / f"{outcome_id}.json").relative_to(self.root)))
            pattern["observations"] = refs[-50:]
            if positive and new >= 0.75 and pattern.get("status") in {"candidate", "tested"}:
                pattern["status"] = "tested"
            if negative and new < 0.35:
                pattern["status"] = "contextualized"
            pattern["version"] = int(pattern.get("version") or 1) + 1
            _write_json(path, pattern)
            changed.append({"patternId": pattern_id, "oldConfidence": old, "newConfidence": new})

        return {"outcome": record, "patternsUpdated": changed}

    def pattern_cycle(self) -> dict[str, Any]:
        patterns: list[dict[str, Any]] = []
        promotions: list[dict[str, Any]] = []
        constraints: list[dict[str, Any]] = []
        propagation: list[dict[str, Any]] = []
        variant_reviews: list[dict[str, Any]] = []

        for path in self.patterns.glob("*.json"):
            pattern = _read_json(path)
            pattern_id = str(pattern.get("id") or path.stem)
            confidence = float(pattern.get("confidence") or 0.0)
            observations = list(pattern.get("observations") or [])
            status = str(pattern.get("status") or "candidate")
            variants = list(pattern.get("variants") or [])

            patterns.append({
                "id": pattern_id,
                "status": status,
                "confidence": confidence,
                "observationCount": len(observations),
                "variantCount": len(variants),
            })

            # Conservative promotion: requires evidence count as well as confidence.
            if confidence >= 0.78 and len(observations) >= 3 and status in {"candidate", "tested"}:
                promotions.append({
                    "patternId": pattern_id,
                    "from": status,
                    "to": "proven",
                    "reason": "confidence_and_repeated_observation",
                })

            if confidence < 0.35 and status in {"candidate", "tested"}:
                constraints.append({
                    "patternId": pattern_id,
                    "recommendedStatus": "contextualized",
                    "reason": "low_confidence",
                })

            if variants and len(variants) >= 3:
                variant_reviews.append({
                    "patternId": pattern_id,
                    "variants": variants,
                    "action": "compare_and_prune_or_promote",
                    "reason": "variant_family_growth",
                })

            if confidence >= 0.65:
                try:
                    matches = self.propagation_candidates(pattern_id)
                except SiteMachineError:
                    matches = []
                for match in matches:
                    propagation.append({"patternId": pattern_id, **match})

        propagation.sort(key=lambda x: (x["score"], next((p["confidence"] for p in patterns if p["id"] == x["patternId"]), 0)), reverse=True)

        report = {
            "capturedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "patternCount": len(patterns),
            "promotions": promotions,
            "constraints": constraints,
            "variantReviews": variant_reviews,
            "propagationCandidates": propagation[:50],
            "policy": {
                "automaticProductionEdits": False,
                "promotionRequiresEvidence": True,
                "propagationRequiresBranchQA": True,
            },
        }
        stamp = time.strftime("%Y%m%d-%H%M%S", time.gmtime())
        _write_json(self.observations / "system" / f"pattern-cycle-{stamp}.json", report)
        return report


    def propagation_candidates(self, pattern_id: str) -> list[dict[str, Any]]:
        path = self.patterns / f"{pattern_id}.json"
        if not path.exists():
            raise SiteMachineError(f"Pattern not found: {pattern_id}")
        pattern = _read_json(path)
        contexts = {str(x).lower() for x in pattern.get("contexts") or []}
        anti = {str(x).lower() for x in pattern.get("antiContexts") or []}
        source_sites = {str(x).lower() for x in pattern.get("sources") or []}

        candidates: list[dict[str, Any]] = []
        for site_path in self.sites.glob("*.json"):
            site = _read_json(site_path)
            site_key = str(site.get("siteKey") or site_path.stem)
            if site_key.lower() in source_sites:
                continue
            corpus = " ".join([
                str(site.get("industry") or ""),
                " ".join(site.get("goals") or []),
                " ".join(site.get("audiences") or []),
                " ".join(site.get("notes") or []),
            ]).lower()
            context_hits = sum(1 for c in contexts if c and c in corpus)
            anti_hits = sum(1 for a in anti if a and a in corpus)
            score = context_hits - anti_hits * 2
            if score > 0:
                candidates.append({
                    "siteKey": site_key,
                    "displayName": site.get("displayName"),
                    "score": score,
                    "reason": "context_match",
                    "requiresBranchQA": True,
                })
        candidates.sort(key=lambda x: x["score"], reverse=True)
        return candidates
