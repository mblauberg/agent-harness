#!/usr/bin/env python3
"""Decide whether project evidence clears the global-skill promotion gate."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys
from typing import Any


def decide(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict) or set(value) != {"schema_version", "project_evidence"}:
        raise ValueError("promotion input keys are invalid")
    if value["schema_version"] != 1:
        raise ValueError("unsupported promotion input schema")
    evidence = value["project_evidence"]
    if not isinstance(evidence, list):
        raise ValueError("project_evidence must be a list")

    evidence_ids: set[str] = set()
    proven_projects: set[str] = set()
    for index, row in enumerate(evidence):
        if not isinstance(row, dict) or set(row) != {"project_id", "evidence_id", "status"}:
            raise ValueError(f"project_evidence[{index}] keys are invalid")
        project_id = row["project_id"]
        evidence_id = row["evidence_id"]
        status = row["status"]
        if not isinstance(project_id, str) or not project_id.strip():
            raise ValueError(f"project_evidence[{index}] project_id is invalid")
        if not isinstance(evidence_id, str) or not evidence_id.strip():
            raise ValueError(f"project_evidence[{index}] evidence_id is invalid")
        if evidence_id in evidence_ids:
            raise ValueError("duplicate evidence_id")
        if status not in {"proven", "failed"}:
            raise ValueError(f"project_evidence[{index}] status is invalid")
        evidence_ids.add(evidence_id)
        if status == "proven":
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
        result = decide(json.loads(args.input.read_text()))
    except (OSError, json.JSONDecodeError, ValueError) as exc:
        print(f"promotion readiness: {exc}", file=sys.stderr)
        return 1
    print(json.dumps(result, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
