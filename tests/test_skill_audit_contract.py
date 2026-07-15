from pathlib import Path

import yaml


ROOT = Path(__file__).resolve().parents[1]
SKILL = ROOT / "skills" / "skill-audit" / "SKILL.md"
METHOD = ROOT / "skills" / "skill-audit" / "references" / "method.md"
FIXTURES = ROOT / "skills" / "skill-audit" / "evals" / "trigger_cases.yaml"
SPEC = ROOT / "docs" / "specs" / "harness" / "lifecycle.md"
ADR = ROOT / "docs" / "adr" / "0001-personal-first-product-compatible.md"


def test_local_history_audit_is_local_first_and_export_gated():
    skill = SKILL.read_text()
    compact = " ".join(skill.split())
    lowered = compact.lower()

    assert len(skill.split()) <= 500
    assert (
        "direct human request authorises read-only analysis of the named "
        "local histories" in lowered
    )
    assert "Do not require a second privacy receipt" in compact
    assert "same authorised session is local delivery, not sharing/export" in compact
    assert "needs no second disclosure confirmation" in compact
    assert "persistent repository/shared artifact" in compact
    assert "sending raw excerpts to another provider" in compact
    assert "new audience or external destination" in compact
    assert "confirm with the human" in compact
    assert "Unsupported or unattributable evidence is `N/A`, never zero" in compact

    method = " ".join(METHOD.read_text().split())
    assert "inspect source history in place" in method
    assert "cannot score a new skill" in method
    assert "same authorised session is local delivery, not export" in method
    assert "raw cross-provider handoff" in method
    assert "Minimise authorised exports to aggregates or paraphrases" in method

    retired = [
        ROOT / "skills" / "skill-audit" / "scripts" / "collect_telemetry.py",
        ROOT / "skills" / "skill-audit" / "scripts" / "validate_telemetry.py",
        ROOT / "skills" / "skill-audit" / "SKILL-TELEMETRY.template.json",
    ]
    assert not [path for path in retired if path.exists()]


def test_local_history_routing_separates_audit_from_export():
    cases = {
        case["id"]: case
        for case in yaml.safe_load(FIXTURES.read_text())["cases"]
    }

    local = cases["q237"]
    assert local["relation"] == "positive"
    assert local["expected"] == {
        "primary_skill": "skill-audit",
        "companion_skills": [],
    }
    assert {"local-history", "direct"} <= set(local["tags"])

    export_only = cases["q238"]
    assert export_only["relation"] == "negative"
    assert export_only["expected"] == {
        "primary_skill": "release",
        "companion_skills": [],
    }
    assert {"local-history", "export"} <= set(export_only["tags"])

    audit_then_export = cases["q243"]
    assert audit_then_export["relation"] == "boundary"
    assert audit_then_export["expected"] == {
        "primary_skill": "release",
        "companion_skills": ["skill-audit"],
    }
    assert {"composition", "local-history", "export"} <= set(
        audit_then_export["tags"]
    )

    audit_then_evaluate = cases["q242"]
    assert "audit" in audit_then_evaluate["prompt"].lower()
    assert audit_then_evaluate["expected"] == {
        "primary_skill": "evaluate",
        "companion_skills": ["skill-audit"],
    }


def test_normative_docs_match_the_local_first_contract():
    spec = SPEC.read_text()
    adr = ADR.read_text()
    compact_adr = " ".join(adr.split())
    compact_spec = " ".join(spec.split())

    assert "Status: Base implementation machine verified" in spec
    assert "current contract permits direct read-only analysis" in compact_spec
    assert "## Local skill evidence and shared exports" in spec
    assert "same authorised session is local delivery, not sharing/export" in compact_spec
    assert "persistent repository/shared artifact" in compact_spec
    assert "no provider-native adapter or producer" in compact_spec
    assert "History predating a skill" in spec
    assert "cannot score that skill" in compact_spec
    assert "prospective contract coverage" in spec
    assert "Unsupported or unattributable evidence is `N/A`, never zero" in spec
    assert "direct request for read-only local history analysis" in compact_adr
    assert "raw cross-provider handoff" in compact_adr
    retired_names = (
        "collect_telemetry.py",
        "validate_telemetry.py",
        "SKILL-TELEMETRY.template.json",
    )
    assert not [name for name in retired_names if name in spec]
