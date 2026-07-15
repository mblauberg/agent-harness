from __future__ import annotations

import json
import re
from pathlib import Path

import yaml


ROOT = Path(__file__).resolve().parents[1]
WORKFLOW = ROOT / ".github" / "workflows" / "ci.yml"
ROOT_PACKAGE = ROOT / "package.json"
ROOT_LOCK = ROOT / "package-lock.json"
FABRIC_PACKAGE = ROOT / "runtime" / "agent-fabric" / "package.json"
IMMUTABLE_ACTION = re.compile(r"^[^@\s]+@[0-9a-f]{40}$")
WORKSPACE_GUIDES = (
    ROOT / "CONTRIBUTING.md",
    ROOT / "docs" / "runbooks" / "agent-fabric-operations.md",
    ROOT / "docs" / "runbooks" / "agent-fabric-traceability.md",
    ROOT / "runtime" / "agent-fabric" / "README.md",
    ROOT / "runtime" / "agent-fabric-herdr" / "README.md",
)


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
    workflow_source = WORKFLOW.read_text(encoding="utf-8")
    assert "pull_request:" in workflow_source
    assert re.search(r"(?m)^  push:\n    branches: \[main\]$", workflow_source)

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

    for job_name in ("harness", "fabric", "console", "herdr"):
        commands = [str(step.get("run", "")) for step in _steps(_job(document, job_name))]
        pin_index = next(
            index for index, command in enumerate(commands) if "npm install --global npm@11.12.1" in command
        )
        install_index = next(index for index, command in enumerate(commands) if "npm ci" in command)
        assert pin_index < install_index
        assert 'test "$(npm --version)" = "11.12.1"' in commands[pin_index]

    harness_node_setup = next(
        step for step in harness_steps if str(step.get("uses", "")).startswith("actions/setup-node@")
    )
    assert harness_node_setup.get("with", {}).get("node-version") == "24"
    harness_commands = "\n".join(str(step.get("run", "")) for step in harness_steps)
    for required in (
        "npm ci --no-audit --no-fund",
        "npm run build:types",
        "npm run schema:check:generated",
        "npm run build",
        "git status --porcelain --untracked-files=all -- runtime/agent-fabric-protocol/schemas",
        "scripts/check-harness",
    ):
        assert required in harness_commands
    harness_run_commands = [str(step.get("run", "")).strip() for step in harness_steps if "run" in step]
    build_types_index = harness_run_commands.index("npm run build:types")
    generated_check_index = harness_run_commands.index("npm run schema:check:generated")
    build_index = harness_run_commands.index("npm run build")
    status_index = next(
        index
        for index, command in enumerate(harness_run_commands)
        if "git status --porcelain --untracked-files=all -- runtime/agent-fabric-protocol/schemas" in command
    )
    harness_index = harness_run_commands.index("scripts/check-harness")
    assert build_types_index < generated_check_index < build_index < status_index < harness_index

    node_setup = next(step for step in fabric_steps if str(step.get("uses", "")).startswith("actions/setup-node@"))
    assert node_setup.get("with", {}).get("node-version") == "24"
    fabric_commands = "\n".join(str(step.get("run", "")) for step in fabric_steps)
    for required in (
        "npm ci --no-audit --no-fund",
        "npm run build",
        "npm run schema:check --workspace=@local/agent-fabric",
        "npm run typecheck --workspace=@local/agent-fabric",
        "npm run test --workspace=@local/agent-fabric",
        "npm run test:evaluation --workspace=@local/agent-fabric",
        "npm run test:load --workspace=@local/agent-fabric",
        "npm audit --workspace=@local/agent-fabric --omit=dev --audit-level=high",
    ):
        assert required in fabric_commands
    run_steps = [step for step in fabric_steps if "run" in step]
    assert all("working-directory" not in step for step in run_steps)


