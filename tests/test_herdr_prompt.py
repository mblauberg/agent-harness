import os
from pathlib import Path
import stat
import subprocess


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "skills" / "orchestrate" / "scripts" / "herdr_prompt.sh"


def test_prompt_helper_uses_pane_run_and_confirms_submit_with_enter(tmp_path):
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    log = tmp_path / "calls.log"
    fake = bin_dir / "herdr"
    fake.write_text(
        "#!/bin/sh\n"
        f"printf '%s\\n' \"$*\" >> {log}\n"
        "if [ \"$1 $2\" = \"agent get\" ]; then\n"
        "  printf '%s\\n' '{\"result\":{\"agent\":{\"pane_id\":\"w9:p3\"}}}'\n"
        "fi\n"
    )
    fake.chmod(fake.stat().st_mode | stat.S_IXUSR)
    env = os.environ.copy()
    env["PATH"] = f"{bin_dir}:{env['PATH']}"
    result = subprocess.run(
        [
            str(SCRIPT),
            "review-claude",
            "--fire-and-forget",
            "--task-ref",
            "task-review-17",
            "--prompt",
            "Steer task-review-17: pause after the current check",
        ],
        env=env,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    assert result.returncode == 0, result.stderr
    calls = log.read_text().splitlines()
    assert calls == [
        "agent get review-claude",
        "pane run w9:p3 Steer task-review-17: pause after the current check",
        "pane send-keys w9:p3 enter",
    ]
    assert "task-ref-unverified" in result.stdout


def test_prompt_helper_rejects_answer_bearing_use_without_explicit_fire_and_forget(tmp_path):
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    fake = bin_dir / "herdr"
    fake.write_text("#!/bin/sh\nexit 99\n")
    fake.chmod(fake.stat().st_mode | stat.S_IXUSR)
    env = os.environ.copy()
    env["PATH"] = f"{bin_dir}:{env['PATH']}"
    result = subprocess.run(
        [str(SCRIPT), "review-claude", "--prompt", "Review and report findings"],
        env=env,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    assert result.returncode == 2
    assert "--fire-and-forget" in result.stderr
    assert "Fabric request/reply" in result.stderr


def test_prompt_helper_requires_tracked_task_reference_for_fire_and_forget(tmp_path):
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    fake = bin_dir / "herdr"
    fake.write_text("#!/bin/sh\nexit 99\n")
    fake.chmod(fake.stat().st_mode | stat.S_IXUSR)
    env = os.environ.copy()
    env["PATH"] = f"{bin_dir}:{env['PATH']}"
    result = subprocess.run(
        [
            str(SCRIPT),
            "review-claude",
            "--fire-and-forget",
            "--prompt",
            "Pause after the current check",
        ],
        env=env,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    assert result.returncode == 2
    assert "--task-ref" in result.stderr


def test_prompt_helper_displays_help_when_help_is_first_argument():
    result = subprocess.run(
        [str(SCRIPT), "--help"],
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    assert result.returncode == 0
    assert "Usage:" in result.stdout


def test_prompt_helper_rejects_large_pastes_before_contacting_herdr(tmp_path):
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    fake = bin_dir / "herdr"
    fake.write_text("#!/bin/sh\nexit 99\n")
    fake.chmod(fake.stat().st_mode | stat.S_IXUSR)
    env = os.environ.copy()
    env["PATH"] = f"{bin_dir}:{env['PATH']}"
    result = subprocess.run(
        [
            str(SCRIPT),
            "review-claude",
            "--fire-and-forget",
            "--task-ref",
            "task-large-steer",
            "--prompt",
            "x" * 4097,
        ],
        env=env, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
    )
    assert result.returncode == 2
    assert "write an artifact and send its path plus digest" in result.stderr
