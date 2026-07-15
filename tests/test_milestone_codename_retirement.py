from __future__ import annotations

import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ARCHIVE_ROOT = Path("docs/archive/evals")
FORBIDDEN = ("spec" + "05", "Spec" + "05", "Spec" + " 05", "SPEC" + "05")


def tracked_paths() -> list[Path]:
    result = subprocess.run(
        ["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"],
        cwd=ROOT,
        check=True,
        capture_output=True,
    )
    return [
        path
        for value in result.stdout.split(b"\0")
        if value and (ROOT / (path := Path(value.decode()))).is_file()
    ]


def test_milestone_codename_is_absent_from_the_live_tree():
    violations: list[str] = []
    for relative in tracked_paths():
        if relative.is_relative_to(ARCHIVE_ROOT):
            continue
        if any(token in relative.as_posix() for token in FORBIDDEN):
            violations.append(relative.as_posix())
            continue
        contents = (ROOT / relative).read_bytes()
        if b"\0" in contents:
            continue
        text = contents.decode("utf-8")
        if any(token in text for token in FORBIDDEN):
            violations.append(relative.as_posix())

    assert violations == [], "live milestone references remain:\n" + "\n".join(violations)


def test_archived_milestone_evidence_is_explicitly_historical():
    archived = [
        path for path in tracked_paths()
        if path.is_relative_to(ARCHIVE_ROOT)
        and any(token in path.as_posix() for token in FORBIDDEN)
    ]
    if not archived:
        return

    marker = ROOT / ARCHIVE_ROOT / "README.md"
    assert marker.is_file()
    statement = marker.read_text()
    assert "Historical evidence only" in statement
    assert "must not be consumed by current gates" in statement
