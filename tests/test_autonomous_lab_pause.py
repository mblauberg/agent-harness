import importlib.util
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "skills" / "autonomous-lab" / "scripts" / "validate_idle_pause.py"
TIERS_HEADING = "## Tiers (dependency-ordered; tier-0 = foundational one-way-doors)"


def load_module():
    spec = importlib.util.spec_from_file_location("validate_idle_pause", SCRIPT)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def write_empty_run_ledger(tmp_path):
    ledger = tmp_path / ".orchestrator" / "runs.md"
    ledger.parent.mkdir()
    ledger.write_text("""# RUN LEDGER

## In-flight

| run-id | item | what | launched | expected-output |
|--------|------|------|----------|-----------------|
<!-- (nothing in flight) -->
""")
    (tmp_path / "DECISION_QUEUE.md").write_text(f"""# DECISION QUEUE

{TIERS_HEADING}

### Tier 0
| Item | Status | Depends on | Scope / next evidence |
|---|---|---|---|
""")
    return ledger


def test_template_pause_requires_dry_frontier_resume_trigger_and_lease_release(tmp_path):
    state = tmp_path / "STATE.md"
    state.write_text("""# STATE
- **Run status:** PAUSED — reason: idle-frontier
- **Orchestrator lease:** release-on-driver-exit
- **In flight:** (none)
- **Next up:** (none — dry after bounded re-enumeration)
- **Resume protocol:** restart-on: human-directive, external-completion
""")

    assert load_module().validate(state, write_empty_run_ledger(tmp_path)) == []


def test_pause_with_in_flight_work_cannot_stop_driver(tmp_path):
    state = tmp_path / "STATE.md"
    state.write_text("""# STATE
- **Run status:** PAUSED — reason: idle-frontier
- **Orchestrator lease:** release-on-driver-exit
- **In flight:** run-17 still executing
- **Next up:** (none — dry)
- **Resume protocol:** restart-on: human-directive
""")

    assert "empty in-flight ledger" in "\n".join(
        load_module().validate(state, write_empty_run_ledger(tmp_path))
    )


def test_fallback_section_format_uses_the_same_pause_contract(tmp_path):
    state = tmp_path / "STATE.md"
    state.write_text("""# STATE
## Run status
PAUSED — reason: idle-frontier
ORCHESTRATOR LEASE: release-on-driver-exit
RESUME PROTOCOL: restart-on: gate-answer, external-completion

## In flight
(none)

## Next up
(none — dry after bounded re-enumeration)
""")

    assert load_module().validate(state, write_empty_run_ledger(tmp_path)) == []


def test_pause_without_external_resume_trigger_is_rejected(tmp_path):
    state = tmp_path / "STATE.md"
    state.write_text("""# STATE
- **Run status:** PAUSED — reason: idle-frontier
- **Orchestrator lease:** released
- **In flight:** (none)
- **Next up:** (none — dry)
- **Resume protocol:** wait and see
""")

    assert "structured external resume trigger" in "\n".join(
        load_module().validate(state, write_empty_run_ledger(tmp_path))
    )


def test_pause_rejects_negated_resume_trigger(tmp_path):
    state = tmp_path / "STATE.md"
    state.write_text("""# STATE
- **Run status:** PAUSED — reason: idle-frontier
- **Orchestrator lease:** released
- **In flight:** (none)
- **Next up:** (none — dry)
- **Resume protocol:** do not restart after any human directive.
""")

    assert "structured external resume trigger" in "\n".join(
        load_module().validate(state, write_empty_run_ledger(tmp_path))
    )


def test_pause_rejects_negative_synonym_in_resume_prose(tmp_path):
    state = tmp_path / "STATE.md"
    state.write_text("""# STATE
- **Run status:** PAUSED — reason: idle-frontier
- **Orchestrator lease:** released
- **In flight:** (none)
- **Next up:** (none — dry)
- **Resume protocol:** restart after refusing every human directive.
""")

    assert "structured external resume trigger" in "\n".join(
        load_module().validate(state, write_empty_run_ledger(tmp_path))
    )


@pytest.mark.parametrize(
    "resume",
    (
        "restart-on: human-directive, human-directive",
        "restart-on: human-directive, timer-expiry",
        "restart-on: human-directive after checking state",
        "restart-on: human-directive.",
    ),
)
def test_pause_rejects_noncanonical_structured_resume_values(tmp_path, resume):
    state = tmp_path / "STATE.md"
    state.write_text(f"""# STATE
- **Run status:** PAUSED — reason: idle-frontier
- **Orchestrator lease:** released
- **In flight:** (none)
- **Next up:** (none — dry)
- **Resume protocol:** {resume}
""")

    assert "structured external resume trigger" in "\n".join(
        load_module().validate(state, write_empty_run_ledger(tmp_path))
    )


