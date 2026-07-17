import json
from pathlib import Path

import yaml


ROOT = Path(__file__).resolve().parents[1]


def read(relative: str) -> str:
    return (ROOT / relative).read_text()


def compact(relative: str) -> str:
    return " ".join(read(relative).split())


def test_reuse_discipline_fixtures_follow_the_shared_minimal_schema():
    for skill in ("natural-writing", "engineering-writing", "deliver", "skill-craft"):
        data = yaml.safe_load(read(f"skills/{skill}/evals/discipline_cases.yaml"))
        assert len(data["cases"]) == 3
        assert all(set(case) == {"prompt", "expected"} for case in data["cases"])
        assert all(case["prompt"].strip() and case["expected"].strip() for case in data["cases"])


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


def test_document_profile_classifies_interactive_html_and_its_conditional_evidence():
    registry = json.loads(read("config/delivery-profiles.json"))
    document = registry["profiles"]["document"]
    surfaces = registry["artifact_type_surfaces"]
    deliver = compact("skills/deliver/references/interactive-documents.md")

    assert {"html", "interactive-document"} <= set(document["artifact_types"])
    assert surfaces["html"] == ["generated-artifact"]
    assert surfaces["interactive-document"] == ["generated-artifact"]
    assert "link-integrity evidence" in deliver
    assert "interaction-smoke evidence" in deliver
