from __future__ import annotations

import re
from pathlib import Path

import yaml


ROOT = Path(__file__).resolve().parents[1]
WORKFLOW = ROOT / ".github" / "workflows" / "ci.yml"
IMMUTABLE_ACTION = re.compile(r"^[^@\s]+@[0-9a-f]{40}$")


def _workflow() -> dict[str, object]:
    value = yaml.safe_load(WORKFLOW.read_text(encoding="utf-8"))
    assert isinstance(value, dict)
    return value


def _job(document: dict[str, object], name: str) -> dict[str, object]:
    jobs = document.get("jobs")
    assert isinstance(jobs, dict)
    value = jobs.get(name)
    assert isinstance(value, dict), f"CI must define the {name} job"
    return value


def _steps(job: dict[str, object]) -> list[dict[str, object]]:
    value = job.get("steps")
    assert isinstance(value, list)
    assert all(isinstance(item, dict) for item in value)
    return value


def test_ci_uses_immutable_actions_and_least_privilege() -> None:
    document = _workflow()
    assert document.get("permissions") == {"contents": "read"}
    assert "pull_request:" in WORKFLOW.read_text(encoding="utf-8")

    jobs = document.get("jobs")
    assert isinstance(jobs, dict)
    for job_name, job in jobs.items():
        assert isinstance(job, dict)
        assert job.get("permissions", {"contents": "read"}) == {"contents": "read"}, job_name
        for step in _steps(job):
            action = step.get("uses")
            if action is not None:
                assert isinstance(action, str) and IMMUTABLE_ACTION.fullmatch(action), action
                if action.startswith("actions/checkout@"):
                    options = step.get("with")
                    assert isinstance(options, dict)
                    assert options.get("persist-credentials") is False


def test_ci_runs_complete_harness_and_fabric_gates() -> None:
    document = _workflow()
    harness_steps = _steps(_job(document, "harness"))
    fabric_steps = _steps(_job(document, "fabric"))

    harness_commands = "\n".join(str(step.get("run", "")) for step in harness_steps)
    assert "scripts/check-harness" in harness_commands

    node_setup = next(step for step in fabric_steps if str(step.get("uses", "")).startswith("actions/setup-node@"))
    assert node_setup.get("with", {}).get("node-version") == "24"
    fabric_commands = "\n".join(str(step.get("run", "")) for step in fabric_steps)
    for required in (
        "npm ci",
        "npm run check",
        "npm run test:evaluation",
        "npm run test:load",
        "npm audit --omit=dev --audit-level=high",
    ):
        assert required in fabric_commands
    run_steps = [step for step in fabric_steps if "run" in step]
    assert all(step.get("working-directory") == "runtime/agent-fabric" for step in run_steps)


def test_repository_policy_covers_sensitive_fabric_surfaces() -> None:
    codeowners = (ROOT / ".github" / "CODEOWNERS").read_text(encoding="utf-8")
    for path in (
        "/runtime/agent-fabric/",
        "/runtime/agent-fabric/migrations/",
        "/runtime/agent-fabric/schemas/",
        "/config/model-routing.json",
        "/config/adapter-compatibility.yaml",
        "/scripts/static-security-check.py",
    ):
        assert path in codeowners

    dependabot = yaml.safe_load((ROOT / ".github" / "dependabot.yml").read_text(encoding="utf-8"))
    updates = dependabot.get("updates", [])
    assert any(item.get("package-ecosystem") == "npm" and item.get("directory") == "/runtime/agent-fabric" for item in updates)
    assert any(item.get("package-ecosystem") == "github-actions" and item.get("directory") == "/" for item in updates)

    template = (ROOT / ".github" / "pull_request_template.md").read_text(encoding="utf-8").lower()
    for evidence in ("risk", "test evidence", "migration", "security", "rollback", "independent review"):
        assert evidence in template
