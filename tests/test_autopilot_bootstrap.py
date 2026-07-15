import re
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
TEMPLATE = ROOT / "skills" / "autopilot" / "templates" / "README.template.md"
BOOTSTRAP = ROOT / "skills" / "autopilot" / "scripts" / "bootstrap-autopilot.sh"
HOME_PATH = re.compile(r"/(?:Users|home)/[A-Za-z0-9._-]+/")


def assert_portable(text: str) -> None:
    assert HOME_PATH.search(text) is None


def inline_readme(script: str) -> str:
    start = script.index("gen_readme() {")
    end = script.index("install_file \"GOAL.md\"", start)
    return script[start:end]


def run_bootstrap(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["sh", str(BOOTSTRAP), *args],
        cwd=ROOT,
        check=False,
        capture_output=True,
        text=True,
        timeout=30,
    )


def test_readme_template_and_fallback_are_mission_root_relative_and_portable():
    template_text = TEMPLATE.read_text()
    assert_portable(template_text)
    assert_portable(inline_readme(BOOTSTRAP.read_text()))
    assert "mission root" in template_text
    assert "references/operating-loop.md" in template_text
    assert "IN FULL first" in template_text


def test_bootstrap_generates_a_machine_portable_readme(tmp_path):
    mission = tmp_path / ".agent-run" / "mission-id"
    result = run_bootstrap("--repo-root", str(tmp_path), "mission-id", "Portability test")

    assert result.returncode == 3, result.stderr
    readme = (mission / "README.md").read_text()
    assert str(mission) not in readme
    assert_portable(readme)


def test_bootstrap_creates_a_resumable_incomplete_mission_without_self_wake_loop(tmp_path):
    mission = tmp_path / ".agent-run" / "mission-id"

    result = run_bootstrap("--repo-root", str(tmp_path), "mission-id", "Example domain")

    assert result.returncode == 3, result.stderr
    for relative in ("GOAL.md", "STATE.md", "QUEUE.md", "HANDOFF.md", "README.md"):
        assert (mission / relative).is_file(), relative

    assert "DOMAIN            = Example domain" in (mission / "GOAL.md").read_text()
    readme = " ".join((mission / "README.md").read_text().split())
    assert "validate_idle_pause.py" in readme
    assert "--queue" in readme
    assert "non-zero" in readme
    assert "self-wake forever" not in readme
    assert "never self-halt" not in readme
    assert "while STATUS != STOP" not in readme
    assert str(mission) not in readme
    queue = (mission / "QUEUE.md").read_text()
    assert "## Tier 0" in queue
    state = (mission / "STATE.md").read_text()
    assert "Conductor lease" in state
    assert "Resume protocol" in state


def test_bootstrap_dry_run_creates_nothing(tmp_path):
    mission = tmp_path / ".agent-run" / "mission-id"

    result = run_bootstrap("--dry-run", "--repo-root", str(tmp_path), "mission-id", "Example domain")

    assert result.returncode == 0, result.stderr
    assert not mission.exists()


def test_bootstrap_rerun_does_not_clobber_existing_state(tmp_path):
    mission = tmp_path / ".agent-run" / "mission-id"
    run_bootstrap("--repo-root", str(tmp_path), "mission-id", "Example domain")

    state = mission / "STATE.md"
    state.write_text("user-owned state\n")

    run_bootstrap("--repo-root", str(tmp_path), "mission-id")

    assert state.read_text() == "user-owned state\n"


def test_bootstrap_refuses_a_mission_id_that_escapes_agent_run(tmp_path):
    result = run_bootstrap("--repo-root", str(tmp_path), "../escape")

    assert result.returncode == 2
    assert "must not contain" in result.stderr
