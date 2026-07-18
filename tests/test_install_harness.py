from pathlib import Path
import json
import os
import subprocess
import tomllib


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "install-harness"


def run(platform: str, home: Path, *arguments: str, **extra_env):
    env = os.environ.copy()
    env.update({"HOME": str(home), **extra_env})
    return subprocess.run(
        [str(SCRIPT), "--platform", platform, *arguments],
        cwd=ROOT,
        env=env,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )


def expected_skills():
    return {path.parent.name for path in (ROOT / "skills").glob("*/SKILL.md")}


def test_installs_claude_skills_and_global_instructions_idempotently(tmp_path):
    config = tmp_path / "claude-config"
    bin_dir = tmp_path / "custom-bin"
    first = run(
        "claude",
        tmp_path,
        CLAUDE_CONFIG_DIR=str(config),
        PROVENANT_BIN_DIR=str(bin_dir),
        PATH=f"{bin_dir}{os.pathsep}{os.environ['PATH']}",
    )
    assert first.returncode == 0, first.stderr
    command = bin_dir / "provenant"
    assert command.is_symlink()
    assert command.resolve() == ROOT / "scripts" / "provenant"
    assert {path.name for path in (config / "skills").iterdir()} == expected_skills()
    instructions = config / "CLAUDE.md"
    content = instructions.read_text()
    assert str(ROOT / "AGENTS.md") in content
    assert str(ROOT / "HARNESS.md") in content
    registration = json.loads((tmp_path / ".claude.json").read_text())["mcpServers"]["agent-fabric"]
    assert registration["command"] == str(ROOT / "scripts" / "agent-fabric-mcp")
    assert registration["env"] == {
        "AGENT_FABRIC_CLIENT_LABEL": "claude",
        "AGENT_FABRIC_SEAT": "claude",
        "AGENT_FABRIC_STATE_DIRECTORY": str(tmp_path / ".local/state/agent-harness/fabric"),
    }

    second = run(
        "claude",
        tmp_path,
        CLAUDE_CONFIG_DIR=str(config),
        PROVENANT_BIN_DIR=str(bin_dir),
        PATH=f"{bin_dir}{os.pathsep}{os.environ['PATH']}",
    )
    assert second.returncode == 0, second.stderr
    assert f"instructions existing={instructions}" in second.stdout


def test_installs_codex_skills_and_global_instructions(tmp_path):
    config = tmp_path / "codex-home"
    config.mkdir()
    codex_config = config / "config.toml"
    codex_config.write_text("[custom]\nvalue = 'preserved'\n")
    result = run("codex", tmp_path, CODEX_HOME=str(config))
    assert result.returncode == 0, result.stderr
    assert {path.name for path in (config / "skills").iterdir()} == expected_skills()
    assert str(ROOT / "HARNESS.md") in (config / "AGENTS.md").read_text()
    configured = codex_config.read_text()
    assert "[custom]\nvalue = 'preserved'" in configured
    assert configured.count('name = "skill-creator"') == 1
    assert "enabled = false" in configured
    registration = tomllib.loads(configured)["mcp_servers"]["agent-fabric"]
    assert registration == {
        "command": str(ROOT / "scripts" / "agent-fabric-mcp"),
        "env": {
            "AGENT_FABRIC_CLIENT_LABEL": "codex",
            "AGENT_FABRIC_SEAT": "codex",
            "AGENT_FABRIC_STATE_DIRECTORY": str(tmp_path / ".local/state/agent-harness/fabric"),
        },
    }

    second = run("codex", tmp_path, CODEX_HOME=str(config))
    assert second.returncode == 0, second.stderr
    assert codex_config.read_text() == configured


def test_optional_mcp_client_configuration_is_explicit_and_dynamic(tmp_path):
    config = tmp_path / "codex-home"
    config.mkdir()
    result = run(
        "codex",
        tmp_path,
        "--mcp-clients", "all",
        CODEX_HOME=str(config),
    )
    assert result.returncode == 0, result.stderr
    optional = {
        "cursor": tmp_path / ".cursor/mcp.json",
        "agy": tmp_path / ".gemini/config/mcp_config.json",
        "kiro": tmp_path / ".kiro/settings/mcp.json",
    }
    for client, path in optional.items():
        registration = json.loads(path.read_text())["mcpServers"]["agent-fabric"]
        assert registration["env"]["AGENT_FABRIC_SEAT"] == client
        assert "AGENT_FABRIC_PROJECT_PATH" not in registration["env"]


def test_codex_skill_override_conflict_fails_without_rewriting_config(tmp_path):
    config = tmp_path / "codex-home"
    config.mkdir()
    codex_config = config / "config.toml"
    original = '[[skills.config]]\nname = "skill-creator"\nenabled = true\n'
    codex_config.write_text(original)

    result = run("codex", tmp_path, CODEX_HOME=str(config))
    assert result.returncode == 3
    assert "conflicting" in result.stderr
    assert codex_config.read_text() == original
    assert not (config / "skills").exists()


