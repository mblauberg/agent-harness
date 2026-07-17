#!/usr/bin/env python3
"""Bind a merged Git artifact and typed GitHub evidence into a software RUN.json."""

from __future__ import annotations

import argparse
from datetime import datetime
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
from typing import Any


def fail(condition: bool, message: str) -> None:
    if condition:
        raise ValueError(message)


def git(root: Path, *args: str, text: bool = True) -> str | bytes:
    return subprocess.run(
        ["git", "-C", str(root), *args], check=True, capture_output=True, text=text,
    ).stdout


def utc(value: str) -> None:
    fail(not value.endswith("Z"), "--recorded-at must be an ISO UTC timestamp")
    try:
        datetime.fromisoformat(value[:-1] + "+00:00")
    except ValueError as exc:
        raise ValueError("--recorded-at must be an ISO UTC timestamp") from exc


def artifact(path: str, artifact_id: str, raw: bytes) -> dict[str, Any]:
    return {
        "id": artifact_id, "path": path, "media_type": "application/json",
        "artifact_type": "evidence", "digest": "sha256:" + hashlib.sha256(raw).hexdigest(),
        "class": "evidence", "owner": "delivery-chair", "retention": "risk-policy",
    }


def encode(value: dict[str, Any]) -> bytes:
    return (json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n").encode()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("receipt", type=Path)
    parser.add_argument("--workspace-root", type=Path, required=True)
    parser.add_argument("--repository", required=True, help="GitHub owner/repository")
    parser.add_argument("--pr-number", type=int, required=True)
    parser.add_argument("--pr-url", required=True)
    parser.add_argument("--head-commit", required=True)
    parser.add_argument("--merge-commit", required=True)
    parser.add_argument("--recorded-at", required=True)
    args = parser.parse_args(argv)
    try:
        workspace = args.workspace_root.resolve()
        receipt = args.receipt.resolve()
        receipt.relative_to(workspace)
        utc(args.recorded_at)
        fail(args.pr_number < 1 or not args.repository or not args.pr_url, "PR identity is invalid")
        run = json.loads(receipt.read_text())
        fail(not isinstance(run, dict) or run.get("contract") != "delivery-run" or run.get("schema_version") != 1,
             "receipt must be a delivery-run v1 object")
        fail(run.get("profile") != "software", "receipt profile must be software")
        fail(run.get("status") != "awaiting_acceptance", "receipt must remain awaiting_acceptance while merge evidence is bound")
        fail(run.get("software_delivery") is not None, "receipt already has a software_delivery binding")
        head_tree = str(git(workspace, "rev-parse", f"{args.head_commit}^{{tree}}")).strip()
        merge_tree = str(git(workspace, "rev-parse", f"{args.merge_commit}^{{tree}}")).strip()
        fail(head_tree != merge_tree, "merged tree differs from reviewed PR head")
        archive = git(workspace, "archive", "--format=tar", args.merge_commit, text=False)
        assert isinstance(archive, bytes)
        ids = {item.get("id") for item in run.get("artifacts", []) if isinstance(item, dict)}
        fixed_ids = {"merged-source", "github-pr", "github-ci"}
        fail(bool(ids & fixed_ids), "receipt already uses a reserved software-delivery artifact id")

        relative_run_dir = receipt.parent.relative_to(workspace)
        evidence_dir = relative_run_dir / "github"
        payloads: list[tuple[str, bytes]] = [
            ("github-pr", encode({
                "schema_version": 1, "contract": "github-pull-request-evidence",
                "repository": args.repository, "number": args.pr_number, "url": args.pr_url,
                "head_commit": args.head_commit, "merge_commit": args.merge_commit, "state": "merged",
            })),
            ("github-ci", encode({
                "schema_version": 1, "contract": "github-ci-evidence",
                "repository": args.repository, "commit": args.merge_commit,
                "check": "ci-status", "conclusion": "success", "completed_at": args.recorded_at,
            })),
        ]
        review_ids: list[str] = []
        for index, review in enumerate(run.get("reviews", []), start=1):
            if not isinstance(review, dict) or review.get("status") != "pass":
                continue
            artifact_id = f"github-review-{index}"
            fail(artifact_id in ids, f"receipt already uses {artifact_id}")
            review_ids.append(artifact_id)
            payloads.append((artifact_id, encode({
                "schema_version": 1, "contract": "code-review-evidence",
                "repository": args.repository, "commit": args.head_commit,
                "provider_family": review.get("provider_family"), "adapter": review.get("adapter"),
                "model": review.get("model"), "verdict": "pass", "reviewed_at": args.recorded_at,
            })))
        fail(not review_ids, "receipt has no passing reviews to retain")

        additions = [{
            "id": "merged-source",
            "git_revision": {"repository": ".", "commit": args.merge_commit, "tree": merge_tree},
            "media_type": "application/x-git-archive", "artifact_type": "source",
            "digest": "sha256:" + hashlib.sha256(archive).hexdigest(),
            "class": "canonical", "owner": "delivery-chair", "retention": "project-policy",
        }]
        for artifact_id, raw in payloads:
            path = (evidence_dir / f"{artifact_id}.json").as_posix()
            additions.append(artifact(path, artifact_id, raw))
        run["artifacts"].extend(additions)
        run["security"]["artifact_surfaces"].append({"artifact_id": "merged-source", "surfaces": ["source"]})
        run["software_delivery"] = {
            "schema_version": 1, "contract": "software-delivery-binding",
            "canonical_artifact_id": "merged-source", "pull_request_artifact_id": "github-pr",
            "ci_artifact_id": "github-ci", "review_artifact_ids": review_ids,
        }
        run["checkpoint"].update({
            "generation": run["checkpoint"]["generation"] + 1,
            "current_slice": "awaiting-acceptance",
            "next_action": "request human acceptance of the exact merged artifact",
        })

        target_dir = workspace / evidence_dir
        target_dir.mkdir(parents=True, exist_ok=True)
        for artifact_id, raw in payloads:
            target = target_dir / f"{artifact_id}.json"
            fail(target.exists() and target.read_bytes() != raw,
                 f"refusing to replace conflicting evidence artifact: {target}")
        for artifact_id, raw in payloads:
            target = target_dir / f"{artifact_id}.json"
            if not target.exists():
                target.write_bytes(raw)
        fd, temporary = tempfile.mkstemp(prefix=".RUN.", suffix=".json", dir=receipt.parent)
        try:
            with os.fdopen(fd, "w") as handle:
                json.dump(run, handle, indent=2)
                handle.write("\n")
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(temporary, receipt)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)
    except (OSError, ValueError, json.JSONDecodeError, subprocess.CalledProcessError) as exc:
        print(f"FAIL: {exc}")
        return 1
    print(f"PASS: bound merged software artifact {args.merge_commit} to {receipt}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
