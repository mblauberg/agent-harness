import copy
import hashlib
import importlib.util
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "skills" / "evaluate" / "scripts" / "validate_evaluation.py"
TEMPLATE = ROOT / "skills" / "evaluate" / "templates" / "EVALUATION.template.json"
SPEC = importlib.util.spec_from_file_location("validate_evaluation", PATH)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def planned():
    return json.loads(TEMPLATE.read_text())


def artifact(artifact_id, suffix="json"):
    letter = "abcdef"[len(artifact_id) % 6]
    return {
        "id": artifact_id,
        "path": f"evidence/{artifact_id}.{suffix}",
        "media_type": "application/json" if suffix == "json" else "text/plain",
        "digest": "sha256:" + letter * 64,
        "owner": "evaluation-chair",
        "retention": "project-policy",
        "data_policy": "synthetic",
    }


def final_receipt():
    value = planned()
    value["decision"]["enclosing_delivery_run_id"] = "DEL-TEST"
    value["status"] = "pass"
    value["updated_at"] = "2026-07-11T00:10:00Z"
    value["artifacts"].extend([
        artifact("preflight"),
        artifact("route"),
        artifact("input"),
        artifact("output"),
        artifact("judgement"),
        artifact("aggregate"),
    ])
    value["preflight"] = [{
        "id": "fixture-schema",
        "status": "pass",
        "started_at": "2026-07-11T00:01:00Z",
        "completed_at": "2026-07-11T00:02:00Z",
        "evidence_artifact_id": "preflight",
        "exit_code": 0,
        "reason": "",
    }]
    attempts = []
    case_results = []
    judgements = []
    for arm_id, score in (("candidate", 0.9), ("control", 0.85)):
        for repetition in (1, 2):
            attempt_id = f"attempt-{arm_id}-{repetition}"
            attempts.append({
                "id": attempt_id,
                "arm_id": arm_id,
                "family": "synthetic",
                "repetition": repetition,
                "seed": value["plan"]["schedule"]["seeds"][repetition - 1],
                "shard_id": "all",
                "status": "success",
                "started_at": f"2026-07-11T00:0{2 + repetition}:00Z",
                "completed_at": f"2026-07-11T00:0{3 + repetition}:00Z",
                "retry_of": "",
                "reason": "",
                "plan_digest": value["plan"]["digest"],
                "shared_runtime_digest": value["plan"]["shared_runtime_digest"],
                "arm_manifest_digest": next(
                    item["digest"] for item in value["artifacts"]
                    if item["id"] == next(
                        arm["manifest_artifact_id"] for arm in value["plan"]["arms"] if arm["id"] == arm_id
                    )
                ),
                "arm_configuration_digest": next(
                    arm["configuration_digest"] for arm in value["plan"]["arms"] if arm["id"] == arm_id
                ),
                "route_receipt_artifact_id": "route",
                "input_artifact_id": "input",
                "output_artifact_id": "output",
                "lineage": {
                    "adapter": "synthetic-runner",
                    "adapter_version": "1",
                    "endpoint_provider": "local",
                    "provider_family": "synthetic",
                    "requested_model": "model-v1",
                    "actual_model": "model-v1",
                    "requested_effort": "standard",
                    "effective_effort": "standard",
                    "capability_source": "frozen route receipt",
                    "session_id": attempt_id,
                    "substitution_reason": "",
                },
                "usage": {"unavailable_reason": "synthetic runner"},
            })
            result = {
                "attempt_id": attempt_id,
                "case_id": "case-001",
                "status": "pass",
                "scores": {"quality": score},
                "evidence_artifact_id": "output",
                "evidence_unavailable_reason": "",
                "reason": "",
            }
            case_results.append(result)
            judgements.append({
                "id": f"judgement-{arm_id}-{repetition}",
                "grader_id": "ground-truth",
                "attempt_id": attempt_id,
                "case_id": "case-001",
                "outcome": "pass",
                "scores": {"quality": score},
                "evidence_artifact_id": "judgement",
            })
    value["attempts"] = attempts
    value["case_results"] = case_results
    value["graders"] = [{
        "id": "ground-truth",
        "type": "ground-truth",
        "rubric_artifact_id": "rubric",
        "independent_of_generators": True,
        "blinded": True,
        "conflict": "none",
        "started_at": "2026-07-11T00:06:00Z",
        "completed_at": "2026-07-11T00:07:00Z",
        "input_artifact_id": "output",
        "output_artifact_id": "judgement",
        "usage": {"unavailable_reason": "deterministic ground-truth grader"},
        "lineage": {
            "adapter": "fixture-checker",
            "adapter_version": "1",
            "endpoint_provider": "local",
            "provider_family": "ground-truth",
            "requested_model": "rules-v1",
            "actual_model": "rules-v1",
            "requested_effort": "not-applicable",
            "effective_effort": "not-applicable",
            "capability_source": "pinned local checker",
            "session_id": "grader-ground-truth",
            "substitution_reason": "",
            "route_receipt_artifact_id": "",
        },
    }]
    value["judgements"] = judgements
    value["adjudications"] = []
    value["results"] = {
        "accounting": {
            "planned": 4,
            "passed": 4,
            "failed": 0,
            "omitted": 0,
            "skipped": 0,
            "excluded": 0,
            "timed_out": 0,
            "invalid": 0,
            "tool_errors": 0,
        },
        "attempt_accounting": {
            "planned": 4,
            "base_planned": 4,
            "retries": 0,
            "succeeded": 4,
            "timed_out": 0,
            "invalid_output": 0,
            "tool_errors": 0,
            "skipped": 0,
            "excluded": 0,
        },
        "metrics": [{
            "name": "quality",
            "target_arm_id": "candidate",
            "numerator": 1.8,
            "denominator": 2,
            "value": 0.9,
            "comparisons": [{
                "arm_id": "control",
                "numerator": 1.7,
                "denominator": 2,
                "value": 0.85,
                "delta": 0.05,
                "passed": True,
            }],
            "passed": True,
            "evidence_artifact_id": "aggregate",
        }],
        "failure_artifact_ids": [],
    }
    value["conclusion"] = {
        "status": "pass",
        "machine_only": True,
        "passed_gates": ["quality"],
        "failed_gates": [],
        "limitations": ["synthetic fixture"],
        "evidence_artifact_ids": ["aggregate"],
    }
    return value


