from collections import Counter
from pathlib import Path

import yaml


ROOT = Path(__file__).resolve().parents[1]


def load(path: Path):
    return yaml.safe_load(path.read_text())


def test_every_skill_has_schema_v2_positive_negative_and_boundary_routes():
    skills = {path.parent.name for path in (ROOT / "skills").glob("*/SKILL.md")}
    seen_ids = set()
    seen_prompts = set()

    for skill in sorted(skills):
        path = ROOT / "skills" / skill / "evals" / "trigger_cases.yaml"
        assert path.is_file(), f"missing trigger fixture: {skill}"
        data = load(path)
        assert set(data) == {"schema_version", "target_skill", "cases"}
        assert data["schema_version"] == 2
        assert data["target_skill"] == skill
        assert isinstance(data["cases"], list)
        assert Counter(case["relation"] for case in data["cases"]) == {
            "positive": 3,
            "negative": 3,
            "boundary": 3,
        }

        for case in data["cases"]:
            assert set(case) == {"id", "relation", "prompt", "tags", "expected"}
            assert case["id"].startswith("q") and case["id"][1:].isdigit()
            assert case["id"] not in seen_ids
            seen_ids.add(case["id"])
            assert isinstance(case["prompt"], str) and case["prompt"].strip()
            assert case["prompt"] not in seen_prompts
            seen_prompts.add(case["prompt"])
            assert isinstance(case["tags"], list) and case["tags"]

            expected = case["expected"]
            assert set(expected) == {"primary_skill", "companion_skills"}
            primary = expected["primary_skill"]
            companions = expected["companion_skills"]
            assert primary is None or primary in skills
            assert isinstance(companions, list) and len(companions) == len(set(companions))
            assert set(companions) <= skills
            assert primary not in companions

            if case["relation"] == "positive":
                assert primary == skill
            elif case["relation"] == "negative":
                assert primary != skill and skill not in companions
            else:
                assert {"adjacent", "composition"} & set(case["tags"])

            if primary is None:
                assert companions == []
                assert "no-skill" in case["tags"]


def test_code_review_discipline_cases_have_prompt_and_expected_behaviour():
    data = load(ROOT / "skills" / "code-review" / "evals" / "discipline_cases.yaml")
    assert len(data["cases"]) >= 4
    for case in data["cases"]:
        assert set(case) == {"prompt", "expected"}
        assert case["prompt"].strip()
        assert case["expected"].strip()
