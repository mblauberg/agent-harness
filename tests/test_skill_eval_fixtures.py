from pathlib import Path

import yaml


ROOT = Path(__file__).resolve().parents[1]


def load(path: Path):
    return yaml.safe_load(path.read_text())


def test_trigger_fixtures_have_positive_and_negative_cases():
    for skill in (
        "natural-writing",
        "implement",
        "code-review",
        "react-performance",
        "tanstack-query",
        "tdd",
        "retrospect",
    ):
        data = load(ROOT / "skills" / skill / "evals" / "trigger_cases.yaml")
        assert {"positive", "negative"} <= set(data)
        assert len(data["positive"]) >= 3
        assert len(data["negative"]) >= 3
        assert all(isinstance(case, str) and case.strip() for cases in data.values() for case in cases)
        assert set(data["positive"]).isdisjoint(data["negative"])


def test_every_core_lifecycle_skill_has_balanced_boundary_cases():
    for skill in (
        "session", "scope", "deliver", "implement", "tdd", "diagnose",
        "code-review", "evaluate", "release", "retrospect", "work-map",
        "autonomous-lab",
    ):
        data = load(ROOT / "skills" / skill / "evals" / "trigger_cases.yaml")
        assert set(data) == {"positive", "negative", "boundary"}
        assert all(len(data[group]) >= 3 for group in data)
        cases = [case for group in data.values() for case in group]
        assert all(isinstance(case, str) and case.strip() for case in cases)
        assert len(cases) == len(set(cases))


def test_code_review_discipline_cases_have_prompt_and_expected_behaviour():
    data = load(ROOT / "skills" / "code-review" / "evals" / "discipline_cases.yaml")
    assert len(data["cases"]) >= 4
    for case in data["cases"]:
        assert set(case) == {"prompt", "expected"}
        assert case["prompt"].strip()
        assert case["expected"].strip()