def materialise(value, root):
    for item in value["artifacts"]:
        target = root / item["path"]
        target.parent.mkdir(parents=True, exist_ok=True)
        if item["id"] == value["plan"]["artifact_id"]:
            frozen = {key: part for key, part in value["plan"].items() if key not in {"artifact_id", "digest"}}
            payload = (json.dumps(frozen, sort_keys=True, separators=(",", ":")) + "\n").encode()
        else:
            payload = f"artifact:{item['id']}\n".encode()
        target.write_bytes(payload)
        item["digest"] = "sha256:" + hashlib.sha256(payload).hexdigest()
    by_id = {item["id"]: item for item in value["artifacts"]}
    value["plan"]["digest"] = by_id[value["plan"]["artifact_id"]]["digest"]
    arms = {item["id"]: item for item in value["plan"]["arms"]}
    for attempt in value.get("attempts", []):
        arm = arms[attempt["arm_id"]]
        attempt.update({
            "plan_digest": value["plan"]["digest"],
            "shared_runtime_digest": value["plan"]["shared_runtime_digest"],
            "arm_manifest_digest": by_id[arm["manifest_artifact_id"]]["digest"],
            "arm_configuration_digest": arm["configuration_digest"],
        })


def add_disagreement(value, *, status):
    second = copy.deepcopy(value["graders"][0])
    second["id"] = "second-judge"
    second["lineage"]["provider_family"] = "other-family"
    second["lineage"]["session_id"] = "grader-second"
    value["graders"].append(second)
    adjudicator = copy.deepcopy(second)
    adjudicator["id"] = "fresh-adjudicator"
    adjudicator["lineage"]["provider_family"] = "third-family"
    adjudicator["lineage"]["session_id"] = "grader-adjudicator"
    adjudicator["started_at"] = "2026-07-11T00:08:00Z"
    adjudicator["completed_at"] = "2026-07-11T00:09:00Z"
    value["graders"].append(adjudicator)
    value["plan"]["grader_policy"]["required_grader_ids"].append("second-judge")
    for original in list(value["judgements"]):
        duplicate = copy.deepcopy(original)
        duplicate["id"] = "second-" + original["id"]
        duplicate["grader_id"] = "second-judge"
        value["judgements"].append(duplicate)
    disputed = next(item for item in value["judgements"] if item["grader_id"] == "second-judge")
    disputed["outcome"] = "fail"
    disputed["scores"] = {"quality": 0.2}
    value["adjudications"] = [{
        "attempt_id": disputed["attempt_id"],
        "case_id": disputed["case_id"],
        "adjudicator_id": "fresh-adjudicator",
        "status": status,
        "final_outcome": "pass" if status == "resolved" else "",
        "final_scores": {"quality": 0.9} if status == "resolved" else {},
        "evidence_artifact_id": "judgement",
    }]


