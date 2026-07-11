import importlib.util
import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "skills" / "release" / "scripts" / "validate_release.py"
SPEC = importlib.util.spec_from_file_location("validate_release", MODULE_PATH)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)

CHANGE_REVISION = "sha256:" + "a" * 64


def valid_receipt(status="awaiting-promotion"):
    receipt = {
        "schema_version": 1,
        "release_id": "REL-1",
        "updated_at": "2026-07-10T04:00:00Z" if status == "awaiting-promotion" else "2026-07-11T04:04:00Z",
        "status": status,
        "target": "production",
        "artifact": {"id": "sha256:a", "source_revision": CHANGE_REVISION, "change_receipt": "RUN.json"},
        "owner": "release-owner",
        "release_authority": {
            "approved_by": "human",
            "expires_at": "2026-07-12T04:00:00Z",
            "targets": ["production"],
            "artifact_ids": ["sha256:a"],
            "allowed_command_prefixes": ["deploy", "health", "rollback", "test"],
            "secrets_access": "none",
            "external_communication": False,
            "irreversible_migration": False,
        },
        "readiness_checks": [{"command": "test", "exit_code": 0}],
        "migration": {
            "required": False, "type": "none", "plan": "", "order": "",
            "backward_compatible": True, "compatibility_window": "",
            "recovery_point": "", "approved_by": "",
        },
        "rollout": {"plan": "canary", "blast_radius_cap": "5%", "stop_conditions": ["errors > 1%"]},
        "rollback": {"tested": True, "plan": "revert", "owner": "release-owner", "time_bound": "10m"},
        "observability": {
            "baseline": "normal",
            "window": "24h",
            "window_started_at": "2026-07-10T04:03:00Z",
            "window_ended_at": "2026-07-11T04:03:00Z",
            "signals": ["error-rate"],
            "owner": "release-owner",
            "rollback_or_containment": "rollback plan",
            "sampling_and_privacy": "aggregate-redacted",
            "close_condition": "all thresholds pass for 24h",
            "success_thresholds": [{"id": "error-rate", "direction": "lte", "limit": 0.01, "unit": "ratio"}],
            "checks": [],
        },
        "human_promotion": {"status": "pending", "approved_by": "", "approved_at": ""},
        "execution": {"commands": [], "started_at": "", "finished_at": ""},
        "outcome": {"status": "pending", "evidence": [], "follow_up_owner": ""},
    }
    return receipt


def validate_policy(receipt, gate):
    """Exercise legacy receipt policy without certifying the live artifact."""
    return MODULE.validate(receipt, gate, structural_only=True)


def write_delivery(tmp_path, status="awaiting_release"):
    reference_path = ROOT / "skills" / "deliver" / "scripts" / "reference_runs.py"
    spec = importlib.util.spec_from_file_location("delivery_reference_fixture", reference_path)
    assert spec and spec.loader
    reference = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(reference)
    change = reference.make_reference_run("software", ROOT)
    intent_bytes = b"approved intent\n"
    evidence_bytes = b"bound evidence\n"
    (tmp_path / "intent.md").write_bytes(intent_bytes)
    (tmp_path / "evidence.json").write_bytes(evidence_bytes)
    intent_digest = "sha256:" + hashlib.sha256(intent_bytes).hexdigest()
    evidence_digest = "sha256:" + hashlib.sha256(evidence_bytes).hexdigest()
    change["artifacts"][0]["digest"] = intent_digest
    change["artifacts"][1]["digest"] = evidence_digest
    change["intent"]["digest"] = intent_digest
    change["design"]["digest"] = intent_digest
    change["human_gates"]["acceptance"] = {"status": "approved", "approver": "human", "evidence": "acceptance-approval"}
    change["state_history"].extend([
        {"state": "accepted", "at": "2026-07-10T00:09:00Z", "evidence_ids": ["acceptance-approval"]},
        {"state": "awaiting_release", "at": "2026-07-10T00:10:00Z", "evidence_ids": ["acceptance-approval"]},
    ])
    if status == "observing":
        change["human_gates"]["release"] = {"status": "approved", "approver": "human", "evidence": "release-approval"}
        change["state_history"].append({"state": "observing", "at": "2026-07-10T00:11:00Z", "evidence_ids": ["release-approval"]})
        change["observation"]["status"] = "active"
    checkpoint_slice = {"awaiting_release": "awaiting-release", "observing": "observing"}[status]
    change["checkpoint"].update({"current_slice": checkpoint_slice, "next_action": "observe release" if status == "observing" else "await release authority", "in_flight": []})
    change["status"] = status
    (tmp_path / "RUN.json").write_text(json.dumps(change))
    return change


def test_ready_gate_passes_with_scoped_release_authority():
    assert validate_policy(valid_receipt(), "ready") == []


