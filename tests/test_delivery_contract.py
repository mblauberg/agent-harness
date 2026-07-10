import copy
import hashlib
import importlib.util
import json
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[1]
VALIDATOR_PATH = ROOT / "skills" / "deliver" / "scripts" / "validate_delivery.py"
REFERENCE_RUNS_PATH = ROOT / "skills" / "deliver" / "scripts" / "reference_runs.py"


def load_validator():
    spec = importlib.util.spec_from_file_location("validate_delivery", VALIDATOR_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(module)
    return module


def fixture(profile="software"):
    module = load(REFERENCE_RUNS_PATH, f"reference_runs_{profile}")
    return module.make_reference_run(profile, ROOT)


def load(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(module)
    return module


def test_reference_run_for_every_profile_passes():
    module = load_validator()
    for profile in ("software", "research", "analysis", "document", "agent-product"):
        module.validate(fixture(profile), ROOT)


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


def test_optional_family_failure_is_recorded_but_non_blocking():
    module = load_validator()
    candidate = fixture("agent-product")
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
    module.validate(candidate, ROOT)


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


def test_closed_crucial_or_incident_cycle_requires_retrospective_linkage():
    module = load_validator()
    candidate = fixture("agent-product")
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
        module.validate(candidate, ROOT)


def test_required_retrospective_cannot_borrow_another_delivery_cycle(tmp_path):
    module = load_validator()
    candidate = fixture("agent-product")
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
        module.validate(candidate, ROOT, workspace_root=tmp_path)


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


def test_awaiting_acceptance_requires_outcome_trajectory_and_reproducible_stochastic_evidence():
    module = load_validator()
    candidate = fixture("agent-product")
    candidate["measures"]["trajectory"] = []
    with pytest.raises(module.Invalid, match="trajectory"):
        module.validate(candidate, ROOT)
    candidate = fixture("agent-product")
    candidate["assurance"]["evaluations"][0]["repetitions"] = 1
    with pytest.raises(module.Invalid, match="repetitions"):
        module.validate(candidate, ROOT)
    candidate = fixture("software")
    candidate["measures"]["outcome"][0].pop("target")
    with pytest.raises(module.Invalid, match="value, target and aggregation"):
        module.validate(candidate, ROOT)


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