def test_shipped_template_is_a_valid_non_gating_plan():
    value = planned()
    assert value["contract"] == "evaluation-run"
    assert value["schema_version"] == 2
    assert value["status"] == "planned"
    assert MODULE.validate(value) == []
    assert "evaluation receipt is not a machine pass" in MODULE.validate(value, require_pass=True)


def test_complete_machine_pass_is_valid_without_claiming_human_acceptance(tmp_path):
    value = final_receipt()
    assert "human_acceptance" not in value
    assert MODULE.validate(value) == []
    materialise(value, tmp_path)
    assert MODULE.validate(
        value,
        receipt_dir=tmp_path,
        verify_hashes=True,
        require_pass=True,
        expected_evaluation_id="EVAL-000",
        expected_plan_digest=value["plan"]["digest"],
        expected_delivery_run_id="DEL-TEST",
    ) == []


def test_cli_reports_verified_machine_pass_without_human_acceptance(tmp_path, capsys):
    value = final_receipt()
    materialise(value, tmp_path)
    path = tmp_path / "EVALUATION.json"
    path.write_text(json.dumps(value))
    assert MODULE.main([
        str(path), "--receipt-dir", str(tmp_path), "--verify-hashes", "--require-pass",
        "--expected-evaluation-id", "EVAL-000",
        "--expected-plan-digest", value["plan"]["digest"],
        "--expected-delivery-run-id", "DEL-TEST",
    ]) == 0
    assert capsys.readouterr().out.strip() == "PASS: machine evaluation gate; human acceptance remains external"


def test_machine_gate_requires_hash_verification_and_frozen_plan_bytes(tmp_path):
    value = final_receipt()
    errors = MODULE.validate(value, require_pass=True)
    assert "require_pass requires verify_hashes" in errors
    assert any("expected_plan_digest" in error for error in errors)
    assert any("expected_delivery_run_id" in error for error in errors)
    materialise(value, tmp_path)
    anchored_digest = value["plan"]["digest"]
    value["plan"]["metrics"][0]["threshold"] = 0.1
    errors = MODULE.validate(
        value, receipt_dir=tmp_path, verify_hashes=True, require_pass=True,
        expected_evaluation_id="EVAL-000",
        expected_plan_digest=anchored_digest,
        expected_delivery_run_id="DEL-TEST",
    )
    assert any("frozen plan artifact does not match" in error for error in errors)


