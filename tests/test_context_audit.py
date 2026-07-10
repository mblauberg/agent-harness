import importlib.util
from datetime import datetime, timezone
from pathlib import Path
import hashlib
import sys


SCRIPT = Path(__file__).resolve().parents[1] / "skills" / "session" / "scripts" / "context_audit.py"
SPEC = importlib.util.spec_from_file_location("context_audit", SCRIPT)
context_audit = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
sys.modules[SPEC.name] = context_audit
SPEC.loader.exec_module(context_audit)


def codes(findings):
    return {item.code for item in findings}


def test_audit_reports_context_growth_without_deleting(tmp_path):
    docs = tmp_path / "docs"
    handoffs = docs / "handoffs"
    handoffs.mkdir(parents=True)
    (docs / "STATE.md").write_text("# State\n" + "x\n" * 121)
    (docs / "large.md").write_text("x" * 16000)
    scratch = tmp_path / ".temp-review.txt"
    scratch.write_text("keep me")
    backup = tmp_path / "SKILL.md.bak-2026-07-10"
    backup.write_text("backup")
    handoff = handoffs / "HANDOFF-old.md"
    handoff.write_text("old")
    handoff.touch()
    findings = context_audit.audit(
        tmp_path,
        now=datetime(2030, 1, 1, tzinfo=timezone.utc),
    )
    assert {"large-agent-doc", "root-scratch", "state-over-cap", "state-freshness-missing", "stale-live-handoff"} <= codes(findings)
    assert scratch.read_text() == "keep me"
    assert any(item.code == "root-scratch" and item.path == backup.name for item in findings)


def test_audit_reports_incomplete_run_index(tmp_path):
    run = tmp_path / ".agent-run" / "one"
    run.mkdir(parents=True)
    (run / "MANIFEST.md").write_text("manifest")
    findings = context_audit.audit(tmp_path)
    assert "incomplete-run-index" in codes(findings)


def test_audit_reports_incomplete_claude_workflow_run(tmp_path):
    run = tmp_path / ".work" / "wf" / "change" / "one"
    run.mkdir(parents=True)
    (run / "MANIFEST.md").write_text("manifest")
    findings = context_audit.audit(tmp_path)
    assert "incomplete-run-index" in codes(findings)


def test_change_workflow_run_requires_change_receipt(tmp_path):
    run = tmp_path / ".work" / "wf" / "change" / "one"
    run.mkdir(parents=True)
    for name in ("MANIFEST.md", "RUN_RECEIPT.json", "SYNTHESIS.md", "FINAL_GATE.md"):
        (run / name).write_text(name)
    findings = context_audit.audit(tmp_path)
    assert any(item.code == "incomplete-run-index" and "RUN.json" in item.detail for item in findings)


def test_cli_is_advisory_unless_strict(tmp_path):
    (tmp_path / "scratch.tmp").write_text("x")
    assert context_audit.main([str(tmp_path)]) == 0
    assert context_audit.main([str(tmp_path), "--strict"]) == 0
    assert context_audit.main([str(tmp_path), "--warnings-as-errors"]) == 1


def test_structural_errors_fail_without_an_extra_flag(tmp_path):
    (tmp_path / ".agent-run" / "broken").mkdir(parents=True)
    assert context_audit.main([str(tmp_path)]) == 1


def test_state_freshness_rejects_template_placeholder_and_accepts_utc(tmp_path):
    state = tmp_path / "STATE.md"
    template = Path(__file__).resolve().parents[1] / "skills" / "autonomous-lab" / "templates" / "STATE.template.md"
    state.write_text(template.read_text())
    findings = context_audit.audit(tmp_path)
    assert "state-freshness-missing" in codes(findings)
    state.write_text(template.read_text().replace("<YYYY-MM-DDTHH:MM:SSZ>", "2026-07-10T12:00:00Z"))
    assert "state-freshness-missing" not in codes(context_audit.audit(tmp_path))
    state.write_text(template.read_text().replace("<YYYY-MM-DDTHH:MM:SSZ>", "2026-07-10"))
    assert "state-freshness-missing" in codes(context_audit.audit(tmp_path))


def test_duplicate_active_handoffs_are_structural_errors(tmp_path):
    handoffs = tmp_path / "docs" / "handoffs"
    handoffs.mkdir(parents=True)
    body = "Status: active\nEffort: E1\nLeg: L2\nSupersedes: none\nConsumed-at: pending\n"
    (handoffs / "HANDOFF-one.md").write_text(body)
    (handoffs / "HANDOFF-two.md").write_text(body)
    findings = context_audit.audit(tmp_path)
    assert "duplicate-active-handoff" in codes(findings)


def test_partial_handoff_metadata_is_an_error(tmp_path):
    handoffs = tmp_path / "docs" / "handoffs"
    handoffs.mkdir(parents=True)
    (handoffs / "HANDOFF-partial.md").write_text("Status: active\n")
    findings = context_audit.audit(tmp_path)
    assert "handoff-metadata-missing" in codes(findings)


def test_audit_is_byte_read_only(tmp_path):
    (tmp_path / "scratch.tmp").write_text("payload")
    before = {
        path.relative_to(tmp_path).as_posix(): hashlib.sha256(path.read_bytes()).hexdigest()
        for path in tmp_path.rglob("*")
        if path.is_file()
    }
    context_audit.audit(tmp_path)
    after = {
        path.relative_to(tmp_path).as_posix(): hashlib.sha256(path.read_bytes()).hexdigest()
        for path in tmp_path.rglob("*")
        if path.is_file()
    }
    assert after == before


def test_audit_does_not_traverse_shared_worktree_checkouts(tmp_path):
    worktree = tmp_path / ".worktrees" / "peer"
    handoffs = worktree / "docs" / "handoffs"
    handoffs.mkdir(parents=True)
    (worktree / "AGENTS.md").write_text("x" * 20000)
    (worktree / "STATE.md").write_text("# stale\n" + "x\n" * 200)
    (handoffs / "HANDOFF-old.md").write_text("old")

    assert context_audit.audit(
        tmp_path, now=datetime(2030, 1, 1, tzinfo=timezone.utc),
    ) == []
