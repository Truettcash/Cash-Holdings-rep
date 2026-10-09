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
from .client import SiteMachineError, SupabaseClient, SupabaseConfig
from .runner import run_agent_task

VERSION = "cash-site-machine-v1"


def _print(value: Any) -> None:
    print(json.dumps(value, indent=2, sort_keys=True, default=str), flush=True)


def _client() -> SupabaseClient:
    return SupabaseClient(SupabaseConfig.from_env())


def _node_id() -> str:
    return os.environ.get("SITE_MACHINE_NODE_ID", "").strip() or "jarvis-main"


def _workspace() -> str:
    default = os.path.join(os.path.expanduser("~"), "CashSiteMachine")
    return os.environ.get("SITE_MACHINE_WORKSPACE", default)


def heartbeat(client: SupabaseClient, mode: str = "daemon") -> dict[str, Any]:
    caps, detail = detect_capabilities()
    metadata = {
        "mode": mode,
        "framerExternalAgent": "expected",
        "sharedBuildStack": True,
        "buildOrigins": ["outbound", "generator", "direct", "revision", "maintenance"],
        "detail": detail,
    }
    return client.rpc(
        "cash_site_machine_heartbeat",
        {
            "p_node_id": _node_id(),
            "p_hostname": socket.gethostname(),
            "p_platform": platform.system().lower(),
            "p_version": VERSION,
            "p_capabilities": caps,
            "p_metadata": metadata,
            "p_max_concurrency": int(os.environ.get("SITE_MACHINE_MAX_CONCURRENCY", "1")),
        },
    )


def claim(client: SupabaseClient) -> dict[str, Any] | None:
    return client.rpc(
        "cash_site_machine_claim",
        {
            "p_node_id": _node_id(),
            "p_lease_seconds": int(os.environ.get("SITE_MACHINE_LEASE_SECONDS", "900")),
        },
    )


def complete(client: SupabaseClient, job_id: str, result: dict[str, Any]) -> Any:
    return client.rpc(
        "cash_site_machine_complete",
        {
            "p_job_id": job_id,
            "p_node_id": _node_id(),
            "p_result": result,
        },
    )


def fail(client: SupabaseClient, job_id: str, error: Exception, *, retryable: bool = True) -> Any:
    return client.rpc(
        "cash_site_machine_fail",
        {
            "p_job_id": job_id,
            "p_node_id": _node_id(),
            "p_error": {
                "code": type(error).__name__,
                "message": str(error)[:2000],
                "trace": traceback.format_exc()[-6000:],
            },
            "p_retryable": retryable,
            "p_retry_delay_seconds": 60,
        },
    )


def run_once(client: SupabaseClient) -> dict[str, Any]:
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


def cmd_status(_: argparse.Namespace) -> int:
    client = _client()
    heartbeat(client, "status")
    _print(client.rpc("cash_site_machine_status", {}))
    return 0


def cmd_once(_: argparse.Namespace) -> int:
    _print(run_once(_client()))
    return 0


def cmd_daemon(_: argparse.Namespace) -> int:
    return daemon()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="cash-site-machine")
    sub = parser.add_subparsers(dest="command", required=True)
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