def test_noncanonical_schema_fails_closed():
    value = planned()
    value["schema_version"] = 1
    assert MODULE.validate(value) == [
        "receipt must use contract evaluation-run schema_version 2"
    ]


def test_false_pass_collections_and_null_evidence_fail_closed():
    value = final_receipt()
    value["results"]["failure_examples"] = "not-a-list"
    value["conclusion"]["evidence_artifact_ids"] = [None]
    errors = MODULE.validate(value)
    assert any("unsupported fields" in error for error in errors)
    assert "conclusion.evidence_artifact_ids[0] must be a non-empty string" in errors


def test_hidden_exclusion_and_wrong_accounting_cannot_pass():
    value = final_receipt()
    value["case_results"][0].update({
        "status": "excluded",
        "scores": {},
        "reason": "post-hoc",
    })
    errors = MODULE.validate(value)
    assert any("exclusion was not predeclared" in error for error in errors)
    assert any("accounting.passed" in error for error in errors)
    assert any("passing conclusion has omitted" in error for error in errors)


def test_attempt_requires_actual_lineage_and_records_substitution():
    value = final_receipt()
    del value["attempts"][0]["lineage"]["actual_model"]
    value["attempts"][1]["lineage"]["actual_model"] = "model-v2"
    errors = MODULE.validate(value)
    assert any("actual_model must be a non-empty string" in error for error in errors)
    assert any("substitution_reason is required" in error for error in errors)


def test_attempt_lineage_requires_adapter_version_and_capability_source():
    value = final_receipt()
    del value["attempts"][0]["lineage"]["adapter_version"]
    del value["attempts"][0]["lineage"]["capability_source"]
    assert any("adapter_version" in error for error in MODULE.validate(value))


def test_attempts_bind_frozen_plan_arm_runtime_and_paired_model_dimensions():
    value = final_receipt()
    value["attempts"][0]["plan_digest"] = "sha256:" + "0" * 64
    value["attempts"][0]["arm_manifest_digest"] = "sha256:" + "1" * 64
    for attempt in value["attempts"]:
        if attempt["arm_id"] == "control":
            attempt["lineage"].update({"requested_model": "other", "actual_model": "other"})
    errors = MODULE.validate(value)
    assert any("plan_digest must match" in error for error in errors)
    assert any("arm_manifest_digest must match" in error for error in errors)
    assert any("paired arms have undeclared runtime drift" in error for error in errors)


def test_deterministic_preflight_must_pass_before_attempts():
    value = final_receipt()
    value["preflight"][0]["status"] = "fail"
    value["preflight"][0]["exit_code"] = 1
    value["attempts"][0]["started_at"] = "2026-07-11T00:01:30Z"
    errors = MODULE.validate(value)
    assert any("preflight fixture-schema must be pass" in error for error in errors)
    assert any("before deterministic preflight completed" in error for error in errors)


def test_preflight_and_attempt_timing_obey_freeze_and_timeout():
    value = final_receipt()
    value["preflight"][0].update({
        "started_at": "2026-07-10T23:58:00Z",
        "completed_at": "2026-07-10T23:59:00Z",
    })
    value["attempts"][0].update({
        "started_at": "2026-07-11T00:03:00Z",
        "completed_at": "2026-07-11T00:05:00Z",
    })
    errors = MODULE.validate(value)
    assert any("preflight[0] starts before the plan was frozen" in error for error in errors)
    assert any("exceeds the frozen timeout" in error for error in errors)
    value["attempts"][0].update({
        "status": "timed-out",
        "output_artifact_id": "",
        "reason": "deadline elapsed",
    })
    value["attempts"][0]["lineage"].update({"actual_model": "", "effective_effort": ""})
    errors = MODULE.validate(value)
    assert any("timer_evidence_artifact_id" in error for error in errors)


