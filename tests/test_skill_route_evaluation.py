import importlib.util
from pathlib import Path

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
