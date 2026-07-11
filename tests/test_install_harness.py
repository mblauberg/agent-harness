from pathlib import Path
import os
import subprocess


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "install-harness"


def run(platform: str, home: Path, **extra_env):
    env = os.environ.copy()
    env.update({"HOME": str(home), **extra_env})
    return subprocess.run(
        [str(SCRIPT), "--platform", platform],
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
    first = run("claude", tmp_path, CLAUDE_CONFIG_DIR=str(config))
    assert first.returncode == 0, first.stderr
    assert {path.name for path in (config / "skills").iterdir()} == expected_skills()
    instructions = config / "CLAUDE.md"
    content = instructions.read_text()
    assert str(ROOT / "AGENTS.md") in content
    assert str(ROOT / "HARNESS.md") in content

    second = run("claude", tmp_path, CLAUDE_CONFIG_DIR=str(config))
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

    second = run("codex", tmp_path, CODEX_HOME=str(config))
    assert second.returncode == 0, second.stderr
    assert codex_config.read_text() == configured


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


def test_requires_supported_platform(tmp_path):
    result = run("other", tmp_path)
    assert result.returncode == 2
    assert "usage:" in result.stderr
