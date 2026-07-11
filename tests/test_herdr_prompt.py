import os
from pathlib import Path
import stat
import subprocess


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "skills" / "orchestrate" / "scripts" / "herdr_prompt.sh"


def test_prompt_helper_uses_atomic_pane_run(tmp_path):
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
        [str(SCRIPT), "review-claude", "--prompt", "Inspect this diff"],
        env=env,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    assert result.returncode == 0, result.stderr
    calls = log.read_text().splitlines()
    assert calls == [
        "agent get review-claude",
        "pane run w9:p3 Inspect this diff",
    ]


def test_prompt_helper_rejects_large_pastes_before_contacting_herdr(tmp_path):
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    fake = bin_dir / "herdr"
    fake.write_text("#!/bin/sh\nexit 99\n")
    fake.chmod(fake.stat().st_mode | stat.S_IXUSR)
    env = os.environ.copy()
    env["PATH"] = f"{bin_dir}:{env['PATH']}"
    result = subprocess.run(
        [str(SCRIPT), "review-claude", "--prompt", "x" * 4097],
        env=env, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
    )
    assert result.returncode == 2
    assert "write an artifact and send its path plus digest" in result.stderr