def test_failed_preflight_can_be_a_truthful_conserved_machine_fail():
    value = final_receipt()
    value["preflight"][0].update({"status": "fail", "exit_code": 1})
    for attempt in value["attempts"]:
        attempt.update({
            "status": "skipped",
            "output_artifact_id": "",
            "reason": "deterministic preflight failed",
        })
        attempt["lineage"].update({"actual_model": "", "effective_effort": ""})
    for result in value["case_results"]:
        result.update({
            "status": "skipped",
            "scores": {},
            "reason": "deterministic preflight failed",
            "evidence_artifact_id": "",
            "evidence_unavailable_reason": "generator did not run",
        })
    value["graders"] = []
    value["judgements"] = []
    value["results"]["accounting"].update({"passed": 0, "skipped": 4})
    value["results"]["attempt_accounting"].update({"succeeded": 0, "skipped": 4})
    metric = value["results"]["metrics"][0]
    metric.update({"numerator": 0.0, "value": 0.0, "passed": False})
    metric["comparisons"][0].update({
        "numerator": 0.0,
        "value": 0.0,
        "delta": 0.0,
        "passed": True,
    })
    value["status"] = "fail"
    value["conclusion"].update({
        "status": "fail",
        "passed_gates": [],
        "failed_gates": ["fixture-schema"],
        "evidence_artifact_ids": ["preflight"],
    })
    assert MODULE.validate(value) == []


def test_attempts_finish_before_grading_and_receipt_update():
    value = final_receipt()
    value["attempts"][0]["completed_at"] = "2026-07-11T00:11:00Z"
    errors = MODULE.validate(value)
    assert any("completed_at follows updated_at" in error for error in errors)
    assert any("grader starts before generation attempts completed" in error for error in errors)


def test_paired_arms_use_identical_input_artifact_for_each_cell():
    value = final_receipt()
    value["attempts"][2]["input_artifact_id"] = "output"
    assert any("paired arms must use the same input artifact" in error for error in MODULE.validate(value))


def test_artifact_hash_verification_and_path_safety(tmp_path):
    value = final_receipt()
    materialise(value, tmp_path)
    assert MODULE.validate(value, receipt_dir=tmp_path, verify_hashes=True) == []
    (tmp_path / value["artifacts"][0]["path"]).write_text("tampered")
    assert any("digest mismatch" in error for error in MODULE.validate(value, receipt_dir=tmp_path, verify_hashes=True))
    value = final_receipt()
    value["artifacts"][0]["path"] = "../outside.json"
    assert any("safe relative" in error for error in MODULE.validate(value, receipt_dir=tmp_path))


def test_symlinked_frozen_plan_escape_is_rejected_before_outside_parse(tmp_path, monkeypatch):
    value = final_receipt()
    materialise(value, tmp_path)
    assert MODULE.validate(value, receipt_dir=tmp_path, verify_hashes=True) == []

    outside = tmp_path.parent / "evaluate-outside.json"
    outside.write_text("{SENTINEL_OUTSIDE_PLAN_PARSE")
    target = tmp_path / "evidence" / "protocol.json"
    target.unlink()
    target.symlink_to(outside)

    original_load_json = MODULE._load_json

    def reject_outside_parse(path):
        assert path != outside.resolve(), "validator attempted to parse escaped frozen plan"
        return original_load_json(path)

    monkeypatch.setattr(MODULE, "_load_json", reject_outside_parse)
    errors = MODULE.validate(value, receipt_dir=tmp_path, verify_hashes=True)
    assert "frozen plan artifact escapes receipt_dir" in errors
    assert not any("frozen plan artifact is not readable JSON" in error for error in errors)


def test_skill_quality_requires_candidate_without_and_previous_with_explicit_na():
    value = planned()
    value["kind"] = "skill-quality"
    value["plan"]["arms"][1]["role"] = "without"
    value["plan"]["arms"].append({
        "id": "previous",
        "role": "previous",
        "applicability": "not-applicable",
        "manifest_artifact_id": "",
        "configuration_digest": "",
        "reason": "new skill has no previous package",
    })
    value["plan"]["metrics"][0]["baseline_arm_ids"].append("previous")
    assert MODULE.validate(value) == []
    value["plan"]["arms"].pop()
    assert any("requires exactly one previous arm" in error for error in MODULE.validate(value))


