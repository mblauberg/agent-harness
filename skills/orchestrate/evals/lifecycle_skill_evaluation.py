#!/usr/bin/env python3
"""Validate lifecycle-skill fixtures and their adapter-absent workflows."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
from typing import Any

import yaml


SCHEMA_VERSION = 1
AFFECTED = (
    "deliver",
    "grill-me",
    "implement",
    "orchestrate",
    "release",
    "retrospect",
    "scope",
    "session",
    "work-map",
)
ARTIFACT_KINDS = {
    "deliver": "delivery-receipt",
    "grill-me": "decision-context",
    "implement": "implementation-checkpoint",
    "orchestrate": "coordination-summary",
    "release": "promotion-receipt",
    "retrospect": "retrospective-receipt",
    "scope": "scope-handoff",
    "session": "session-handoff",
    "work-map": "effort-map",
}


class Invalid(ValueError):
    pass


def fail(condition: bool, message: str) -> None:
    if condition:
        raise Invalid(message)


def sha256_file(path: Path) -> str:
    return "sha256:" + hashlib.sha256(path.read_bytes()).hexdigest()


def validate_inputs(root: Path) -> None:
    known_skills = {path.parent.name for path in (root / "skills").glob("*/SKILL.md")}
    seen_ids: set[str] = set()
    seen_prompts: set[str] = set()
    for skill in AFFECTED:
        fixture = root / "skills" / skill / "evals" / "lifecycle_cases.yaml"
        payload = yaml.safe_load(fixture.read_text())
        fail(
            not isinstance(payload, dict)
            or set(payload) != {"schema_version", "target_skill", "cases"},
            f"{skill} lifecycle fixture envelope is invalid",
        )
        fail(
            payload["schema_version"] != SCHEMA_VERSION or payload["target_skill"] != skill,
            f"{skill} lifecycle fixture identity is invalid",
        )
        cases = payload["cases"]
        fail(not isinstance(cases, list) or len(cases) != 4, f"{skill} lifecycle cases are incomplete")
        fail(
            {case.get("relation") for case in cases}
            != {"positive", "negative", "adjacent", "portability"},
            f"{skill} lifecycle relations are incomplete",
        )
        for case in cases:
            required = {"id", "relation", "prompt", "tags", "expected"}
            if case.get("relation") == "portability":
                required.add("adapters")
            fail(set(case) != required, f"{skill} lifecycle case shape is invalid")
            case_id = case["id"]
            prompt = case["prompt"]
            fail(
                not isinstance(case_id, str)
                or not case_id.startswith(f"lifecycle-{skill}-")
                or case_id in seen_ids,
                f"{skill} lifecycle case id is invalid",
            )
            fail(not isinstance(prompt, str) or not prompt.strip() or prompt in seen_prompts,
                 f"{skill} lifecycle prompt is invalid")
            seen_ids.add(case_id)
            seen_prompts.add(prompt)
            fail("lifecycle-alignment" not in case["tags"], f"{skill} lifecycle tag is missing")
            expected = case["expected"]
            fail(
                not isinstance(expected, dict)
                or set(expected) != {"primary_skill", "companion_skills"},
                f"{skill} expected route is invalid",
            )
            primary = expected["primary_skill"]
            companions = expected["companion_skills"]
            fail(primary not in known_skills | {None}, f"{skill} primary route is unknown")
            fail(not isinstance(companions, list) or not set(companions) <= known_skills,
                 f"{skill} companion route is unknown")
        portable = next(case for case in cases if case["relation"] == "portability")
        fail(
            portable["adapters"] != {"console": "absent", "herdr": "absent", "github": "absent"},
            f"{skill} portability boundary is invalid",
        )


def run_portability_probe(
    root: Path,
    probe_root: Path,
    *,
    workflow_runner: Path | None = None,
) -> dict[str, Any]:
    validate_inputs(root)
    empty_bin = probe_root / "empty-bin"
    artifacts = probe_root / "project-artifacts"
    empty_bin.mkdir(parents=True, exist_ok=True)
    artifacts.mkdir(parents=True, exist_ok=True)
    absent = {
        command: shutil.which(command, path=str(empty_bin)) is None
        for command in ("agent-fabric-console", "gh", "herdr")
    }
    context_path = artifacts / "project-context.json"
    context_path.write_text(json.dumps({
        "project": "lifecycle-portability-probe",
        "source": "canonical-project-artifacts",
        "authority": "local-evaluation-only",
        "accepted_artifact_digest": "sha256:" + "0" * 64,
    }, sort_keys=True) + "\n")
    runner = workflow_runner or root / "skills" / "_shared" / "portable_workflow.py"
    cases = []
    for skill in AFFECTED:
        output_path = artifacts / f"{skill}-{ARTIFACT_KINDS[skill]}.json"
        subprocess.run(
            [
                sys.executable,
                str(runner),
                "--skill-root", str(root / "skills" / skill),
                "--context", str(context_path),
                "--output", str(output_path),
            ],
            check=True,
            cwd=artifacts,
            env={"PATH": str(empty_bin), "PYTHONUTF8": "1"},
            capture_output=True,
            text=True,
        )
        observed = json.loads(output_path.read_text())
        fail(observed.get("skill") != skill, f"portable workflow identity differs for {skill}")
        fail(observed.get("artifact_kind") != ARTIFACT_KINDS[skill],
             f"portable workflow artifact kind differs for {skill}")
        fail(observed.get("artifact_basis") != "project-artifacts" or observed.get("adapters_used") != [],
             f"portable workflow used an optional adapter for {skill}")
        fail(observed.get("source_digest") != sha256_file(context_path),
             f"portable workflow source digest differs for {skill}")
        cases.append({
            "skill": skill,
            "artifact_kind": ARTIFACT_KINDS[skill],
            "status": "pass" if observed.get("status") == "completed" else "fail",
        })
    result = {
        "schema_version": SCHEMA_VERSION,
        "environment": {"mode": "isolated-empty-path", "absent_commands": absent},
        "cases": cases,
        "status": "pass" if all(case["status"] == "pass" for case in cases) else "fail",
    }
    validate_portability_result(result)
    return result


def validate_portability_result(result: Any) -> None:
    fail(not isinstance(result, dict) or set(result) != {"schema_version", "environment", "cases", "status"},
         "portability result shape is invalid")
    fail(
        result["schema_version"] != SCHEMA_VERSION
        or result["environment"] != {
            "mode": "isolated-empty-path",
            "absent_commands": {"agent-fabric-console": True, "gh": True, "herdr": True},
        },
        "portability probe did not remove every optional adapter",
    )
    fail({case.get("skill") for case in result["cases"]} != set(AFFECTED),
         "portability result skill coverage differs")
    fail(result["status"] != "pass", "lifecycle adapter-absent portability probe failed")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("validate-inputs", "probe"))
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[3])
    args = parser.parse_args(argv)
    root = args.root.resolve()
    try:
        if args.command == "validate-inputs":
            validate_inputs(root)
        else:
            probe_root = root / ".agent-run" / "lifecycle-portability-check"
            try:
                run_portability_probe(root, probe_root)
            finally:
                shutil.rmtree(probe_root, ignore_errors=True)
    except (OSError, json.JSONDecodeError, Invalid, yaml.YAMLError) as exc:
        print(f"FAIL: {exc}", file=sys.stderr)
        return 1
    print(f"PASS: {args.command}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
