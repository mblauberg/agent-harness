import hashlib
import json
import importlib.util
from pathlib import Path

import pytest
import yaml


ROOT = Path(__file__).resolve().parents[1]


def read(relative: str) -> str:
    return (ROOT / relative).read_text()


def compact(relative: str) -> str:
    return " ".join(read(relative).split())


def test_reuse_rules_live_in_the_existing_routing_portfolio_not_prose_pair_files():
    expected_ids = {
        "natural-writing": {"q145", "q150", "q151"},
        "engineering-writing": {"q084", "q088"},
        "engineering-docs": {"q075"},
        "legal-writing": {"q138"},
        "deliver": {"q055", "q058"},
        "skill-craft": {"q708"},
    }
    for skill, ids in expected_ids.items():
        assert not (ROOT / f"skills/{skill}/evals/discipline_cases.yaml").exists()
        cases = yaml.safe_load(read(f"skills/{skill}/evals/trigger_cases.yaml"))["cases"]
        selected = [case for case in cases if case["id"] in ids]
        assert {case["id"] for case in selected} == ids
        assert selected


def promotion_module():
    path = ROOT / "skills/skill-craft/scripts/promotion_readiness.py"
    spec = importlib.util.spec_from_file_location("promotion_readiness", path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def project(tmp_path: Path, project_id: str, *, status: str = "proven") -> dict:
    candidate = "a" * 40
    evidence_id = f"evidence-{project_id}"
    content = json.dumps({
        "schema_version": 1,
        "candidate_commit": candidate,
        "project_id": project_id,
        "evidence_id": evidence_id,
        "result": status,
    }, sort_keys=True).encode()
    path = tmp_path / f"{project_id}.json"
    path.write_bytes(content)
    return {
        "project_id": project_id,
        "evidence_id": evidence_id,
        "artifact": {
            "path": path.name,
            "sha256": "sha256:" + hashlib.sha256(content).hexdigest(),
        },
    }


def promotion_input(rows: list[dict]) -> dict:
    return {"schema_version": 1, "candidate_commit": "a" * 40, "project_evidence": rows}


def test_promotion_inventory_requires_two_distinct_projects_before_human_review(tmp_path: Path):
    decide = promotion_module().decide
    assert decide(promotion_input([project(tmp_path, "alpha")]), tmp_path) == {
        "schema_version": 1,
        "decision": "remain-project-local",
        "proven_project_count": 1,
    }
    assert decide(promotion_input([
        project(tmp_path, "alpha"), project(tmp_path, "beta"),
    ]), tmp_path) == {
        "schema_version": 1,
        "decision": "evidence-ready-for-human-review",
        "proven_project_count": 2,
    }


def test_global_promotion_rejects_invented_tampered_duplicate_and_failed_evidence(tmp_path: Path):
    decide = promotion_module().decide
    alpha = project(tmp_path, "alpha")
    beta = project(tmp_path, "beta")
    failed = project(tmp_path, "failed", status="failed")
    invented = {**beta, "artifact": {**beta["artifact"], "path": "missing.json"}}
    with pytest.raises(ValueError, match="missing"):
        decide(promotion_input([alpha, invented]), tmp_path)
    tampered = {**beta, "artifact": {**beta["artifact"], "sha256": "sha256:" + "0" * 64}}
    with pytest.raises(ValueError, match="digest"):
        decide(promotion_input([alpha, tampered]), tmp_path)
    with pytest.raises(ValueError, match="identity"):
        decide(promotion_input([alpha, {**beta, "project_id": "gamma"}]), tmp_path)
    rebound = promotion_input([alpha, beta])
    rebound["candidate_commit"] = "b" * 40
    with pytest.raises(ValueError, match="identity"):
        decide(rebound, tmp_path)
    assert decide(promotion_input([alpha, failed]), tmp_path)["decision"] == "remain-project-local"
    duplicate_project = {**beta, "project_id": "alpha"}
    with pytest.raises(ValueError, match="duplicate project_id"):
        decide(promotion_input([alpha, duplicate_project]), tmp_path)
    duplicate_evidence = {**beta, "evidence_id": "evidence-alpha"}
    with pytest.raises(ValueError, match="duplicate evidence_id"):
        decide(promotion_input([alpha, duplicate_evidence]), tmp_path)


def test_promotion_inventory_never_certifies_promotion(tmp_path: Path):
    result = promotion_module().decide(promotion_input([
        project(tmp_path, "alpha"), project(tmp_path, "beta"),
    ]), tmp_path)
    assert "promotion" not in result["decision"]


def test_writing_and_documentation_rules_encode_the_reusable_boundaries():
    natural = compact("skills/natural-writing/references/anti-ai-taxonomy.md")
    legal = compact("skills/legal-writing/references/decision-overviews.md")
    docs = compact("skills/engineering-docs/SKILL.md")
    engineering = compact("skills/engineering-writing/references/architecture-and-presentations.md")

    assert "name information or an action" in natural
    assert "authority, provenance, liability or negotiation meaning" in natural
    assert "Position or options" in legal
    assert "Professional confirmation" in legal
    assert "same audience, owner and lifecycle" in docs
    assert "pointer-only file" in docs
    assert "progressive disclosure" in engineering.lower()
    assert "contributing services or components" in engineering


def test_skill_craft_requires_cross_project_generalisation_and_semantic_correction_mining():
    skill = compact("skills/skill-craft/SKILL.md")
    audit = compact("skills/skill-craft/references/audit.md")

    assert "cross-project triggers, procedures and gates" in skill
    assert "contextual values into parameters" in skill
    assert "cluster corrections by meaning" in audit
    assert "Literal search can confirm known residue" in audit
    assert "at least two projects" in skill
    assert "[MAINTAINING.md](../../MAINTAINING.md)" in skill


def test_legal_decision_overview_is_one_hop_from_the_skill_front_door():
    legal_skill = read("skills/legal-writing/SKILL.md")
    assert "(references/decision-overviews.md)" in legal_skill


def test_document_profile_classifies_interactive_html_and_its_conditional_evidence():
    registry = json.loads(read("config/delivery-profiles.json"))
    document = registry["profiles"]["document"]
    surfaces = registry["artifact_type_surfaces"]
    deliver = compact("skills/deliver/references/interactive-documents.md")

    assert {"html", "interactive-document"} <= set(document["artifact_types"])
    assert surfaces["html"] == ["generated-artifact"]
    assert surfaces["interactive-document"] == ["generated-artifact", "source"]
    assert document["conditional_evidence"] == {
        "html": {"deterministic": ["link-integrity"], "judgement": []},
        "interactive-document": {
            "deterministic": ["link-integrity", "interaction-smoke"],
            "judgement": [],
        },
    }
    assert "link-integrity evidence" in deliver
    assert "interaction-smoke evidence" in deliver
