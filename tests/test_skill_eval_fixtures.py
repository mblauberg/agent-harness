from collections import Counter
import json
from pathlib import Path
import subprocess

import yaml


ROOT = Path(__file__).resolve().parents[1]


def load(path: Path):
    return yaml.safe_load(path.read_text())


def test_every_skill_has_canonical_positive_negative_and_boundary_routes():
    skills = {path.parent.name for path in (ROOT / "skills").glob("*/SKILL.md")}
    seen_ids = set()
    seen_prompts = set()

    for skill in sorted(skills):
        path = ROOT / "skills" / skill / "evals" / "trigger_cases.yaml"
        assert path.is_file(), f"missing trigger fixture: {skill}"
        data = load(path)
        assert set(data) == {"schema_version", "target_skill", "cases"}
        assert data["schema_version"] == 1
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


def test_portfolio_routing_summary_retains_a_self_consistent_historical_result():
    root = ROOT / "docs" / "evals" / "skill-portfolio-2026"
    summary = json.loads((root / "summary.json").read_text())["routing_regression"]
    result = json.loads((root / "routing-result.json").read_text())
    plan = json.loads((root / result["plan"]["path"]).read_text())
    repository = result["repository"]
    assert summary["evaluation_id"] == result["evaluation_id"]
    assert summary["repository"] == repository == plan["repository"]
    assert set(repository) == {"commit", "path"}
    assert len(repository["commit"]) == 40
    historical_root = repository["path"]
    historical_result = json.loads(subprocess.run(
        ["git", "show", f'{repository["commit"]}:{historical_root}/routing-result.json'],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    ).stdout)
    subprocess.run(
        ["git", "cat-file", "-e", f'{repository["commit"]}:{historical_root}/{result["dataset"]["path"]}'],
        cwd=ROOT,
        check=True,
        capture_output=True,
    )
    assert historical_result["evaluation_id"] == result["evaluation_id"]
    assert historical_result["metrics"] == result["metrics"]
    assert historical_result["lineage"] == result["lineage"]
    assert summary["case_rows"] == result["schedule"]["case_rows"]
    for name in ("primary_accuracy", "companion_fidelity"):
        assert summary[name] == result["metrics"][name]["value"]
        assert summary[f"{name.split('_')[0]}_threshold"] == result["metrics"][name]["threshold"]
        assert result["metrics"][name]["passed"] is True
    assert result["metrics"]["critical_case_failures"] == 0


def test_portfolio_summary_retains_bounded_failure_lineage():
    root = ROOT / "docs" / "evals" / "skill-portfolio-2026"
    summary = json.loads((root / "summary.json").read_text())
    nonpasses = summary["retained_nonpasses"]

    assert {item["status"] for item in nonpasses} == {"incomplete", "fail", "cancelled"}
    assert {item["evaluation_id"] for item in nonpasses} >= {
        "skill-portfolio-routing-20260711-v2",
        "skill-portfolio-routing-20260711-v3",
        "skill-portfolio-routing-20260711-v4",
        "skill-portfolio-routing-20260711-v5",
    }
    for item in nonpasses:
        assert item["reason"].strip()
