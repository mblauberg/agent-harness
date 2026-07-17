import json
from pathlib import Path
import subprocess
import tomllib


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "configure-agent-fabric-mcp.py"


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


def test_operations_docs_define_dynamic_primary_registration_and_bounded_fixed_paths() -> None:
    runbook = (ROOT / "docs/runbooks/agent-fabric-operations.md").read_text()
    runtime_readme = (ROOT / "runtime/agent-fabric/README.md").read_text()
    for document in (runbook, runtime_readme):
        assert "configure-agent-fabric-mcp.py" in document
        assert "AGENT_FABRIC_PROJECT_PATH" in document
        assert "Claude Code and Codex" in document
        assert "cannot preserve" in document
    assert "Registry entries bind `AGENT_FABRIC_PROJECT_PATH`" not in runbook
