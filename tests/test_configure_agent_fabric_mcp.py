import json
import importlib.util
import os
from pathlib import Path
import subprocess
import sys
import tomllib

import pytest


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "configure-agent-fabric-mcp.py"


def load_configurer():
    spec = importlib.util.spec_from_file_location("configure_agent_fabric_mcp", SCRIPT)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def run_configure(tmp_path: Path, *arguments: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [
            str(SCRIPT),
            "--agents-home", str(ROOT),
            "--state-directory", str(tmp_path / "state"),
            "--claude-config", str(tmp_path / "claude.json"),
            "--codex-config", str(tmp_path / "codex.toml"),
            *arguments,
        ],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
    )


def test_configures_both_global_clients_without_a_fixed_project_path(tmp_path: Path) -> None:
    claude_config = tmp_path / "claude.json"
    codex_config = tmp_path / "codex.toml"
    claude_config.write_text(json.dumps({
        "unrelatedSecret": "never-print-claude",
        "mcpServers": {
            "other": {"command": "other"},
            "agent-fabric": {
                "command": "/old/proxy",
                "env": {"AGENT_FABRIC_PROJECT_PATH": "/wrong/project"},
            },
        },
    }))
    codex_config.write_text("""
[custom]
secret = "never-print-codex"

[mcp_servers.agent-fabric]
command = "/old/proxy"

[mcp_servers.agent-fabric.env]
AGENT_FABRIC_PROJECT_PATH = "/wrong/project"
AGENT_FABRIC_CAPABILITY = "never-print-capability"
""")

    result = run_configure(tmp_path)

    assert result.returncode == 0, result.stderr
    claude = json.loads(claude_config.read_text())
    codex = tomllib.loads(codex_config.read_text())
    expected_common = {
        "AGENT_FABRIC_STATE_DIRECTORY": str(tmp_path / "state"),
    }
    assert claude["mcpServers"]["agent-fabric"] == {
        "type": "stdio",
        "command": str(ROOT / "scripts" / "agent-fabric-mcp"),
        "args": [],
        "env": {**expected_common, "AGENT_FABRIC_SEAT": "claude", "AGENT_FABRIC_CLIENT_LABEL": "claude"},
    }
    assert codex["mcp_servers"]["agent-fabric"] == {
        "command": str(ROOT / "scripts" / "agent-fabric-mcp"),
        "env": {**expected_common, "AGENT_FABRIC_SEAT": "codex", "AGENT_FABRIC_CLIENT_LABEL": "codex"},
    }
    assert claude["mcpServers"]["other"] == {"command": "other"}
    assert claude["unrelatedSecret"] == "never-print-claude"
    assert codex["custom"] == {"secret": "never-print-codex"}
    rendered = result.stdout + result.stderr
    assert "AGENT_FABRIC_PROJECT_PATH" not in rendered
    assert "AGENT_FABRIC_CAPABILITY" not in rendered
    assert "never-print" not in rendered

    original_claude = claude_config.read_bytes()
    original_codex = codex_config.read_bytes()
    second = run_configure(tmp_path)
    assert second.returncode == 0, second.stderr
    assert claude_config.read_bytes() == original_claude
    assert codex_config.read_bytes() == original_codex


def test_check_reports_only_agent_fabric_entry_status(tmp_path: Path) -> None:
    configured = run_configure(tmp_path)
    assert configured.returncode == 0, configured.stderr
    checked = run_configure(tmp_path, "--check")
    assert checked.returncode == 0, checked.stderr
    assert "agent-fabric MCP verified platform=claude" in checked.stdout
    assert "agent-fabric MCP verified platform=codex" in checked.stdout
    assert "AGENT_FABRIC_" not in checked.stdout + checked.stderr


def test_preflight_rejects_malformed_codex_without_mutating_claude(tmp_path: Path) -> None:
    claude_config = tmp_path / "claude.json"
    codex_config = tmp_path / "codex.toml"
    original = '{"unrelatedSecret":"preserved"}\n'
    claude_config.write_text(original)
    codex_config.write_text("[mcp_servers.agent-fabric\n")

    result = run_configure(tmp_path, "--preflight")

    assert result.returncode == 3
    assert "invalid TOML" in result.stderr
    assert "preserved" not in result.stdout + result.stderr
    assert claude_config.read_text() == original


def test_rejects_inline_codex_entry_instead_of_rewriting_ambiguous_toml(tmp_path: Path) -> None:
    codex_config = tmp_path / "codex.toml"
    original = '[mcp_servers]\nagent-fabric = { command = "/old" }\n'
    codex_config.write_text(original)

    result = run_configure(tmp_path, "--platform", "codex")

    assert result.returncode == 3
    assert "unsupported inline or quoted table form" in result.stderr
    assert codex_config.read_text() == original


