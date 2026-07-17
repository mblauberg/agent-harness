#!/usr/bin/env python3
"""Validate a repeated skill-routing receipt against an exact candidate commit."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import subprocess
import sys
from typing import Any, Callable

import yaml


DIGEST = re.compile(r"^sha256:[0-9a-f]{64}$")
COMMIT = re.compile(r"^[0-9a-f]{40}$")


class Invalid(ValueError):
    pass


def fail(condition: bool, message: str) -> None:
    if condition:
        raise Invalid(message)


def digest(value: bytes) -> str:
    return "sha256:" + hashlib.sha256(value).hexdigest()


def validate_candidate_cases(
    dataset: list[dict[str, Any]], read_at_commit: Callable[[str], str]
) -> None:
    loaded: dict[str, dict[str, Any]] = {}
    for row in dataset:
        fail(
            not isinstance(row, dict)
            or set(row) != {"id", "source_path", "prompt", "expected"},
            "dataset case keys are invalid",
        )
        path = row["source_path"]
        if path not in loaded:
            value = yaml.safe_load(read_at_commit(path))
            cases = value.get("cases") if isinstance(value, dict) else None
            fail(not isinstance(cases, list), f"candidate fixture is invalid: {path}")
            loaded[path] = {case.get("id"): case for case in cases if isinstance(case, dict)}
        canonical = loaded[path].get(row["id"])
        fail(
            canonical is None
            or canonical.get("prompt") != row["prompt"]
            or canonical.get("expected") != row["expected"],
            f"dataset case {row['id']} does not match candidate commit",
        )


def score_trial(
    expected: dict[str, dict[str, Any]], selections: list[dict[str, Any]]
) -> tuple[int, int]:
    fail(not isinstance(selections, list), "trial selections must be a list")
    actual: dict[str, dict[str, Any]] = {}
    for row in selections:
        fail(
            not isinstance(row, dict)
            or set(row) != {"case_id", "primary_skill", "companion_skills"},
            "selection keys are invalid",
        )
        case_id = row["case_id"]
        fail(case_id in actual, "duplicate selection case")
        actual[case_id] = {
            "primary_skill": row["primary_skill"],
            "companion_skills": row["companion_skills"],
        }
    fail(set(actual) != set(expected), "trial case coverage is incomplete or extra")
    return sum(actual[case_id] == route for case_id, route in expected.items()), len(expected)


def git(root: Path, *args: str) -> str:
    result = subprocess.run(
        ["git", *args], cwd=root, check=False, capture_output=True, text=True
    )
    if result.returncode:
        raise Invalid(result.stderr.strip() or "git evidence lookup failed")
    return result.stdout


def artifact(root: Path, value: Any, label: str) -> bytes:
    fail(
        not isinstance(value, dict) or set(value) != {"path", "sha256"},
        f"{label} artifact declaration is invalid",
    )
    path = PurePosixPath(value["path"]) if isinstance(value["path"], str) else PurePosixPath("..")
    fail(path.is_absolute() or ".." in path.parts, f"{label} artifact path is unsafe")
    target = root / Path(*path.parts)
    fail(not target.is_file(), f"{label} artifact is missing")
    content = target.read_bytes()
    fail(not DIGEST.fullmatch(str(value["sha256"])) or digest(content) != value["sha256"], f"{label} artifact digest does not match")
    return content


def catalogue_at_commit(root: Path, commit: str) -> bytes:
    paths = [
        line for line in git(root, "ls-tree", "-r", "--name-only", commit, "skills").splitlines()
        if re.fullmatch(r"skills/[a-z0-9][a-z0-9-]*/SKILL\.md", line)
    ]
    rows = []
    for path in sorted(paths):
        text = git(root, "show", f"{commit}:{path}")
        match = re.match(r"^---\n(.*?)\n---\n", text, re.DOTALL)
        fail(match is None, f"candidate skill frontmatter is invalid: {path}")
        frontmatter = yaml.safe_load(match.group(1))
        fail(not isinstance(frontmatter, dict), f"candidate skill frontmatter is invalid: {path}")
        rows.append(f"- {frontmatter['name']}: {frontmatter['description']}")
    fail(not rows, "candidate catalogue is empty")
    return ("\n".join(rows) + "\n").encode()


def packet(instruction: bytes, catalogue: bytes, cases: list[dict[str, Any]]) -> bytes:
    prompts = [{"case_id": row["id"], "prompt": row["prompt"]} for row in cases]
    return (
        instruction.rstrip()
        + b"\n\n## Skill catalogue\n\n"
        + catalogue.rstrip()
        + b"\n\n## Cases\n\n"
        + json.dumps(prompts, sort_keys=True, separators=(",", ":")).encode()
        + b"\n"
    )


def validate(receipt_path: Path, repository_root: Path) -> tuple[int, int]:
    receipt = json.loads(receipt_path.read_text())
    required = {
        "schema_version", "candidate_commit", "candidate_tree", "dataset",
        "catalogue", "classifier", "packet", "minimum_trials", "invocations",
        "threshold", "status",
    }
    fail(not isinstance(receipt, dict) or set(receipt) != required, "receipt keys are invalid")
    fail(receipt["schema_version"] != 1, "unsupported receipt schema")
    commit = receipt["candidate_commit"]
    fail(not isinstance(commit, str) or not COMMIT.fullmatch(commit), "candidate commit is invalid")
    tree = git(repository_root, "rev-parse", f"{commit}^{{tree}}").strip()
    fail(receipt["candidate_tree"] != tree, "candidate tree does not match candidate commit")

    evidence_root = receipt_path.parent
    dataset_bytes = artifact(evidence_root, receipt["dataset"], "dataset")
    catalogue = artifact(evidence_root, receipt["catalogue"], "catalogue")
    instruction = artifact(evidence_root, receipt["classifier"], "classifier")
    retained_packet = artifact(evidence_root, receipt["packet"], "packet")
    data = yaml.safe_load(dataset_bytes)
    cases = data.get("cases") if isinstance(data, dict) and data.get("schema_version") == 1 else None
    fail(not isinstance(cases, list) or not cases, "dataset is invalid")
    validate_candidate_cases(
        cases, lambda path: git(repository_root, "show", f"{commit}:{path}")
    )
    fail(catalogue != catalogue_at_commit(repository_root, commit), "catalogue does not match candidate commit")
    fail(retained_packet != packet(instruction, catalogue, cases), "packet does not match retained components")

    minimum = receipt["minimum_trials"]
    fail(isinstance(minimum, bool) or not isinstance(minimum, int) or minimum < 3, "minimum_trials must be at least three")
    invocations = receipt["invocations"]
    fail(not isinstance(invocations, list) or len(invocations) != minimum, "invocation count does not match minimum_trials")
    expected = {row["id"]: row["expected"] for row in cases}
    passed = total = 0
    seen_trials: set[int] = set()
    for invocation in invocations:
        fields = {"trial", "provider_family", "adapter", "model", "reasoning_effort", "output"}
        fail(not isinstance(invocation, dict) or set(invocation) != fields, "invocation keys are invalid")
        trial = invocation["trial"]
        fail(isinstance(trial, bool) or not isinstance(trial, int) or trial in seen_trials, "invocation trial is invalid or duplicate")
        for field in ("provider_family", "adapter", "model", "reasoning_effort"):
            fail(not isinstance(invocation[field], str) or not invocation[field], f"invocation {field} is missing")
        output = json.loads(artifact(evidence_root, invocation["output"], f"trial {trial} output"))
        fail(not isinstance(output, dict) or set(output) != {"schema_version", "selections"} or output["schema_version"] != 1, f"trial {trial} output is invalid")
        trial_passed, trial_total = score_trial(expected, output["selections"])
        passed += trial_passed
        total += trial_total
        seen_trials.add(trial)
    fail(seen_trials != set(range(1, minimum + 1)), "invocation trials are not contiguous")
    threshold = receipt["threshold"]
    fail(not isinstance(threshold, dict) or set(threshold) != {"numerator", "denominator", "minimum_rate"}, "threshold keys are invalid")
    fail(threshold["numerator"] != passed or threshold["denominator"] != total, "threshold counts do not match outputs")
    rate = passed / total
    fail(not isinstance(threshold["minimum_rate"], (int, float)) or rate < threshold["minimum_rate"], f"routing rate {passed}/{total} is below threshold")
    fail(receipt["status"] != "pass", "receipt is not a declared pass")
    return passed, total


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("receipt", type=Path)
    parser.add_argument("--repository-root", type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args(argv)
    try:
        passed, total = validate(args.receipt.resolve(), args.repository_root.resolve())
    except (OSError, json.JSONDecodeError, yaml.YAMLError, Invalid) as exc:
        print(f"FAIL: {exc}", file=sys.stderr)
        return 1
    print(f"PASS: exact candidate-bound routing {passed}/{total}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
