#!/usr/bin/env python3
"""Decide whether project evidence clears the global-skill promotion gate."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from pathlib import PurePosixPath
import re
import sys
from typing import Any


COMMIT = re.compile(r"^[0-9a-f]{40}$")
DIGEST = re.compile(r"^sha256:[0-9a-f]{64}$")
IDENTIFIER = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")


def decide(value: Any, evidence_root: Path) -> dict[str, Any]:
    if not isinstance(value, dict) or set(value) != {"schema_version", "candidate_commit", "project_evidence"}:
        raise ValueError("promotion input keys are invalid")
    if value["schema_version"] != 1:
        raise ValueError("unsupported promotion input schema")
    candidate = value["candidate_commit"]
    if not isinstance(candidate, str) or not COMMIT.fullmatch(candidate):
        raise ValueError("candidate_commit is invalid")
    evidence = value["project_evidence"]
    if not isinstance(evidence, list):
        raise ValueError("project_evidence must be a list")

    evidence_ids: set[str] = set()
    project_ids: set[str] = set()
    proven_projects: set[str] = set()
    for index, row in enumerate(evidence):
        if not isinstance(row, dict) or set(row) != {"project_id", "evidence_id", "artifact"}:
            raise ValueError(f"project_evidence[{index}] keys are invalid")
        project_id = row["project_id"]
        evidence_id = row["evidence_id"]
        if not isinstance(project_id, str) or not IDENTIFIER.fullmatch(project_id):
            raise ValueError(f"project_evidence[{index}] project_id is invalid")
        if not isinstance(evidence_id, str) or not IDENTIFIER.fullmatch(evidence_id):
            raise ValueError(f"project_evidence[{index}] evidence_id is invalid")
        if project_id in project_ids:
            raise ValueError("duplicate project_id")
        if evidence_id in evidence_ids:
            raise ValueError("duplicate evidence_id")
        artifact = row["artifact"]
        if not isinstance(artifact, dict) or set(artifact) != {"path", "sha256"}:
            raise ValueError(f"project_evidence[{index}] artifact is invalid")
        path = PurePosixPath(artifact["path"]) if isinstance(artifact["path"], str) else PurePosixPath("..")
        if path.is_absolute() or ".." in path.parts:
            raise ValueError(f"project_evidence[{index}] artifact path is unsafe")
        target = evidence_root / Path(*path.parts)
        if not target.is_file():
            raise ValueError(f"project_evidence[{index}] artifact is missing")
        content = target.read_bytes()
        actual_digest = "sha256:" + hashlib.sha256(content).hexdigest()
        if not isinstance(artifact["sha256"], str) or not DIGEST.fullmatch(artifact["sha256"]) or artifact["sha256"] != actual_digest:
            raise ValueError(f"project_evidence[{index}] artifact digest does not match")
        try:
            result = json.loads(content)
        except json.JSONDecodeError as exc:
            raise ValueError(f"project_evidence[{index}] artifact is invalid JSON") from exc
        if (
            not isinstance(result, dict)
            or set(result) != {"schema_version", "candidate_commit", "project_id", "evidence_id", "result"}
            or result["schema_version"] != 1
            or result["candidate_commit"] != candidate
            or result["project_id"] != project_id
            or result["evidence_id"] != evidence_id
            or result["result"] not in {"proven", "failed"}
        ):
            raise ValueError(f"project_evidence[{index}] artifact identity or result is invalid")
        project_ids.add(project_id)
        evidence_ids.add(evidence_id)
        if result["result"] == "proven":
            proven_projects.add(project_id)

    count = len(proven_projects)
    return {
        "schema_version": 1,
        "decision": (
            "eligible-for-global-promotion"
            if count >= 2
            else "remain-project-local"
        ),
        "proven_project_count": count,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    args = parser.parse_args(argv)
    try:
        result = decide(json.loads(args.input.read_text()), args.input.resolve().parent)
    except (OSError, json.JSONDecodeError, ValueError) as exc:
        print(f"promotion readiness: {exc}", file=sys.stderr)
        return 1
    print(json.dumps(result, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
