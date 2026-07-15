from pathlib import Path

import yaml


ROOT = Path(__file__).resolve().parents[1]
UI_UX_DESIGN = ROOT / "skills" / "ui-ux-design"


def test_ui_ux_design_composes_with_canonical_lifecycle_owners():
    skill = (UI_UX_DESIGN / "SKILL.md").read_text()
    routing = (UI_UX_DESIGN / "reference" / "command-routing.md").read_text()

    assert "inside `implement`" in skill
    assert "`scope` owns" in routing
    assert "`engineering-docs` owns" in routing
    assert "review branch](review.md) owns" in routing
    assert "`code-review` owns" in routing
    assert "`react-performance` owns" in routing


def test_ui_ux_design_has_no_competing_review_or_performance_commands():
    routing = (UI_UX_DESIGN / "reference" / "command-routing.md").read_text()
    for command in ("critique", "audit", "optimize"):
        assert f"`{command}" not in routing
        assert not (UI_UX_DESIGN / "reference" / f"{command}.md").exists()

    for retired in ("heuristics-scoring.md", "personas.md"):
        assert not (UI_UX_DESIGN / "reference" / retired).exists()


def test_review_branch_cannot_generate_overlapping_pinned_skills_or_run_legacy_cleanup():
    for retired in (
        "pin.mjs",
        "command-metadata.json",
        "critique-storage.mjs",
        "cleanup-deprecated.mjs",
    ):
        assert not (UI_UX_DESIGN / "scripts" / retired).exists()

    paths = (UI_UX_DESIGN / "scripts" / "impeccable-paths.mjs").read_text()
    assert "CRITIQUE_DIR" not in paths
    assert "getCritiqueDir" not in paths

    boundary = yaml.safe_load((UI_UX_DESIGN / "evals" / "boundary_cases.yaml").read_text())
    review_cases = [case for case in boundary["cases"] if case["branch"] == "review"]
    assert review_cases, "expected at least one review-branch boundary case"
    for case in review_cases:
        forbidden = set(case["expected"].get("tool_calls_forbidden", []))
        assert {"Write", "Edit", "NotebookEdit"} <= forbidden


def test_mutating_design_routes_keep_implement_as_lifecycle_owner():
    trigger = yaml.safe_load((UI_UX_DESIGN / "evals" / "trigger_cases.yaml").read_text())
    cases = {case["id"]: case for case in trigger["cases"]}

    composition_implement_cases = [
        case
        for case in cases.values()
        if "composition" in case.get("tags", []) and case["expected"]["primary_skill"] == "implement"
    ]
    assert composition_implement_cases, "expected a composition case owned by implement"
    for case in composition_implement_cases:
        assert "ui-ux-design" in case["expected"]["companion_skills"]

    boundary = yaml.safe_load((UI_UX_DESIGN / "evals" / "boundary_cases.yaml").read_text())
    design_make_cases = {case["id"]: case for case in boundary["cases"] if case["branch"] == "design/make"}
    assert design_make_cases, "expected a design/make boundary case"
    for case in design_make_cases.values():
        permitted = set(case["expected"].get("tool_calls_permitted", []))
        assert {"Write", "Edit"} <= permitted
        assert "implement" in case["expected"]["behaviour"]
