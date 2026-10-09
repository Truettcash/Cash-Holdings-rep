from __future__ import annotations

import argparse
import json
import os
import platform
import socket
import sys
import time
import traceback
from typing import Any

from .capabilities import detect_capabilities
from .client import CashSessionClient, SiteMachineError
from .factory import SiteFactory
from .qa import browser_qa
from .runner import run_agent_task
from .orchestrator import BuildOrchestrator

VERSION = "cash-site-machine-v1"


def _print(value: Any) -> None:
    print(json.dumps(value, indent=2, sort_keys=True, default=str), flush=True)


def _client() -> CashSessionClient:
    return CashSessionClient()


def _node_id() -> str:
    return os.environ.get("SITE_MACHINE_NODE_ID", "").strip() or "jarvis-main"


def _workspace() -> str:
    default = os.path.join(os.path.expanduser("~"), "CashSiteMachine")
    return os.environ.get("SITE_MACHINE_WORKSPACE", default)


def heartbeat(client: CashSessionClient, mode: str = "daemon") -> dict[str, Any]:
    caps, detail = detect_capabilities()
    metadata = {
        "mode": mode,
        "framerExternalAgent": "expected",
        "sharedBuildStack": True,
        "buildOrigins": ["outbound", "generator", "direct", "revision", "maintenance"],
        "detail": detail,
    }
    return client.action(
        "heartbeat",
        node_id=_node_id(),
        hostname=socket.gethostname(),
        platform=platform.system().lower(),
        version=VERSION,
        capabilities=caps,
        metadata=metadata,
        max_concurrency=int(os.environ.get("SITE_MACHINE_MAX_CONCURRENCY", "1")),
    )


def claim(client: CashSessionClient) -> dict[str, Any] | None:
    return client.action(
        "claim",
        node_id=_node_id(),
        lease_seconds=int(os.environ.get("SITE_MACHINE_LEASE_SECONDS", "900")),
    )


def complete(client: CashSessionClient, job_id: str, result: dict[str, Any]) -> Any:
    return client.action(
        "complete",
        job_id=job_id,
        node_id=_node_id(),
        result=result,
    )


def fail(client: CashSessionClient, job_id: str, error: Exception, *, retryable: bool = True) -> Any:
    return client.action(
        "fail",
        job_id=job_id,
        node_id=_node_id(),
        error={
            "code": type(error).__name__,
            "message": str(error)[:2000],
            "trace": traceback.format_exc()[-6000:],
        },
        retryable=retryable,
        retry_delay_seconds=60,
    )


def run_once(client: CashSessionClient) -> dict[str, Any]:
    heartbeat(client, "once")
    job = claim(client)
    if not job:
        return {"ok": True, "claimed": 0}

    job_id = str(job.get("id") or "")
    if not job_id:
        raise SiteMachineError("Claim returned job without id")

    try:
        result = run_agent_task(job, _workspace())
        if result.get("ok"):
            complete(client, job_id, result)
            return {"ok": True, "claimed": 1, "completed": job_id, "result": result}

        error = SiteMachineError(
            f"Local agent exited {result.get('exitCode')}: {result.get('stderr','')[-1000:]}"
        )
        fail(client, job_id, error, retryable=True)
        return {"ok": False, "claimed": 1, "failed": job_id, "result": result}
    except Exception as exc:
        fail(client, job_id, exc, retryable=True)
        return {"ok": False, "claimed": 1, "failed": job_id, "error": str(exc)}


def daemon() -> int:
    client = _client()
    poll = max(5, int(os.environ.get("SITE_MACHINE_POLL_SECONDS", "15")))
    heartbeat_every = max(15, int(os.environ.get("SITE_MACHINE_HEARTBEAT_SECONDS", "30")))
    last_heartbeat = 0.0

    print(f"Cash Site Machine {VERSION} starting as {_node_id()}", flush=True)
    while True:
        now = time.time()
        try:
            if now - last_heartbeat >= heartbeat_every:
                heartbeat(client, "daemon")
                last_heartbeat = now

            result = run_once(client)
            if result.get("claimed"):
                _print(result)
                continue
        except KeyboardInterrupt:
            return 0
        except Exception as exc:
            print(f"site-machine: {exc}", file=sys.stderr, flush=True)

        time.sleep(poll)


def cmd_local_status(_: argparse.Namespace) -> int:
    caps, detail = detect_capabilities()
    _print({
        "ok": True,
        "nodeId": _node_id(),
        "workspace": _workspace(),
        "capabilities": caps,
        "detail": detail,
        "cloudControlPlane": "deferred",
        "mode": "local-only",
    })
    return 0


def cmd_factory_status(_: argparse.Namespace) -> int:
    _print(SiteFactory(_workspace()).status())
    return 0


