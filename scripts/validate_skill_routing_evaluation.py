#!/usr/bin/env python3
"""Validate candidate, comparison, and failed skill-routing evidence."""

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
ARM_ROLES = {"candidate", "without-skill", "previous-package"}
REQUIRED_ATTEMPT_IDS = [
    "schema-type-rejection", "schema-unique-items-rejection",
    "semantic-f0f34f4", "semantic-70f2a05",
]


class Invalid(ValueError):
    pass


def fail(condition: bool, message: str) -> None:
    if condition:
        raise Invalid(message)


def digest(value: bytes) -> str:
    return "sha256:" + hashlib.sha256(value).hexdigest()


def git(root: Path, *args: str) -> str:
    result = subprocess.run(
        ["git", *args], cwd=root, check=False, capture_output=True, text=True,
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
    fail(
        not DIGEST.fullmatch(str(value["sha256"])) or digest(content) != value["sha256"],
        f"{label} artifact digest does not match",
    )
    return content


def skill_rows_at_commit(root: Path, commit: str) -> list[tuple[str, str]]:
    paths = [
        line for line in git(root, "ls-tree", "-r", "--name-only", commit, "skills").splitlines()
        if re.fullmatch(r"skills/[a-z0-9][a-z0-9-]*/SKILL\.md", line)
    ]
    rows: list[tuple[str, str]] = []
    for path in sorted(paths):
        text = git(root, "show", f"{commit}:{path}")
        match = re.match(r"^---\n(.*?)\n---\n", text, re.DOTALL)
        fail(match is None, f"candidate skill frontmatter is invalid: {path}")
        frontmatter = yaml.safe_load(match.group(1))
        fail(not isinstance(frontmatter, dict), f"candidate skill frontmatter is invalid: {path}")
        rows.append((frontmatter["name"], frontmatter["description"]))
    fail(not rows, "candidate catalogue is empty")
    return rows


def catalogue_at_commit(root: Path, commit: str) -> bytes:
    return ("\n".join(f"- {name}: {description}" for name, description in skill_rows_at_commit(root, commit)) + "\n").encode()


def names_at_commit(root: Path, commit: str) -> bytes:
    return ("\n".join(f"- {name}" for name, _ in skill_rows_at_commit(root, commit)) + "\n").encode()


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


def validate_candidate_cases(
    dataset: list[dict[str, Any]], read_at_commit: Callable[[str], str],
) -> None:
    loaded: dict[str, dict[str, Any]] = {}
    seen: set[str] = set()
    for row in dataset:
        fail(
            not isinstance(row, dict)
            or set(row) != {"id", "source_path", "prompt", "expected"},
            "dataset case keys are invalid",
        )
        fail(row["id"] in seen, "dataset case id is duplicate")
        seen.add(row["id"])
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
    expected: dict[str, dict[str, Any]], selections: list[dict[str, Any]],
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


def validate_invocation(
    invocation: Any, expected: dict[str, dict[str, Any]], evidence_root: Path, label: str,
) -> tuple[int, int]:
    fields = {"trial", "provider_family", "adapter", "model", "reasoning_effort", "output"}
    fail(not isinstance(invocation, dict) or set(invocation) != fields, f"{label} invocation is invalid")
    for field in ("provider_family", "adapter", "model", "reasoning_effort"):
        fail(not isinstance(invocation[field], str) or not invocation[field], f"{label} {field} is missing")
    output = json.loads(artifact(evidence_root, invocation["output"], f"{label} output"))
    fail(
        not isinstance(output, dict)
        or set(output) != {"schema_version", "selections"}
        or output["schema_version"] != 1,
        f"{label} output is invalid",
    )
    return score_trial(expected, output["selections"])


def validate_attempts(
    content: bytes, evidence_root: Path, required_ids: list[str], repository_root: Path,
) -> None:
    value = json.loads(content)
    fail(
        not isinstance(value, dict) or set(value) != {"schema_version", "attempts"}
        or value["schema_version"] != 2 or not isinstance(value["attempts"], list),
        "attempts manifest is invalid",
    )
    attempts = value["attempts"]
    fail([row.get("id") for row in attempts if isinstance(row, dict)] != required_ids, "attempt set or order does not match receipt")
    for row in attempts:
        common = {"id", "candidate_commit", "candidate_tree", "status", "model"}
        fail(not isinstance(row, dict) or not common <= set(row), "attempt row is invalid")
        fail(not isinstance(row["model"], str) or not row["model"].strip(), "attempt model lineage is missing")
        commit = row["candidate_commit"]
        fail(not isinstance(commit, str) or not COMMIT.fullmatch(commit), "attempt candidate commit is invalid")
        tree = git(repository_root, "rev-parse", f"{commit}^{{tree}}").strip()
        fail(row["candidate_tree"] != tree, "attempt candidate tree does not match")
        if row["status"] == "invalid-pre-inference":
            fail(
                set(row) != common | {"reason", "raw_available"}
                or not isinstance(row["reason"], str) or not row["reason"]
                or row["raw_available"] is not False,
                "invalid pre-inference attempt is not honestly declared",
            )
            continue
        fail(row["status"] != "fail", "semantic attempt status must be fail")
        required = common | {"dataset", "catalogue", "classifier", "packet", "invocations", "score"}
        fail(set(row) != required, "semantic attempt keys are invalid")
        dataset_bytes = artifact(evidence_root, row["dataset"], f"attempt {row['id']} dataset")
        catalogue = artifact(evidence_root, row["catalogue"], f"attempt {row['id']} catalogue")
        instruction = artifact(evidence_root, row["classifier"], f"attempt {row['id']} classifier")
        retained_packet = artifact(evidence_root, row["packet"], f"attempt {row['id']} packet")
        data = yaml.safe_load(dataset_bytes)
        cases = data.get("cases") if isinstance(data, dict) and data.get("schema_version") == 1 else None
        fail(not isinstance(cases, list) or not cases, "semantic attempt dataset is invalid")
        validate_candidate_cases(cases, lambda path: git(repository_root, "show", f"{commit}:{path}"))
        fail(catalogue != catalogue_at_commit(repository_root, commit), "semantic attempt catalogue does not match candidate")
        fail(retained_packet != packet(instruction, catalogue, cases), "semantic attempt packet does not match inputs")
        expected = {case["id"]: case["expected"] for case in cases}
        passed = total = 0
        invocations = row["invocations"]
        fail(not isinstance(invocations, list) or not invocations, "semantic attempt invocations are missing")
        for index, invocation in enumerate(invocations, start=1):
            fail(invocation.get("trial") != index, "semantic attempt trials are not contiguous")
            scored, count = validate_invocation(invocation, expected, evidence_root, f"attempt {row['id']} trial {index}")
            passed += scored
            total += count
        fail(row["score"] != {"numerator": passed, "denominator": total}, "semantic attempt score is incorrect")
        fail(passed == total, "semantic attempt labelled fail has a passing score")


def validate(receipt_path: Path, repository_root: Path) -> tuple[int, int]:
    receipt = json.loads(receipt_path.read_text())
    required = {
        "schema_version", "candidate_commit", "candidate_tree", "dataset", "classifier",
        "response_schema", "arms", "attempts", "required_attempt_ids", "threshold", "claim", "status",
    }
    fail(not isinstance(receipt, dict) or set(receipt) != required, "receipt keys are invalid")
    fail(receipt["schema_version"] != 2, "unsupported receipt schema")
    candidate = receipt["candidate_commit"]
    fail(not isinstance(candidate, str) or not COMMIT.fullmatch(candidate), "candidate commit is invalid")
    candidate_tree = git(repository_root, "rev-parse", f"{candidate}^{{tree}}").strip()
    fail(receipt["candidate_tree"] != candidate_tree, "candidate tree does not match candidate commit")
    evidence_root = receipt_path.parent
    dataset_bytes = artifact(evidence_root, receipt["dataset"], "dataset")
    instruction = artifact(evidence_root, receipt["classifier"], "classifier")
    artifact(evidence_root, receipt["response_schema"], "response schema")
    data = yaml.safe_load(dataset_bytes)
    cases = data.get("cases") if isinstance(data, dict) and data.get("schema_version") == 1 else None
    fail(not isinstance(cases, list) or not cases, "dataset is invalid")
    validate_candidate_cases(cases, lambda path: git(repository_root, "show", f"{candidate}:{path}"))
    expected = {row["id"]: row["expected"] for row in cases}

    arms = receipt["arms"]
    fail(not isinstance(arms, list) or len(arms) != 3, "receipt must contain three routing arms")
    by_role = {arm.get("role"): arm for arm in arms if isinstance(arm, dict)}
    fail(set(by_role) != ARM_ROLES, "receipt routing arm roles are invalid or duplicate")
    scores: dict[str, tuple[int, int]] = {}
    trial_scores: dict[str, list[tuple[int, int]]] = {}
    for role in ("candidate", "without-skill", "previous-package"):
        arm = by_role[role]
        fields = {
            "id", "role", "package_commit", "package_tree", "catalogue", "packet",
            "minimum_trials", "invocations", "score",
        }
        fail(set(arm) != fields or arm["id"] != role, f"{role} arm is invalid")
        package_commit = arm["package_commit"]
        if role == "without-skill":
            fail(package_commit is not None or arm["package_tree"] is not None, "without-skill arm must not bind a package")
            expected_catalogue = names_at_commit(repository_root, candidate)
        else:
            fail(not isinstance(package_commit, str) or not COMMIT.fullmatch(package_commit), f"{role} package commit is invalid")
            tree = git(repository_root, "rev-parse", f"{package_commit}^{{tree}}").strip()
            fail(arm["package_tree"] != tree, f"{role} package tree does not match")
            if role == "candidate":
                fail(package_commit != candidate or tree != candidate_tree, "candidate arm package is not the candidate")
            else:
                previous_package = git(repository_root, "rev-parse", f"{candidate}^2").strip()
                fail(package_commit != previous_package, "previous-package arm is not the candidate's merged baseline")
            expected_catalogue = catalogue_at_commit(repository_root, package_commit)
        catalogue = artifact(evidence_root, arm["catalogue"], f"{role} catalogue")
        fail(catalogue != expected_catalogue, f"{role} catalogue does not match its package")
        retained_packet = artifact(evidence_root, arm["packet"], f"{role} packet")
        fail(retained_packet != packet(instruction, catalogue, cases), f"{role} packet does not match retained inputs")
        minimum = arm["minimum_trials"]
        expected_minimum = 3 if role == "candidate" else 1
        fail(minimum != expected_minimum, f"{role} minimum_trials is invalid")
        invocations = arm["invocations"]
        fail(not isinstance(invocations, list) or len(invocations) != minimum, f"{role} invocation count is invalid")
        passed = total = 0
        arm_trial_scores: list[tuple[int, int]] = []
        for index, invocation in enumerate(invocations, start=1):
            fail(invocation.get("trial") != index, f"{role} trials are not contiguous")
            scored, count = validate_invocation(invocation, expected, evidence_root, f"{role} trial {index}")
            passed += scored
            total += count
            arm_trial_scores.append((scored, count))
        fail(arm["score"] != {"numerator": passed, "denominator": total}, f"{role} score is incorrect")
        scores[role] = (passed, total)
        trial_scores[role] = arm_trial_scores

    candidate_passed, candidate_total = scores["candidate"]
    threshold = receipt["threshold"]
    fail(
        threshold != {"numerator": candidate_passed, "denominator": candidate_total, "minimum_rate": 0.95},
        "candidate threshold does not match outputs",
    )
    fail(candidate_passed / candidate_total < threshold["minimum_rate"], "candidate exact routing is below threshold")
    candidate_pair = trial_scores["candidate"][0]
    previous_pair = trial_scores["previous-package"][0]
    fail(candidate_pair[0] / candidate_pair[1] < previous_pair[0] / previous_pair[1], "paired candidate regresses previous-package exact routing")
    fail(receipt["claim"] != "current-candidate-correctness-and-paired-non-regression", "receipt claim is invalid")
    required_attempt_ids = receipt["required_attempt_ids"]
    fail(
        required_attempt_ids != REQUIRED_ATTEMPT_IDS,
        "required attempt ids are invalid",
    )
    attempts_content = artifact(evidence_root, receipt["attempts"], "attempts")
    validate_attempts(attempts_content, evidence_root, required_attempt_ids, repository_root)
    fail(receipt["status"] != "pass", "receipt is not a declared pass")
    return candidate_passed, candidate_total


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
    print(f"PASS: exact candidate-bound routing {passed}/{total} with comparison arms and retained failures")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
