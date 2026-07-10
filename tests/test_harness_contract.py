from pathlib import Path
import re

import pytest


ROOT = Path(__file__).resolve().parents[1]
WORKFLOWS = Path.home() / ".claude" / "workflows"


def frontmatter_name(path: Path) -> str:
    text = path.read_text()
    match = re.search(r"^name:\s*([^\n]+)$", text, re.MULTILINE)
    assert match, f"missing name in {path}"
    return match.group(1).strip()


def test_lifecycle_skills_are_portable_and_named_for_their_directory():
    for name in ("change", "code-review"):
        skill = ROOT / "skills" / name / "SKILL.md"
        assert skill.is_file(), f"missing portable {name} skill"
        assert frontmatter_name(skill) == name


def test_claude_workflows_do_not_reference_retired_orchestration_skill():
    offenders = []
    for path in WORKFLOWS.glob("*.js"):
        if "multi-agent-orchestration" in path.read_text():
            offenders.append(path.name)
    assert offenders == []


def test_constitution_names_equal_primaries_and_router_has_current_codex_family():
    text = (ROOT / "HARNESS.md").read_text()
    assert "fallback orchestrator" not in text.lower()
    assert all(alias in text for alias in ("flagship", "workhorse", "scout"))
    assert "equal primary orchestrators" in text
    assert "never block on absence" in text
    routing = (ROOT / "skills" / "orchestrate" / "references" / "routing-and-tiers.md").read_text()
    assert "GPT-5.6" in routing


def test_constitution_is_a_compact_core_with_progressive_disclosure():
    text = (ROOT / "HARNESS.md").read_text()
    assert len(text.split()) <= 700
    assert "paired-primary.md" in text
    assert "config/risk-policy.json" in text
    assert "skills/release/" in text
    assert "skills/evaluate/" in text


def test_release_and_evaluate_complete_the_delivery_spine():
    for name in ("release", "evaluate"):
        skill = ROOT / "skills" / name / "SKILL.md"
        assert skill.is_file()
        assert frontmatter_name(skill) == name


def test_autonomous_lab_external_reviewers_fail_closed_read_only():
    script = (ROOT / "skills" / "autonomous-lab" / "scripts" / "cross-family.sh").read_text()
    dispatcher = (ROOT / "skills" / "orchestrate" / "scripts" / "cf_dispatch.sh").read_text()
    assert "CF_DISPATCH" in script
    assert "codex exec -s read-only" in dispatcher
    assert "--editable" not in script
    assert "--dangerously-skip-permissions" not in script
    assert "BOTH_PRIMARY" in script
    assert "cancelled without delaying the gate" in script


def test_root_harness_checker_is_available():
    checker = ROOT / "scripts" / "check-harness"
    assert checker.is_file()
    assert checker.stat().st_mode & 0o111


def test_dispatchers_default_to_their_checkout_not_a_home_install():
    dispatcher = (ROOT / "skills" / "orchestrate" / "scripts" / "cf_dispatch.sh").read_text()
    cross_family = (ROOT / "skills" / "autonomous-lab" / "scripts" / "cross-family.sh").read_text()
    assert 'AGENTS_ROOT="${AGENTS_HOME:-$HARNESS_ROOT}"' in dispatcher
    assert 'MODEL_ROUTE="${AGENTS_HOME:-$HARNESS_ROOT}/scripts/model-route"' in cross_family
    assert '${AGENTS_HOME:-$HOME/.agents}/scripts/model-route' not in dispatcher + cross_family


@pytest.mark.skipif(
    not all((WORKFLOWS / name).is_file() for name in ("change-run.js", "codebase-polish.js", "cross-verify.js")),
    reason="optional local Claude workflow installation is absent",
)
def test_claude_workflows_use_router_and_safe_change_loop():
    for name in ("change-run.js", "codebase-polish.js", "cross-verify.js"):
        text = (WORKFLOWS / name).read_text()
        assert "model-route" in text
        assert "claude-haiku-" not in text
    change = (WORKFLOWS / "change-run.js").read_text()
    assert "cycle <= 2" in change
    assert "state: 'awaiting-human'" in change
    assert "git checkout" not in change
    assert "git restore" not in change
    assert "git reset" not in change
    assert "required: false" in change
    assert "otherPrimaryRan" in change
    assert "bonus availability never blocks" in change
    assert "Copy the global change RUN.template.json" in change
    assert "refusing the next dispatch" in change
    assert "do not recreate or replace it" in change
    assert "Review verdicts and dispatcher lineage" in change
    assert "certification_eligible" in change
    assert "Machine gate FAILED" in change
    assert "state: 'failed'" in change


def test_read_only_review_allows_scoped_artifacts_but_forbids_unscoped_scratch():
    text = " ".join((ROOT / "skills" / "code-review" / "SKILL.md").read_text().split())
    assert "Artifact-only authority permits named outputs under the assigned run directory" in text
    assert "does not permit arbitrary repo-root scratch" in text


def test_code_review_uses_task_selected_multi_agent_lenses_without_voting():
    skill = (ROOT / "skills" / "code-review" / "SKILL.md").read_text()
    topology = (ROOT / "skills" / "code-review" / "references" / "multi-agent-review.md").read_text()
    assert "2–4 blind independent agents" in skill
    assert "Correctness/spec alignment" in skill
    assert "anonymised claim challenge" in skill
    assert "Never rank prose or majority-vote" in skill
    assert "fresh-context reducer" in topology


def test_default_agent_run_directory_is_ignored_in_the_harness_repo():
    assert ".agent-run/" in (ROOT / ".gitignore").read_text().splitlines()


def test_context_hygiene_is_owned_by_session_and_machine_receipts():
    harness = " ".join((ROOT / "HARNESS.md").read_text().split())
    change = (ROOT / "skills" / "change" / "references" / "run-contract.md").read_text()
    assert "`session` owns context hygiene" in harness
    assert "context_hygiene" in change