def cmd_new_site(args: argparse.Namespace) -> int:
    factory = SiteFactory(_workspace())
    result = factory.new_site(
        name=args.name,
        prompt=args.prompt,
        platform=args.platform,
        industry=args.industry,
        project_url=args.project_url,
        container_cmd=os.environ.get("SITE_MACHINE_CONTAINER_CMD"),
    )
    _print(result)
    return 0


def cmd_attach_container(args: argparse.Namespace) -> int:
    result = BuildOrchestrator(_workspace()).attach_container(
        build_id=args.build_id,
        project_url=args.project_url,
        project_id=args.project_id,
        preview_url=args.preview_url,
    )
    _print(result)
    return 0


def cmd_provision_site(args: argparse.Namespace) -> int:
    result = BuildOrchestrator(_workspace()).provision(
        build_id=args.build_id,
        command=args.command,
    )
    _print(result)
    return 0


def cmd_build_site(args: argparse.Namespace) -> int:
    result = BuildOrchestrator(_workspace()).run(
        build_id=args.build_id,
        max_passes=args.max_passes,
        skip_qa=args.skip_qa,
    )
    _print(result)
    return 0


def cmd_record_outcome(args: argparse.Namespace) -> int:
    factory = SiteFactory(_workspace())
    result = factory.record_outcome(
        site_key=args.site_key,
        signal=args.signal,
        value=args.value,
        pattern_ids=args.pattern,
        notes=args.notes,
    )
    _print(result)
    return 0


def cmd_pattern_cycle(_: argparse.Namespace) -> int:
    _print(SiteFactory(_workspace()).pattern_cycle())
    return 0


def cmd_propagation_candidates(args: argparse.Namespace) -> int:
    _print(SiteFactory(_workspace()).propagation_candidates(args.pattern_id))
    return 0


def cmd_qa_url(args: argparse.Namespace) -> int:
    root = os.path.join(_workspace(), "qa", args.name or str(int(time.time())))
    _print(browser_qa(args.url, root, args.viewport))
    return 0


def cmd_status(_: argparse.Namespace) -> int:
    client = _client()
    heartbeat(client, "status")
    _print(client.action("status"))
    return 0


def cmd_once(_: argparse.Namespace) -> int:
    _print(run_once(_client()))
    return 0


def cmd_daemon(_: argparse.Namespace) -> int:
    return daemon()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="cash-site-machine")
    sub = parser.add_subparsers(dest="command", required=True)
    local_status = sub.add_parser("local-status")
    local_status.set_defaults(func=cmd_local_status)

    factory_status = sub.add_parser("factory-status")
    factory_status.set_defaults(func=cmd_factory_status)

    new_site = sub.add_parser("new-site")
    new_site.add_argument("--name", required=True)
    new_site.add_argument("--prompt", required=True)
    new_site.add_argument("--platform", default="framer")
    new_site.add_argument("--industry")
    new_site.add_argument("--project-url")
    new_site.set_defaults(func=cmd_new_site)

    attach = sub.add_parser("attach-container")
    attach.add_argument("--build-id", required=True)
    attach.add_argument("--project-url", required=True)
    attach.add_argument("--project-id")
    attach.add_argument("--preview-url")
    attach.set_defaults(func=cmd_attach_container)

    provision = sub.add_parser("provision-site")
    provision.add_argument("--build-id", required=True)
    provision.add_argument("--command")
    provision.set_defaults(func=cmd_provision_site)

    build_site = sub.add_parser("build-site")
    build_site.add_argument("--build-id", required=True)
    build_site.add_argument("--max-passes", type=int, default=3)
    build_site.add_argument("--skip-qa", action="store_true")
    build_site.set_defaults(func=cmd_build_site)

    outcome = sub.add_parser("record-outcome")
    outcome.add_argument("--site-key", required=True)
    outcome.add_argument("--signal", required=True)
    outcome.add_argument("--value", type=float)
    outcome.add_argument("--pattern", action="append", default=[])
    outcome.add_argument("--notes")
    outcome.set_defaults(func=cmd_record_outcome)

    pattern_cycle = sub.add_parser("pattern-cycle")
    pattern_cycle.set_defaults(func=cmd_pattern_cycle)

    propagation = sub.add_parser("propagation-candidates")
    propagation.add_argument("--pattern-id", required=True)
    propagation.set_defaults(func=cmd_propagation_candidates)

    qa = sub.add_parser("qa-url")
    qa.add_argument("--url", required=True)
    qa.add_argument("--name")
    qa.add_argument("--viewport", action="append", choices=["desktop","laptop","tablet","mobile"])
    qa.set_defaults(func=cmd_qa_url)
    status = sub.add_parser("status")
    status.set_defaults(func=cmd_status)
    once = sub.add_parser("once")
    once.set_defaults(func=cmd_once)
    daemon_p = sub.add_parser("daemon")
    daemon_p.set_defaults(func=cmd_daemon)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        return int(args.func(args))
    except SiteMachineError as exc:
        print(f"cash-site-machine: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
