import os
from pathlib import Path
import stat
import subprocess


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "skills" / "autonomous-lab" / "scripts" / "cross-family.sh"


def executable(path: Path, body: str) -> None:
    path.write_text(body)
    path.chmod(path.stat().st_mode | stat.S_IXUSR)


def test_both_families_preserve_background_reviewer_failure(tmp_path):
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    executable(bin_dir / "codex", "#!/bin/sh\nexit 9\n")
    executable(bin_dir / "agy", "#!/bin/sh\necho AGY\n")
    wrapper = tmp_path / "agy-wrapper"
    executable(wrapper, "#!/bin/sh\necho GEMINI_OK\n")
    target = tmp_path / "target"
    target.mkdir()
    env = os.environ.copy()
    env["PATH"] = f"{bin_dir}:{env['PATH']}"
    env["AGY_WRAPPER"] = str(wrapper)
    result = subprocess.run(
        [
            str(SCRIPT),
            "--dir",
            str(target),
            "--prompt",
            "Review",
            "--models",
            "both",
            "--operator-family",
            "anthropic",
            "--gemini-model",
            "gemini-test",
            "--timeout",
            "2",
        ],
        env=env,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    assert result.returncode == 4
    reviews = list((target / ".cross-family-reviews").glob("REVIEW-*.md"))
    assert len(reviews) in {2, 3}
    codex = next(path for path in reviews if path.name.endswith("-codex.md"))
    assert "exit_code: 1" in codex.read_text()
    assert any("-gemini" in path.name for path in reviews)


def test_operator_family_is_mandatory(tmp_path):
    target = tmp_path / "target"
    target.mkdir()
    result = subprocess.run(
        [str(SCRIPT), "--dir", str(target), "--prompt", "Review", "--models", "codex"],
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    assert result.returncode == 2
    assert "--operator-family is required" in result.stderr


def test_gemini_route_requires_resolved_model(tmp_path):
    target = tmp_path / "target"
    target.mkdir()
    result = subprocess.run(
        [
            str(SCRIPT),
            "--dir",
            str(target),
            "--prompt",
            "Review",
            "--models",
            "gemini",
            "--operator-family",
            "anthropic",
        ],
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    assert result.returncode == 2
    assert "--gemini-model is required" in result.stderr


def test_bonus_reviewer_failure_does_not_fail_other_primary_gate(tmp_path):
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    executable(bin_dir / "codex", """#!/bin/sh
if [ "$1" = debug ]; then
  echo '{"models":[{"slug":"gpt-5.6-sol","supported_reasoning_levels":[{"effort":"high"},{"effort":"max"}]}]}'
  exit 0
fi
echo CODEX_OK
""")
    executable(bin_dir / "agy", "#!/bin/sh\necho AGY\n")
    wrapper = tmp_path / "agy-wrapper"
    executable(wrapper, "#!/bin/sh\nexit 8\n")
    target = tmp_path / "target"
    target.mkdir()
    env = os.environ.copy()
    env["PATH"] = f"{bin_dir}:{env['PATH']}"
    env["AGY_WRAPPER"] = str(wrapper)
    result = subprocess.run(
        [
            str(SCRIPT), "--dir", str(target), "--prompt", "Review", "--models", "both",
            "--operator-family", "anthropic", "--gemini-model", "gemini-test", "--timeout", "2",
        ],
        env=env,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    assert result.returncode == 0


def test_both_mode_does_not_wait_for_slow_bonus_reviewer(tmp_path):
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    executable(bin_dir / "codex", """#!/bin/sh
if [ "$1" = debug ]; then
  echo '{"models":[{"slug":"gpt-5.6-sol","supported_reasoning_levels":[{"effort":"high"},{"effort":"max"}]}]}'
  exit 0
fi
echo CODEX_OK
""")
    executable(bin_dir / "agy", "#!/bin/sh\necho AGY\n")
    wrapper = tmp_path / "agy-wrapper"
    executable(wrapper, "#!/bin/sh\nsleep 20\necho TOO_LATE\n")
    target = tmp_path / "target"
    target.mkdir()
    env = os.environ.copy()
    env["PATH"] = f"{bin_dir}:{env['PATH']}"
    env["AGY_WRAPPER"] = str(wrapper)
    result = subprocess.run(
        [
            str(SCRIPT), "--dir", str(target), "--prompt", "Review", "--models", "both",
            "--operator-family", "anthropic", "--gemini-model", "gemini-test", "--timeout", "30",
        ],
        env=env,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=5,
    )
    assert result.returncode == 0
    gemini = next((target / ".cross-family-reviews").glob("REVIEW-*-gemini-skip.md"))
    assert "cancelled without delaying the gate" in gemini.read_text()


def test_empty_reviewer_output_is_not_success(tmp_path):
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    executable(bin_dir / "codex", """#!/bin/sh
if [ "$1" = debug ]; then
  echo '{"models":[{"slug":"gpt-5.6-sol","supported_reasoning_levels":[{"effort":"high"},{"effort":"max"}]}]}'
  exit 0
fi
exit 0
""")
    target = tmp_path / "target"
    target.mkdir()
    env = os.environ.copy()
    env["PATH"] = f"{bin_dir}:{env['PATH']}"
    result = subprocess.run(
        [
            str(SCRIPT), "--dir", str(target), "--prompt", "Review", "--models", "codex",
            "--operator-family", "anthropic", "--timeout", "2",
        ],
        env=env,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    assert result.returncode == 4
    assert "empty output" in result.stderr
