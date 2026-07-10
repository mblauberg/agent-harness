import importlib.util
import json
from pathlib import Path
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[1]
INIT = ROOT / "skills" / "orchestrate" / "scripts" / "run_dir_init.sh"
SCRIPT = ROOT / "skills" / "orchestrate" / "scripts" / "run_dir_finalize.py"
SPEC = importlib.util.spec_from_file_location("run_dir_finalize", SCRIPT)
run_dir_finalize = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
sys.modules[SPEC.name] = run_dir_finalize
SPEC.loader.exec_module(run_dir_finalize)


def init_run(tmp_path):
    run = tmp_path / "run"
    result = subprocess.run([str(INIT), str(run)], text=True, capture_output=True)
    assert result.returncode == 0, result.stderr
    return run


def add_manifest_row(run, row):
    with (run / "MANIFEST.md").open("a") as handle:
        handle.write(row + "\n")


def test_failed_terminalisation_requires_reason(tmp_path):
    run = init_run(tmp_path)
    assert run_dir_finalize.main([str(run), "--status", "failed"]) == 1
    assert run_dir_finalize.main([str(run), "--status", "failed", "--reason", "reviewer timeout"]) == 0


def test_failed_terminalisation_preserves_unmanifested_crash_partial(tmp_path):
    run = init_run(tmp_path)
    partial = run / "findings" / "partial-scan.md"
    partial.write_text("worker crashed mid-write")
    assert run_dir_finalize.main([str(run), "--status", "failed", "--reason", "worker crashed"]) == 0
    assert partial.exists()
    receipt = json.loads((run / "RUN_RECEIPT.json").read_text())
    assert receipt["unclassified_paths"] == ["findings/partial-scan.md"]


def test_success_requires_closed_final_gate(tmp_path):
    run = init_run(tmp_path)
    assert run_dir_finalize.main([str(run), "--status", "succeeded"]) == 1


def test_pruning_is_dry_run_then_removes_only_classified_ephemeral(tmp_path):
    run = init_run(tmp_path)
    raw = run / "findings" / "raw.txt"
    raw.write_text("duplicate payload")
    add_manifest_row(run, "| A1 | findings/raw.txt | retry noise | worker | 2026-07-10 | retired | ephemeral | - |")
    args = [str(run), "--status", "failed", "--reason", "bounded failure", "--prune-ephemeral"]
    assert run_dir_finalize.main(args) == 0
    assert raw.exists()
    assert run_dir_finalize.main(args + ["--apply"]) == 0
    assert not raw.exists()


def test_manifest_rejects_parent_path(tmp_path):
    run = init_run(tmp_path)
    add_manifest_row(run, "| A1 | ../outside.txt | escape | worker | 2026-07-10 | verified | evidence | - |")
    errors, _ = run_dir_finalize.validate(run, "failed", "bad manifest")
    assert any("path escapes run directory" in error for error in errors)


def test_terminalisation_requires_owned_panes_to_be_closed_or_handed_off(tmp_path):
    run = init_run(tmp_path)
    receipt = run / "RUN_RECEIPT.json"
    data = json.loads(receipt.read_text())
    data["owned_panes"] = [{"pane_id": "w1:p2", "role": "review"}]
    receipt.write_text(json.dumps(data))
    errors, _ = run_dir_finalize.validate(run, "failed", "cancelled")
    assert any("run-owned panes/resources" in error for error in errors)


def test_handed_off_panes_require_typed_acknowledged_evidence(tmp_path):
    run = init_run(tmp_path)
    receipt = run / "RUN_RECEIPT.json"
    data = json.loads(receipt.read_text())
    data["handed_off_panes"] = ["not-a-handoff"]
    receipt.write_text(json.dumps(data))
    errors, _ = run_dir_finalize.validate(run, "failed", "handoff")
    assert any("structured handoff record" in error for error in errors)


def test_paired_receipt_must_preserve_compaction_and_lease_state(tmp_path):
    run = init_run(tmp_path)
    receipt = run / "RUN_RECEIPT.json"
    data = json.loads(receipt.read_text())
    assignment = run / "decisions.md"
    assignment_digest = __import__("hashlib").sha256(assignment.read_bytes()).hexdigest()
    def stage_evidence(stage):
        values = {}
        for kind in ("assignment", "acknowledgement", "output"):
            path = run / "findings" / f"{stage}-{kind}.md"
            path.write_text(f"{stage}-{kind}")
            values[f"{kind}_path"] = path.relative_to(run).as_posix()
            values[f"{kind}_sha256"] = __import__("hashlib").sha256(path.read_bytes()).hexdigest()
        return values
    (run / "LEASE.json").write_text(json.dumps({
        "schema_version": 1, "status": "released", "holder": "", "previous_holder": "openai-session-1",
        "generation": 2, "updated_at": "2026-07-10T00:00:00Z", "expires_at": "",
    }))
    data["pair"] = {
        "mode": "paired-primary", "chair_family": "openai", "chair_id": "openai-session-1",
        "peer_family": "anthropic", "peer_id": "anthropic-session-1",
        "status": "complete", "degradation_reason": "", "lease_path": "LEASE.json",
        "lease_generation": 2, "checkpoint_generation": 2,
        "current_stage": "implementation", "in_flight": [],
        "assignment_artifacts": [{"path": "decisions.md", "sha256": assignment_digest}],
        "stage_ledger": [
            {"stage": "scope", "owner_family": "openai", "peer_family": "anthropic", "generation": 1,
             "status": "complete", "acknowledged": True, "base_revision": "a", "result_revision": "b",
             "checks": [{"command": "spec-check", "exit_code": 0}], "human_gates": ["spec"], **stage_evidence("scope")},
            {"stage": "implementation", "owner_family": "anthropic", "peer_family": "openai", "generation": 2,
             "status": "complete", "acknowledged": True, "base_revision": "b", "result_revision": "c",
             "checks": [{"command": "pytest", "exit_code": 0}], "human_gates": [], **stage_evidence("implementation")},
        ],
        "handoff_generation": 0,
    }
    receipt.write_text(json.dumps(data))
    errors, _ = run_dir_finalize.validate(run, "failed", "demo")
    assert errors == []
    data["pair"]["in_flight"] = ["worker"]
    receipt.write_text(json.dumps(data))
    errors, _ = run_dir_finalize.validate(run, "failed", "demo")
    assert any("empty in_flight" in error for error in errors)