def test_pause_rejects_negated_release_and_dry_sentinels(tmp_path):
    state = tmp_path / "STATE.md"
    state.write_text("""# STATE
- **Run status:** PAUSED — reason: idle-frontier
- **Orchestrator lease:** not released
- **In flight:** (none)
- **Next up:** not dry: task-17 remains
- **Resume protocol:** restart-on: human-directive
""")

    errors = "\n".join(load_module().validate(state, write_empty_run_ledger(tmp_path)))
    assert "lease release-on-driver-exit or released" in errors
    assert "empty dry next-up frontier" in errors


def test_pause_rejects_negated_status(tmp_path):
    state = tmp_path / "STATE.md"
    state.write_text("""# STATE
- **Run status:** NOT PAUSED — reason: idle-frontier
- **Orchestrator lease:** release-on-driver-exit
- **In flight:** (none)
- **Next up:** (none — dry after bounded re-enumeration)
- **Resume protocol:** restart-on: human-directive
""")

    assert "run status must be exactly PAUSED" in "\n".join(
        load_module().validate(state, write_empty_run_ledger(tmp_path))
    )


def test_pause_rejects_live_rows_in_canonical_run_ledger(tmp_path):
    state = tmp_path / "STATE.md"
    state.write_text("""# STATE
- **Run status:** PAUSED — reason: idle-frontier
- **Orchestrator lease:** release-on-driver-exit
- **In flight:** (none)
- **Next up:** (none — dry after bounded re-enumeration)
- **Resume protocol:** restart-on: human-directive
""")
    ledger = write_empty_run_ledger(tmp_path)
    ledger.write_text(ledger.read_text().replace(
        "<!-- (nothing in flight) -->",
        "| run-17 | task-17 | review | now | output/review.md |",
    ))

    assert "canonical run ledger still has in-flight work" in "\n".join(
        load_module().validate(state, ledger)
    )


def test_pause_rejects_selectable_decision_queue_work(tmp_path):
    state = tmp_path / "STATE.md"
    state.write_text("""# STATE
- **Run status:** PAUSED — reason: idle-frontier
- **Orchestrator lease:** release-on-driver-exit
- **In flight:** (none)
- **Next up:** (none — dry after bounded re-enumeration)
- **Resume protocol:** restart-on: human-directive
""")
    ledger = write_empty_run_ledger(tmp_path)
    (tmp_path / "DECISION_QUEUE.md").write_text(f"""# DECISION QUEUE

{TIERS_HEADING}

### Tier 0
| Item | Status | Depends on | Scope / next evidence |
|---|---|---|---|
| W001 | UNRESOLVED | none | Select the next implementation slice. |
""")

    assert "decision queue still has selectable work" in "\n".join(
        load_module().validate(state, ledger)
    )


def test_pause_rejects_unparseable_nonempty_decision_queue_tiers(tmp_path):
    state = tmp_path / "STATE.md"
    state.write_text("""# STATE
- **Run status:** PAUSED — reason: idle-frontier
- **Orchestrator lease:** release-on-driver-exit
- **In flight:** (none)
- **Next up:** (none — dry after bounded re-enumeration)
- **Resume protocol:** restart-on: human-directive
""")
    ledger = write_empty_run_ledger(tmp_path)
    (tmp_path / "DECISION_QUEUE.md").write_text(f"""# DECISION QUEUE

{TIERS_HEADING}

- W001 — UNRESOLVED — selectable now
""")

    assert "unparseable tier content" in "\n".join(
        load_module().validate(state, ledger)
    )


@pytest.mark.parametrize(
    "tier_content",
    (
        "| W001 | DEFERRED | none | no header |",
        "| Item | Status | Depends on | Scope / next evidence |\n"
        "| W001 | DEFERRED | none | no separator |",
        "| Item | Status | Depends on |\n|---|---|---|",
    ),
)
def test_pause_rejects_malformed_decision_queue_tables(tmp_path, tier_content):
    state = tmp_path / "STATE.md"
    state.write_text("""# STATE
- **Run status:** PAUSED — reason: idle-frontier
- **Orchestrator lease:** release-on-driver-exit
- **In flight:** (none)
- **Next up:** (none — dry after bounded re-enumeration)
- **Resume protocol:** restart-on: human-directive
""")
    ledger = write_empty_run_ledger(tmp_path)
    (tmp_path / "DECISION_QUEUE.md").write_text(
        f"# DECISION QUEUE\n\n{TIERS_HEADING}\n\n### Tier 0\n" + tier_content + "\n"
    )

    assert "unparseable tier content" in "\n".join(
        load_module().validate(state, ledger)
    )


