import json
import importlib.util
import os
from pathlib import Path
import stat
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
            "--cursor-config", str(tmp_path / "cursor.json"),
            "--agy-config", str(tmp_path / "agy.json"),
            "--kiro-config", str(tmp_path / "kiro.json"),
            *arguments,
        ],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
    )


def test_configures_all_global_clients_without_a_fixed_project_path(tmp_path: Path) -> None:
    claude_config = tmp_path / "claude.json"
    codex_config = tmp_path / "codex.toml"
    optional_configs = {
        "cursor": tmp_path / "cursor.json",
        "agy": tmp_path / "agy.json",
        "kiro": tmp_path / "kiro.json",
    }
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
    for path in optional_configs.values():
        path.write_text(json.dumps({
            "unrelatedSecret": "never-print-optional",
            "mcpServers": {
                "other": {"command": "other"},
                "agent-fabric": {
                    "command": "/old/proxy",
                    "env": {"AGENT_FABRIC_PROJECT_PATH": "/wrong/project"},
                },
            },
        }))

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
    for client, path in optional_configs.items():
        value = json.loads(path.read_text())
        assert value["mcpServers"]["agent-fabric"] == {
            "command": str(ROOT / "scripts" / "agent-fabric-mcp"),
            "env": {**expected_common, "AGENT_FABRIC_SEAT": client, "AGENT_FABRIC_CLIENT_LABEL": client},
        }
        assert value["mcpServers"]["other"] == {"command": "other"}
        assert value["unrelatedSecret"] == "never-print-optional"
    assert claude["mcpServers"]["other"] == {"command": "other"}
    assert claude["unrelatedSecret"] == "never-print-claude"
    assert codex["custom"] == {"secret": "never-print-codex"}
    rendered = result.stdout + result.stderr
    assert "AGENT_FABRIC_PROJECT_PATH" not in rendered
    assert "AGENT_FABRIC_CAPABILITY" not in rendered
    assert "never-print" not in rendered

    original_claude = claude_config.read_bytes()
    original_codex = codex_config.read_bytes()
    original_optional = {client: path.read_bytes() for client, path in optional_configs.items()}
    second = run_configure(tmp_path)
    assert second.returncode == 0, second.stderr
    assert claude_config.read_bytes() == original_claude
    assert codex_config.read_bytes() == original_codex
    assert {client: path.read_bytes() for client, path in optional_configs.items()} == original_optional


def test_check_reports_only_agent_fabric_entry_status(tmp_path: Path) -> None:
    configured = run_configure(tmp_path)
    assert configured.returncode == 0, configured.stderr
    checked = run_configure(tmp_path, "--check")
    assert checked.returncode == 0, checked.stderr
    assert "agent-fabric MCP verified platform=claude" in checked.stdout
    assert "agent-fabric MCP verified platform=codex" in checked.stdout
    assert "agent-fabric MCP verified platform=cursor" in checked.stdout
    assert "agent-fabric MCP verified platform=agy" in checked.stdout
    assert "agent-fabric MCP verified platform=kiro" in checked.stdout
    assert "AGENT_FABRIC_" not in checked.stdout + checked.stderr


@pytest.mark.parametrize("client", ["cursor", "agy", "kiro"])
def test_project_scoped_optional_registration_requires_explicit_scope(
    tmp_path: Path, client: str,
) -> None:
    project = tmp_path / "project"
    project.mkdir()

    implicit = run_configure(
        tmp_path, "--platform", client, "--project-path", str(project),
    )
    assert implicit.returncode == 3
    assert "--registration-scope project" in implicit.stderr

    configured = run_configure(
        tmp_path,
        "--platform", client,
        "--registration-scope", "project",
        "--project-path", str(project),
    )
    assert configured.returncode == 0, configured.stderr
    value = json.loads((tmp_path / f"{client}.json").read_text())
    assert value["mcpServers"]["agent-fabric"]["env"]["AGENT_FABRIC_PROJECT_PATH"] == str(project)


