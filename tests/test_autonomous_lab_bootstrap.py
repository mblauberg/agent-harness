import re
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
TEMPLATE = ROOT / "skills" / "autonomous-lab" / "templates" / "README.template.md"
BOOTSTRAP = ROOT / "skills" / "autonomous-lab" / "scripts" / "bootstrap-lab.sh"
HOME_PATH = re.compile(r"/(?:Users|home)/[A-Za-z0-9._-]+/")


def assert_portable_loop_prompt(text: str) -> None:
    assert "{{LAB_DIR}}" not in text
    assert "this lab root" in text
    assert "Read OPERATING_MANUAL.md IN FULL first" in text
    assert HOME_PATH.search(text) is None


def inline_readme(script: str) -> str:
    start = script.index("gen_readme() {")
    end = script.index("# install each memory file", start)
    return script[start:end]


def test_readme_sources_use_a_lab_root_relative_loop_prompt():
    assert_portable_loop_prompt(TEMPLATE.read_text())
    assert_portable_loop_prompt(inline_readme(BOOTSTRAP.read_text()))


def test_bootstrap_generates_a_machine_portable_readme(tmp_path):
    lab = tmp_path / "portable-lab"
    lab.mkdir()
    (lab / "GOAL.md").write_text(
        """# Test goal

```config-knobs
DOMAIN = Portability test
MISSION = Prove portable bootstrap output
LOCKED_CONSTRAINTS = no machine paths
HARD_GATES = deterministic tests
ESCALATION_GATES = none
BUILD_CEILING = scaffold only
```
"""
    )
    result = subprocess.run(
        [str(BOOTSTRAP), "--dir", str(lab), "--domain", "Portability test"],
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )

    assert result.returncode == 0, result.stderr
    readme = (lab / "README.md").read_text()
    assert str(lab) not in readme
    assert_portable_loop_prompt(readme)


def test_bootstrap_creates_a_resumable_incomplete_lab_without_self_wake_loop(tmp_path):
    lab = tmp_path / "lab"

    result = subprocess.run(
        [str(BOOTSTRAP), str(lab), "Example domain"],
        check=False,
        capture_output=True,
        text=True,
        timeout=30,
    )

    assert result.returncode == 3, result.stderr
    for relative in (
        "GOAL.md",
        "OPERATING_MANUAL.md",
        "STATE.md",
        "HANDOFF.md",
        "DECISION_QUEUE.md",
        ".orchestrator/runs.md",
        "adr/_meta/ADR.template.md",
    ):
        assert (lab / relative).is_file(), relative

    assert "DOMAIN            = Example domain" in (lab / "GOAL.md").read_text()
    manual = " ".join((lab / "OPERATING_MANUAL.md").read_text().split())
    assert "one bounded re-enumeration pass" in manual
    assert "idle checkpoint" in manual
    assert "self-wake forever" not in manual
    readme = " ".join((lab / "README.md").read_text().split())
    assert "validated external driver" in readme
    assert "validate_idle_pause.py" in readme
    assert "--runs" in readme and "--queue" in readme
    assert "non-zero" in readme
    assert "never self-halt" not in readme
    assert "while STATUS != STOP" not in readme
    assert str(lab) not in readme
    queue = (lab / "DECISION_QUEUE.md").read_text()
    assert queue.count("| Item | Status | Depends on | Scope / next evidence |") == 2
    state = (lab / "STATE.md").read_text()
    assert "restart-on:" in state
    assert "human-directive" in state


def test_bootstrap_dry_run_creates_nothing(tmp_path):
    lab = tmp_path / "dry-lab"

    result = subprocess.run(
        [str(BOOTSTRAP), "--dry-run", str(lab), "Example domain"],
        check=False,
        capture_output=True,
        text=True,
        timeout=30,
    )

    assert result.returncode == 0, result.stderr
    assert not lab.exists()


def test_bootstrap_rerun_does_not_clobber_existing_state(tmp_path):
    lab = tmp_path / "lab"
    subprocess.run(
        [str(BOOTSTRAP), str(lab), "Example domain"],
        check=False,
        capture_output=True,
        text=True,
        timeout=30,
    )
    state = lab / "STATE.md"
    state.write_text("user-owned state\n")

    subprocess.run(
        [str(BOOTSTRAP), str(lab)],
        check=False,
        capture_output=True,
        text=True,
        timeout=30,
    )

    assert state.read_text() == "user-owned state\n"
