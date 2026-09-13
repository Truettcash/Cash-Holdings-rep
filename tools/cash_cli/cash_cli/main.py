from __future__ import annotations

import argparse
import json
import os
import socket
import sys
from typing import Any

from .client import CashCliError, SupabaseClient, SupabaseConfig
from .scoring import score_prospect

CLI_VERSION = "cash-cli-v1"


def _print(value: Any) -> None:
    print(json.dumps(value, indent=2, sort_keys=True, default=str))


def _client() -> SupabaseClient:
    return SupabaseClient(SupabaseConfig.from_env())


def _worker_id() -> str:
    configured = os.environ.get("CASH_WORKER_ID", "").strip()
    if configured:
        return configured
    host = socket.gethostname().strip().lower() or "local"
    return f"{host}-cash"


def _score_profile(
    client: SupabaseClient,
    profile_id: str,
    *,
    apply: bool,
) -> dict[str, Any]:
    bundle = client.rpc(
        "cash_cli_prospect_score_input",
        {"p_prospect_profile_id": profile_id},
    ) or {}

    # Resolve routing first, then apply the routed brand's research policy.
    # scoring.py also understands the `policies` shape directly; retaining the
    # explicit selection here makes the execution contract obvious in output.
    route_probe = score_prospect(bundle)
    routed_brand = route_probe.research["routed_brand"]
    policies = bundle.get("policies") or {}
    bundle["policy"] = policies.get(routed_brand) or {}
    score = score_prospect(bundle)

    record: dict[str, Any] = {
        "prospect_profile_id": profile_id,
        "score": score.update,
        "research": score.research,
        "applied": False,
    }
    if apply:
        applied = client.rpc(
            "cash_cli_apply_prospect_score",
            {
                "p_prospect_profile_id": profile_id,
                "p_score": score.update,
                "p_explanation": score.explanation,
                "p_research": score.research,
            },
        )
        record["applied"] = True
        record["result"] = applied
    return record


def _select_score_ids(client: SupabaseClient, limit: int) -> list[str]:
    rows = client.select(
        "prospect_profiles",
        {
            "select": "id,commercial_priority_score,updated_at",
            "website": "not.is.null",
            "suppress_outreach": "eq.false",
            "order": "commercial_priority_score.desc.nullslast,updated_at.asc",
            "limit": str(limit),
        },
    )
    return [str(row["id"]) for row in (rows or [])]


def cmd_score(args: argparse.Namespace) -> int:
    client = _client()
    ids = [args.id] if args.id else _select_score_ids(client, args.limit)
    results = [
        _score_profile(client, profile_id, apply=args.apply)
        for profile_id in ids
    ]
    _print(
        {
            "ok": True,
            "mode": "apply" if args.apply else "dry-run",
            "count": len(results),
            "results": results,
        }
    )
    return 0


def cmd_enqueue(args: argparse.Namespace) -> int:
    client = _client()
    ids = [args.id] if args.id else _select_score_ids(client, args.limit)
    results = []
    for profile_id in ids:
        results.append(
            client.rpc(
                "cash_cli_enqueue_prospect_score",
                {
                    "p_prospect_profile_id": profile_id,
                    "p_reason": args.reason,
                    "p_priority": args.priority,
                },
            )
        )
    _print({"ok": True, "count": len(results), "jobs": results})
    return 0


def _join_prefix(prefix: str, name: str) -> str:
    prefix = prefix.strip("/")
    name = name.strip("/")
    return f"{prefix}/{name}" if prefix else name


def _walk_storage(
    client: SupabaseClient,
    bucket: str,
    prefix: str,
    *,
    _visited: set[str] | None = None,
) -> list[str]:
    """Recursively resolve every object key under a Storage prefix."""
    normalized = prefix.strip("/")
    visited = _visited if _visited is not None else set()
    if normalized in visited:
        return []
    visited.add(normalized)

    paths: list[str] = []
    offset = 0
    while True:
        rows = client.storage_list(
            bucket,
            prefix=normalized,
            limit=1000,
            offset=offset,
        )
        if not rows:
            break

        for row in rows:
            name = str(row.get("name") or "").strip("/")
            if not name:
                continue
            full = _join_prefix(normalized, name)
            if row.get("id"):
                paths.append(full)
            else:
                paths.extend(
                    _walk_storage(
                        client,
                        bucket,
                        full,
                        _visited=visited,
                    )
                )

        if len(rows) < 1000:
            break
        offset += len(rows)

    return list(dict.fromkeys(paths))


def cmd_storage_purge(args: argparse.Namespace) -> int:
    client = _client()
    paths = _walk_storage(client, args.bucket, args.prefix)
    result = {
        "ok": True,
        "bucket": args.bucket,
        "prefix": args.prefix,
        "objects": len(paths),
        "applied": False,
    }
    if not args.apply:
        result["sample"] = paths[:20]
        _print(result)
        return 0

    removed = 0
    for start in range(0, len(paths), 100):
        batch = paths[start : start + 100]
        client.storage_remove(args.bucket, batch)
        removed += len(batch)
    result["applied"] = True
    result["removed"] = removed
    _print(result)
    return 0


def cmd_status(args: argparse.Namespace) -> int:
    del args
    client = _client()
    _print(client.rpc("cash_cli_runtime_status", {}))
    return 0


def cmd_worker_status(args: argparse.Namespace) -> int:
    del args
    client = _client()
    _print(client.rpc("cash_cli_local_worker_status", {}))
    return 0


