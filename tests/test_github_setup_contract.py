from pathlib import Path

import yaml


ROOT = Path(__file__).resolve().parents[1]
SKILL = ROOT / "skills" / "github-setup"


def test_fresh_scaffold_includes_the_security_policy_linked_by_issue_forms():
    security_policy = SKILL / "templates" / "SECURITY.md"
    config = yaml.safe_load(
        (SKILL / "templates" / "ISSUE_TEMPLATE" / "config.yml").read_text()
    )
    security_link = config["contact_links"][0]
    instructions = (SKILL / "SKILL.md").read_text()
    policy = security_policy.read_text()

    assert security_policy.is_file()
    assert "<private-reporting-route>" in policy
    assert security_link["url"].endswith("/blob/main/SECURITY.md")
    assert "templates/SECURITY.md" in instructions
    assert "private vulnerability reporting is enabled" in instructions
    assert "working confidential contact method" in instructions
    assert "replace `<private-reporting-route>`" in " ".join(instructions.split())
    assert "before" in instructions.lower()


def test_global_skill_authoring_routes_to_skill_craft_not_repo_bootstrap():
    cases = yaml.safe_load((SKILL / "evals" / "trigger_cases.yaml").read_text())["cases"]
    q900 = next(case for case in cases if case["id"] == "q900")
    q906 = next(case for case in cases if case["id"] == "q906")

    assert q900["expected"] == {
        "primary_skill": "github-setup",
        "companion_skills": [],
    }
    assert q906["expected"] == {
        "primary_skill": "skill-craft",
        "companion_skills": [],
    }