def test_successful_terminalisation_closes_a_complete_run(tmp_path):
    run = init_run(tmp_path)
    receipt = run / "RUN_RECEIPT.json"
    data = json.loads(receipt.read_text())
    data["task"] = "context hygiene test"
    receipt.write_text(json.dumps(data))
    (run / "SYNTHESIS.md").write_text("Verified synthesis\n")
    gate = run / "FINAL_GATE.md"
    rewritten = []
    for line in gate.read_text().splitlines():
        if line.startswith("|") and not line.startswith(("| gate", "|---")):
            cells = [cell.strip() for cell in line.strip("|").split("|")]
            cells[1] = "PASS"
            cells[2] = "verified"
            line = "| " + " | ".join(cells) + " |"
        rewritten.append(line)
    gate.write_text("\n".join(rewritten) + "\n")
    assert run_dir_finalize.main([str(run), "--status", "succeeded"]) == 0
    assert json.loads(receipt.read_text())["status"] == "succeeded"


def test_success_rejects_incomplete_gate_schema(tmp_path):
    run = init_run(tmp_path)
    receipt = run / "RUN_RECEIPT.json"
    data = json.loads(receipt.read_text())
    data["task"] = "incomplete gate"
    receipt.write_text(json.dumps(data))
    (run / "SYNTHESIS.md").write_text("done")
    (run / "FINAL_GATE.md").write_text("| gate | status | evidence |\n|---|---|---|\n| arbitrary | PASS | none |\n")
    errors, _ = run_dir_finalize.validate(run, "succeeded", None)
    assert any("missing gates" in error for error in errors)


def test_prune_preserves_ephemeral_file_referenced_by_retained_evidence(tmp_path):
    run = init_run(tmp_path)
    summary = run / "findings" / "summary.md"
    raw = run / "findings" / "raw.txt"
    summary.write_text("Evidence: findings/raw.txt")
    raw.write_text("raw")
    add_manifest_row(run, "| S1 | findings/summary.md | summary | worker | 2026-07-10 | verified | evidence | - |")
    add_manifest_row(run, "| R1 | findings/raw.txt | raw | worker | 2026-07-10 | retired | ephemeral | - |")
    errors, rows = run_dir_finalize.validate(run, "failed", "demo")
    assert errors == []
    assert run_dir_finalize.prune_candidates(run, rows) == []


def test_prune_preserves_relative_markdown_link_from_retained_evidence(tmp_path):
    run = init_run(tmp_path)
    summary = run / "findings" / "summary.md"
    raw = run / "findings" / "raw.txt"
    summary.write_text("[raw evidence](raw.txt)")
    raw.write_text("raw")
    add_manifest_row(run, "| S1 | findings/summary.md | summary | worker | 2026-07-10 | verified | evidence | - |")
    add_manifest_row(run, "| R1 | findings/raw.txt | raw | worker | 2026-07-10 | retired | ephemeral | - |")
    errors, rows = run_dir_finalize.validate(run, "failed", "demo")
    assert errors == []
    assert run_dir_finalize.prune_candidates(run, rows) == []


def test_duplicate_manifest_path_cannot_downgrade_retained_evidence(tmp_path):
    run = init_run(tmp_path)
    report = run / "findings" / "report.md"
    report.write_text("verified evidence")
    add_manifest_row(run, "| A1 | findings/report.md | report | reviewer | 2026-07-10 | verified | capsule | - |")
    add_manifest_row(run, "| A2 | findings/report.md | alias | worker | 2026-07-10 | superseded | ephemeral | - |")
    errors, rows = run_dir_finalize.validate(run, "failed", "demo")
    assert any("duplicate manifest path" in error for error in errors)
    assert run_dir_finalize.prune_candidates(run, rows) == []
    assert report.exists()


def test_receipt_schema_is_validated(tmp_path):
    run = init_run(tmp_path)
    (run / "RUN_RECEIPT.json").write_text("[]")
    errors, _ = run_dir_finalize.validate(run, "failed", "bad")
    assert "root must be an object" in errors[0]


def test_receipt_path_lists_reject_non_strings(tmp_path):
    run = init_run(tmp_path)
    receipt = run / "RUN_RECEIPT.json"
    data = json.loads(receipt.read_text())
    data["pruned_paths"] = [{}]
    receipt.write_text(json.dumps(data))
    errors, _ = run_dir_finalize.validate(run, "failed", "bad")
    assert "receipt pruned_paths entries must be strings" in errors
