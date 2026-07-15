from collections import Counter
import importlib.util
from pathlib import Path
import subprocess

import pytest
import yaml


ROOT = Path(__file__).resolve().parents[1]
LIFECYCLE_EVAL = ROOT / "skills" / "orchestrate" / "evals" / "lifecycle_skill_evaluation.py"
AFFECTED = {
    "scope",
    "grill-me",
    "implement",
    "orchestrate",
    "session",
    "deliver",
    "work-map",
    "release",
    "retrospect",
}
REQUIRED_DOCTRINE = {
    "scope": ("decision context", "digest-bound"),
    "grill-me": ("decision context", "digest-bound"),
    "implement": ("minor work", "fresh implementation session", "adaptive plan"),
    "orchestrate": (
        "one chair", "leaders", ".worktrees/<task-agent>",
        "recursive obligations", "generation-bound operator action",
    ),
    "session": ("fresh session", "provider session", "compaction"),
    "deliver": ("project session", "coordination run", "workstream"),
    "work-map": ("project/run/lead", "not live task truth"),
    "release": ("exact accepted-artifact", "target-bound", "project/session authority"),
    "retrospect": ("gate latency", "unnecessary interruption", "next scope cycle"),
}


def load_evaluation():
    spec = importlib.util.spec_from_file_location("lifecycle_skill_evaluation", LIFECYCLE_EVAL)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_lifecycle_skills_have_focused_routes_and_adapter_absent_coverage():
    known_skills = {path.parent.name for path in (ROOT / "skills").glob("*/SKILL.md")}
    prompts = set()
    for skill in sorted(AFFECTED):
        path = ROOT / "skills" / skill / "evals" / "lifecycle_cases.yaml"
        data = yaml.safe_load(path.read_text())
        assert data == {"schema_version": 1, "target_skill": skill, "cases": data["cases"]}
        assert Counter(case["relation"] for case in data["cases"]) == {
            "positive": 1,
            "negative": 1,
            "adjacent": 1,
            "portability": 1,
        }
        for case in data["cases"]:
            assert case["id"].startswith(f"lifecycle-{skill}-")
            assert case["prompt"].strip() and case["prompt"] not in prompts
            prompts.add(case["prompt"])
            assert "lifecycle-alignment" in case["tags"]
            expected = case["expected"]
            assert expected["primary_skill"] in known_skills | {None}
            assert set(expected["companion_skills"]) <= known_skills
        portable = next(case for case in data["cases"] if case["relation"] == "portability")
        assert portable["adapters"] == {"console": "absent", "herdr": "absent", "github": "absent"}
        assert "project artifacts" in portable["prompt"].lower()


def test_lifecycle_skill_doctrine_is_adaptive_portable_and_bounded():
    for skill, fragments in REQUIRED_DOCTRINE.items():
        text = " ".join((ROOT / "skills" / skill / "SKILL.md").read_text().lower().split())
        for fragment in fragments:
            assert fragment in text, f"{skill} lacks lifecycle doctrine: {fragment}"
        assert "import agent-fabric-console" not in text
        assert "parse the console" not in text
        assert "requires herdr" not in text
        assert "requires github" not in text


def test_deliver_exposes_the_typed_portable_fabric_relationship_contract():
    skill = (ROOT / "skills" / "deliver" / "SKILL.md").read_text()
    contract = (ROOT / "skills" / "deliver" / "references" / "contract.md").read_text()
    cases = yaml.safe_load(
        (ROOT / "skills" / "deliver" / "evals" / "lifecycle_cases.yaml").read_text()
    )["cases"]
    assert "fabric_relationships" in skill
    for fragment in (
        "fabric_relationships", "delivery_run_id", "project_session_id",
        "coordination_run_id", "workstream_id", "lead_agent_id",
        "coordinated", "independent", "not_applicable",
    ):
        assert fragment in contract
    assert "fabric_relationships" in next(case["prompt"] for case in cases if case["relation"] == "positive")
    assert "not_applicable" in next(case["prompt"] for case in cases if case["relation"] == "portability")


def test_lifecycle_evaluator_validates_current_inputs_and_executes_portability(tmp_path):
    module = load_evaluation()
    module.validate_inputs(ROOT)
    result = module.run_portability_probe(ROOT, tmp_path / "probe")
    assert {case["skill"] for case in result["cases"]} == AFFECTED
    assert result["status"] == "pass"


def test_lifecycle_adapter_absent_probe_fails_when_workflow_runner_breaks(tmp_path):
    module = load_evaluation()
    runner = tmp_path / "broken-portable-workflow.py"
    runner.write_text("raise SystemExit(42)\n")
    with pytest.raises(subprocess.CalledProcessError):
        module.run_portability_probe(ROOT, tmp_path / "probe", workflow_runner=runner)
