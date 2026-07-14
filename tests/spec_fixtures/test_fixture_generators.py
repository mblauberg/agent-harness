from __future__ import annotations

from pathlib import Path
import shutil
import subprocess
import sys

import pytest


FIXTURES = Path(__file__).resolve().parent


@pytest.mark.parametrize(
    ("script_name", "results_name", "stdout_marker"),
    (
        (
            "fixtures_lifecycle.py",
            "results_lifecycle.txt",
            "LEAD8: ACCEPTED (defect reproduced)",
        ),
        (
            "fixtures_schema.py",
            "results_schema.txt",
            "All six defects reproduced as predicted.",
        ),
    ),
)
def test_defect_reproduction_generator_is_gated_without_tracked_writes(
    tmp_path: Path,
    script_name: str,
    results_name: str,
    stdout_marker: str,
) -> None:
    script = tmp_path / script_name
    generated_results = tmp_path / results_name
    expected_results = FIXTURES / results_name
    tracked_before = expected_results.read_bytes()
    shutil.copy2(FIXTURES / script_name, script)

    result = subprocess.run(
        [sys.executable, script.name],
        cwd=tmp_path,
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0, result.stdout + result.stderr
    assert stdout_marker in result.stdout
    assert generated_results.read_bytes() == tracked_before
    assert expected_results.read_bytes() == tracked_before
