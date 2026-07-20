from pathlib import Path

import yaml


ROOT = Path(__file__).resolve().parents[1]


def _label_names(path: Path) -> set[str]:
    return {entry["name"] for entry in yaml.safe_load(path.read_text())}


def test_dead_endpoint_dispatch_surface_is_not_shipped() -> None:
    assert not (ROOT / ".github" / "workflows" / "agent-go-trigger.yml").exists()
    assert not (ROOT / ".github" / "agent-go.yml").exists()

    assert "agent-go" not in _label_names(ROOT / ".github" / "labels.yml")
    assert "agent-go" not in _label_names(
        ROOT / "skills" / "setup-repo" / "templates" / "labels.yml"
    )

    runbook = (ROOT / "docs" / "runbooks" / "github-workflow.md").read_text()
    skill = (ROOT / "skills" / "setup-repo" / "SKILL.md").read_text()
    assert "## Agent-go trigger" not in runbook
    assert "agent-go" not in skill