def test_undeclared_result_metric_and_wrong_comparison_arithmetic_fail():
    value = final_receipt()
    value["results"]["metrics"].append(copy.deepcopy(value["results"]["metrics"][0]))
    value["results"]["metrics"][-1]["name"] = "unbounded"
    value["results"]["metrics"][0]["comparisons"][0]["delta"] = 999
    errors = MODULE.validate(value)
    assert any("is undeclared: unbounded" in error for error in errors)
    assert any("delta does not match retained rows" in error for error in errors)


def test_malformed_declared_metric_fails_closed_without_validator_exception():
    value = final_receipt()
    del value["plan"]["metrics"][0]["minimum"]
    errors = MODULE.validate(value)
    assert any("plan.metrics[0].minimum" in error for error in errors)


def test_model_grader_cannot_judge_its_own_generating_family():
    value = final_receipt()
    grader = value["graders"][0]
    grader["type"] = "model"
    grader["lineage"].update({
        "adapter": "model-judge",
        "endpoint_provider": "local",
        "provider_family": "synthetic",
        "requested_model": "judge-v1",
        "actual_model": "judge-v1",
        "route_receipt_artifact_id": "route",
    })
    assert any("generating family as its own model judge" in error for error in MODULE.validate(value))


def test_unresolved_grader_disagreement_blocks_a_machine_pass():
    value = final_receipt()
    add_disagreement(value, status="unresolved")
    errors = MODULE.validate(value)
    assert "passing conclusion has unresolved grader disagreement" in errors


def test_model_adjudicator_cannot_be_generator_family_or_reuse_session():
    value = final_receipt()
    add_disagreement(value, status="resolved")
    adjudicator = next(item for item in value["graders"] if item["id"] == "fresh-adjudicator")
    adjudicator["type"] = "model"
    adjudicator["lineage"].update({
        "provider_family": "synthetic",
        "session_id": value["attempts"][0]["lineage"]["session_id"],
        "route_receipt_artifact_id": "route",
    })
    errors = MODULE.validate(value)
    assert any("adjudicator uses the generating family" in error for error in errors)
    assert any("adjudicator session must be fresh" in error for error in errors)


def test_fresh_adjudicator_can_resolve_a_blinded_disagreement():
    value = final_receipt()
    add_disagreement(value, status="resolved")
    assert MODULE.validate(value) == []


def test_critical_candidate_failure_blocks_even_when_aggregate_meets_threshold():
    value = final_receipt()
    result = value["case_results"][0]
    result["status"] = "fail"
    result["scores"] = {"quality": 0.7}
    judgement = next(item for item in value["judgements"] if item["attempt_id"] == result["attempt_id"])
    judgement["outcome"] = "fail"
    judgement["scores"] = {"quality": 0.7}
    metric = value["results"]["metrics"][0]
    metric.update({"numerator": 1.6, "value": 0.8})
    metric["comparisons"][0].update({"delta": -0.05, "passed": True})
    errors = MODULE.validate(value)
    assert "passing conclusion has critical candidate case failures" in errors


def test_machine_fail_is_a_valid_final_receipt_not_a_machine_gate():
    value = final_receipt()
    result = value["case_results"][0]
    result["status"] = "fail"
    result["scores"] = {"quality": 0.7}
    judgement = next(item for item in value["judgements"] if item["attempt_id"] == result["attempt_id"])
    judgement["outcome"] = "fail"
    judgement["scores"] = {"quality": 0.7}
    value["results"]["accounting"].update({"passed": 3, "failed": 1})
    value["results"]["failure_artifact_ids"] = ["output"]
    metric = value["results"]["metrics"][0]
    metric.update({"numerator": 1.6, "value": 0.8})
    metric["comparisons"][0].update({"delta": -0.05, "passed": True})
    value["status"] = "fail"
    value["conclusion"].update({"status": "fail", "passed_gates": [], "failed_gates": ["critical-case"]})
    assert MODULE.validate(value) == []
    assert any("not a machine pass" in error for error in MODULE.validate(value, require_pass=True))


