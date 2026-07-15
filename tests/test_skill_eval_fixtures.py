from collections import Counter
import hashlib
import json
from pathlib import Path

import pytest
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


@pytest.mark.xfail(
    reason=(
        "skill-portfolio-2026 catalogue digest is bound to the pre-#124 skill "
        "descriptions; the #124 merges change the live catalogue, so this frozen "
        "routing evidence is regenerated under issue #135 (see "
        "docs/audits/skill-catalogue-audit-register.md)."
    ),
    strict=False,
)
def test_portfolio_routing_summary_binds_the_canonical_result():
    root = ROOT / "docs" / "evals" / "skill-portfolio-2026"
    summary = json.loads((root / "summary.json").read_text())["routing_regression"]
    result_path = root / "routing-result.json"
    result = json.loads(result_path.read_text())
    dataset_path = root / result["dataset"]["path"]
    plan_path = root / result["plan"]["path"]
    plan = json.loads(plan_path.read_text())
    descriptions = {}
    for path in sorted((ROOT / "skills").glob("*/SKILL.md")):
        frontmatter = yaml.safe_load(path.read_text().split("---", 2)[1])
        descriptions[frontmatter["name"]] = frontmatter["description"]
    catalogue = "".join(
        f"- {name}: {descriptions[name]}\n" for name in sorted(descriptions)
    ).encode()

    assert summary["evaluation_id"] == result["evaluation_id"]
    assert summary["receipt_digest"] == (
        "sha256:" + hashlib.sha256(result_path.read_bytes()).hexdigest()
    )
    assert result["dataset"]["sha256"] == (
        "sha256:" + hashlib.sha256(dataset_path.read_bytes()).hexdigest()
    )
    assert result["plan"]["sha256"] == (
        "sha256:" + hashlib.sha256(plan_path.read_bytes()).hexdigest()
    )
    assert plan["dataset"] == result["dataset"] | {"split": "fresh-holdout"}
    assert plan["catalogue"] == result["catalogue"]
    assert result["catalogue"] == {
        "sha256": "sha256:" + hashlib.sha256(catalogue).hexdigest(),
        "characters": len(catalogue.decode()),
    }
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
