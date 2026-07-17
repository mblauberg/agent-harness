import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess

import pytest
import yaml


ROOT = Path(__file__).resolve().parents[1]


def module():
    path = ROOT / "scripts/validate_skill_routing_evaluation.py"
    spec = importlib.util.spec_from_file_location("validate_skill_routing_evaluation", path)
    assert spec and spec.loader
    loaded = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(loaded)
    return loaded


def test_candidate_cases_are_loaded_from_the_bound_commit_not_fixture_claims():
    validator = module()
    canonical = {
        "cases": [{
            "id": "q001",
            "prompt": "Route this request.",
            "expected": {"primary_skill": "skill-craft", "companion_skills": []},
        }]
    }
    dataset = [{
        "id": "q001",
        "source_path": "skills/skill-craft/evals/trigger_cases.yaml",
        "prompt": "Route this request.",
        "expected": {"primary_skill": "skill-craft", "companion_skills": []},
    }]
    validator.validate_candidate_cases(
        dataset,
        lambda _path: yaml.safe_dump(canonical),
    )
    mutated = [{**dataset[0], "prompt": "Different text."}]
    with pytest.raises(validator.Invalid, match="does not match candidate commit"):
        validator.validate_candidate_cases(mutated, lambda _path: yaml.safe_dump(canonical))


def test_route_scoring_executes_exact_primary_and_companion_behavior():
    validator = module()
    expected = {
        "q001": {"primary_skill": "deliver", "companion_skills": ["implement"]},
        "q002": {"primary_skill": "skill-craft", "companion_skills": ["evaluate"]},
    }
    correct = [
        {"case_id": "q001", **expected["q001"]},
        {"case_id": "q002", **expected["q002"]},
    ]
    assert validator.score_trial(expected, correct) == (2, 2)
    mutated = [correct[0], {**correct[1], "companion_skills": []}]
    assert validator.score_trial(expected, mutated) == (1, 2)
    with pytest.raises(validator.Invalid, match="case coverage"):
        validator.score_trial(expected, correct[:1])


def test_retained_reuse_routing_receipt_matches_exact_candidate_tree():
    result = subprocess.run(
        [
            "python3",
            "scripts/validate_skill_routing_evaluation.py",
            "docs/evals/skill-reuse-2026/receipt.json",
        ],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    assert result.stdout.strip() == (
        "PASS: exact candidate-bound routing 29/30; "
        "cross-primary-family promotion gate unmet"
    )


@pytest.mark.parametrize("mutation", [
    "omit", "relabel", "rescore", "rebind", "invalid-rebind", "invalid-model", "invalid-reason",
])
def test_retained_failure_manifest_rejects_history_mutations(tmp_path: Path, mutation: str):
    validator = module()
    evidence = tmp_path / "skill-reuse-2026"
    shutil.copytree(ROOT / "docs/evals/skill-reuse-2026", evidence)
    attempts_path = evidence / "attempts.json"
    attempts = json.loads(attempts_path.read_text())
    if mutation == "omit":
        attempts["attempts"].pop()
    elif mutation == "relabel":
        attempts["attempts"][-1]["status"] = "pass"
    elif mutation == "rescore":
        attempts["attempts"][-1]["score"]["numerator"] += 1
    elif mutation == "rebind":
        attempts["attempts"][-1]["candidate_tree"] = "0" * 40
    elif mutation == "invalid-rebind":
        rebound = subprocess.run(
            ["git", "rev-parse", "origin/main"], cwd=ROOT, check=True, capture_output=True, text=True,
        ).stdout.strip()
        rebound_tree = subprocess.run(
            ["git", "rev-parse", f"{rebound}^{{tree}}"], cwd=ROOT, check=True, capture_output=True, text=True,
        ).stdout.strip()
        attempts["attempts"][0]["candidate_commit"] = rebound
        attempts["attempts"][0]["candidate_tree"] = rebound_tree
    elif mutation == "invalid-model":
        attempts["attempts"][0]["model"] = "different-model"
    else:
        attempts["attempts"][0]["reason"] = "different rejection"
    attempts_path.write_text(json.dumps(attempts, indent=2, sort_keys=True) + "\n")
    receipt_path = evidence / "receipt.json"
    receipt = json.loads(receipt_path.read_text())
    if mutation == "omit":
        receipt["required_attempt_ids"].pop()
    receipt["attempts"]["sha256"] = "sha256:" + hashlib.sha256(attempts_path.read_bytes()).hexdigest()
    receipt_path.write_text(json.dumps(receipt, indent=2, sort_keys=True) + "\n")

    with pytest.raises(validator.Invalid):
        validator.validate(receipt_path, ROOT)
