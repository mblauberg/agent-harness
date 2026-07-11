from pathlib import Path

import yaml


ROOT = Path(__file__).resolve().parents[1]
FRONTEND = ROOT / "skills" / "frontend-design"


def test_frontend_design_composes_with_canonical_lifecycle_owners():
    skill = (FRONTEND / "SKILL.md").read_text()
    routing = (FRONTEND / "reference" / "command-routing.md").read_text()

    assert "inside `implement`" in skill
    assert "`scope` owns" in routing
    assert "`engineering-docs` owns" in routing
    assert "`frontend-review` owns" in routing
    assert "`react-performance` owns" in routing


def test_frontend_design_has_no_competing_review_or_performance_commands():
    routing = (FRONTEND / "reference" / "command-routing.md").read_text()
    for command in ("critique", "audit", "optimize"):
        assert f"`{command}" not in routing
        assert not (FRONTEND / "reference" / f"{command}.md").exists()

    for retired in ("heuristics-scoring.md", "personas.md"):
        assert not (FRONTEND / "reference" / retired).exists()


def test_frontend_design_cannot_generate_overlapping_pinned_skills_or_run_legacy_cleanup():
    for retired in (
        "pin.mjs",
        "command-metadata.json",
        "critique-storage.mjs",
        "cleanup-deprecated.mjs",
    ):
        assert not (FRONTEND / "scripts" / retired).exists()

    paths = (FRONTEND / "scripts" / "impeccable-paths.mjs").read_text()
    assert "CRITIQUE_DIR" not in paths
    assert "getCritiqueDir" not in paths


def test_mutating_frontend_routes_keep_implement_as_lifecycle_owner():
    design = yaml.safe_load((FRONTEND / "evals" / "trigger_cases.yaml").read_text())
    review = yaml.safe_load((ROOT / "skills/frontend-review/evals/trigger_cases.yaml").read_text())
    cases = {case["id"]: case for case in design["cases"] + review["cases"]}
    for case_id in ("q106", "q107", "q108", "q112"):
        expected = cases[case_id]["expected"]
        assert expected["primary_skill"] == "implement"
        assert "frontend-design" in expected["companion_skills"]
