import os
from pathlib import Path
import subprocess


ROOT = Path(__file__).resolve().parents[1]
WRAPPER = ROOT / "skills" / "playwright" / "scripts" / "playwright_cli.sh"


def test_wrapper_prefers_existing_cli_and_preserves_arguments(tmp_path):
    fake = tmp_path / "playwright-cli"
    fake.write_text("#!/bin/sh\nprintf '%s\\n' \"$@\"\n")
    fake.chmod(0o755)
    env = os.environ.copy()
    env["PATH"] = f"{tmp_path}:{env['PATH']}"
    env["PLAYWRIGHT_CLI_SESSION"] = "isolated"

    result = subprocess.run(
        [str(WRAPPER), "snapshot"],
        env=env,
        check=True,
        capture_output=True,
        text=True,
    )

    assert result.stdout.splitlines() == ["--session", "isolated", "snapshot"]


def test_wrapper_does_not_resolve_network_package_without_opt_in(tmp_path):
    env = os.environ.copy()
    env["PATH"] = "/usr/bin:/bin"
    env.pop("PLAYWRIGHT_CLI_ALLOW_NPX_INSTALL", None)

    result = subprocess.run(
        [str(WRAPPER), "--help"],
        env=env,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 1
    assert "PLAYWRIGHT_CLI_ALLOW_NPX_INSTALL=1" in result.stderr


def test_authorised_npx_resolution_ignores_ambient_package_override(tmp_path):
    fake_npx = tmp_path / "npx"
    fake_npx.write_text("#!/bin/sh\nprintf '%s\\n' \"$@\"\n")
    fake_npx.chmod(0o755)
    env = os.environ.copy()
    env["PATH"] = f"{tmp_path}:/usr/bin:/bin"
    env["PLAYWRIGHT_CLI_ALLOW_NPX_INSTALL"] = "1"
    env["PLAYWRIGHT_CLI_PACKAGE"] = "malicious-package@latest"

    result = subprocess.run(
        [str(WRAPPER), "--help"],
        env=env,
        check=True,
        capture_output=True,
        text=True,
    )

    args = result.stdout.splitlines()
    assert "@playwright/cli@0.1.17" in args
    assert all("malicious-package" not in arg for arg in args)
