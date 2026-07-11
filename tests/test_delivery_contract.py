import copy
import hashlib
import importlib.util
import json
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[1]
VALIDATOR_PATH = ROOT / "skills" / "deliver" / "scripts" / "validate_delivery.py"
REFERENCE_RUNS_PATH = ROOT / "skills" / "deliver" / "scripts" / "reference_runs.py"
REFERENCE_EVALUATION_PATH = ROOT / "skills" / "deliver" / "scripts" / "reference_evaluation.py"


def load_validator():
    spec = importlib.util.spec_from_file_location("validate_delivery", VALIDATOR_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(module)
    return module


def fixture(profile="software", workspace_root=None, **materialise_kwargs):
    module = load(REFERENCE_RUNS_PATH, f"reference_runs_{profile}")
    run = module.make_reference_run(profile, ROOT)
    if workspace_root is not None:
        materialiser = load(REFERENCE_EVALUATION_PATH, f"reference_evaluation_{profile}")
        materialiser.materialise_reference_run(
            run, workspace_root, ROOT, **materialise_kwargs,
        )
    return run


def load(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(module)
    return module


def terminalise_reference_evaluation(run, status="failed"):
    binding = run["assurance"]["evaluations"][0]
    evidence_id = f"evaluation-{status}-receipt"
    binding.update({
        "status": status,
        "evaluation_id": f"EVAL-{status.upper()}",
        "evidence_id": evidence_id,
    })
    run["evidence"].append({
        "id": evidence_id,
        "kind": "deterministic",
        "gate": f"evaluation-{status}",
        "status": "pass",
        "method": "canonical terminal receipt validation",
        "artifact_id": binding["evaluation_artifact_id"],
        "source_paths": ["input"],
        "result": {
            "exit_code": 0,
            "receipt_digest": "sha256:" + "f" * 64,
        },
    })
    return binding


def test_reference_run_for_every_profile_passes(tmp_path):
    module = load_validator()
    for profile in ("software", "research", "analysis", "document", "agent-product"):
        workspace_root = tmp_path / profile
        module.validate(
            fixture(profile, workspace_root), ROOT,
            workspace_root=workspace_root, verify_hashes=True,
        )


def test_approved_intent_requires_bound_artifact_digest_owner_and_evidence():
    module = load_validator()
    candidate = fixture()
    for path in (
        ("intent", "digest"),
        ("intent", "decision_owner"),
        ("intent", "approval", "approver"),
        ("intent", "approval", "evidence"),
    ):
        broken = copy.deepcopy(candidate)
        target = broken
        for key in path[:-1]:
            target = target[key]
        target[path[-1]] = ""
        with pytest.raises(module.Invalid, match="intent"):
            module.validate(broken, ROOT)


def test_live_hash_check_rejects_artifact_changed_after_approval(tmp_path):
    module = load_validator()
    candidate = fixture()
    (tmp_path / "intent.md").write_text("changed")
    candidate["intent"]["artifact"] = "intent.md"
    candidate["artifacts"][0]["path"] = "intent.md"
    with pytest.raises(module.Invalid, match="digest does not match"):
        module.validate(candidate, ROOT, receipt_dir=tmp_path, verify_hashes=True)


def test_state_history_cannot_jump_a_mandatory_gate():
    module = load_validator()
    candidate = fixture()
    candidate["state_history"] = [
        {"state": "draft", "at": "2026-07-10T00:00:00Z", "evidence_ids": []},
        {"state": "executing", "at": "2026-07-10T00:01:00Z", "evidence_ids": []},
        {"state": "awaiting_acceptance", "at": "2026-07-10T00:02:00Z", "evidence_ids": ["tests"]},
    ]
    with pytest.raises(module.Invalid, match="invalid lifecycle transition"):
        module.validate(candidate, ROOT)


def test_history_must_start_at_draft_and_honest_draft_needs_no_future_results():
    module = load_validator()
    candidate = fixture()
    candidate["state_history"] = [candidate["state_history"][-1]]
    with pytest.raises(module.Invalid, match="start at draft"):
        module.validate(candidate, ROOT)

    candidate = fixture()
    candidate["status"] = "draft"
    candidate["state_history"] = [candidate["state_history"][0]]
    candidate["intent"]["approval"] = {"status": "pending", "approver": "", "evidence": ""}
    candidate["design"]["status"] = "draft"
    candidate["evidence"] = [item for item in candidate["evidence"] if item["kind"] == "human"]
    candidate["reviews"] = []
    candidate["measures"] = {"outcome": [], "trajectory": []}
    candidate["assurance"] = {"stochastic_required": False, "reason": "not decided", "evaluations": []}
    candidate["security"] = {"status": "pending", "reason": "", "policy_sha256": candidate["security"]["policy_sha256"], "changed_surfaces": [], "checks": [], "agentic_risks": []}
    module.validate(candidate, ROOT)


def test_recoverable_side_state_records_its_own_resume_contract():
    module = load_validator()
    candidate = fixture()
    candidate["status"] = "executing"
    candidate["state_history"] = candidate["state_history"][:4] + [
        {"state": "blocked", "at": "2026-07-10T00:04:00Z", "evidence_ids": [], "reason": "provider unavailable", "recovery": "retry local route", "resume_state": "executing"},
        {"state": "executing", "at": "2026-07-10T00:05:00Z", "evidence_ids": []},
    ]
    candidate["evidence"] = [item for item in candidate["evidence"] if item["kind"] == "human"]
    candidate["reviews"] = []
    candidate["measures"] = {"outcome": [], "trajectory": []}
    candidate["security"]["status"] = "pending"
    for check in candidate["security"]["checks"]:
        check["status"] = "pending"
        check["evidence_id"] = ""
    module.validate(candidate, ROOT)

    jumped = fixture()
    jumped["status"] = "blocked"
    jumped["state_history"].append({
        "state": "blocked", "at": "2026-07-10T00:09:00Z", "evidence_ids": [],
        "reason": "blocked", "recovery": "resume review", "resume_state": "closed",
    })
    jumped["degradation"] = {"reason": "blocked", "recovery": "resume review"}
    with pytest.raises(module.Invalid, match="resume the state"):
        module.validate(jumped, ROOT)


def test_repair_cycle_count_must_match_history():
    module = load_validator()
    candidate = fixture()
    candidate["state_history"] = candidate["state_history"][:-1] + [
        {"state": "repairing", "at": "2026-07-10T00:06:30Z", "evidence_ids": ["tests"]},
        {"state": "verifying", "at": "2026-07-10T00:07:00Z", "evidence_ids": ["tests"]},
        {"state": "reviewing", "at": "2026-07-10T00:08:00Z", "evidence_ids": ["tests"]},
        {"state": "awaiting_acceptance", "at": "2026-07-10T00:09:00Z", "evidence_ids": [item["id"] for item in candidate["evidence"]]},
    ]
    candidate["repair_cycles"] = 0
    with pytest.raises(module.Invalid, match="repair_cycles"):
        module.validate(candidate, ROOT)


def test_delegate_authority_can_only_narrow_parent():
    module = load_validator()
    candidate = fixture()
    candidate["authority"]["delegations"] = [{
        "actor": "worker-1",
        "source_paths": ["../outside"],
        "artifact_paths": [".agent-run/DEL-001/worker-1"],
        "prohibited_actions": [],
        "disclosure": "external-approved",
    }]
    with pytest.raises(module.Invalid, match="delegation"):
        module.validate(candidate, ROOT)


def test_authority_requires_approver_expiry_and_external_action_controls():
    module = load_validator()
    candidate = fixture()
    for field in ("approved_by", "evidence", "expires_at", "secrets_access", "deployment", "irreversible_actions"):
        broken = copy.deepcopy(candidate)
        del broken["authority"][field]
        with pytest.raises(module.Invalid, match="authority"):
            module.validate(broken, ROOT)


def test_local_artifact_must_be_inside_authorised_artifact_scope():
    module = load_validator()
    candidate = fixture()
    candidate["authority"]["allowed_artifact_paths"] = ["elsewhere"]
    with pytest.raises(module.Invalid, match="outside authority"):
        module.validate(candidate, ROOT)


def test_deterministic_evidence_digest_must_bind_its_declared_artifact():
    module = load_validator()
    candidate = fixture()
    check = next(item for item in candidate["evidence"] if item["kind"] == "deterministic")
    check["result"]["receipt_digest"] = "sha256:" + "c" * 64

    with pytest.raises(module.Invalid, match="receipt digest must bind its declared artifact"):
        module.validate(candidate, ROOT)


def test_deterministic_evidence_artifact_must_be_a_matching_bundle(tmp_path):
    module = load_validator()
    workspace = tmp_path / "arbitrary"
    candidate = fixture("software", workspace)
    artifact = next(item for item in candidate["artifacts"] if item["id"] == "evidence-bundle")
    target = workspace / artifact["path"]
    target.write_text("not a receipt\n")
    digest = "sha256:" + hashlib.sha256(target.read_bytes()).hexdigest()
    artifact["digest"] = digest
    for item in candidate["evidence"]:
        if item.get("kind") == "deterministic" and item.get("artifact_id") == artifact["id"]:
            item["result"]["receipt_digest"] = digest

    with pytest.raises(module.Invalid, match="valid bundle JSON"):
        module.validate(candidate, ROOT, workspace_root=workspace, verify_hashes=True)

    candidate = fixture("software", workspace)
    artifact = next(item for item in candidate["artifacts"] if item["id"] == "evidence-bundle")
    target = workspace / artifact["path"]
    bundle = json.loads(target.read_text())
    bundle["checks"][0]["gate"] = "wrong-gate"
    target.write_text(json.dumps(bundle) + "\n")
    digest = "sha256:" + hashlib.sha256(target.read_bytes()).hexdigest()
    artifact["digest"] = digest
    for item in candidate["evidence"]:
        if item.get("kind") == "deterministic" and item.get("artifact_id") == artifact["id"]:
            item["result"]["receipt_digest"] = digest

    with pytest.raises(module.Invalid, match="does not match its evidence row"):
        module.validate(candidate, ROOT, workspace_root=workspace, verify_hashes=True)


def test_risk_tier_cannot_be_downgraded_without_human_evidence():
    module = load_validator()
    candidate = fixture()
    candidate["risk_tier"] = "routine"
    with pytest.raises(module.Invalid, match="risk downgrade"):
        module.validate(candidate, ROOT)
    candidate["risk_override"] = {
        "status": "approved",
        "approved_by": "human",
        "evidence": "risk-override-approval",
        "reason": "bounded reference run",
    }
    module.validate(candidate, ROOT)
    candidate["risk_override"]["evidence"] = "intent-approval"
    with pytest.raises(module.Invalid, match="risk override"):
        module.validate(candidate, ROOT)


def test_substantial_run_requires_design_and_both_primary_review_lanes():
    module = load_validator()
    candidate = fixture("research")
    candidate["design"]["status"] = "not-required"
    with pytest.raises(module.Invalid, match="design"):
        module.validate(candidate, ROOT)
    candidate = fixture("research")
    candidate["reviews"] = [review for review in candidate["reviews"] if review["provider_family"] != "anthropic"]
    with pytest.raises(module.Invalid, match="other-primary"):
        module.validate(candidate, ROOT)


def test_crucial_design_requires_alternatives_failure_analysis_and_containment():
    module = load_validator()
    candidate = fixture("agent-product")
    candidate["risk_tier"] = "crucial"
    candidate["design"]["alternatives"] = []
    with pytest.raises(module.Invalid, match="alternatives"):
        module.validate(candidate, ROOT)


def test_crucial_design_rejects_unresolved_or_demoted_one_way_door():
    module = load_validator()
    candidate = fixture("agent-product")
    candidate["risk_tier"] = "crucial"
    candidate["design"]["one_way_doors"] = [{
        "id": "irreversible-schema-cutover",
        "decision": "replace the old store",
        "classification": "implementation-detail",
        "status": "unresolved",
        "evidence": "",
    }]
    with pytest.raises(module.Invalid, match="implementation detail|unresolved"):
        module.validate(candidate, ROOT)

    candidate["design"]["one_way_doors"][0].update({
        "classification": "design-decision",
        "status": "deferred",
        "evidence": "human:design-deferral",
        "approved_by": "",
        "reason": "",
    })
    with pytest.raises(module.Invalid, match="human evidence|human approval"):
        module.validate(candidate, ROOT)


@pytest.mark.parametrize("profile", ["software", "agent-product"])
def test_crucial_technical_profiles_require_applicable_security_evidence(profile):
    module = load_validator()
    candidate = fixture(profile)
    candidate["risk_tier"] = "crucial"
    candidate["security"]["checks"] = []
    with pytest.raises(module.Invalid, match="security"):
        module.validate(candidate, ROOT)


def test_agent_product_requires_owasp_agentic_risk_disposition():
    module = load_validator()
    candidate = fixture("agent-product")
    candidate["security"]["agentic_risks"] = []
    with pytest.raises(module.Invalid, match="agentic risk"):
        module.validate(candidate, ROOT)

    candidate = fixture("agent-product")
    passing_risk = next(item for item in candidate["security"]["agentic_risks"] if item["status"] == "pass")
    passing_risk["evidence_id"] = next(
        item["id"] for item in candidate["evidence"] if item["kind"] == "judgement"
    )
    with pytest.raises(module.Invalid, match="deterministic"):
        module.validate(candidate, ROOT)


def test_security_checks_are_exact_policy_selected_deterministic_evidence():
    module = load_validator()
    candidate = fixture("software")
    candidate["risk_tier"] = "crucial"
    candidate["security"]["checks"] = [{"id": "made-up", "surface": "made-up", "status": "pass", "evidence_id": "tests"}]
    with pytest.raises(module.Invalid, match="security"):
        module.validate(candidate, ROOT)
    candidate = fixture("software")
    candidate["risk_tier"] = "crucial"
    candidate["security"]["checks"][0]["evidence_id"] = next(item["id"] for item in candidate["evidence"] if item["kind"] == "judgement")
    with pytest.raises(module.Invalid, match="deterministic"):
        module.validate(candidate, ROOT)

    candidate = fixture("software")
    candidate["risk_tier"] = "crucial"
    candidate["security"]["changed_surfaces"] = ["generated-artifact"]
    candidate["security"]["artifact_surfaces"] = [{"artifact_id": "intent", "surfaces": ["generated-artifact"]}]
    candidate["security"]["checks"] = [{"id": "provenance", "surface": "generated-artifact", "status": "pass", "evidence_id": "security-provenance"}]
    candidate["evidence"].append({"id": "security-provenance", "kind": "deterministic", "gate": "provenance", "status": "pass", "method": "probe", "artifact_id": "evidence-bundle", "source_paths": ["input"], "result": {"exit_code": 0, "receipt_digest": "sha256:" + "b" * 64}})
    with pytest.raises(module.Invalid, match="derived surfaces"):
        module.validate(candidate, ROOT)

    candidate = fixture("software")
    candidate["security"].update({"status": "not_applicable", "reason": "self-declared", "changed_surfaces": [], "artifact_surfaces": [], "checks": []})
    with pytest.raises(module.Invalid, match=r"substantial\+ technical profile"):
        module.validate(candidate, ROOT)


def test_optional_family_failure_is_recorded_but_non_blocking(tmp_path):
    module = load_validator()
    workspace_root = tmp_path / "agent-product"
    candidate = fixture("agent-product", workspace_root)
    candidate["reviews"].append({
        "role": "bonus",
        "provider_family": "google",
        "adapter": "gemini",
        "independent_of_authorship": True,
        "lenses": ["security"],
        "status": "unavailable",
        "evidence_id": "",
        "reason": "quota",
    })
    module.validate(candidate, ROOT, workspace_root=workspace_root, verify_hashes=True)


def test_primary_reviews_require_distinct_matching_judgement_evidence():
    module = load_validator()
    candidate = fixture()
    candidate["reviews"][1]["evidence_id"] = candidate["reviews"][0]["evidence_id"]
    with pytest.raises(module.Invalid, match="distinct|lineage"):
        module.validate(candidate, ROOT)
    candidate = fixture()
    candidate["reviews"][1]["evidence_id"] = "tests"
    with pytest.raises(module.Invalid, match="judgement"):
        module.validate(candidate, ROOT)


def test_profile_gate_cannot_be_satisfied_by_wrong_evidence_kind():
    module = load_validator()
    candidate = fixture("research")
    next(item for item in candidate["evidence"] if item["gate"] == "source-coverage")["kind"] = "judgement"
    with pytest.raises(module.Invalid, match="profile gate|model_lineage"):
        module.validate(candidate, ROOT)


def test_closed_run_requires_observation_contract_and_accepted_human_gate():
    module = load_validator()
    candidate = fixture()
    candidate["status"] = "closed"
    candidate["checkpoint"].update({"current_slice": "closed", "next_action": "cycle closed", "in_flight": []})
    candidate["state_history"].extend([
        {"state": "accepted", "at": "2026-07-10T00:09:00Z", "evidence_ids": ["acceptance-approval"]},
        {"state": "awaiting_release", "at": "2026-07-10T00:10:00Z", "evidence_ids": ["acceptance-approval"]},
        {"state": "observing", "at": "2026-07-10T00:11:00Z", "evidence_ids": ["release-approval"]},
        {"state": "closed", "at": "2026-07-11T00:11:00Z", "evidence_ids": []},
    ])
    candidate["human_gates"]["acceptance"] = {"status": "approved", "approver": "human", "evidence": "acceptance-approval"}
    candidate["human_gates"]["release"] = {"status": "approved", "approver": "human", "evidence": "release-approval"}
    candidate["observation"] = None
    with pytest.raises(module.Invalid, match="observation"):
        module.validate(candidate, ROOT)

    candidate = fixture()
    candidate["human_gates"]["acceptance"] = {"status": "approved", "approver": "human", "evidence": "intent-approval"}
    candidate["status"] = "accepted"
    candidate["checkpoint"].update({"current_slice": "accepted", "next_action": "prepare release", "in_flight": []})
    candidate["state_history"].append({"state": "accepted", "at": "2026-07-10T00:09:00Z", "evidence_ids": ["intent-approval"]})
    with pytest.raises(module.Invalid, match="human acceptance"):
        module.validate(candidate, ROOT)


def test_observation_not_applicable_requires_profile_justification():
    module = load_validator()
    candidate = fixture()
    candidate["observation"] = {"status": "not_applicable", "reason": ""}
    with pytest.raises(module.Invalid, match="not_applicable"):
        module.validate(candidate, ROOT)


def test_closed_crucial_or_incident_cycle_requires_retrospective_linkage(tmp_path):
    module = load_validator()
    workspace_root = tmp_path / "agent-product"
    candidate = fixture("agent-product", workspace_root)
    candidate["risk_tier"] = "crucial"
    candidate["status"] = "closed"
    candidate["checkpoint"].update({"current_slice": "closed", "next_action": "cycle closed", "in_flight": []})
    candidate["state_history"].extend([
        {"state": "accepted", "at": "2026-07-10T00:09:00Z", "evidence_ids": ["acceptance-approval"]},
        {"state": "awaiting_release", "at": "2026-07-10T00:10:00Z", "evidence_ids": ["acceptance-approval"]},
        {"state": "observing", "at": "2026-07-10T00:11:00Z", "evidence_ids": ["release-approval"]},
        {"state": "closed", "at": "2026-07-11T00:11:00Z", "evidence_ids": ["observation"]},
    ])
    candidate["human_gates"]["acceptance"] = {"status": "approved", "approver": "human", "evidence": "acceptance-approval"}
    candidate["human_gates"]["release"] = {"status": "approved", "approver": "human", "evidence": "release-approval"}
    candidate["evidence"].append({"id": "observation-result", "kind": "observation", "gate": "task-success", "status": "pass", "method": "reference-observation", "artifact_id": "evidence-bundle", "source_paths": ["input"], "observed_at": "2026-07-10T12:00:00Z", "measured_value": 1})
    candidate["state_history"][-1]["evidence_ids"] = ["observation-result"]
    candidate["observation"]["status"] = "pass"
    candidate["observation"].update({"started_at": "2026-07-10T00:11:00Z", "ended_at": "2026-07-11T00:11:00Z", "observed_events": 1, "evidence_ids": ["observation-result"]})
    candidate["retrospective"] = None
    with pytest.raises(module.Invalid, match="retrospective"):
        module.validate(candidate, ROOT, workspace_root=workspace_root, verify_hashes=True)


def test_required_retrospective_cannot_borrow_another_delivery_cycle(tmp_path):
    module = load_validator()
    candidate = fixture("agent-product", tmp_path)
    candidate["risk_tier"] = "crucial"
    candidate["status"] = "closed"
    candidate["checkpoint"].update({"current_slice": "closed", "next_action": "cycle closed", "in_flight": []})
    candidate["state_history"].extend([
        {"state": "accepted", "at": "2026-07-10T00:09:00Z", "evidence_ids": ["acceptance-approval"]},
        {"state": "awaiting_release", "at": "2026-07-10T00:10:00Z", "evidence_ids": ["acceptance-approval"]},
        {"state": "observing", "at": "2026-07-10T00:11:00Z", "evidence_ids": ["release-approval"]},
        {"state": "closed", "at": "2026-07-11T00:11:00Z", "evidence_ids": ["observation-result"]},
    ])
    candidate["human_gates"]["acceptance"] = {"status": "approved", "approver": "human", "evidence": "acceptance-approval"}
    candidate["human_gates"]["release"] = {"status": "approved", "approver": "human", "evidence": "release-approval"}
    candidate["evidence"].append({
        "id": "observation-result", "kind": "observation", "gate": "task-success",
        "status": "pass", "method": "reference-observation", "artifact_id": "evidence-bundle",
        "source_paths": ["input"], "observed_at": "2026-07-10T12:00:00Z", "measured_value": 1,
    })
    candidate["observation"].update({
        "status": "pass", "started_at": "2026-07-10T00:11:00Z",
        "ended_at": "2026-07-11T00:11:00Z", "observed_events": 1,
        "evidence_ids": ["observation-result"],
    })

    retro_dir = tmp_path / "retro"
    retro_dir.mkdir()
    other = fixture("agent-product")
    other["run_id"] = "OTHER-CYCLE"
    source_path = retro_dir / "OTHER.json"
    source_path.write_text(json.dumps(other))
    retro = json.loads((ROOT / "skills" / "retrospect" / "templates" / "RETROSPECT.template.json").read_text())
    retro.update({"status": "no-change", "proposals": []})
    retro["scope"].update({
        "cycle_ids": ["OTHER-CYCLE"], "profile": "agent-product",
        "baseline": {"cycle_ids": ["OTHER-CYCLE"], "absence_reason": ""},
    })
    retro["sources"] = [{
        "kind": "delivery", "id": "OTHER-CYCLE", "path": "OTHER.json",
        "sha256": hashlib.sha256(source_path.read_bytes()).hexdigest(), "schema_version": 1,
    }]
    retro["metrics"][0]["source_ids"] = ["OTHER-CYCLE"]
    retro["findings"][0]["evidence_ids"] = ["OTHER-CYCLE"]
    retro_path = retro_dir / "RETROSPECT.json"
    retro_path.write_text(json.dumps(retro))
    retro_digest = "sha256:" + hashlib.sha256(retro_path.read_bytes()).hexdigest()
    candidate["artifacts"].append({
        "id": "retrospective", "path": "retro/RETROSPECT.json", "media_type": "application/json",
        "artifact_type": "evidence", "digest": retro_digest, "class": "evidence",
        "owner": "delivery-chair", "retention": "risk-policy",
    })
    candidate["retrospective"] = {"status": "no-change", "artifact_id": "retrospective", "digest": retro_digest}
    with pytest.raises(module.Invalid, match="current delivery cycle"):
        module.validate(candidate, ROOT, workspace_root=tmp_path, verify_hashes=True)


def test_checkpoint_and_observation_substates_follow_lifecycle_state():
    module = load_validator()
    candidate = fixture()
    candidate["status"] = "observing"
    candidate["state_history"].extend([
        {"state": "accepted", "at": "2026-07-10T00:09:00Z", "evidence_ids": ["acceptance-approval"]},
        {"state": "awaiting_release", "at": "2026-07-10T00:10:00Z", "evidence_ids": ["acceptance-approval"]},
        {"state": "observing", "at": "2026-07-10T00:11:00Z", "evidence_ids": ["release-approval"]},
    ])
    candidate["human_gates"]["acceptance"] = {"status": "approved", "approver": "human", "evidence": "acceptance-approval"}
    candidate["human_gates"]["release"] = {"status": "approved", "approver": "human", "evidence": "release-approval"}
    candidate["checkpoint"].update({"current_slice": "observing", "next_action": "complete observation", "in_flight": []})
    candidate["observation"]["status"] = "planned"
    with pytest.raises(module.Invalid, match="observing.*active or pass"):
        module.validate(candidate, ROOT)

    candidate["observation"]["status"] = "active"
    module.validate(candidate, ROOT)
    candidate["checkpoint"]["current_slice"] = "awaiting-acceptance"
    with pytest.raises(module.Invalid, match="checkpoint.current_slice"):
        module.validate(candidate, ROOT)


def test_closed_checkpoint_is_terminal_and_only_references_known_artifacts():
    module = load_validator()
    candidate = fixture()
    candidate["checkpoint"]["artifact_paths"] = ["missing-review.md"]
    with pytest.raises(module.Invalid, match="checkpoint artifact.*declared or live"):
        module.validate(candidate, ROOT)


def test_high_stakes_overlay_requires_source_authority_privacy_and_qualified_review():
    module = load_validator()
    candidate = fixture("document")
    candidate["high_stakes"] = True
    with pytest.raises(module.Invalid, match="high[-_]stakes"):
        module.validate(candidate, ROOT)
    candidate["high_stakes_controls"] = {
        "source_authority": {"status": "pass", "evidence_id": "intent-approval", "authority": "human"},
        "privacy": {"status": "pass", "evidence_id": "render", "privacy_boundary": "private"},
        "qualified_domain_review": {"status": "pass", "evidence_id": "intent-approval", "domain": "law", "reviewer": "human", "qualification": "claimed"},
        "explicit_human_action_gate": {"status": "pass", "evidence_id": "intent-approval", "action": "file", "approved_by": "human"},
    }
    with pytest.raises(module.Invalid, match="matching|distinct"):
        module.validate(candidate, ROOT)


def test_awaiting_acceptance_requires_outcome_trajectory_and_bound_stochastic_evidence(tmp_path):
    module = load_validator()
    candidate = fixture("agent-product")
    candidate["measures"]["trajectory"] = []
    with pytest.raises(module.Invalid, match="trajectory"):
        module.validate(candidate, ROOT)

    workspace_root = tmp_path / "agent-product"
    candidate = fixture("agent-product", workspace_root)
    with pytest.raises(module.Invalid, match="requires --verify-hashes"):
        module.validate(candidate, ROOT, workspace_root=workspace_root)
    module.validate(candidate, ROOT, workspace_root=workspace_root, verify_hashes=True)

    candidate["assurance"]["evaluations"][0]["repetitions"] = 3
    with pytest.raises(module.Invalid, match="canonical receipt binding fields"):
        module.validate(candidate, ROOT, workspace_root=workspace_root, verify_hashes=True)

    candidate = fixture("software")
    candidate["measures"]["outcome"][0].pop("target")
    with pytest.raises(module.Invalid, match="value, target and aggregation"):
        module.validate(candidate, ROOT)


def test_stochastic_binding_anchors_plan_before_execution_then_completes(tmp_path):
    module = load_validator()
    workspace_root = tmp_path / "two-phase"
    complete = fixture("agent-product", workspace_root)
    complete_row = complete["assurance"]["evaluations"][0]
    anchored_values = (complete_row["evaluation_id"], complete_row["plan_digest"])

    planned = copy.deepcopy(complete)
    planned["status"] = "executing"
    planned["state_history"] = planned["state_history"][:4]
    planned["checkpoint"].update({
        "current_slice": "executing", "next_action": "run frozen evaluation",
        "in_flight": ["evaluation"],
    })
    planned["reviews"] = []
    planned["measures"] = {"outcome": [], "trajectory": []}
    planned["evidence"] = [
        item for item in planned["evidence"] if item["kind"] != "judgement"
    ]
    planned["artifacts"] = [
        item for item in planned["artifacts"] if item["id"] != "evaluation-receipt"
    ]
    planned_row = planned["assurance"]["evaluations"][0]
    planned_row.update({
        "status": "planned", "evaluation_artifact_id": "",
        "evaluation_digest": "", "evidence_id": "",
    })
    module.validate(planned, ROOT)
    assert (planned_row["evaluation_id"], planned_row["plan_digest"]) == anchored_values

    transitioned = copy.deepcopy(complete)
    transitioned_row = copy.deepcopy(planned_row)
    transitioned_row.update({
        field: complete_row[field]
        for field in ("status", "evaluation_artifact_id", "evaluation_digest", "evidence_id")
    })
    transitioned["assurance"]["evaluations"][0] = transitioned_row
    assert (transitioned_row["evaluation_id"], transitioned_row["plan_digest"]) == anchored_values
    module.validate(
        transitioned, ROOT, workspace_root=workspace_root, verify_hashes=True,
    )

    awaiting = copy.deepcopy(complete)
    awaiting_row = awaiting["assurance"]["evaluations"][0]
    awaiting_row.update({
        "status": "planned", "evaluation_artifact_id": "",
        "evaluation_digest": "", "evidence_id": "",
    })
    awaiting["artifacts"] = [
        item for item in awaiting["artifacts"] if item["id"] != "evaluation-receipt"
    ]
    with pytest.raises(module.Invalid, match="must be complete before stochastic acceptance"):
        module.validate(awaiting, ROOT)

    assert (complete_row["evaluation_id"], complete_row["plan_digest"]) == anchored_values


def test_stochastic_anchor_must_precede_nested_evaluation_execution(tmp_path):
    module = load_validator()
    workspace_root = tmp_path / "late-anchor"
    candidate = fixture("agent-product", workspace_root)
    candidate["assurance"]["evaluations"][0]["anchored_at"] = "2026-07-10T00:03:00Z"
    with pytest.raises(module.Invalid, match="precede its nested evaluation execution"):
        module.validate(candidate, ROOT, workspace_root=workspace_root, verify_hashes=True)


@pytest.mark.parametrize("terminal_status", ["failed", "incomplete"])
def test_terminal_evaluation_is_retained_but_cannot_satisfy_acceptance(
    tmp_path, terminal_status,
):
    module = load_validator()
    materialiser = load(
        REFERENCE_EVALUATION_PATH, f"terminal_evaluation_{terminal_status}",
    )
    workspace_root = tmp_path / terminal_status
    candidate = fixture("agent-product")
    terminalise_reference_evaluation(candidate, terminal_status)
    awaiting_transition = copy.deepcopy(candidate["state_history"][-1])
    candidate["status"] = "reviewing"
    candidate["state_history"] = candidate["state_history"][:-1]
    candidate["checkpoint"].update({
        "current_slice": "reviewing", "next_action": "decide whether to retry",
        "in_flight": [],
    })
    materialiser.materialise_reference_run(
        candidate, workspace_root, ROOT,
        evaluation_repetitions=2, evaluation_sample_size=1,
    )
    module.validate(
        candidate, ROOT, workspace_root=workspace_root, verify_hashes=True,
    )

    awaiting = copy.deepcopy(candidate)
    awaiting["status"] = "awaiting_acceptance"
    awaiting["state_history"].append(awaiting_transition)
    awaiting["checkpoint"].update({
        "current_slice": "awaiting-acceptance", "next_action": "human acceptance",
    })
    with pytest.raises(module.Invalid, match="at least one complete passing evaluation"):
        module.validate(
            awaiting, ROOT, workspace_root=workspace_root, verify_hashes=True,
        )


def test_terminal_evaluation_requires_deterministic_not_judgement_evidence(tmp_path):
    module = load_validator()
    materialiser = load(REFERENCE_EVALUATION_PATH, "terminal_evidence_kind")
    workspace_root = tmp_path / "terminal-evidence"
    candidate = fixture("agent-product")
    binding = terminalise_reference_evaluation(candidate)
    materialiser.materialise_reference_run(candidate, workspace_root, ROOT)
    binding["evidence_id"] = next(
        item["id"] for item in candidate["evidence"] if item["kind"] == "judgement"
    )
    with pytest.raises(module.Invalid, match="terminal nonpass.*deterministic evidence"):
        module.validate(
            candidate, ROOT, workspace_root=workspace_root, verify_hashes=True,
        )


def test_fresh_complete_plan_after_failed_evaluation_can_satisfy_acceptance(tmp_path):
    module = load_validator()
    materialiser = load(REFERENCE_EVALUATION_PATH, "fresh_after_failed")
    workspace_root = tmp_path / "fresh-after-failed"
    candidate = fixture("agent-product")
    failed = terminalise_reference_evaluation(candidate)
    failed["evaluation_id"] = "EVAL-FAILED-FIRST"

    candidate["artifacts"].append({
        "id": "evaluation-retry",
        "path": "evaluation-retry/EVALUATION.json",
        "media_type": "application/json",
        "artifact_type": "evidence",
        "digest": "sha256:" + "e" * 64,
        "class": "evidence",
        "owner": "evaluation-chair",
        "retention": "risk-policy",
    })
    retry = {
        "status": "complete",
        "anchored_at": "2026-07-10T00:04:30Z",
        "evidence_id": next(
            item["id"] for item in candidate["evidence"]
            if item["kind"] == "judgement" and item["model_lineage"]["provider_family"] == "openai"
        ),
        "evaluation_artifact_id": "evaluation-retry",
        "evaluation_id": "EVAL-RETRY",
        "evaluation_digest": "sha256:" + "e" * 64,
        "plan_digest": "sha256:" + "e" * 64,
    }
    candidate["assurance"]["evaluations"].append(retry)
    candidate["state_history"][-2]["at"] = "2026-07-10T00:07:30Z"
    candidate["state_history"][-1]["at"] = "2026-07-10T00:08:00Z"

    materialiser.materialise_reference_run(candidate, workspace_root, ROOT)
    materialiser.materialise_evaluation_binding(
        candidate, workspace_root, ROOT, binding_index=0,
        repetitions=2, sample_size=1,
    )
    materialiser.materialise_evaluation_binding(
        candidate, workspace_root, ROOT, binding_index=1,
        repetitions=3, sample_size=10, time_offset_minutes=2,
    )

    first_execution = next(
        item["at"] for item in candidate["state_history"] if item["state"] == "executing"
    )
    assert retry["anchored_at"] > first_execution

    planned_retry = copy.deepcopy(candidate)
    planned_retry["status"] = "executing"
    planned_retry["state_history"] = planned_retry["state_history"][:5] + [{
        "state": "executing", "at": "2026-07-10T00:05:30Z", "evidence_ids": [],
    }]
    planned_retry["checkpoint"].update({
        "current_slice": "executing", "next_action": "run fresh evaluation plan",
        "in_flight": ["EVAL-RETRY"],
    })
    planned_retry_binding = planned_retry["assurance"]["evaluations"][1]
    planned_retry_binding.update({
        "status": "planned", "evaluation_artifact_id": "",
        "evaluation_digest": "", "evidence_id": "",
    })
    planned_retry["artifacts"] = [
        item for item in planned_retry["artifacts"] if item["id"] != "evaluation-retry"
    ]
    module.validate(
        planned_retry, ROOT, workspace_root=workspace_root, verify_hashes=True,
    )

    module.validate(
        candidate, ROOT, workspace_root=workspace_root, verify_hashes=True,
    )


@pytest.mark.parametrize(
    ("anchor", "replacement", "message"),
    [
        ("evaluation_id", "EVAL-FORGED", "evaluation_id does not match"),
        ("plan_digest", "sha256:" + "0" * 64, "plan.digest does not match"),
    ],
)
def test_stochastic_evaluation_rejects_forged_delivery_anchors(
    tmp_path, anchor, replacement, message,
):
    module = load_validator()
    workspace_root = tmp_path / anchor
    candidate = fixture("agent-product", workspace_root)
    candidate["assurance"]["evaluations"][0][anchor] = replacement
    with pytest.raises(module.Invalid, match=message):
        module.validate(candidate, ROOT, workspace_root=workspace_root, verify_hashes=True)


def test_stochastic_evaluation_is_bound_to_the_enclosing_delivery_run(tmp_path):
    module = load_validator()
    workspace_root = tmp_path / "run-id"
    candidate = fixture("agent-product", workspace_root)
    candidate["run_id"] = "FORGED-DELIVERY"
    with pytest.raises(module.Invalid, match="enclosing_delivery_run_id does not match"):
        module.validate(candidate, ROOT, workspace_root=workspace_root, verify_hashes=True)


def test_stochastic_evaluation_verifies_nested_artifact_hashes(tmp_path):
    module = load_validator()
    workspace_root = tmp_path / "nested-hash"
    candidate = fixture("agent-product", workspace_root)
    output = workspace_root / "evaluation" / "evidence" / "output.json"
    output.write_text(output.read_text() + "tampered\n")
    with pytest.raises(module.Invalid, match="artifact output digest mismatch"):
        module.validate(candidate, ROOT, workspace_root=workspace_root, verify_hashes=True)


@pytest.mark.parametrize(
    ("repetitions", "sample_size", "message"),
    [
        (2, 10, "bound plan repetitions are below"),
        (3, 1, "bound plan sample size is below"),
    ],
)
def test_stochastic_evaluation_uses_bound_plan_for_profile_minimums(
    tmp_path, repetitions, sample_size, message,
):
    module = load_validator()
    workspace_root = tmp_path / f"{repetitions}-{sample_size}"
    candidate = fixture(
        "agent-product", workspace_root,
        evaluation_repetitions=repetitions,
        evaluation_sample_size=sample_size,
    )
    with pytest.raises(module.Invalid, match=message):
        module.validate(candidate, ROOT, workspace_root=workspace_root, verify_hashes=True)


def test_global_policy_root_cannot_be_replaced_by_project_registry(tmp_path):
    module = load_validator()
    with pytest.raises(module.Invalid, match="global policy root"):
        module.validate(fixture(), tmp_path)


def test_project_policy_can_only_add_a_digest_bound_profile_or_gate(tmp_path):
    module = load_validator()
    candidate = fixture("research")
    overlay_path = tmp_path / "delivery-policy.json"
    overlay = {"schema_version": 1, "profiles": {"research": {"artifact_types": ["anything"]}}}
    raw = json.dumps(overlay).encode()
    overlay_path.write_bytes(raw)
    candidate["project_policy"] = {"path": "delivery-policy.json", "digest": "sha256:" + hashlib.sha256(raw).hexdigest()}
    with pytest.raises(module.Invalid, match="non-additive"):
        module.validate(candidate, ROOT, workspace_root=tmp_path, project_policy_path=overlay_path)

    registry = json.loads((ROOT / "config" / "delivery-profiles.json").read_text())
    custom = copy.deepcopy(registry["profiles"]["research"])
    overlay = {"schema_version": 1, "profiles": {"evidence-brief": custom}}
    raw = json.dumps(overlay).encode()
    overlay_path.write_bytes(raw)
    candidate = fixture("research")
    candidate["profile"] = "evidence-brief"
    candidate["project_policy"] = {"path": "delivery-policy.json", "digest": "sha256:" + hashlib.sha256(raw).hexdigest()}
    module.validate(candidate, ROOT, workspace_root=tmp_path, project_policy_path=overlay_path)


def test_project_defined_technical_profile_cannot_bypass_artifact_security(tmp_path):
    module = load_validator()
    registry = json.loads((ROOT / "config" / "delivery-profiles.json").read_text())
    overlay_path = tmp_path / "delivery-policy.json"
    overlay = {"schema_version": 1, "profiles": {"firmware": copy.deepcopy(registry["profiles"]["software"])}}
    raw = json.dumps(overlay).encode()
    overlay_path.write_bytes(raw)
    candidate = fixture("software")
    candidate["profile"] = "firmware"
    candidate["project_policy"] = {"path": "delivery-policy.json", "digest": "sha256:" + hashlib.sha256(raw).hexdigest()}
    module.validate(candidate, ROOT, workspace_root=tmp_path, project_policy_path=overlay_path)

    candidate["security"].update({"status": "not_applicable", "reason": "custom profile", "changed_surfaces": [], "artifact_surfaces": [], "checks": []})
    with pytest.raises(module.Invalid, match=r"substantial\+ technical profile"):
        module.validate(candidate, ROOT, workspace_root=tmp_path, project_policy_path=overlay_path)

    unknown = copy.deepcopy(registry["profiles"]["software"])
    unknown["artifact_types"] = ["firmware-binary"]
    raw = json.dumps({"schema_version": 1, "profiles": {"firmware": unknown}}).encode()
    overlay_path.write_bytes(raw)
    candidate = fixture("software")
    candidate["profile"] = "firmware"
    candidate["artifacts"][0]["artifact_type"] = "firmware-binary"
    candidate["project_policy"] = {"path": "delivery-policy.json", "digest": "sha256:" + hashlib.sha256(raw).hexdigest()}
    with pytest.raises(module.Invalid, match="unclassified artifact type"):
        module.validate(candidate, ROOT, workspace_root=tmp_path, project_policy_path=overlay_path)
