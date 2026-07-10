import importlib.util
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "skills" / "release" / "scripts" / "validate_release.py"
SPEC = importlib.util.spec_from_file_location("validate_release", MODULE_PATH)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)

CHANGE_TEST_PATH = ROOT / "skills" / "change" / "tests" / "test_validate_run.py"
CHANGE_SPEC = importlib.util.spec_from_file_location("change_fixture", CHANGE_TEST_PATH)
assert CHANGE_SPEC and CHANGE_SPEC.loader
CHANGE_FIXTURE = importlib.util.module_from_spec(CHANGE_SPEC)
CHANGE_SPEC.loader.exec_module(CHANGE_FIXTURE)
CHANGE_REVISION = CHANGE_FIXTURE.valid_run()["implementation"]["result_revision"]


def valid_receipt(status="awaiting-promotion"):
    receipt = {
        "schema_version": 1,
        "release_id": "REL-1",
        "updated_at": "2026-07-10T04:00:00Z",
        "status": status,
        "target": "production",
        "artifact": {"id": "sha256:a", "source_revision": CHANGE_REVISION, "change_receipt": "RUN.json"},
        "owner": "release-owner",
        "release_authority": {
            "approved_by": "human",
            "expires_at": "2026-07-11T04:00:00Z",
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
        "observability": {"baseline": "normal", "success_thresholds": [{"id": "error-rate", "direction": "lte", "limit": 0.01, "unit": "ratio"}], "checks": []},
        "human_promotion": {"status": "pending", "approved_by": "", "approved_at": ""},
        "execution": {"commands": [], "started_at": "", "finished_at": ""},
        "outcome": {"status": "pending", "evidence": [], "follow_up_owner": ""},
    }
    return receipt


def test_ready_gate_passes_with_scoped_release_authority():
    assert MODULE.validate(valid_receipt(), "ready") == []


def test_ready_gate_requires_rollback_and_stop_conditions():
    receipt = valid_receipt()
    receipt["rollback"]["plan"] = ""
    receipt["rollout"]["stop_conditions"] = []
    errors = MODULE.validate(receipt, "ready")
    assert "rollback.plan is required" in errors
    assert "rollout.stop_conditions must not be empty" in errors


def test_boolean_exit_code_is_not_zero():
    receipt = valid_receipt()
    receipt["readiness_checks"][0]["exit_code"] = False
    assert "readiness_checks[0] must record command and exit_code 0" in MODULE.validate(receipt, "ready")


def test_complete_gate_requires_human_approval_and_observed_health():
    receipt = valid_receipt("complete")
    errors = MODULE.validate(receipt, "complete")
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
    receipt["observability"]["checks"] = [{"command": "health", "exit_code": 0, "threshold_id": "error-rate", "measured_value": 0.005, "evidence": ["dashboard"]}]
    receipt["outcome"] = {"status": "complete", "evidence": ["health pass"], "follow_up_owner": ""}
    assert MODULE.validate(receipt, "complete") == []
    receipt["status"] = receipt["outcome"]["status"] = "rolled-back"
    assert "non-success terminal outcome requires follow_up_owner" in MODULE.validate(receipt, "complete")
    receipt["outcome"]["follow_up_owner"] = "team"
    receipt["execution"]["commands"][0]["exit_code"] = 1
    receipt["observability"]["checks"][0]["exit_code"] = 1
    receipt["rollback_execution"] = {
        "commands": [{"command": "rollback", "exit_code": 0}],
        "restoration_checks": [{"command": "health", "exit_code": 0}],
        "started_at": "2026-07-10T04:04:00Z", "finished_at": "2026-07-10T04:05:00Z",
    }
    assert MODULE.validate(receipt, "complete") == []


def test_cli_ready_gate_requires_an_accepted_change_receipt(tmp_path):
    value = valid_receipt()
    value["artifact"]["change_receipt"] = "RUN.json"
    release_path = tmp_path / "RELEASE.json"
    release_path.write_text(json.dumps(value))
    assert MODULE.main(["--gate", "ready", str(release_path)]) == 1
    change = CHANGE_FIXTURE.valid_run()
    change["phase"] = "complete"
    change["human_final"] = {"status": "approved", "approved_by": "human"}
    (tmp_path / "RUN.json").write_text(json.dumps(change))
    for name in ("review.md", "native-review.md", "other-primary.md", "challenge.md", "reduction.md"):
        (tmp_path / name).write_text("artifact")
    (tmp_path / "other-primary.route.json").write_text(json.dumps({
        "status": "ok", "provider_family": "anthropic", "cross_family": True,
        "certification_eligible": True, "read_only_guarantee": "enforced",
        "output_path": str(tmp_path / "other-primary.md"),
    }))
    CHANGE_FIXTURE.write_scope_receipt(change, tmp_path)
    assert MODULE.main(["--gate", "ready", str(release_path)]) == 0


def test_release_artifact_must_match_accepted_change_revision(tmp_path):
    value = valid_receipt()
    value["artifact"]["source_revision"] = "unrelated"
    change = CHANGE_FIXTURE.valid_run()
    change["phase"] = "complete"
    change["human_final"] = {"status": "approved", "approved_by": "human"}
    (tmp_path / "RUN.json").write_text(json.dumps(change))
    for name in ("review.md", "native-review.md", "other-primary.md", "challenge.md", "reduction.md"):
        (tmp_path / name).write_text("artifact")
    (tmp_path / "other-primary.route.json").write_text(json.dumps({
        "status": "ok", "provider_family": "anthropic", "cross_family": True,
        "certification_eligible": True, "read_only_guarantee": "enforced",
        "output_path": str(tmp_path / "other-primary.md"),
    }))
    CHANGE_FIXTURE.write_scope_receipt(change, tmp_path)
    errors = MODULE.validate(value, "ready", tmp_path)
    assert "artifact.source_revision must match the accepted change result_revision" in errors


def test_release_command_scope_and_ordering_are_enforced():
    receipt = valid_receipt("complete")
    receipt["human_promotion"] = {
        "status": "approved", "approved_by": "human", "approved_at": "2026-07-10T04:03:00Z"
    }
    receipt["execution"] = {
        "commands": [{"command": "kubectl delete namespace prod", "exit_code": 0}],
        "started_at": "2026-07-10T04:02:00Z", "finished_at": "2026-07-10T04:01:00Z",
    }
    receipt["observability"]["checks"] = [{"command": "health", "exit_code": 0, "threshold_id": "error-rate", "measured_value": 0.005, "evidence": ["dashboard"]}]
    receipt["outcome"] = {"status": "complete", "evidence": ["health pass"], "follow_up_owner": ""}
    errors = MODULE.validate(receipt, "complete")
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
    receipt["observability"]["checks"] = [{"command": "health", "exit_code": 0, "threshold_id": "error-rate", "measured_value": 0.005, "evidence": ["dashboard"]}]
    receipt["outcome"] = {"status": "complete", "evidence": ["claimed"], "follow_up_owner": ""}
    assert "execution.commands[0] must be argv or shell-free text" in MODULE.validate(receipt, "complete")


def test_stateful_migration_cannot_hide_behind_required_false():
    receipt = valid_receipt()
    receipt["migration"].update({"type": "stateful", "required": False})
    errors = MODULE.validate(receipt, "ready")
    assert "migration.required must agree with migration.type" in errors
    assert "required migration needs plan" in errors


def test_complete_release_must_measure_each_health_threshold():
    receipt = valid_receipt("complete")
    receipt["human_promotion"] = {"status": "approved", "approved_by": "human", "approved_at": "2026-07-10T04:01:00Z"}
    receipt["execution"] = {"commands": [{"command": "deploy", "exit_code": 0}], "started_at": "2026-07-10T04:02:00Z", "finished_at": "2026-07-10T04:03:00Z"}
    receipt["observability"]["checks"] = [{"command": "health", "exit_code": 0, "threshold_id": "error-rate", "measured_value": 0.02, "evidence": ["dashboard"]}]
    receipt["outcome"] = {"status": "complete", "evidence": ["claimed"], "follow_up_owner": ""}
    assert "observability threshold error-rate was not met" in MODULE.validate(receipt, "complete")
    receipt["observability"]["checks"][0]["measured_value"] = float("-inf")
    assert "observability threshold error-rate needs a measured value and evidence" in MODULE.validate(receipt, "complete")