@pytest.mark.parametrize("platform", ["all", "claude", "codex"])
def test_project_scoped_registration_rejects_primary_or_multi_client_targets(
    tmp_path: Path, platform: str,
) -> None:
    project = tmp_path / "project"
    project.mkdir()
    result = run_configure(
        tmp_path,
        "--platform", platform,
        "--registration-scope", "project",
        "--project-path", str(project),
    )
    assert result.returncode == 3
    assert "single optional client" in result.stderr


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
def test_existing_direct_config_under_symlinked_parent_binds_installed_inode(tmp_path: Path, client: str) -> None:
    configurer = load_configurer()
    desired = configurer.registration(ROOT, tmp_path / "state", client)
    suffix = "json" if client == "claude" else "toml"
    real_parent = tmp_path / "real-parent"
    real_parent.mkdir()
    linked_parent = tmp_path / "linked-parent"
    linked_parent.symlink_to(real_parent, target_is_directory=True)
    requested = linked_parent / f"{client}.{suffix}"
    requested.write_text('{}\n' if client == "claude" else '[unrelated]\nvalue = "before"\n')
    proposal = configurer.claude_update(requested, desired) if client == "claude" else configurer.codex_update(requested, desired)

    configurer.write_proposal(proposal)

    assert "agent-fabric" in requested.read_text()


@pytest.mark.parametrize("client", ["claude", "codex"])
def test_absent_config_under_symlinked_parent_binds_installed_inode(tmp_path: Path, client: str) -> None:
    configurer = load_configurer()
    desired = configurer.registration(ROOT, tmp_path / "state", client)
    suffix = "json" if client == "claude" else "toml"
    real_parent = tmp_path / "real-parent"
    real_parent.mkdir()
    linked_parent = tmp_path / "linked-parent"
    linked_parent.symlink_to(real_parent, target_is_directory=True)
    requested = linked_parent / f"{client}.{suffix}"
    proposal = configurer.claude_update(requested, desired) if client == "claude" else configurer.codex_update(requested, desired)

    configurer.write_proposal(proposal)

    assert "agent-fabric" in requested.read_text()


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
            replacement.chmod(0o644)
            os.replace(replacement, requested)
        atomic_exchange(first, second)

    monkeypatch.setattr(configurer, "atomic_exchange", interleaved_exchange)
    with pytest.raises(configurer.RegistrationConflictError, match=f"{client.title()} config changed") as caught:
        configurer.write_proposal(proposal)

    assert "agent-fabric" in requested.read_text()
    recovery = Path(str(caught.value).rsplit(" ", 1)[-1])
    assert recovery.read_text() == external
    assert recovery.parent != tmp_path
    assert stat.S_IMODE(recovery.parent.stat().st_mode) == 0o700
    recovery.unlink()
    recovery.parent.rmdir()


@pytest.mark.parametrize("client", ["claude", "codex"])
def test_private_recovery_preserves_displaced_hardlink_without_chmod(tmp_path: Path, client: str, monkeypatch) -> None:
    configurer = load_configurer()
    desired = configurer.registration(ROOT, tmp_path / "state", client)
    suffix = "json" if client == "claude" else "toml"
    requested = tmp_path / f"{client}.{suffix}"
    requested.write_text('{}\n' if client == "claude" else '[unrelated]\nvalue = "before"\n')
    external = '{"external":"hardlinked"}\n' if client == "claude" else '[external]\nvalue = "hardlinked"\n'
    proposal = configurer.claude_update(requested, desired) if client == "claude" else configurer.codex_update(requested, desired)
    atomic_exchange = configurer.atomic_exchange
    hardlink = tmp_path / f"external-hardlink.{suffix}"

    def interleaved_exchange(first: Path, second: Path) -> None:
        replacement = tmp_path / f"external.{suffix}"
        replacement.write_text(external)
        replacement.chmod(0o644)
        os.link(replacement, hardlink)
        os.replace(replacement, requested)
        atomic_exchange(first, second)

    monkeypatch.setattr(configurer, "atomic_exchange", interleaved_exchange)
    with pytest.raises(configurer.RegistrationConflictError) as caught:
        configurer.write_proposal(proposal)

    recovery = Path(str(caught.value).rsplit(" ", 1)[-1])
    assert recovery.parent != tmp_path
    assert stat.S_IMODE(recovery.parent.stat().st_mode) == 0o700
    assert recovery.stat().st_ino == hardlink.stat().st_ino
    assert stat.S_IMODE(hardlink.stat().st_mode) == 0o644
    assert hardlink.read_text() == external
    recovery.unlink()
    recovery.parent.rmdir()


