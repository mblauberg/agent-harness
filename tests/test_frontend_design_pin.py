from pathlib import Path
import subprocess


ROOT = Path(__file__).resolve().parents[1]
PIN = ROOT / "skills" / "frontend-design" / "scripts" / "pin.mjs"


def test_pin_works_with_global_skill_and_uses_new_command_name(tmp_path):
    (tmp_path / "package.json").write_text("{}")
    (tmp_path / ".agents" / "skills").mkdir(parents=True)
    result = subprocess.run(
        ["node", str(PIN), "pin", "audit"],
        cwd=tmp_path,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    assert result.returncode == 0, result.stderr
    pinned = tmp_path / ".agents" / "skills" / "audit" / "SKILL.md"
    text = pinned.read_text()
    assert "frontend-design audit" in text
    assert "/impeccable" not in text
