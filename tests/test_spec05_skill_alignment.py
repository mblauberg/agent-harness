from collections import Counter
import importlib.util
import json
from pathlib import Path

import pytest
import yaml


ROOT = Path(__file__).resolve().parents[1]
SPEC05_EVAL = ROOT / "skills" / "orchestrate" / "evals" / "spec05_skill_evaluation.py"
SPEC05_EVIDENCE = ROOT / "docs" / "evals" / "spec05-skill-routing-2026"
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


def test_spec05_affected_skills_have_focused_routes_and_adapter_absent_coverage():
    known_skills = {path.parent.name for path in (ROOT / "skills").glob("*/SKILL.md")}
    prompts = set()

    for skill in sorted(AFFECTED):
        path = ROOT / "skills" / skill / "evals" / "spec05_cases.yaml"
        data = yaml.safe_load(path.read_text())
        assert data == {
            "schema_version": 1,
            "target_skill": skill,
            "cases": data["cases"],
        }
        assert Counter(case["relation"] for case in data["cases"]) == {
            "positive": 1,
            "negative": 1,
            "adjacent": 1,
            "portability": 1,
        }

        for case in data["cases"]:
            assert set(case) == {"id", "relation", "prompt", "tags", "expected"} | (
                {"adapters"} if case["relation"] == "portability" else set()
            )
            assert case["id"].startswith(f"s05-{skill}-")
            assert case["prompt"].strip() and case["prompt"] not in prompts
            prompts.add(case["prompt"])
            assert "spec05" in case["tags"]

            expected = case["expected"]
            assert set(expected) == {"primary_skill", "companion_skills"}
            assert expected["primary_skill"] in known_skills | {None}
            assert set(expected["companion_skills"]) <= known_skills
            if case["relation"] in {"positive", "portability"}:
                assert expected["primary_skill"] == skill
            elif case["relation"] == "negative":
                assert expected["primary_skill"] != skill
                assert skill not in expected["companion_skills"]
            else:
                assert "composition" in case["tags"]
                assert skill == expected["primary_skill"] or skill in expected["companion_skills"]

        portable = next(case for case in data["cases"] if case["relation"] == "portability")
        assert portable["adapters"] == {
            "console": "absent",
            "herdr": "absent",
            "github": "absent",
        }
        assert "project artifacts" in portable["prompt"].lower()


def test_spec05_affected_skill_doctrine_is_adaptive_portable_and_bounded():
    for skill, fragments in REQUIRED_DOCTRINE.items():
        text = " ".join(
            (ROOT / "skills" / skill / "SKILL.md").read_text().lower().split()
        )
        for fragment in fragments:
            assert fragment in text, f"{skill} lacks Spec 05 doctrine: {fragment}"
        assert "import agent-fabric-console" not in text
        assert "parse the console" not in text
        assert "requires herdr" not in text
        assert "requires github" not in text

    release = (ROOT / "skills" / "release" / "SKILL.md").read_text().lower()
    assert "cannot release or deploy" in release


def test_deliver_exposes_the_typed_portable_fabric_relationship_contract():
    skill = (ROOT / "skills" / "deliver" / "SKILL.md").read_text()
    contract = (ROOT / "skills" / "deliver" / "references" / "contract.md").read_text()
    cases = yaml.safe_load(
        (ROOT / "skills" / "deliver" / "evals" / "spec05_cases.yaml").read_text()
    )["cases"]

    assert "fabric_relationships" in skill
    for fragment in (
        "fabric_relationships", "delivery_run_id", "project_session_id",
        "coordination_run_id", "workstream_id", "lead_agent_id",
        "coordinated", "independent", "not_applicable",
    ):
        assert fragment in contract
    assert "fabric_relationships" in next(
        case["prompt"] for case in cases if case["relation"] == "positive"
    )
    assert "not_applicable" in next(
        case["prompt"] for case in cases if case["relation"] == "portability"
    )


def load_spec05_evaluation():
    assert SPEC05_EVAL.is_file(), "Spec 05 needs an executable routing and portability evaluation"
    spec = importlib.util.spec_from_file_location("spec05_skill_evaluation", SPEC05_EVAL)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_spec05_routing_packet_is_derived_from_live_catalogue_and_focused_cases():
    module = load_spec05_evaluation()
    module.validate_frozen_routing_inputs(ROOT, SPEC05_EVIDENCE)


def test_spec05_routing_validator_rejects_synthetic_or_self_declared_answers(tmp_path):
    module = load_spec05_evaluation()
    result = module.make_contract_test_result(ROOT, SPEC05_EVIDENCE, tmp_path)
    module.validate_routing_result(result, ROOT, SPEC05_EVIDENCE, evidence_root=tmp_path)

    action_path = tmp_path / result["invocations"][0]["action_evidence_artifact"]
    action = json.loads(action_path.read_text())
    action["adapter_id"] = "recorded-eval"
    action_path.write_text(json.dumps(action, sort_keys=True) + "\n")
    result["invocations"][0]["action_evidence_sha256"] = module.sha256_file(action_path)
    with pytest.raises(module.Invalid, match="real Agent Fabric adapter"):
        module.validate_routing_result(result, ROOT, SPEC05_EVIDENCE, evidence_root=tmp_path)


def test_spec05_retained_real_fabric_routing_result_passes():
    module = load_spec05_evaluation()
    result = json.loads((SPEC05_EVIDENCE / "routing-result.json").read_text())
    module.validate_routing_result(result, ROOT, SPEC05_EVIDENCE)


def test_spec05_adapter_absent_workflows_execute_and_match_retained_result(tmp_path):
    module = load_spec05_evaluation()
    actual = module.run_portability_probe(ROOT, tmp_path / "probe")
    retained = json.loads((SPEC05_EVIDENCE / "portability-result.json").read_text())
    assert actual == retained
    module.validate_portability_result(retained, ROOT, SPEC05_EVIDENCE)
    assert {case["skill"] for case in retained["cases"]} == AFFECTED
    assert all(case["status"] == "pass" for case in retained["cases"])
    assert retained["environment"]["absent_commands"] == {
        "agent-fabric-console": True,
        "gh": True,
        "herdr": True,
    }