def cmd_worker_heartbeat(args: argparse.Namespace) -> int:
    client = _client()
    worker_id = _worker_id()
    _print(
        client.rpc(
            "cash_cli_worker_heartbeat",
            {
                "p_worker_id": worker_id,
                "p_version": CLI_VERSION,
                "p_metadata": {"mode": args.mode},
            },
        )
    )
    return 0


def cmd_worker_drain(args: argparse.Namespace) -> int:
    client = _client()
    worker_id = _worker_id()
    client.rpc(
        "cash_cli_worker_heartbeat",
        {
            "p_worker_id": worker_id,
            "p_version": CLI_VERSION,
            "p_metadata": {"mode": "drain"},
        },
    )
    jobs = client.rpc(
        "cash_cli_claim_jobs",
        {
            "p_worker_id": worker_id,
            "p_job_type": "prospect_score",
            "p_limit": args.limit,
            "p_lease_seconds": args.lease_seconds,
        },
    ) or []
    if not isinstance(jobs, list):
        raise CashCliError("cash_cli_claim_jobs returned a non-list payload")

    completed: list[dict[str, Any]] = []
    failed: list[dict[str, Any]] = []
    for job in jobs:
        job_id = str(job.get("id") or "")
        profile_id = str(job.get("subject_id") or "")
        if not job_id or not profile_id:
            failed.append({"job_id": job_id or None, "error": "invalid_job_payload"})
            continue

        try:
            result = _score_profile(client, profile_id, apply=True)
            complete = client.rpc(
                "cash_cli_complete_job",
                {
                    "p_job_id": job_id,
                    "p_worker_id": worker_id,
                    "p_result": {
                        "prospect_profile_id": profile_id,
                        "score": result.get("score"),
                        "research": result.get("research"),
                    },
                },
            )
            completed.append(
                {
                    "job_id": job_id,
                    "prospect_profile_id": profile_id,
                    "result": complete,
                }
            )
        except Exception as exc:  # keep one bad prospect from killing the batch
            error_text = str(exc)[:1000]
            try:
                fail_result = client.rpc(
                    "cash_cli_fail_job",
                    {
                        "p_job_id": job_id,
                        "p_worker_id": worker_id,
                        "p_error": {
                            "type": type(exc).__name__,
                            "message": error_text,
                        },
                        "p_retry_delay_seconds": args.retry_delay_seconds,
                    },
                )
            except Exception as fail_exc:
                fail_result = {
                    "ok": False,
                    "error": f"failed_to_record_job_failure: {str(fail_exc)[:500]}",
                }
            failed.append(
                {
                    "job_id": job_id,
                    "prospect_profile_id": profile_id,
                    "error": error_text,
                    "result": fail_result,
                }
            )

    _print(
        {
            "ok": not failed,
            "worker_id": worker_id,
            "claimed": len(jobs),
            "completed": completed,
            "failed": failed,
        }
    )
    return 0 if not failed else 1


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="cash",
        description="Cash Holdings local execution CLI",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    status = sub.add_parser(
        "status",
        help="Show compact Cash Holdings runtime status",
    )
    status.set_defaults(func=cmd_status)

    prospects = sub.add_parser(
        "prospects",
        help="Local prospect execution",
    )
    prospect_sub = prospects.add_subparsers(
        dest="prospects_command",
        required=True,
    )

    score = prospect_sub.add_parser(
        "score",
        help="Score prospects locally using one bundled input RPC per prospect",
    )
    score.add_argument("--id", help="Score one prospect profile UUID")
    score.add_argument("--limit", type=int, default=25)
    score.add_argument(
        "--apply",
        action="store_true",
        help="Persist score and queue enrichment if warranted",
    )
    score.set_defaults(func=cmd_score)

    enqueue = prospect_sub.add_parser(
        "enqueue",
        help="Queue prospect scoring for the local worker",
    )
    enqueue.add_argument("--id", help="Queue one prospect profile UUID")
    enqueue.add_argument("--limit", type=int, default=1)
    enqueue.add_argument("--priority", type=int, default=50)
    enqueue.add_argument("--reason", default="manual_cli")
    enqueue.set_defaults(func=cmd_enqueue)

    worker = sub.add_parser("worker", help="Local queue worker")
    worker_sub = worker.add_subparsers(dest="worker_command", required=True)

    worker_status = worker_sub.add_parser("status", help="Show worker queue status")
    worker_status.set_defaults(func=cmd_worker_status)

    heartbeat = worker_sub.add_parser("heartbeat", help="Publish worker heartbeat")
    heartbeat.add_argument("--mode", default="manual")
    heartbeat.set_defaults(func=cmd_worker_heartbeat)

    drain = worker_sub.add_parser(
        "drain",
        help="Claim and execute a bounded batch of local jobs",
    )
    drain.add_argument("--limit", type=int, default=10)
    drain.add_argument("--lease-seconds", type=int, default=300)
    drain.add_argument("--retry-delay-seconds", type=int, default=60)
    drain.set_defaults(func=cmd_worker_drain)

    storage = sub.add_parser(
        "storage",
        help="Storage maintenance through the supported Storage API",
    )
    storage_sub = storage.add_subparsers(
        dest="storage_command",
        required=True,
    )
    purge = storage_sub.add_parser(
        "purge-prefix",
        help="Delete objects below an exact bucket prefix",
    )
    purge.add_argument("--bucket", required=True)
    purge.add_argument("--prefix", required=True)
    purge.add_argument(
        "--apply",
        action="store_true",
        help="Actually delete; default is dry-run",
    )
    purge.set_defaults(func=cmd_storage_purge)

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        return int(args.func(args))
    except CashCliError as exc:
        print(f"cash: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