def test_ready_gate_requires_rollback_and_stop_conditions():
    receipt = valid_receipt()
    receipt["rollback"]["plan"] = ""
    receipt["rollout"]["stop_conditions"] = []
    errors = validate_policy(receipt, "ready")
    assert "rollback.plan is required" in errors
    assert "rollout.stop_conditions must not be empty" in errors


def test_ready_gate_requires_complete_observation_contract():
    receipt = valid_receipt()
    for field in ("window", "signals", "owner", "rollback_or_containment", "sampling_and_privacy", "close_condition"):
        candidate = valid_receipt()
        candidate["observability"][field] = [] if field == "signals" else ""
        assert f"observability.{field} is required" in validate_policy(candidate, "ready")


def test_boolean_exit_code_is_not_zero():
    receipt = valid_receipt()
    receipt["readiness_checks"][0]["exit_code"] = False
    assert "readiness_checks[0] must record command and exit_code 0" in validate_policy(receipt, "ready")


def test_complete_gate_requires_human_approval_and_observed_health():
    receipt = valid_receipt("complete")
    errors = validate_policy(receipt, "complete")
    assert "human_promotion must be approved by a named human" in errors
    assert "observability.checks must not be empty" in errors


def test_complete_and_rollback_receipts_are_explicit():
    receipt = valid_receipt("complete")
    receipt["human_promotion"] = {
        "status": "approved", "approved_by": "human", "approved_at": "2026-07-10T04:01:00Z"
    }
    receipt["execution"] = {
        "commands": [{"command": "deploy", "exit_code": 0}],
        "started_at": "2026-07-10T04:02:00Z",
        "finished_at": "2026-07-10T04:03:00Z",
    }
    receipt["observability"]["checks"] = [{"command": "health", "exit_code": 0, "threshold_id": "error-rate", "measured_value": 0.005, "evidence": ["dashboard"], "observed_at": "2026-07-11T04:03:00Z"}]
    receipt["outcome"] = {"status": "complete", "evidence": ["health pass"], "follow_up_owner": ""}
    assert validate_policy(receipt, "complete") == []
    receipt["observability"]["window_ended_at"] = "2026-07-10T04:04:00Z"
    assert "observability window is shorter than declared" in validate_policy(receipt, "complete")
    receipt["observability"]["window_ended_at"] = "2026-07-11T04:03:00Z"
    receipt["status"] = receipt["outcome"]["status"] = "rolled-back"
    assert "non-success terminal outcome requires follow_up_owner" in validate_policy(receipt, "complete")
    receipt["outcome"]["follow_up_owner"] = "team"
    receipt["execution"]["commands"][0]["exit_code"] = 1
    receipt["observability"]["checks"][0]["exit_code"] = 1
    receipt["rollback_execution"] = {
        "commands": [{"command": "rollback", "exit_code": 0}],
        "restoration_checks": [{"command": "health", "exit_code": 0}],
        "started_at": "2026-07-10T04:04:00Z", "finished_at": "2026-07-10T04:05:00Z",
    }
    assert validate_policy(receipt, "complete") == []


def test_cli_ready_gate_requires_an_accepted_change_receipt(tmp_path):
    value = valid_receipt()
    value["artifact"]["change_receipt"] = "RUN.json"
    release_path = tmp_path / "RELEASE.json"
    release_path.write_text(json.dumps(value))
    assert MODULE.main(["--gate", "ready", str(release_path)]) == 1
    change = write_delivery(tmp_path)
    value["artifact"] = {"id": "intent", "source_revision": change["artifacts"][0]["digest"], "change_receipt": "RUN.json"}
    value["release_authority"]["artifact_ids"] = ["intent"]
    release_path.write_text(json.dumps(value))
    assert MODULE.main(["--gate", "ready", "--workspace-root", str(tmp_path), str(release_path)]) == 0


def test_release_artifact_must_match_accepted_change_revision(tmp_path):
    value = valid_receipt()
    value["artifact"]["source_revision"] = "unrelated"
    write_delivery(tmp_path)
    errors = MODULE.validate(value, "ready", tmp_path)
    assert "artifact.source_revision must match the accepted delivery artifact digest" in errors


def test_release_accepts_canonical_delivery_receipt_and_live_hashes(tmp_path):
    change = write_delivery(tmp_path)
    receipt = valid_receipt()
    receipt["artifact"] = {
        "id": "intent",
        "source_revision": change["artifacts"][0]["digest"],
        "change_receipt": "RUN.json",
    }
    receipt["release_authority"]["artifact_ids"] = ["intent"]
    assert MODULE.validate(receipt, "ready", tmp_path) == []

    (tmp_path / "intent.md").write_text("tampered\n")
    assert "artifact.change_receipt must be a valid neutral delivery receipt" in MODULE.validate(receipt, "ready", tmp_path)


