from pathlib import Path


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
    source = read("README.md")
    assert '"$AGENTS_HOME/scripts/manage_installation.py" plan' in source
    assert '"$AGENTS_HOME/scripts/manage_installation.py" reconcile' in source
    assert '--renames "$AGENTS_HOME/config/skill-renames.json"' in source
    assert 'python3 "${AGENTS_HOME:-$HOME/.agents}/scripts/validate_delivery_scenarios.py"' in source
    assert "\nscripts/manage_installation.py" not in source


def test_harness_handoff_validation_command_is_complete_and_portable():
    source = read("docs/handoffs/HANDOFF-2026-07-10-harness-lifecycle-refactor.md")
    assert VALIDATE in source
    assert '.agent-run/HREF-002/RUN.json --workspace-root "$PWD" --verify-hashes' in source
    assert '"${AGENTS_HOME:-$HOME/.agents}/scripts/check-harness"' in source
    assert '"${AGENTS_HOME:-$HOME/.agents}/scripts/public-release-check"' in source