def test_clean_ci_builds_locked_protocol_before_daemon_typecheck() -> None:
    document = _workflow()
    fabric_steps = _steps(_job(document, "fabric"))
    node_setup = next(
        step for step in fabric_steps if str(step.get("uses", "")).startswith("actions/setup-node@")
    )
    cache_paths = str(node_setup.get("with", {}).get("cache-dependency-path", "")).splitlines()
    assert cache_paths == ["package-lock.json"]

    root_package = json.loads(ROOT_PACKAGE.read_text(encoding="utf-8"))
    assert root_package.get("workspaces") == [
        "runtime/agent-fabric-protocol",
        "runtime/agent-fabric",
        "runtime/agent-fabric-herdr",
        "runtime/agent-fabric-console",
    ]
    root_scripts = root_package.get("scripts")
    assert isinstance(root_scripts, dict)
    root_build = root_scripts.get("build")
    assert isinstance(root_build, str)
    assert "tsc -b tsconfig.json" in root_build
    assert "npm run schema:write" in root_build
    schema_write = root_scripts.get("schema:write")
    assert isinstance(schema_write, str)
    assert "runtime/agent-fabric-protocol/scripts/write-schema.mjs --write" in schema_write
    generated_schema_check = root_scripts.get("schema:check:generated")
    assert isinstance(generated_schema_check, str)
    assert "runtime/agent-fabric-protocol/scripts/write-schema.mjs --check" in generated_schema_check
    assert ROOT_LOCK.is_file()
    assert not list((ROOT / "runtime").glob("*/package-lock.json"))
    root_dev_dependencies = root_package.get("devDependencies")
    assert isinstance(root_dev_dependencies, dict)
    assert root_dev_dependencies.get("tsx") == "4.23.1"

    package = json.loads(FABRIC_PACKAGE.read_text(encoding="utf-8"))
    scripts = package.get("scripts")
    assert isinstance(scripts, dict)
    daemon_check = scripts.get("check")
    assert "check:protocol" not in scripts
    assert isinstance(daemon_check, str)
    assert "npm --prefix" not in daemon_check

    for relative in (
        "runtime/agent-fabric/package.json",
        "runtime/agent-fabric-herdr/package.json",
        "runtime/agent-fabric-console/package.json",
    ):
        consumer = json.loads((ROOT / relative).read_text(encoding="utf-8"))
        consumer_scripts = consumer.get("scripts")
        assert isinstance(consumer_scripts, dict)
        assert consumer_scripts.get("precheck") == "npm run build --include-workspace-root"

    fabric_commands = "\n".join(str(step.get("run", "")) for step in fabric_steps)
    assert "test ! -e runtime/agent-fabric-protocol/dist" in fabric_commands
    assert fabric_commands.index("npm run build") < fabric_commands.index(
        "npm run typecheck --workspace=@local/agent-fabric"
    )
    assert "test -f runtime/agent-fabric-protocol/dist/index.d.ts" in fabric_commands


def test_ci_runs_console_and_herdr_product_gates() -> None:
    document = _workflow()
    expected = {
        "console": {
            "commands": {
                "npm ci --no-audit --no-fund",
                "npm run build",
                "npm run typecheck --workspace=@local/agent-fabric-console",
                "npm run test --workspace=@local/agent-fabric-console",
                "npm run test:evaluation --workspace=@local/agent-fabric-console",
                "npm run test:load --workspace=@local/agent-fabric-console",
                "npm audit --workspace=@local/agent-fabric-console --omit=dev --audit-level=high",
            },
        },
        "herdr": {
            "commands": {
                "npm ci --no-audit --no-fund",
                "npm run build",
                "npm run typecheck --workspace=@local/agent-fabric-herdr",
                "npm run test --workspace=@local/agent-fabric-herdr",
                "npm audit --workspace=@local/agent-fabric-herdr --omit=dev --audit-level=high",
            },
        },
    }
    for job_name, contract in expected.items():
        steps = _steps(_job(document, job_name))
        node_setup = next(
            step for step in steps if str(step.get("uses", "")).startswith("actions/setup-node@")
        )
        assert node_setup.get("with", {}).get("node-version") == "24"
        cache_paths = set(
            str(node_setup.get("with", {}).get("cache-dependency-path", "")).splitlines()
        )
        assert cache_paths == {"package-lock.json"}
        run_steps = [step for step in steps if "run" in step]
        assert all("working-directory" not in step for step in run_steps)
        commands = "\n".join(str(step.get("run", "")) for step in run_steps)
        assert all(command in commands for command in contract["commands"])


def test_repository_policy_covers_sensitive_fabric_surfaces() -> None:
    codeowners = (ROOT / ".github" / "CODEOWNERS").read_text(encoding="utf-8")
    for path in (
        "/runtime/agent-fabric/",
        "/runtime/agent-fabric-protocol/",
        "/runtime/agent-fabric-console/",
        "/runtime/agent-fabric-herdr/",
        "/runtime/agent-fabric/migrations/",
        "/runtime/agent-fabric/schemas/",
        "/config/model-routing.json",
        "/config/adapter-compatibility.yaml",
        "/scripts/static-security-check.py",
    ):
        assert path in codeowners

    dependabot = yaml.safe_load((ROOT / ".github" / "dependabot.yml").read_text(encoding="utf-8"))
    updates = dependabot.get("updates", [])
    npm_updates = [item for item in updates if item.get("package-ecosystem") == "npm"]
    assert len(npm_updates) == 1
    assert npm_updates[0].get("directory") == "/"
    assert any(item.get("package-ecosystem") == "github-actions" and item.get("directory") == "/" for item in updates)

    template = (ROOT / ".github" / "pull_request_template.md").read_text(encoding="utf-8").lower()
    for evidence in ("risk", "test evidence", "migration", "security", "rollback", "independent review"):
        assert evidence in template


def test_live_workspace_guides_use_only_the_root_install_and_build_graph() -> None:
    for guide in WORKSPACE_GUIDES:
        source = guide.read_text(encoding="utf-8")
        assert "npm --prefix" not in source, guide
        assert not re.search(r"(?m)^npm install(?:\s|$)", source), guide

    operations = WORKSPACE_GUIDES[1].read_text(encoding="utf-8")
    for command in (
        "npm ci --no-audit --no-fund",
        "npm run build",
        "npm run check",
    ):
        assert command in operations