def test_required_safety_needs_critical_cases_and_na_needs_reason():
    value = planned()
    value["plan"]["safety"].update({"applicability": "not-applicable", "reason": "", "case_ids": []})
    assert "plan.safety.reason must be a non-empty string" in MODULE.validate(value)
    value = planned()
    value["plan"]["schedule"]["cases"][0]["critical"] = False
    value["plan"]["safety"] = {"applicability": "required", "reason": "", "case_ids": ["case-001"]}
    assert any("safety case must be critical" in error for error in MODULE.validate(value))


def test_retry_is_retained_and_cannot_replace_failed_attempt_denominator():
    value = final_receipt()
    value["plan"]["schedule"]["retry_policy"] = {"mode": "retain-all-predeclared", "max_retries": 1}
    original = value["attempts"][0]
    original.update({"status": "tool-error", "output_artifact_id": "", "reason": "provider error"})
    original["lineage"].update({"actual_model": "", "effective_effort": ""})
    original_result = value["case_results"][0]
    original_result.update({
        "status": "tool-error",
        "scores": {},
        "reason": "provider error",
        "evidence_artifact_id": "",
        "evidence_unavailable_reason": "provider returned no result",
    })
    value["judgements"] = [item for item in value["judgements"] if item["attempt_id"] != original["id"]]
    retry = copy.deepcopy(value["attempts"][1])
    retry.update({
        "id": "attempt-candidate-1-retry",
        "arm_id": "candidate",
        "repetition": 1,
        "seed": 101,
        "retry_of": original["id"],
        "started_at": "2026-07-11T00:06:00Z",
        "completed_at": "2026-07-11T00:07:00Z",
    })
    value["attempts"].append(retry)
    retry_result = copy.deepcopy(value["case_results"][1])
    retry_result.update({"attempt_id": retry["id"], "scores": {"quality": 0.9}})
    value["case_results"].append(retry_result)
    retry_judgement = copy.deepcopy(value["judgements"][0])
    retry_judgement.update({
        "id": "judgement-retry",
        "attempt_id": retry["id"],
        "scores": {"quality": 0.9},
    })
    value["judgements"].append(retry_judgement)
    errors = MODULE.validate(value)
    assert any("accounting.planned" in error for error in errors)
    assert any("passing conclusion has omitted" in error for error in errors)


def test_receipt_cannot_embed_or_claim_human_acceptance():
    value = final_receipt()
    value["human_acceptance"] = {"status": "approved"}
    value["conclusion"]["approved_by"] = "human"
    value["plan"]["approval"] = {"status": "claimed"}
    value["human_gates"] = {"acceptance": {"status": "approved"}}
    value["conclusion"]["passed_gates"].append("human-acceptance")
    errors = MODULE.validate(value)
    assert any("receipt cannot claim human acceptance" in error for error in errors)
    assert any("receipt.conclusion cannot claim human acceptance" in error for error in errors)
    assert any("receipt.plan cannot claim human acceptance" in error for error in errors)
    assert any("unknown top-level fields" in error for error in errors)
    assert any("unsupported gate" in error for error in errors)


def test_embedded_nul_artifact_path_fails_closed_in_api_and_cli(tmp_path):
    value = planned()
    value["artifacts"][0]["path"] = "evidence/bad\u0000path.json"
    errors = MODULE.validate(value, receipt_dir=tmp_path)
    assert any("control characters" in error for error in errors)
    path = tmp_path / "EVALUATION.json"
    path.write_text(json.dumps(value))
    assert MODULE.main([str(path)]) == 1
