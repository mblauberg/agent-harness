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
        assert set(data) == {"positive", "negative"}
        assert len(data["positive"]) >= 3
        assert len(data["negative"]) >= 3
        assert all(isinstance(case, str) and case.strip() for cases in data.values() for case in cases)
        assert set(data["positive"]).isdisjoint(data["negative"])


def test_code_review_discipline_cases_have_prompt_and_expected_behaviour():
    data = load(ROOT / "skills" / "code-review" / "evals" / "discipline_cases.yaml")
    assert len(data["cases"]) >= 4
    for case in data["cases"]:
        assert set(case) == {"prompt", "expected"}
        assert case["prompt"].strip()
        assert case["expected"].strip()
