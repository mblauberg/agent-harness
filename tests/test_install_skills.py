from pathlib import Path
import subprocess


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "install-skills"


def run(target: Path):
    return subprocess.run(
        [str(SCRIPT), "--target", str(target)],
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )


def test_installer_links_every_skill_and_is_idempotent(tmp_path):
    target = tmp_path / "skills"
    first = run(target)
    assert first.returncode == 0, first.stderr
    expected = {path.parent.name for path in (ROOT / "skills").glob("*/SKILL.md")}
    assert {path.name for path in target.iterdir()} == expected
    assert all((target / name).is_symlink() for name in expected)
    assert f"linked={len(expected)} existing=0" in first.stdout

    second = run(target)
    assert second.returncode == 0, second.stderr
    assert f"linked=0 existing={len(expected)}" in second.stdout


def test_installer_preserves_existing_entries(tmp_path):
    target = tmp_path / "skills"
    target.mkdir()
    existing = target / "scope"
    existing.mkdir()
    marker = existing / "keep.txt"
    marker.write_text("owned elsewhere\n")

    result = run(target)
    assert result.returncode == 0, result.stderr
    assert marker.read_text() == "owned elsewhere\n"
    assert not existing.is_symlink()


def test_installer_requires_a_target():
    result = subprocess.run(
        [str(SCRIPT)],
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    assert result.returncode == 2
    assert "usage:" in result.stderr