def test_terminal_release_requires_canonical_observing_state_and_release_gate(tmp_path):
    change = write_delivery(tmp_path, status="awaiting_release")
    receipt = valid_receipt("complete")
    receipt["artifact"] = {"id": "intent", "source_revision": change["artifacts"][0]["digest"], "change_receipt": "RUN.json"}
    receipt["release_authority"]["artifact_ids"] = ["intent"]
    assert "terminal release requires canonical observing state and approved release gate" in MODULE.validate(receipt, "complete", tmp_path)
    change = write_delivery(tmp_path, status="observing")
    receipt["artifact"]["source_revision"] = change["artifacts"][0]["digest"]
    assert "terminal release requires canonical observing state and approved release gate" not in MODULE.validate(receipt, "complete", tmp_path)


def test_terminal_release_rejects_planned_canonical_observation(tmp_path):
    change = write_delivery(tmp_path, status="observing")
    change["observation"]["status"] = "planned"
    (tmp_path / "RUN.json").write_text(json.dumps(change))
    receipt = valid_receipt("complete")
    receipt["artifact"] = {"id": "intent", "source_revision": change["artifacts"][0]["digest"], "change_receipt": "RUN.json"}
    receipt["release_authority"]["artifact_ids"] = ["intent"]
    errors = MODULE.validate(receipt, "complete", tmp_path)
    assert "terminal release requires active or passing canonical observation" in errors


def test_release_command_scope_and_ordering_are_enforced():
    receipt = valid_receipt("complete")
    receipt["human_promotion"] = {
        "status": "approved", "approved_by": "human", "approved_at": "2026-07-10T04:03:00Z"
    }
    receipt["execution"] = {
        "commands": [{"command": "kubectl delete namespace prod", "exit_code": 0}],
        "started_at": "2026-07-10T04:02:00Z", "finished_at": "2026-07-10T04:01:00Z",
    }
    receipt["observability"]["checks"] = [{"command": "health", "exit_code": 0, "threshold_id": "error-rate", "measured_value": 0.005, "evidence": ["dashboard"], "observed_at": "2026-07-11T04:03:00Z"}]
    receipt["outcome"] = {"status": "complete", "evidence": ["health pass"], "follow_up_owner": ""}
    errors = validate_policy(receipt, "complete")
    assert "execution.commands[0] is outside release authority" in errors
    assert "release execution cannot start before promotion approval" in errors
    assert "release execution cannot finish before it starts" in errors


def test_release_command_prefixes_are_token_bound_and_shell_free():
    receipt = valid_receipt("complete")
    receipt["human_promotion"] = {
        "status": "approved", "approved_by": "human", "approved_at": "2026-07-10T04:01:00Z"
    }
    receipt["execution"] = {
        "commands": [{"command": "deploy-malware; rm -rf /", "exit_code": 0}],
        "started_at": "2026-07-10T04:02:00Z", "finished_at": "2026-07-10T04:03:00Z",
    }
    receipt["observability"]["checks"] = [{"command": "health", "exit_code": 0, "threshold_id": "error-rate", "measured_value": 0.005, "evidence": ["dashboard"], "observed_at": "2026-07-11T04:03:00Z"}]
    receipt["outcome"] = {"status": "complete", "evidence": ["claimed"], "follow_up_owner": ""}
    assert "execution.commands[0] must be argv or shell-free text" in validate_policy(receipt, "complete")


def test_stateful_migration_cannot_hide_behind_required_false():
    receipt = valid_receipt()
    receipt["migration"].update({"type": "stateful", "required": False})
    errors = validate_policy(receipt, "ready")
    assert "migration.required must agree with migration.type" in errors
    assert "required migration needs plan" in errors


def test_complete_release_must_measure_each_health_threshold():
    receipt = valid_receipt("complete")
    receipt["human_promotion"] = {"status": "approved", "approved_by": "human", "approved_at": "2026-07-10T04:01:00Z"}
    receipt["execution"] = {"commands": [{"command": "deploy", "exit_code": 0}], "started_at": "2026-07-10T04:02:00Z", "finished_at": "2026-07-10T04:03:00Z"}
    receipt["observability"]["checks"] = [{"command": "health", "exit_code": 0, "threshold_id": "error-rate", "measured_value": 0.02, "evidence": ["dashboard"], "observed_at": "2026-07-11T04:03:00Z"}]
    receipt["outcome"] = {"status": "complete", "evidence": ["claimed"], "follow_up_owner": ""}
    assert "observability threshold error-rate was not met" in validate_policy(receipt, "complete")
    receipt["observability"]["checks"][0]["measured_value"] = float("-inf")
    assert "observability threshold error-rate needs a measured value and evidence" in validate_policy(receipt, "complete")
