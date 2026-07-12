#!/usr/bin/env python3
"""Execute a skill-owned project-artifact fallback without optional adapters."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any


def digest(path: Path) -> str:
    return "sha256:" + hashlib.sha256(path.read_bytes()).hexdigest()


def read_object(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text())
    if not isinstance(value, dict):
        raise ValueError(f"{path} must contain one JSON object")
    return value


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--skill-root", required=True, type=Path)
    parser.add_argument("--context", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()

    skill_root = args.skill_root.resolve()
    contract = read_object(skill_root / "portable-workflow.v1.json")
    required_contract = {
        "schema_version", "skill", "artifact_kind", "artifact_basis",
        "required_context_fields",
    }
    if set(contract) != required_contract or contract["schema_version"] != 1:
        raise ValueError("portable workflow contract is invalid")
    if contract["skill"] != skill_root.name or contract["artifact_basis"] != "project-artifacts":
        raise ValueError("portable workflow contract identity is invalid")
    if not isinstance(contract["artifact_kind"], str) or not contract["artifact_kind"]:
        raise ValueError("portable workflow artifact kind is invalid")
    required_fields = contract["required_context_fields"]
    if not isinstance(required_fields, list) or not required_fields or not all(
        isinstance(field, str) and field for field in required_fields
    ):
        raise ValueError("portable workflow context contract is invalid")

    context = read_object(args.context)
    if any(field not in context for field in required_fields):
        raise ValueError("portable workflow context is incomplete")
    if not (skill_root / "SKILL.md").is_file():
        raise ValueError("portable workflow has no owning skill")

    artifact = {
        "schema_version": 1,
        "skill": contract["skill"],
        "artifact_kind": contract["artifact_kind"],
        "artifact_basis": contract["artifact_basis"],
        "source_digest": digest(args.context),
        "adapters_used": [],
        "status": "completed",
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(artifact, sort_keys=True) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
