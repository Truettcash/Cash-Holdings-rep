#!/usr/bin/env python3
"""Repo-controlled preflight wrapper for managed-agent agent asks.

This wrapper preserves the current OpenJarvis runtime and agent identity, but
intercepts `jarvis agents ask <agent_id> <query> ...` before the actual jarvis
CLI executes. It loads the deterministic Cash Operator router, persists the
intent/workflow metadata, and for DIAGNOSTIC requests injects the required
workflow contract into the prompt so the final answer is only synthesized after
pattern reasoning.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
RUNTIME_ROOT = REPO_ROOT / "runtime"
ROUTER_PATH = RUNTIME_ROOT / "agents" / "cash_operator_router.py"

if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from runtime.agents.cash_operator_router import INTENT_DIAGNOSTIC, classify_intent


OPENJARVIS_HOME = Path(os.environ.get("OPENJARVIS_HOME", "~/.openjarvis")).expanduser()
ACTUAL_JARVIS_BIN = Path("/home/codespace/.local/share/openjarvis/1.0.3/venv/bin/jarvis")
ROUTER_STATE_PATH = OPENJARVIS_HOME / "cash_operator_router_state.json"


def persist_router_state(intent: str, query: str) -> None:
    OPENJARVIS_HOME.mkdir(parents=True, exist_ok=True)
    state = {
        "intent": intent,
        "query": query,
        "pattern_diagnostic_required": intent == INTENT_DIAGNOSTIC,
        "guard_source": "runtime/agents/cash_operator_router.py",
        "workflow": [
            "evidence retrieval",
            "bounded problem assembly",
            "intelligence_match_patterns or intelligence_get_reasoning_trace",
            "final synthesis",
        ],
    }
    ROUTER_STATE_PATH.write_text(json.dumps(state, indent=2), encoding="utf-8")


def build_diagnostic_prompt(query: str) -> str:
    return (
        f"{query}\n\n"
        "Cash Operator router classification: DIAGNOSTIC. Required workflow contract: "
        "(1) retrieve only necessary evidence/context; (2) build a bounded problem from retrieved state only; "
        "(3) execute intelligence_match_patterns OR intelligence_get_reasoning_trace before final synthesis; "
        "(4) if the evidence is insufficient, return DIAGNOSTIC_INSUFFICIENT_EVIDENCE; "
        "(5) preserve explicit separation: OBSERVED / EVIDENCE, DERIVED INTELLIGENCE, PATTERN CANDIDATES, LIKELY CONSTRAINTS, COUNTEREVIDENCE, MISSING STATE. "
        "Do not finalize after list/read-only calls; do not force a positive pattern or constraint; do not hard-code any answer."
    )


def rewrite_argv(argv: list[str]) -> list[str]:
    if len(argv) < 4:
        return argv
    if argv[0] != "agents" or argv[1] != "ask":
        return argv

    agent_id = argv[2]
    tail = argv[3:]
    if not tail:
        return argv

    flag_tail = []
    while tail and tail[-1].startswith("-"):
        flag_tail.insert(0, tail.pop())

    query = " ".join(tail)
    if not query.strip():
        return argv

    intent = classify_intent(query)
    persist_router_state(intent, query)

    if agent_id == "8e0f72601b25" and intent == INTENT_DIAGNOSTIC:
        query = build_diagnostic_prompt(query)

    return ["agents", "ask", agent_id, query, *flag_tail]


def main() -> int:
    argv = sys.argv[1:]
    rewritten = rewrite_argv(argv)
    if REPO_ROOT.exists() and str(REPO_ROOT) not in sys.path:
        sys.path.insert(0, str(REPO_ROOT))

    if not ACTUAL_JARVIS_BIN.exists():
        print(f"OpenJarvis CLI not found at {ACTUAL_JARVIS_BIN}", file=sys.stderr)
        return 1

    result = subprocess.run([str(ACTUAL_JARVIS_BIN), *rewritten], check=False)
    return result.returncode


if __name__ == "__main__":
    raise SystemExit(main())
