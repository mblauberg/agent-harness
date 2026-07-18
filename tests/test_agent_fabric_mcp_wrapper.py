import os
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_source_wrapper_preserves_caller_cwd_for_project_seat_resolution(tmp_path: Path) -> None:
    state = tmp_path / "state"
    state.mkdir(mode=0o700)
    environment = {
        **os.environ,
        "AGENTS_HOME": str(ROOT),
        "AGENT_FABRIC_SOCKET_PATH": str(tmp_path / "missing.sock"),
        "AGENT_FABRIC_STATE_DIRECTORY": str(state),
        "AGENT_FABRIC_SEAT": "codex",
    }
    result = subprocess.run(
        [str(ROOT / "scripts" / "agent-fabric-mcp")],
        cwd=tmp_path,
        env=environment,
        capture_output=True,
        text=True,
        timeout=10,
        check=False,
    )

    assert result.returncode == 0
    assert f"not provisioned for {tmp_path}" in result.stderr
    assert "exact-root bootstrap is available" in result.stderr
    assert "Fabric tools are unavailable until seats are provisioned" not in result.stderr
    assert "runtime/agent-fabric or an ancestor project" not in result.stderr


def test_wrapper_resolves_symlinked_install_and_rejects_relative_agents_home(tmp_path: Path) -> None:
    state = tmp_path / "state"
    bin_directory = tmp_path / "bin"
    state.mkdir(mode=0o700)
    bin_directory.mkdir()
    wrapper = bin_directory / "agent-fabric-mcp"
    wrapper.symlink_to(ROOT / "scripts" / "agent-fabric-mcp")
    environment = {
        **os.environ,
        "AGENT_FABRIC_SOCKET_PATH": str(tmp_path / "missing.sock"),
        "AGENT_FABRIC_STATE_DIRECTORY": str(state),
        "AGENT_FABRIC_SEAT": "codex",
    }
    environment.pop("AGENTS_HOME", None)
    symlinked = subprocess.run(
        [str(wrapper)], cwd=tmp_path, env=environment, capture_output=True, text=True, timeout=10, check=False,
    )
    assert symlinked.returncode == 0
    assert f"not provisioned for {tmp_path}" in symlinked.stderr
    relative = subprocess.run(
        [str(ROOT / "scripts" / "agent-fabric-mcp")],
        cwd=tmp_path,
        env={**environment, "AGENTS_HOME": "relative"},
        capture_output=True,
        text=True,
        timeout=10,
        check=False,
    )
    assert relative.returncode == 2
    assert "AGENTS_HOME must be absolute" in relative.stderr