@pytest.mark.parametrize("client", ["claude", "codex"])
def test_post_exchange_fsync_error_retains_private_displaced_recovery(tmp_path: Path, client: str, monkeypatch) -> None:
    configurer = load_configurer()
    desired = configurer.registration(ROOT, tmp_path / "state", client)
    suffix = "json" if client == "claude" else "toml"
    requested = tmp_path / f"{client}.{suffix}"
    original = '{}\n' if client == "claude" else '[unrelated]\nvalue = "before"\n'
    requested.write_text(original)
    proposal = configurer.claude_update(requested, desired) if client == "claude" else configurer.codex_update(requested, desired)
    fsync_directory = configurer._fsync_directory
    calls = 0

    def fail_first_fsync(path: Path) -> None:
        nonlocal calls
        calls += 1
        if calls == 1:
            raise OSError("post-exchange durability failure")
        fsync_directory(path)

    monkeypatch.setattr(configurer, "_fsync_directory", fail_first_fsync)
    with pytest.raises(configurer.RegistrationConflictError, match="preserve private recovery file") as caught:
        configurer.write_proposal(proposal)

    assert "agent-fabric" in requested.read_text()
    recovery = Path(str(caught.value).rsplit(" ", 1)[-1])
    assert recovery.read_text() == original
    assert stat.S_IMODE(recovery.parent.stat().st_mode) == 0o700
    recovery.unlink()
    recovery.parent.rmdir()


@pytest.mark.parametrize("client", ["claude", "codex"])
@pytest.mark.parametrize("failure_call", [3, 4])
def test_post_commit_cleanup_fsync_error_does_not_report_conflict(
    tmp_path: Path, client: str, failure_call: int, monkeypatch, capsys,
) -> None:
    configurer = load_configurer()
    desired = configurer.registration(ROOT, tmp_path / "state", client)
    suffix = "json" if client == "claude" else "toml"
    requested = tmp_path / f"{client}.{suffix}"
    requested.write_text('{}\n' if client == "claude" else '[unrelated]\nvalue = "before"\n')
    proposal = configurer.claude_update(requested, desired) if client == "claude" else configurer.codex_update(requested, desired)
    fsync_directory = configurer._fsync_directory
    calls = 0
    failed_path: Path | None = None

    def fail_cleanup_fsync(path: Path) -> None:
        nonlocal calls, failed_path
        calls += 1
        if calls == failure_call:
            failed_path = path
            raise OSError("cleanup durability failure")
        fsync_directory(path)

    monkeypatch.setattr(configurer, "_fsync_directory", fail_cleanup_fsync)

    configurer.write_proposal(proposal)

    assert "agent-fabric" in requested.read_text()
    assert not list(tmp_path.glob(f".{requested.name}.recovery.*"))
    operation = "recovery-directory-fsync" if failure_call == 3 else "target-parent-fsync"
    assert capsys.readouterr().err.strip() == (
        f"warning: post-commit recovery cleanup failed operation={operation} path={failed_path}"
    )


@pytest.mark.parametrize("client", ["claude", "codex"])
def test_post_commit_recovery_rmdir_error_warns_without_reporting_conflict(
    tmp_path: Path, client: str, monkeypatch, capsys,
) -> None:
    configurer = load_configurer()
    desired = configurer.registration(ROOT, tmp_path / "state", client)
    suffix = "json" if client == "claude" else "toml"
    requested = tmp_path / f"{client}.{suffix}"
    requested.write_text('{}\n' if client == "claude" else '[unrelated]\nvalue = "before"\n')
    proposal = configurer.claude_update(requested, desired) if client == "claude" else configurer.codex_update(requested, desired)
    rmdir = configurer.Path.rmdir
    failed_path: Path | None = None

    def fail_recovery_rmdir(path: Path) -> None:
        nonlocal failed_path
        if ".recovery." in path.name:
            failed_path = path
            raise OSError("cleanup rmdir failure")
        rmdir(path)

    monkeypatch.setattr(configurer.Path, "rmdir", fail_recovery_rmdir)

    configurer.write_proposal(proposal)

    assert "agent-fabric" in requested.read_text()
    assert failed_path is not None and failed_path.is_dir()
    assert capsys.readouterr().err.strip() == (
        f"warning: post-commit recovery cleanup failed operation=recovery-directory-rmdir path={failed_path}"
    )