@pytest.mark.parametrize("client", ["claude", "codex"])
@pytest.mark.parametrize("drift", ["absent-created", "content", "symlink"])
def test_write_rejects_config_source_drift(tmp_path: Path, client: str, drift: str) -> None:
    configurer = load_configurer()
    desired = configurer.registration(ROOT, tmp_path / "state", client)
    suffix = "json" if client == "claude" else "toml"
    requested = tmp_path / f"{client}.{suffix}"
    original = '{}\n' if client == "claude" else '[unrelated]\nvalue = "before"\n'
    external = '{"external":true}\n' if client == "claude" else '[external]\nvalue = true\n'

    if drift == "absent-created":
        proposal = configurer.claude_update(requested, desired) if client == "claude" else configurer.codex_update(requested, desired)
        requested.write_text(external)
        protected = requested
    elif drift == "content":
        requested.write_text(original)
        proposal = configurer.claude_update(requested, desired) if client == "claude" else configurer.codex_update(requested, desired)
        requested.write_text(external)
        protected = requested
    else:
        first = tmp_path / f"first.{suffix}"
        second = tmp_path / f"second.{suffix}"
        first.write_text(original)
        second.write_text(external)
        requested.symlink_to(first)
        proposal = configurer.claude_update(requested, desired) if client == "claude" else configurer.codex_update(requested, desired)
        requested.unlink()
        requested.symlink_to(second)
        protected = second

    with pytest.raises(configurer.RegistrationConflictError, match=f"{client.title()} config changed"):
        configurer.write_proposal(proposal)
    assert protected.read_text() == external


def test_platform_all_revalidates_codex_after_writing_claude(tmp_path: Path, monkeypatch, capsys) -> None:
    configurer = load_configurer()
    claude_config = tmp_path / "claude.json"
    codex_config = tmp_path / "codex.toml"
    claude_config.write_text('{}\n')
    codex_config.write_text('[unrelated]\nvalue = "before"\n')
    external = '[external]\nvalue = "during-claude-write"\n'
    write_proposal = configurer.write_proposal

    def interleaved_write(proposal):
        write_proposal(proposal)
        if proposal.client == "claude":
            codex_config.write_text(external)

    monkeypatch.setattr(configurer, "write_proposal", interleaved_write)
    result = configurer.main([
        "--agents-home", str(ROOT),
        "--state-directory", str(tmp_path / "state"),
        "--claude-config", str(claude_config),
        "--codex-config", str(codex_config),
    ])

    captured = capsys.readouterr()
    assert result == 3
    assert "Codex config changed" in captured.err
    assert codex_config.read_text() == external
    assert json.loads(claude_config.read_text())["mcpServers"]["agent-fabric"]["env"]["AGENT_FABRIC_SEAT"] == "claude"


@pytest.mark.parametrize("client", ["claude", "codex"])
def test_existing_write_preserves_post_validation_interleave_as_recovery(tmp_path: Path, client: str, monkeypatch) -> None:
    configurer = load_configurer()
    desired = configurer.registration(ROOT, tmp_path / "state", client)
    suffix = "json" if client == "claude" else "toml"
    requested = tmp_path / f"{client}.{suffix}"
    original = '{}\n' if client == "claude" else '[unrelated]\nvalue = "before"\n'
    external = '{"external":"after-validation"}\n' if client == "claude" else '[external]\nvalue = "after-validation"\n'
    requested.write_text(original)
    proposal = configurer.claude_update(requested, desired) if client == "claude" else configurer.codex_update(requested, desired)
    atomic_exchange = configurer.atomic_exchange
    interleaved = False

    def interleaved_exchange(first: Path, second: Path) -> None:
        nonlocal interleaved
        if not interleaved:
            interleaved = True
            replacement = tmp_path / f"external.{suffix}"
            replacement.write_text(external)
            os.replace(replacement, requested)
        atomic_exchange(first, second)

    monkeypatch.setattr(configurer, "atomic_exchange", interleaved_exchange)
    with pytest.raises(configurer.RegistrationConflictError, match=f"{client.title()} config changed") as caught:
        configurer.write_proposal(proposal)

    assert "agent-fabric" in requested.read_text()
    recovery = Path(str(caught.value).rsplit(" ", 1)[-1])
    assert recovery.read_text() == external
    recovery.unlink()