def test_codex_inline_skill_config_fails_closed_without_invalid_rewrite(tmp_path):
    config = tmp_path / "codex-home"
    config.mkdir()
    codex_config = config / "config.toml"
    original = '[skills]\nconfig = [{name = "other", enabled = true}]\n'
    codex_config.write_text(original)

    result = run("codex", tmp_path, CODEX_HOME=str(config))
    assert result.returncode == 3
    assert "invalid TOML" in result.stderr
    assert codex_config.read_text() == original
    assert not (config / "skills").exists()


def test_codex_skill_override_preserves_symlinked_config(tmp_path):
    config = tmp_path / "codex-home"
    target_dir = tmp_path / "dotfiles"
    config.mkdir()
    target_dir.mkdir()
    target = target_dir / "codex.toml"
    target.write_text("[custom]\nvalue = 'preserved'\n")
    codex_config = config / "config.toml"
    codex_config.symlink_to(target)

    result = run("codex", tmp_path, CODEX_HOME=str(config))
    assert result.returncode == 0, result.stderr
    assert codex_config.is_symlink()
    assert target.read_text().count('name = "skill-creator"') == 1
    assert {path.name for path in (config / "skills").iterdir()} == expected_skills()


def test_preserves_existing_instructions_and_prints_merge_line(tmp_path):
    config = tmp_path / "claude-config"
    config.mkdir()
    instructions = config / "CLAUDE.md"
    instructions.write_text("# My existing instructions\n")

    result = run("claude", tmp_path, CLAUDE_CONFIG_DIR=str(config))
    assert result.returncode == 3
    assert instructions.read_text() == "# My existing instructions\n"
    assert "instructions preserved=" in result.stderr
    assert str(ROOT / "AGENTS.md") in result.stderr
    assert {path.name for path in (config / "skills").iterdir()} == expected_skills()


def test_accepts_claude_instruction_symlink_to_canonical_agents_file(tmp_path):
    config = tmp_path / "claude-config"
    config.mkdir()
    instructions = config / "CLAUDE.md"
    instructions.symlink_to(ROOT / "AGENTS.md")

    result = run("claude", tmp_path, CLAUDE_CONFIG_DIR=str(config))

    assert result.returncode == 0, result.stderr
    assert instructions.is_symlink()
    assert instructions.resolve() == ROOT / "AGENTS.md"
    assert f"instructions existing={instructions}" in result.stdout
    assert "add this line" not in result.stderr


def test_accepts_codex_instruction_symlink_to_canonical_agents_file(tmp_path):
    config = tmp_path / "codex-home"
    config.mkdir()
    instructions = config / "AGENTS.md"
    instructions.symlink_to(ROOT / "AGENTS.md")

    result = run("codex", tmp_path, CODEX_HOME=str(config))

    assert result.returncode == 0, result.stderr
    assert instructions.is_symlink()
    assert instructions.resolve() == ROOT / "AGENTS.md"
    assert f"instructions existing={instructions}" in result.stdout
    assert "add this line" not in result.stderr


def test_rejects_instruction_symlink_to_foreign_file(tmp_path):
    config = tmp_path / "claude-config"
    config.mkdir()
    foreign = tmp_path / "foreign-instructions.md"
    foreign.write_text("# Foreign instructions\n")
    instructions = config / "CLAUDE.md"
    instructions.symlink_to(foreign)

    result = run("claude", tmp_path, CLAUDE_CONFIG_DIR=str(config))

    assert result.returncode == 3
    assert instructions.is_symlink()
    assert instructions.resolve() == foreign
    assert foreign.read_text() == "# Foreign instructions\n"
    assert "add this line" in result.stderr


def test_requires_supported_platform(tmp_path):
    result = run("other", tmp_path)
    assert result.returncode == 2
    assert "usage:" in result.stderr


def test_refuses_provenant_command_collision_before_any_mutation(tmp_path):
    config = tmp_path / "claude-config"
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    collision = bin_dir / "provenant"
    collision.write_text("user-owned\n")

    result = run(
        "claude",
        tmp_path,
        CLAUDE_CONFIG_DIR=str(config),
        PROVENANT_BIN_DIR=str(bin_dir),
    )

    assert result.returncode == 3
    assert "collision" in result.stderr
    assert collision.read_text() == "user-owned\n"
    assert not config.exists()
    assert not (tmp_path / ".claude.json").exists()


def test_warns_when_provenant_bin_directory_is_outside_path(tmp_path):
    config = tmp_path / "claude-config"
    bin_dir = tmp_path / "not-on-path"

    result = run(
        "claude",
        tmp_path,
        CLAUDE_CONFIG_DIR=str(config),
        PROVENANT_BIN_DIR=str(bin_dir),
        PATH=os.environ["PATH"],
    )

    assert result.returncode == 0, result.stderr
    assert f"warning: {bin_dir} is not on PATH" in result.stderr
    assert (bin_dir / "provenant").resolve() == ROOT / "scripts" / "provenant"
    assert not (tmp_path / ".zshrc").exists()
    assert not (tmp_path / ".bashrc").exists()
