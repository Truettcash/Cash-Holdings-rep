from __future__ import annotations

import argparse
import json
import sys
from typing import Any

from .client import CashCliError, SupabaseClient, SupabaseConfig
from .scoring import score_prospect


def _print(value: Any) -> None:
    print(json.dumps(value, indent=2, sort_keys=True, default=str))


def _client() -> SupabaseClient:
    return SupabaseClient(SupabaseConfig.from_env())


def cmd_score(args: argparse.Namespace) -> int:
    client = _client()
    if args.id:
        ids = [args.id]
    else:
        rows = client.select(
            "prospect_profiles",
            {
                "select": "id,commercial_priority_score,updated_at",
                "website": "not.is.null",
                "suppress_outreach": "eq.false",
                "order": "commercial_priority_score.desc.nullslast,updated_at.asc",
                "limit": str(args.limit),
            },
        )
        ids = [str(row["id"]) for row in (rows or [])]

    results = []
    for profile_id in ids:
        bundle = client.rpc(
            "cash_cli_prospect_score_input",
            {"p_prospect_profile_id": profile_id},
        ) or {}

        # Routing math does not depend on research policy. Run once to resolve
        # ATHRTY vs Truett Cash, then rerun with the matching policy so paid
        # enrichment semantics remain aligned with prospect-score-v2.
        route_probe = score_prospect(bundle)
        routed_brand = route_probe.research["routed_brand"]
        policies = bundle.get("policies") or {}
        bundle["policy"] = policies.get(routed_brand) or {}
        score = score_prospect(bundle)

        record = {
            "prospect_profile_id": profile_id,
            "score": score.update,
            "research": score.research,
            "applied": False,
        }
        if args.apply:
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
        results.append(record)

    _print(
        {
            "ok": True,
            "mode": "apply" if args.apply else "dry-run",
            "count": len(results),
            "results": results,
        }
    )
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
    """Recursively resolve every object key under a Storage prefix.

    Supabase list responses represent folders as rows without an object id.
    Walking those prefixes is required before the Storage API can remove all
    physical objects beneath a nested legacy tree.
    """
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

    # Deduping protects against unusual list pagination/folder representations
    # while preserving stable output for dry-run review.
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
    score.add_argument(
        "--limit",
        type=int,
        default=25,
        help="Batch size when --id is omitted",
    )
    score.add_argument(
        "--apply",
        action="store_true",
        help="Persist score and queue enrichment if warranted",
    )
    score.set_defaults(func=cmd_score)

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