def test_pause_accepts_closed_queue_rows_with_escaped_pipes(tmp_path):
    state = tmp_path / "STATE.md"
    state.write_text("""# STATE
- **Run status:** PAUSED — reason: idle-frontier
- **Orchestrator lease:** release-on-driver-exit
- **In flight:** (none)
- **Next up:** (none — dry after bounded re-enumeration)
- **Resume protocol:** restart-on: material-change, explicit-restart
""")
    ledger = write_empty_run_ledger(tmp_path)
    (tmp_path / "DECISION_QUEUE.md").write_text(fr"""# DECISION QUEUE

{TIERS_HEADING}

### Tier 0
| Item | Status | Depends on | Scope / next evidence |
|---|---|---|---|
| W001 | DEFERRED | none | Retained A \| B evidence. |
""")

    assert load_module().validate(state, ledger) == []


@pytest.mark.parametrize(
    "tiers",
    (
        "## Tiersgarbage\n\n### Tier 0\n"
        "| Item | Status | Depends on | Scope / next evidence |\n"
        "|---|---|---|---|",
        f"{TIERS_HEADING}\n",
        f"{TIERS_HEADING}\n\n### Tier 0\n(none yet)",
        f"{TIERS_HEADING}\n\n### Tier 0\n"
        "| Item | Status | Depends on | Scope / next evidence |\n"
        "|---|---|---|---|\n\n"
        f"{TIERS_HEADING}\n\n### Tier 1\n"
        "| Item | Status | Depends on | Scope / next evidence |\n"
        "|---|---|---|---|\n"
        "| W002 | UNRESOLVED | none | hidden by duplicate section |",
        f"{TIERS_HEADING}\n\n### Tier 0\n"
        "| Item | Status | Depends on | Scope / next evidence |\n"
        "|---|---|---|---|\n\n"
        "## tiers (dependency-ordered; tier-0 = foundational one-way-doors)\n\n"
        "### Tier 1\n"
        "| Item | Status | Depends on | Scope / next evidence |\n"
        "|---|---|---|---|\n"
        "| W002 | UNRESOLVED | none | hidden by lowercase heading |",
        f"{TIERS_HEADING}\n\n### Tier 0\n"
        "| Item | Status | Depends on | Scope / next evidence |\n"
        "|---|---|---|---|\n\n"
        "##  Tiers (dependency-ordered; tier-0 = foundational one-way-doors)\n\n"
        "### Tier 1\n"
        "| Item | Status | Depends on | Scope / next evidence |\n"
        "|---|---|---|---|\n"
        "| W002 | UNRESOLVED | none | hidden by doubled spacing |",
    ),
)
def test_pause_rejects_noncanonical_tiers_envelopes(tmp_path, tiers):
    state = tmp_path / "STATE.md"
    state.write_text("""# STATE
- **Run status:** PAUSED — reason: idle-frontier
- **Orchestrator lease:** released
- **In flight:** (none)
- **Next up:** (none — dry)
- **Resume protocol:** restart-on: human-directive
""")
    ledger = write_empty_run_ledger(tmp_path)
    (tmp_path / "DECISION_QUEUE.md").write_text(f"# DECISION QUEUE\n\n{tiers}\n")

    assert "canonical decision queue" in "\n".join(
        load_module().validate(state, ledger)
    )


def test_pause_treats_undocumented_verified_status_as_selectable(tmp_path):
    state = tmp_path / "STATE.md"
    state.write_text("""# STATE
- **Run status:** PAUSED — reason: idle-frontier
- **Orchestrator lease:** released
- **In flight:** (none)
- **Next up:** (none — dry)
- **Resume protocol:** restart-on: human-directive
""")
    ledger = write_empty_run_ledger(tmp_path)
    queue = tmp_path / "DECISION_QUEUE.md"
    queue.write_text(queue.read_text().replace(
        "|---|---|---|---|",
        "|---|---|---|---|\n| W001 | VERIFIED | none | undocumented state |",
    ))

    assert "decision queue still has selectable work" in "\n".join(
        load_module().validate(state, ledger)
    )


def test_pause_requires_the_canonical_decision_queue(tmp_path):
    state = tmp_path / "STATE.md"
    state.write_text("""# STATE
- **Run status:** PAUSED — reason: idle-frontier
- **Orchestrator lease:** release-on-driver-exit
- **In flight:** (none)
- **Next up:** (none — dry after bounded re-enumeration)
- **Resume protocol:** restart-on: human-directive
""")
    ledger = write_empty_run_ledger(tmp_path)
    (tmp_path / "DECISION_QUEUE.md").unlink()

    assert "cannot read canonical decision queue" in "\n".join(
        load_module().validate(state, ledger)
    )


def test_pause_requires_the_canonical_run_ledger(tmp_path):
    state = tmp_path / "STATE.md"
    state.write_text("""# STATE
- **Run status:** PAUSED — reason: idle-frontier
- **Orchestrator lease:** release-on-driver-exit
- **In flight:** (none)
- **Next up:** (none — dry after bounded re-enumeration)
- **Resume protocol:** restart-on: human-directive
""")

    assert "cannot read canonical run ledger" in "\n".join(load_module().validate(state))