@pytest.mark.parametrize("client", ["claude", "codex"])
def test_pre_exchange_registration_error_cleans_private_staging(tmp_path: Path, client: str, monkeypatch) -> None:
    configurer = load_configurer()
    desired = configurer.registration(ROOT, tmp_path / "state", client)
    suffix = "json" if client == "claude" else "toml"
    requested = tmp_path / f"{client}.{suffix}"
    original = '{}\n' if client == "claude" else '[unrelated]\nvalue = "before"\n'
    requested.write_text(original)
    proposal = configurer.claude_update(requested, desired) if client == "claude" else configurer.codex_update(requested, desired)

    def unsupported_exchange(first: Path, second: Path) -> None:
        raise configurer.RegistrationError("atomic config exchange is unavailable")

    monkeypatch.setattr(configurer, "atomic_exchange", unsupported_exchange)
    with pytest.raises(configurer.RegistrationError, match="unavailable"):
        configurer.write_proposal(proposal)

    assert requested.read_text() == original
    assert not list(tmp_path.glob(f".{requested.name}.recovery.*"))


@pytest.mark.parametrize("client", ["claude", "codex"])
@pytest.mark.parametrize("existing", [False, True])
def test_post_commit_recovery_unlink_error_does_not_report_conflict(
    tmp_path: Path, client: str, existing: bool, monkeypatch, capsys,
) -> None:
    configurer = load_configurer()
    desired = configurer.registration(ROOT, tmp_path / "state", client)
    suffix = "json" if client == "claude" else "toml"
    requested = tmp_path / f"{client}.{suffix}"
    if existing:
        requested.write_text('{}\n' if client == "claude" else '[unrelated]\nvalue = "before"\n')
    proposal = configurer.claude_update(requested, desired) if client == "claude" else configurer.codex_update(requested, desired)
    unlink = configurer.Path.unlink

    def fail_recovery_unlink(path: Path, *args, **kwargs) -> None:
        if ".recovery." in path.parent.name:
            raise OSError("recovery cleanup failure")
        unlink(path, *args, **kwargs)

    monkeypatch.setattr(configurer.Path, "unlink", fail_recovery_unlink)

    configurer.write_proposal(proposal)

    assert "agent-fabric" in requested.read_text()
    recovery_directories = list(tmp_path.glob(f".{requested.name}.recovery.*"))
    assert len(recovery_directories) == 1
    assert stat.S_IMODE(recovery_directories[0].stat().st_mode) == 0o700
    recovery_files = list(recovery_directories[0].iterdir())
    assert len(recovery_files) == 1
    assert str(recovery_files[0]) in capsys.readouterr().err


@pytest.mark.parametrize("client", ["claude", "codex"])
def test_private_recovery_preserves_displaced_symlink_without_following(tmp_path: Path, client: str, monkeypatch) -> None:
    configurer = load_configurer()
    desired = configurer.registration(ROOT, tmp_path / "state", client)
    suffix = "json" if client == "claude" else "toml"
    requested = tmp_path / f"{client}.{suffix}"
    requested.write_text('{}\n' if client == "claude" else '[unrelated]\nvalue = "before"\n')
    proposal = configurer.claude_update(requested, desired) if client == "claude" else configurer.codex_update(requested, desired)
    atomic_exchange = configurer.atomic_exchange
    referent = tmp_path / f"external-target.{suffix}"
    referent.write_text('{"external":true}\n' if client == "claude" else '[external]\nvalue = true\n')

    def interleaved_exchange(first: Path, second: Path) -> None:
        replacement = tmp_path / f"external-link.{suffix}"
        replacement.symlink_to(referent)
        os.replace(replacement, requested)
        atomic_exchange(first, second)

    monkeypatch.setattr(configurer, "atomic_exchange", interleaved_exchange)
    with pytest.raises(configurer.RegistrationConflictError) as caught:
        configurer.write_proposal(proposal)

    recovery = Path(str(caught.value).rsplit(" ", 1)[-1])
    assert recovery.is_symlink()
    assert os.readlink(recovery) == str(referent)
    assert stat.S_IMODE(recovery.parent.stat().st_mode) == 0o700
    assert referent.exists()
    recovery.unlink()
    recovery.parent.rmdir()


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
