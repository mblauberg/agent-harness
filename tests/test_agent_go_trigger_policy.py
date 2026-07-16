"""Policy tests for the label-gated agent-go trigger (issue #152).

These assert the security invariants a public-repo, prompt-injection-aware
trigger must hold: it fires only on the maintainer's own `agent-go` label
event, never interpolates untrusted issue title/body into a shell `run:`
block, and every job keeps least-privilege permissions. A future edit that
weakens any of these must fail this suite.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest
import yaml


ROOT = Path(__file__).resolve().parents[1]
WORKFLOW = ROOT / ".github" / "workflows" / "agent-go-trigger.yml"
CONFIG = ROOT / ".github" / "agent-go.yml"
RUNBOOK = ROOT / "docs" / "runbooks" / "github-workflow.md"
IMMUTABLE_ACTION = re.compile(r"^[^@\s]+@[0-9a-f]{40}$")

EXPECTED_JOB_PERMISSIONS = {
    "gate": {"contents": "read"},
    "dispatch": {},
}
GATE_CONDITION_CLAUSES = (
    "github.event.action == 'labeled'",
    "github.event.label.name == 'agent-go'",
    "github.event.sender.login == 'mblauberg'",
    "github.event.issue.state == 'open'",
)
UNTRUSTED_ISSUE_FIELDS = ("github.event.issue.title", "github.event.issue.body")


def _document() -> dict[str, object]:
    value = yaml.safe_load(WORKFLOW.read_text(encoding="utf-8"))
    assert isinstance(value, dict)
    return value


def _jobs(document: dict[str, object]) -> dict[str, dict[str, object]]:
    jobs = document.get("jobs")
    assert isinstance(jobs, dict)
    assert all(isinstance(job, dict) for job in jobs.values())
    return jobs


def _job(document: dict[str, object], name: str) -> dict[str, object]:
    job = _jobs(document).get(name)
    assert isinstance(job, dict), f"agent-go-trigger.yml must define the {name} job"
    return job


def _steps(job: dict[str, object]) -> list[dict[str, object]]:
    value = job.get("steps")
    assert isinstance(value, list)
    assert all(isinstance(item, dict) for item in value)
    return value


def _run_texts(job: dict[str, object]) -> list[str]:
    return [str(step["run"]) for step in _steps(job) if "run" in step]


def _env_maps(job: dict[str, object]) -> list[dict[str, object]]:
    maps: list[dict[str, object]] = []
    if isinstance(job.get("env"), dict):
        maps.append(job["env"])
    for step in _steps(job):
        if isinstance(step.get("env"), dict):
            maps.append(step["env"])
    return maps


def _all_uses(document: dict[str, object]) -> list[str]:
    uses: list[str] = []
    for job in _jobs(document).values():
        for step in _steps(job):
            action = step.get("uses")
            if action is not None:
                assert isinstance(action, str)
                uses.append(action)
    return uses


def _triggers(document: dict[str, object]) -> dict[str, object]:
    # PyYAML resolves the bare `on:` key to boolean True (YAML 1.1 core
    # schema); read the trigger mapping under whichever key the loader used.
    on = document.get(True, document.get("on"))
    assert isinstance(on, dict)
    return on


def _assert_gate_condition(document: dict[str, object]) -> None:
    condition = str(_job(document, "gate").get("if", ""))
    for clause in GATE_CONDITION_CLAUSES:
        assert clause in condition, clause


def test_trigger_fires_only_on_issue_labeled_events() -> None:
    document = _document()
    on = _triggers(document)
    # Exactly one event/type pair. No `unlabeled`, no `workflow_dispatch`
    # (which write-access collaborators, not only the maintainer, could
    # invoke), no `issue_comment` (no @-mention path), no `pull_request`.
    assert on == {"issues": {"types": ["labeled"]}}


def test_top_level_permissions_are_empty() -> None:
    document = _document()
    assert document.get("permissions") == {}


def test_jobs_scope_permissions_to_least_privilege() -> None:
    document = _document()
    jobs = _jobs(document)
    assert set(jobs) == set(EXPECTED_JOB_PERMISSIONS)
    for job_name, expected in EXPECTED_JOB_PERMISSIONS.items():
        job = jobs[job_name]
        assert job.get("permissions") == expected, job_name
        assert isinstance(job.get("timeout-minutes"), int), job_name


def test_concurrency_serialises_per_issue() -> None:
    document = _document()
    concurrency = document.get("concurrency")
    assert isinstance(concurrency, dict)
    assert concurrency.get("group") == "agent-go-${{ github.event.issue.number }}"
    assert concurrency.get("cancel-in-progress") is False


def test_gate_condition_checks_label_actor_and_open_state() -> None:
    _assert_gate_condition(_document())


@pytest.mark.parametrize("clause", GATE_CONDITION_CLAUSES)
def test_removing_any_gate_clause_fails_the_guard(clause: str) -> None:
    document = _document()
    condition = str(_job(document, "gate")["if"])
    _job(document, "gate")["if"] = condition.replace(clause, "true")
    with pytest.raises(AssertionError):
        _assert_gate_condition(document)


def _string_values(node: object) -> list[str]:
    # Walk the parsed document, not the raw file text, so explanatory
    # comments (which may need to name github.actor to explain why it is
    # avoided) can never satisfy or defeat this check either way.
    if isinstance(node, str):
        return [node]
    if isinstance(node, dict):
        values: list[str] = []
        for value in node.values():
            values.extend(_string_values(value))
        return values
    if isinstance(node, list):
        values = []
        for item in node:
            values.extend(_string_values(item))
        return values
    return []


def test_gate_never_reads_github_actor() -> None:
    # github.actor can differ from the acting principal on some event
    # shapes; every live expression (if/env/run) must key off
    # github.event.sender.login (the webhook payload's own record of who
    # performed the action), never github.actor. Checked against the parsed
    # YAML values, not raw file text, so this cannot be defeated by a
    # comment and cannot be spuriously tripped by one either.
    document = _document()
    assert all("github.actor" not in value for value in _string_values(document))


def test_dispatch_needs_gate_and_a_resolved_provider() -> None:
    document = _document()
    dispatch = _job(document, "dispatch")
    assert dispatch.get("needs") == "gate"
    assert dispatch.get("if") == "needs.gate.outputs.provider != ''"


def test_no_step_interpolates_untrusted_issue_fields_into_run_blocks() -> None:
    # Issue title/body are untrusted input on a public repository. They may
    # only cross into a `run:` script through an `env:` variable reference
    # (`$ISSUE_TITLE`), never as a raw `${{ github.event.issue.* }}`
    # expression spliced into the script text itself.
    document = _document()
    for job in _jobs(document).values():
        for text in _run_texts(job):
            for field in UNTRUSTED_ISSUE_FIELDS:
                assert field not in text, text


def test_untrusted_issue_fields_reach_the_job_only_via_env_indirection() -> None:
    # The protections above would be vacuous if the fields were simply
    # dropped. Prove the indirection is actually wired: the dispatch job's
    # env block sources ISSUE_TITLE/ISSUE_BODY from the event context, and
    # the payload-building step consumes them as shell variables (jq --arg),
    # never re-embedding a `${{ }}` expression.
    document = _document()
    dispatch = _job(document, "dispatch")
    env_maps = _env_maps(dispatch)
    flattened_env = {key: str(value) for env in env_maps for key, value in env.items()}
    assert flattened_env.get("ISSUE_TITLE") == "${{ github.event.issue.title }}"
    assert flattened_env.get("ISSUE_BODY") == "${{ github.event.issue.body }}"

    payload_step = next(step for step in _steps(dispatch) if step.get("id") == "payload")
    run_text = str(payload_step.get("run", ""))
    assert "jq -n" in run_text
    assert '--arg title "$ISSUE_TITLE"' in run_text
    assert '--arg body "$ISSUE_BODY"' in run_text
    # The built payload is referenced as a single env var downstream, never
    # rebuilt from the raw event fields a second time.
    for step in _steps(dispatch):
        if step is payload_step:
            continue
        text = str(step.get("run", ""))
        assert "$ISSUE_TITLE" not in text
        assert "$ISSUE_BODY" not in text


def test_dispatch_lanes_are_gated_on_the_resolved_provider_and_use_distinct_secrets() -> None:
    document = _document()
    dispatch = _job(document, "dispatch")
    steps = {step.get("name"): step for step in _steps(dispatch)}
    codex_step = steps["Dispatch to Codex Cloud lane"]
    claude_step = steps["Dispatch to Claude lane"]
    assert codex_step.get("if") == "needs.gate.outputs.provider == 'codex'"
    assert claude_step.get("if") == "needs.gate.outputs.provider == 'claude'"
    codex_env = codex_step.get("env", {})
    claude_env = claude_step.get("env", {})
    assert codex_env.get("DISPATCH_URL") == "${{ secrets.AGENT_GO_CODEX_DISPATCH_URL }}"
    assert claude_env.get("DISPATCH_URL") == "${{ secrets.AGENT_GO_CLAUDE_DISPATCH_URL }}"
    assert codex_env.get("DISPATCH_URL") != claude_env.get("DISPATCH_URL")
    for step in (codex_step, claude_step):
        assert 'if [ -z "$DISPATCH_URL" ]' in str(step.get("run", ""))
        assert "exit 1" in str(step.get("run", ""))


def test_actions_are_sha_pinned() -> None:
    document = _document()
    uses = _all_uses(document)
    assert uses, "expected at least one action reference"
    for action in uses:
        assert IMMUTABLE_ACTION.fullmatch(action), action


def test_provider_config_defaults_to_codex_as_a_single_line() -> None:
    text = CONFIG.read_text(encoding="utf-8")
    provider_lines = [line for line in text.splitlines() if line.startswith("provider:")]
    # Swapping providers must be a one-line change: exactly one bare,
    # uncommented `provider:` line in the whole file.
    assert len(provider_lines) == 1
    assert provider_lines[0] == "provider: codex"

    document = yaml.safe_load(text)
    assert isinstance(document, dict)
    assert document.get("provider") == "codex"


def test_gate_reads_the_same_config_file_and_rejects_unknown_providers() -> None:
    document = _document()
    gate = _job(document, "gate")
    config_step = next(step for step in _steps(gate) if step.get("id") == "config")
    run_text = str(config_step.get("run", ""))
    assert '.github/agent-go.yml' in run_text
    assert "codex|claude" in run_text
    assert "exit 1" in run_text
    assert 'echo "provider=$provider" >> "$GITHUB_OUTPUT"' in run_text


def test_runbook_documents_the_agent_go_trigger() -> None:
    runbook = RUNBOOK.read_text(encoding="utf-8")
    assert "agent-go" in runbook.lower()
    for term in (
        "AGENT_GO_CODEX_DISPATCH_URL",
        "AGENT_GO_CLAUDE_DISPATCH_URL",
        "github.event.sender.login",
        "provider: claude",
    ):
        assert term in runbook, term
