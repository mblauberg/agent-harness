from pathlib import Path
import re


ROOT = Path(__file__).resolve().parents[1]
VALIDATE = '"${AGENTS_HOME:-$HOME/.agents}/skills/deliver/scripts/validate_delivery.py"'
RECEIPT_AND_ARGS = '.agent-run/<id>/RUN.json --workspace-root "$PWD" --verify-hashes'


def read(path: str) -> str:
    return (ROOT / path).read_text()


def test_delivery_and_implementation_guidance_names_receipt_and_safe_root():
    for path in (
        "skills/deliver/SKILL.md",
        "skills/deliver/references/contract.md",
        "skills/implement/SKILL.md",
        "skills/implement/references/run-contract.md",
    ):
        source = read(path)
        assert VALIDATE in source, path
        assert RECEIPT_AND_ARGS in source, path


def test_readme_operator_commands_are_agents_home_safe():
    # Assert the rule, not the wording. A reader runs README commands from their own
    # project, so every harness script the README tells them to run must be
    # $AGENTS_HOME-qualified: a bare `scripts/...` path resolves against their cwd,
    # so it finds the wrong tree or nothing. Pinning this to a fixed list of commands
    # is what broke it, once the operator detail moved to MAINTAINING.md.
    source = read("README.md")
    shell = "\n".join(re.findall(r"```sh\n(.*?)```", source, re.DOTALL))
    invocations = [line.strip() for line in shell.splitlines() if "scripts/" in line]
    assert invocations, "the README shows no harness commands to check"
    unsafe = [line for line in invocations if "AGENTS_HOME" not in line]
    assert unsafe == [], f"README runs harness scripts without $AGENTS_HOME: {unsafe}"
    assert '"$AGENTS_HOME/scripts/install-harness"' in shell
    assert "\nscripts/manage_installation.py" not in source


def test_managed_reconciliation_stays_documented_for_maintainers():
    # The operator detail the README used to carry. A maintainer reads this with the
    # checkout as cwd, so a relative script path is the correct form here.
    source = read("MAINTAINING.md")
    assert "`config/skill-renames.json`" in source
    assert "`scripts/manage_installation.py plan`" in source
    assert "reconcile" in source
    assert "Never claim or overwrite an unmanaged target." in source


def test_delivery_scenario_replay_command_is_portable():
    source = read("skills/deliver/references/contract.md")
    assert 'python3 "${AGENTS_HOME:-$HOME/.agents}/scripts/validate_delivery_scenarios.py"' in source


def test_harness_handoff_validation_command_is_complete_and_portable():
    source = read("docs/handoffs/HANDOFF-2026-07-10-harness-lifecycle-refactor.md")
    assert VALIDATE in source
    assert '.agent-run/HREF-002/RUN.json --workspace-root "$PWD" --verify-hashes' in source
    assert '"${AGENTS_HOME:-$HOME/.agents}/scripts/check-harness"' in source
    assert '"${AGENTS_HOME:-$HOME/.agents}/scripts/public-release-check"' in source