@pytest.mark.parametrize("client", ["claude", "codex"])
def test_conflict_never_rolls_back_over_a_newer_target(tmp_path: Path, client: str, monkeypatch) -> None:
    configurer = load_configurer()
    desired = configurer.registration(ROOT, tmp_path / "state", client)
    suffix = "json" if client == "claude" else "toml"
    requested = tmp_path / f"{client}.{suffix}"
    original = '{}\n' if client == "claude" else '[unrelated]\nvalue = "before"\n'
    first_race = '{"external":"first-race"}\n' if client == "claude" else '[external]\nvalue = "first-race"\n'
    newest = '{"external":"newest"}\n' if client == "claude" else '[external]\nvalue = "newest"\n'
    requested.write_text(original)
    proposal = configurer.claude_update(requested, desired) if client == "claude" else configurer.codex_update(requested, desired)
    atomic_exchange = configurer.atomic_exchange
    displaced_matches = configurer._displaced_matches
    exchanged = False

    def first_interleave(first: Path, second: Path) -> None:
        nonlocal exchanged
        if not exchanged:
            exchanged = True
            replacement = tmp_path / f"first-race.{suffix}"
            replacement.write_text(first_race)
            os.replace(replacement, requested)
        atomic_exchange(first, second)

    def second_interleave(candidate, displaced: Path) -> bool:
        matched = displaced_matches(candidate, displaced)
        replacement = tmp_path / f"newest.{suffix}"
        replacement.write_text(newest)
        os.replace(replacement, requested)
        return matched

    monkeypatch.setattr(configurer, "atomic_exchange", first_interleave)
    monkeypatch.setattr(configurer, "_displaced_matches", second_interleave)
    with pytest.raises(configurer.RegistrationConflictError) as caught:
        configurer.write_proposal(proposal)

    assert requested.read_text() == newest
    recovery = Path(str(caught.value).rsplit(" ", 1)[-1])
    assert recovery.read_text() == first_race
    recovery.unlink()


@pytest.mark.parametrize("client", ["claude", "codex"])
def test_symlink_retarget_after_exchange_fails_closed_with_recovery(tmp_path: Path, client: str, monkeypatch) -> None:
    configurer = load_configurer()
    desired = configurer.registration(ROOT, tmp_path / "state", client)
    suffix = "json" if client == "claude" else "toml"
    requested = tmp_path / f"{client}.{suffix}"
    original = '{}\n' if client == "claude" else '[unrelated]\nvalue = "before"\n'
    external = '{"external":"retargeted"}\n' if client == "claude" else '[external]\nvalue = "retargeted"\n'
    first = tmp_path / f"first.{suffix}"
    second = tmp_path / f"second.{suffix}"
    first.write_text(original)
    second.write_text(external)
    requested.symlink_to(first)
    proposal = configurer.claude_update(requested, desired) if client == "claude" else configurer.codex_update(requested, desired)
    atomic_exchange = configurer.atomic_exchange

    def retarget_after_exchange(first_path: Path, second_path: Path) -> None:
        atomic_exchange(first_path, second_path)
        requested.unlink()
        requested.symlink_to(second)

    monkeypatch.setattr(configurer, "atomic_exchange", retarget_after_exchange)
    with pytest.raises(configurer.RegistrationConflictError) as caught:
        configurer.write_proposal(proposal)

    assert requested.resolve() == second
    assert second.read_text() == external
    recovery = Path(str(caught.value).rsplit(" ", 1)[-1])
    assert recovery.read_text() == original
    recovery.unlink()


@pytest.mark.parametrize("client", ["claude", "codex"])
def test_absent_target_replaced_after_link_fails_closed_with_recovery(tmp_path: Path, client: str, monkeypatch) -> None:
    configurer = load_configurer()
    desired = configurer.registration(ROOT, tmp_path / "state", client)
    suffix = "json" if client == "claude" else "toml"
    requested = tmp_path / f"{client}.{suffix}"
    external = '{"external":"newest"}\n' if client == "claude" else '[external]\nvalue = "newest"\n'
    proposal = configurer.claude_update(requested, desired) if client == "claude" else configurer.codex_update(requested, desired)
    link = configurer.os.link

    def replace_after_link(source: Path, target: Path, **options) -> None:
        link(source, target, **options)
        replacement = tmp_path / f"external.{suffix}"
        replacement.write_text(external)
        os.replace(replacement, requested)

    monkeypatch.setattr(configurer.os, "link", replace_after_link)
    with pytest.raises(configurer.RegistrationConflictError) as caught:
        configurer.write_proposal(proposal)

    assert requested.read_text() == external
    recovery = Path(str(caught.value).rsplit(" ", 1)[-1])
    assert "agent-fabric" in recovery.read_text()
    recovery.unlink()


def test_operations_docs_define_dynamic_primary_registration_and_bounded_fixed_paths() -> None:
    runbook = (ROOT / "docs/runbooks/agent-fabric-operations.md").read_text()
    runtime_readme = (ROOT / "runtime/agent-fabric/README.md").read_text()
    for document in (runbook, runtime_readme):
        assert "configure-agent-fabric-mcp.py" in document
        assert "AGENT_FABRIC_PROJECT_PATH" in document
        assert "Claude Code and Codex" in document
        assert "cannot preserve" in document
    assert "Registry entries bind `AGENT_FABRIC_PROJECT_PATH`" not in runbook
