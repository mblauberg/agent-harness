import importlib.util
import hashlib
import json
from pathlib import Path
import subprocess


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "validate_run.py"
SPEC = importlib.util.spec_from_file_location("validate_run", SCRIPT)
validate_run = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
SPEC.loader.exec_module(validate_run)
ARTIFACT_SHA = hashlib.sha256(b"artifact").hexdigest()


def scope_receipt_bytes(run):
    approval = run["scope_approval"]
    return (json.dumps({
        "approved_by": approval["approved_by"],
        "approved_at": approval["approved_at"],
        "binding_digest": approval["digest"],
    }, sort_keys=True) + "\n").encode()


def write_scope_receipt(run, directory):
    path = directory / run["scope_approval"]["receipt"]
    path.write_bytes(scope_receipt_bytes(run))
    path.chmod(0o444)


def valid_run(tier="substantial"):
    reviews = [
        {
            "role": "native-review",
            "adapter": "native-subagent",
            "provider_family": "openai",
            "status": "pass",
            "output_path": "native-review.md",
            "sha256": ARTIFACT_SHA,
            "reviewed_revision": "rev-final",
            "dispatch_status": "not-applicable",
            "cross_family": False,
            "certification_eligible": False,
            "read_only_guarantee": "source-read-only",
            "independence": {"fresh_context": True, "authored_reviewed_surface": False, "decision_influence_on_reviewed_surface": False},
        },
        {
            "role": "other-primary",
            "adapter": "claude-code",
            "provider_family": "anthropic",
            "status": "pass",
            "output_path": "other-primary.md",
            "sha256": ARTIFACT_SHA,
            "reviewed_revision": "rev-final",
            "route_receipt": "other-primary.route.json",
            "dispatch_status": "ok",
            "cross_family": True,
            "certification_eligible": True,
            "read_only_guarantee": "enforced",
            "independence": {"fresh_context": True, "authored_reviewed_surface": False, "decision_influence_on_reviewed_surface": False},
        },
    ]
    if tier in {"crucial", "terminal"}:
        reviews.append(
            {
                "role": "bonus-family-1",
                "adapter": "cursor",
                "provider_family": "xai",
                "status": "unavailable",
                "reason": "usage limit",
            }
        )
    if tier == "terminal":
        reviews.append(
            {
                "role": "bonus-family-2",
                "adapter": "agy",
                "provider_family": "google",
                "status": "failed",
                "reason": "API error",
            }
        )
    blast = {"routine": "local", "substantial": "multi-module", "crucial": "shared-system", "terminal": "production"}[tier]
    run = {
        "schema_version": 1,
        "task_id": "CHG-1",
        "mode": "normal",
        "updated_at": "2026-07-10T00:00:00Z",
        "risk_tier": tier,
        "risk_assessment": {
            "blast_radius": blast,
            "reversibility": "easy",
            "data_sensitivity": "public",
            "migration": "none",
            "oracle_quality": "strong",
            "external_effects": "none",
            "critical_surface": "none",
        },
        "risk_override": {"approved_by": "", "reason": ""},
        "expedited": {"reason": "", "authorised_by": "", "incident_reference": "", "reconcile_by": "", "follow_up_owner": ""},
        "lead_family": "openai",
        "authority": {
            "approved_by": "human",
            "expires_at": "2026-07-11T00:00:00Z",
            "source_write_paths": ["src/"],
            "artifact_write_paths": ["."],
            "prohibited_paths": ["secrets/"],
            "prohibited_actions": ["deployment"],
            "ignored_path_exemptions": [],
            "external_disclosure": "forbidden",
            "disclosure_providers": [],
            "secrets_access": "none",
            "deployment": False,
            "irreversible_actions": False,
        },
        "phase": "awaiting-human",
        "spec": {
            "status": "approved",
            "approved_by": "human",
            "acceptance_criteria": [
                {"id": "AC-1", "status": "pass", "evidence": ["pytest: pass"]}
            ],
        },
        "design": {"status": "not-required"},
        "implementation": {
            "status": "complete",
            "repo_root": "/tmp/repo",
            "base_revision": "base",
            "result_revision": "rev-final",
            "preexisting_paths": [],
            "applied_paths": [{"path": "src/change.py", "operation": "modify", "sha256": "a" * 64}],
        },
        "verification": {
            "status": "pass",
            "checks": [{"command": "pytest", "exit_code": 0}],
        },
        "checkpoint": {
            "generation": 3,
            "current_slice": "human acceptance",
            "next_action": "human reviews the machine-gated change",
            "in_flight": [],
            "artifact_paths": ["RUN.json", "review.md"],
        },
        "context_hygiene": {
            "status": "pass",
            "audit_command": "context_audit.py . --json",
            "audit_exit_code": 0,
            "actions": ["graduated findings"],
            "retained": ["RUN.json", "review.md"],
        },
        "assurance": {"evaluation_required": False, "reason": "deterministic", "receipt": "", "status": "not-required"},
        "pair": {"mode": "solo", "chair_family": "openai", "peer_family": "anthropic", "status": "not-running", "degradation_reason": "", "stage_ledger": []},
        "review_council": {
            "status": "pass",
            "reviewed_revision": "rev-final",
            "lenses": [
                {"name": "correctness-spec", "blind": True, "output_path": "native-review.md", "sha256": ARTIFACT_SHA, "reviewed_revision": "rev-final", "review_role": "native-review", "actor_family": "openai", "adapter": "native-subagent"},
                {"name": "tests-structure", "blind": True, "output_path": "other-primary.md", "sha256": ARTIFACT_SHA, "reviewed_revision": "rev-final", "review_role": "other-primary", "actor_family": "anthropic", "adapter": "claude-code"},
            ],
            "challenge": {"anonymized": True, "randomized": True, "output_path": "challenge.md", "sha256": ARTIFACT_SHA},
            "reduction": {"fresh_context": True, "output_path": "reduction.md", "sha256": ARTIFACT_SHA, "unresolved_dissent": []},
            "post_repair_review": True,
        },
        "reviews": reviews,
        "repair_cycles": 1,
        "unresolved_blockers": [],
        "human_final": {"status": "pending"},
    }
    canonical_revision = validate_run._result_revision(
        run["implementation"]["base_revision"], run["implementation"]["applied_paths"]
    )
    run["implementation"]["result_revision"] = canonical_revision
    run["review_council"]["reviewed_revision"] = canonical_revision
    for lens in run["review_council"]["lenses"]:
        lens["reviewed_revision"] = canonical_revision
    for review in run["reviews"]:
        if review.get("status") == "pass":
            review["reviewed_revision"] = canonical_revision
    run["scope_approval"] = {
        "approved_by": "human",
        "approved_at": "2026-07-10T00:00:00Z",
        "digest": validate_run._scope_approval_digest(run),
        "receipt": "SCOPE_APPROVAL.json",
    }
    run["scope_approval"]["receipt_sha256"] = hashlib.sha256(scope_receipt_bytes(run)).hexdigest()
    return run


def test_valid_substantial_run_reaches_human_gate():
    assert validate_run.validate(valid_run()) == []


def test_spec_approval_is_required():
    run = valid_run()
    run["spec"]["status"] = "draft"
    assert "spec.status must be approved" in validate_run.validate(run)


def test_repair_loop_is_bounded():
    run = valid_run()
    run["repair_cycles"] = 3
    assert "repair_cycles must be between 0 and 2" in validate_run.validate(run)


def test_substantial_run_requires_recovery_checkpoint_and_context_hygiene():
    run = valid_run()
    del run["checkpoint"]
    del run["context_hygiene"]
    errors = validate_run.validate(run)
    assert "checkpoint must record current_slice and next_action" in errors
    assert "context_hygiene.status must be pass" in errors


def test_human_gate_rejects_fake_or_inflight_recovery_evidence(tmp_path):
    run = valid_run()
    run["updated_at"] = "x"
    run["checkpoint"]["in_flight"] = ["worker-1"]
    run["context_hygiene"]["audit_exit_code"] = 7
    errors = validate_run.validate(run)
    assert "updated_at must be a UTC timestamp for substantial and higher runs" in errors
    assert "checkpoint.in_flight must be empty at the human gate" in errors
    assert "context_hygiene.audit_exit_code must be 0" in errors


def test_cli_path_validation_rejects_missing_recovery_artifacts(tmp_path):
    run = valid_run()
    errors = validate_run.validate(run, base_dir=tmp_path)
    assert any("path does not exist" in error for error in errors)


def test_bonus_family_failure_is_recorded_but_does_not_block():
    run = valid_run("crucial")
    assert validate_run.validate(run) == []


def test_repeated_attempts_through_the_same_bonus_family_do_not_block():
    run = valid_run("terminal")
    run["reviews"][3]["provider_family"] = "xai"
    run["bonus_coverage_reason"] = "Gemini quota unavailable; xAI retry recorded honestly"
    assert validate_run.validate(run) == []


def test_terminal_duplicate_bonus_family_requires_reduced_coverage_reason():
    run = valid_run("terminal")
    run["reviews"][3]["provider_family"] = "xai"
    assert "terminal tier with fewer than two distinct bonus families must record bonus_coverage_reason" in validate_run.validate(run)


def test_fresh_context_native_review_is_required_for_substantial_work():
    run = valid_run()
    run["reviews"] = [item for item in run["reviews"] if item["role"] != "native-review"]
    assert "required fresh-context native review is missing" in validate_run.validate(run)


def test_complete_gate_requires_human_approval():
    run = valid_run()
    assert "human_final.status must be approved" in validate_run.validate(run, gate="complete")
    run["human_final"] = {"status": "approved", "approved_by": "human"}
    run["phase"] = "complete"
    assert validate_run.validate(run, gate="complete") == []


def test_machine_gate_cannot_claim_complete_before_human_approval():
    run = valid_run()
    run["phase"] = "complete"
    assert "phase must be awaiting-human at the machine gate" in validate_run.validate(run)


def test_other_primary_must_be_the_other_equal_primary_family():
    run = valid_run()
    run["reviews"][1]["provider_family"] = "xai"
    assert "other-primary review must use anthropic for an openai lead" in validate_run.validate(run)


def test_other_primary_requires_dispatch_certification_evidence():
    run = valid_run()
    run["reviews"][1]["certification_eligible"] = False
    run["reviews"][1]["dispatch_status"] = "error"
    errors = validate_run.validate(run)
    assert "other-primary review dispatch_status must be ok" in errors
    assert "other-primary review must carry certified cross-family lineage" in errors


def test_risk_tier_cannot_be_silently_downgraded():
    run = valid_run("substantial")
    run["risk_tier"] = "routine"
    errors = validate_run.validate(run)
    assert "risk_tier is below derived minimum substantial; human override required" in errors
    run["risk_override"] = {"approved_by": "human", "reason": "isolated behind fixture"}
    assert "risk_tier is below derived minimum substantial; human override required" not in validate_run.validate(run)


def test_critical_surface_raises_the_derived_risk_floor():
    run = valid_run("substantial")
    run["risk_assessment"]["critical_surface"] = "auth-security"
    errors = validate_run.validate(run)
    assert "risk_tier is below derived minimum crucial; human override required" in errors
    assert "scope_approval digest does not bind current risk, authority, spec and design" in errors


def test_substantial_run_requires_machine_readable_authority():
    run = valid_run()
    del run["authority"]
    assert "authority is required for substantial and higher runs" in validate_run.validate(run)


def test_authority_must_cover_the_current_checkpoint():
    run = valid_run()
    run["authority"]["expires_at"] = run["updated_at"]
    assert "authority expires_at must be after the run checkpoint" in validate_run.validate(run)


def test_required_evaluation_receipt_must_pass(tmp_path):
    run = valid_run()
    run["assurance"] = {"evaluation_required": True, "status": "pending", "receipt": ""}
    assert "required evaluation assurance must pass with a receipt" in validate_run.validate(run)


def test_required_evaluation_receipt_content_is_validated(tmp_path):
    run = valid_run()
    run["assurance"] = {"evaluation_required": True, "status": "pass", "receipt": "EVALUATION.json"}
    for path in ("RUN.json", "review.md", "native-review.md", "other-primary.md", "challenge.md", "reduction.md"):
        (tmp_path / path).write_text("artifact")
    (tmp_path / "other-primary.route.json").write_text(json.dumps({
        "status": "ok", "provider_family": "anthropic", "cross_family": True,
        "certification_eligible": True, "read_only_guarantee": "enforced",
        "output_path": str(tmp_path / "other-primary.md"),
    }))
    write_scope_receipt(run, tmp_path)
    (tmp_path / "EVALUATION.json").write_text("{}")
    assert "assurance.receipt must pass the evaluation validator" in validate_run.validate(run, base_dir=tmp_path)


def test_implementation_paths_must_stay_within_authority():
    run = valid_run()
    run["implementation"]["applied_paths"] = [
        {"path": "secrets/key.txt", "operation": "modify", "sha256": "b" * 64}
    ]
    errors = validate_run.validate(run)
    assert "implementation path is outside source_write_paths: secrets/key.txt" in errors
    assert "implementation path is prohibited: secrets/key.txt" in errors


def test_shared_worktree_root_cannot_be_authorised_or_recorded_as_a_change():
    run = valid_run()
    run["authority"]["source_write_paths"] = [".worktrees/peer"]
    run["authority"]["artifact_write_paths"] = [".worktrees"]
    run["implementation"]["applied_paths"] = [
        {"path": ".worktrees/peer/source.py", "operation": "modify", "sha256": "b" * 64}
    ]
    errors = validate_run.validate(run)
    assert "authority.source_write_paths cannot target protected .worktrees infrastructure" in errors
    assert "authority.artifact_write_paths cannot target protected .worktrees infrastructure" in errors
    assert "implementation path targets protected .worktrees infrastructure: .worktrees/peer/source.py" in errors


def test_review_council_must_cover_final_revision_and_blind_lenses():
    run = valid_run()
    run["review_council"]["reviewed_revision"] = "old"
    run["review_council"]["lenses"][0]["blind"] = False
    errors = validate_run.validate(run)
    assert "review_council must review the final implementation revision" in errors
    assert "review_council.lenses[0] must be blind with output_path" in errors


def test_review_council_artifacts_must_be_distinct_and_route_bound():
    run = valid_run()
    run["review_council"]["lenses"][1]["output_path"] = "native-review.md"
    run["reviews"][1]["output_path"] = "native-review.md"
    run["review_council"]["challenge"]["output_path"] = "native-review.md"
    errors = validate_run.validate(run)
    assert "passing reviews must use distinct output paths" in errors
    assert "review_council artifacts must use distinct output paths" in errors


def test_other_primary_route_receipt_is_required():
    run = valid_run()
    run["reviews"][1]["route_receipt"] = ""
    assert "other-primary review must reference a dispatcher route receipt" in validate_run.validate(run)


def test_live_git_gate_recomputes_paths_hashes_and_result_revision(tmp_path):
    repo = tmp_path / "repo"
    run_dir = tmp_path / "run"
    (repo / "src").mkdir(parents=True)
    run_dir.mkdir()
    subprocess.run(["git", "init", "-q", str(repo)], check=True)
    subprocess.run(["git", "-C", str(repo), "config", "user.email", "test@example.com"], check=True)
    subprocess.run(["git", "-C", str(repo), "config", "user.name", "Test"], check=True)
    target = repo / "src" / "change.py"
    target.write_text("before\n")
    subprocess.run(["git", "-C", str(repo), "add", "."], check=True)
    subprocess.run(["git", "-C", str(repo), "commit", "-qm", "base"], check=True)
    base = subprocess.check_output(["git", "-C", str(repo), "rev-parse", "HEAD"], text=True).strip()
    target.write_text("after\n")
    digest = validate_run._file_sha256(target)
    run = valid_run()
    run["implementation"] = {
        "status": "complete",
        "repo_root": str(repo),
        "base_revision": base,
        "preexisting_paths": [],
        "applied_paths": [{"path": "src/change.py", "operation": "modify", "sha256": digest}],
    }
    run["implementation"]["result_revision"] = validate_run._result_revision(
        base, run["implementation"]["applied_paths"]
    )
    run["review_council"]["reviewed_revision"] = run["implementation"]["result_revision"]
    for lens in run["review_council"]["lenses"]:
        lens["reviewed_revision"] = run["implementation"]["result_revision"]
    for review in run["reviews"]:
        if review.get("status") == "pass":
            review["reviewed_revision"] = run["implementation"]["result_revision"]
    for path in ("RUN.json", "review.md", "native-review.md", "other-primary.md", "challenge.md", "reduction.md"):
        (run_dir / path).write_text("artifact")
    (run_dir / "other-primary.route.json").write_text(json.dumps({
        "status": "ok", "provider_family": "anthropic", "cross_family": True,
        "certification_eligible": True, "read_only_guarantee": "enforced",
        "output_path": str(run_dir / "other-primary.md"),
    }))
    write_scope_receipt(run, run_dir)
    assert validate_run.validate(run, base_dir=run_dir) == []
    (repo / "outside.txt").write_text("unscoped\n")
    errors = validate_run.validate(run, base_dir=run_dir)
    assert any("does not match live git changes" in error for error in errors)


def test_live_gate_rejects_posthoc_preexisting_and_ignored_writes(tmp_path):
    repo = tmp_path / "repo"
    run_dir = tmp_path / "run"
    (repo / "src").mkdir(parents=True)
    run_dir.mkdir()
    subprocess.run(["git", "init", "-q", str(repo)], check=True)
    subprocess.run(["git", "-C", str(repo), "config", "user.email", "test@example.com"], check=True)
    subprocess.run(["git", "-C", str(repo), "config", "user.name", "Test"], check=True)
    (repo / ".gitignore").write_text(".env\n")
    target = repo / "src" / "change.py"
    target.write_text("before\n")
    subprocess.run(["git", "-C", str(repo), "add", "."], check=True)
    subprocess.run(["git", "-C", str(repo), "commit", "-qm", "base"], check=True)
    base = subprocess.check_output(["git", "-C", str(repo), "rev-parse", "HEAD"], text=True).strip()
    target.write_text("after\n")
    (repo / ".env").write_text("SECRET=changed\n")
    run = valid_run()
    run["implementation"] = {
        "status": "complete", "repo_root": str(repo), "base_revision": base,
        "preexisting_paths": [{"path": ".env", "sha256": validate_run._file_sha256(repo / ".env")}],
        "applied_paths": [{"path": "src/change.py", "operation": "modify", "sha256": validate_run._file_sha256(target)}],
    }
    run["implementation"]["result_revision"] = validate_run._result_revision(base, run["implementation"]["applied_paths"])
    run["review_council"]["reviewed_revision"] = run["implementation"]["result_revision"]
    for lens in run["review_council"]["lenses"]:
        lens["reviewed_revision"] = run["implementation"]["result_revision"]
    for review in run["reviews"]:
        if review.get("status") == "pass":
            review["reviewed_revision"] = run["implementation"]["result_revision"]
    for path in ("RUN.json", "review.md", "native-review.md", "other-primary.md", "challenge.md", "reduction.md"):
        (run_dir / path).write_text("artifact")
    (run_dir / "other-primary.route.json").write_text(json.dumps({
        "status": "ok", "provider_family": "anthropic", "cross_family": True,
        "certification_eligible": True, "read_only_guarantee": "enforced",
        "output_path": str(run_dir / "other-primary.md"),
    }))
    write_scope_receipt(run, run_dir)
    errors = validate_run.validate(run, base_dir=run_dir)
    assert "live implementation gate requires a clean baseline; preexisting_paths must be empty" in errors
    assert any(".env" in error and "live git changes" in error for error in errors)


def test_live_gate_excludes_only_the_authorised_in_repo_run_directory(tmp_path):
    repo = tmp_path / "repo"
    (repo / "src").mkdir(parents=True)
    subprocess.run(["git", "init", "-q", str(repo)], check=True)
    subprocess.run(["git", "-C", str(repo), "config", "user.email", "test@example.com"], check=True)
    subprocess.run(["git", "-C", str(repo), "config", "user.name", "Test"], check=True)
    target = repo / "src" / "change.py"
    target.write_text("before\n")
    subprocess.run(["git", "-C", str(repo), "add", "."], check=True)
    subprocess.run(["git", "-C", str(repo), "commit", "-qm", "base"], check=True)
    base = subprocess.check_output(["git", "-C", str(repo), "rev-parse", "HEAD"], text=True).strip()
    run_dir = repo / ".work" / "wf" / "change" / "run"
    run_dir.mkdir(parents=True)
    (run_dir / "RUN.json").write_text("run artifact")
    target.write_text("after\n")
    run = valid_run()
    run["authority"]["artifact_write_paths"] = [".work/wf/change/run"]
    run["implementation"] = {
        "status": "complete", "repo_root": str(repo), "base_revision": base, "preexisting_paths": [],
        "applied_paths": [{"path": "src/change.py", "operation": "modify", "sha256": validate_run._file_sha256(target)}],
    }
    run["implementation"]["result_revision"] = validate_run._result_revision(base, run["implementation"]["applied_paths"])
    assert validate_run._validate_implementation(run, "substantial", True, run_dir) == []


def test_paired_mode_requires_clean_baton_and_independent_review():
    run = valid_run()
    run["pair"] = {
        "mode": "paired-primary",
        "chair_family": "openai",
        "peer_family": "anthropic",
        "status": "complete",
        "degradation_reason": "",
        "stage_ledger": [{
            "stage": "scope",
            "owner_family": "openai",
            "peer_family": "anthropic",
            "status": "complete",
            "acknowledged": True,
            "assignment_path": "pair/scope-assignment.md",
            "assignment_sha256": "1" * 64,
            "acknowledgement_path": "pair/scope-ack.md",
            "acknowledgement_sha256": "2" * 64,
            "output_path": "pair/scope-output.md",
            "output_sha256": "3" * 64,
            "generation": 1,
            "checks": [{"command": "spec-check", "exit_code": 0}],
            "human_gates": ["spec-approved"],
            "base_revision": "base",
            "result_revision": "b",
            "writers": [],
        }, {
            "stage": "implementation",
            "owner_family": "anthropic",
            "peer_family": "openai",
            "status": "complete",
            "acknowledged": True,
            "assignment_path": "pair/implementation-assignment.md",
            "assignment_sha256": "4" * 64,
            "acknowledgement_path": "pair/implementation-ack.md",
            "acknowledgement_sha256": "5" * 64,
            "output_path": "pair/implementation-output.md",
            "output_sha256": "6" * 64,
            "generation": 2,
            "checks": [{"command": "pytest", "exit_code": 0}],
            "human_gates": [],
            "base_revision": "b",
            "result_revision": run["implementation"]["result_revision"],
            "writers": [{"actor_family": "anthropic", "paths": ["src/change.py"]}],
        }],
    }
    assert validate_run.validate(run) == []
    run["reviews"][1]["independence"]["authored_reviewed_surface"] = True
    assert "paired other-primary reviewer cannot author the reviewed surface" in validate_run.validate(run)


def test_paired_mode_rejects_overlapping_cross_family_writers():
    run = valid_run()
    run["pair"] = {
        "mode": "paired-primary", "chair_family": "openai", "peer_family": "anthropic",
        "status": "complete", "degradation_reason": "", "stage_ledger": [{
            "stage": "implementation", "owner_family": "openai", "status": "complete",
            "peer_family": "anthropic", "acknowledged": True, "base_revision": "base", "result_revision": "b",
            "writers": [
                {"actor_family": "openai", "paths": ["src/api"]},
                {"actor_family": "anthropic", "paths": ["src/api/routes"]},
            ],
        }, {
            "stage": "review", "owner_family": "anthropic", "peer_family": "openai",
            "status": "complete", "acknowledged": True, "base_revision": "b",
            "result_revision": "rev-final", "writers": [],
        }],
    }
    assert "pair.stage_ledger[0] has overlapping cross-family writer scopes" in validate_run.validate(run)


def test_pair_stage_artifact_hashes_detect_post_ack_mutation(tmp_path):
    run = valid_run()
    paths = []
    stages = []
    prior = "base"
    for generation, (name, owner, result) in enumerate((("scope", "openai", "b"), ("implementation", "anthropic", run["implementation"]["result_revision"])), 1):
        values = {}
        for kind in ("assignment", "acknowledgement", "output"):
            path = f"pair/{name}-{kind}.md"
            target = tmp_path / path
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(f"{name}-{kind}")
            values[f"{kind}_path"] = path
            values[f"{kind}_sha256"] = validate_run._file_sha256(target)
            paths.append(target)
        stages.append({
            "stage": name, "owner_family": owner, "peer_family": "anthropic" if owner == "openai" else "openai",
            "status": "complete", "acknowledged": True, "generation": generation,
            "base_revision": prior, "result_revision": result, "checks": [{"command": "check", "exit_code": 0}],
            "human_gates": [], "writers": [] if name == "scope" else [{"actor_family": owner, "paths": ["src/change.py"]}],
            **values,
        })
        prior = result
    run["pair"] = {
        "mode": "paired-primary", "chair_family": "openai", "peer_family": "anthropic",
        "status": "complete", "degradation_reason": "", "stage_ledger": stages,
    }
    assert validate_run._validate_pair(run, tmp_path) == []
    paths[0].write_text("mutated")
    assert any("sha256 does not match" in error for error in validate_run._validate_pair(run, tmp_path))


def test_expedited_incident_requires_authority_and_follow_up():
    run = valid_run("crucial")
    run["mode"] = "expedited-incident"
    assert "expedited.reason is required" in validate_run.validate(run)
    run["expedited"] = {
        "reason": "service unavailable", "authorised_by": "incident commander",
        "incident_reference": "INC-1", "reconcile_by": "2026-07-11T00:00:00Z",
        "follow_up_owner": "team",
        "severity": "SEV-2", "incident_state": "mitigated",
        "impact_window": {"started_at": "2026-07-10T00:00:00Z", "ended_at": "2026-07-10T00:30:00Z"},
        "affected_systems": ["api"], "evidence": ["trace"],
        "communication_status": "not-required", "postmortem_owner": "team",
        "action_tracker": "INC-1/actions",
    }
    assert validate_run.validate(run) == []


def test_expedited_reconciliation_deadline_must_follow_checkpoint():
    run = valid_run("crucial")
    run["mode"] = "expedited-incident"
    run["expedited"] = {
        "reason": "outage", "authorised_by": "incident commander", "incident_reference": "INC-2",
        "reconcile_by": "2000-01-01T00:00:00Z", "follow_up_owner": "team",
        "severity": "SEV-1", "incident_state": "resolved",
        "impact_window": {"started_at": "2026-07-10T00:00:00Z", "ended_at": "2026-07-10T00:10:00Z"},
        "affected_systems": ["api"], "evidence": ["trace"], "communication_status": "complete",
        "postmortem_owner": "team", "action_tracker": "INC-2/actions",
    }
    assert "expedited.reconcile_by must be after the run checkpoint" in validate_run.validate(run)


def test_preflight_proves_clean_repository_baseline(tmp_path):
    repo = tmp_path / "repo"
    run_dir = tmp_path / "run"
    repo.mkdir()
    run_dir.mkdir()
    subprocess.run(["git", "init", "-q", str(repo)], check=True)
    subprocess.run(["git", "-C", str(repo), "config", "user.email", "test@example.com"], check=True)
    subprocess.run(["git", "-C", str(repo), "config", "user.name", "Test"], check=True)
    (repo / "tracked.txt").write_text("base\n")
    subprocess.run(["git", "-C", str(repo), "add", "."], check=True)
    subprocess.run(["git", "-C", str(repo), "commit", "-qm", "base"], check=True)
    base = subprocess.check_output(["git", "-C", str(repo), "rev-parse", "HEAD"], text=True).strip()
    run = valid_run()
    run["implementation"]["repo_root"] = str(repo)
    run["implementation"]["base_revision"] = base
    write_scope_receipt(run, run_dir)
    assert validate_run.validate_preflight(run, run_dir) == []
    (repo / "tracked.txt").write_text("dirty\n")
    assert "preflight requires a clean tracked, untracked and non-exempt ignored baseline" in validate_run.validate_preflight(run, run_dir)


def test_git_evidence_excludes_only_ignored_sibling_worktree_infrastructure(tmp_path):
    repo = tmp_path / "repo"
    repo.mkdir()
    subprocess.run(["git", "init", "-q", str(repo)], check=True)
    subprocess.run(["git", "-C", str(repo), "config", "user.email", "test@example.com"], check=True)
    subprocess.run(["git", "-C", str(repo), "config", "user.name", "Test"], check=True)
    (repo / ".gitignore").write_text("/.worktrees/\n")
    (repo / "tracked.txt").write_text("base\n")
    subprocess.run(["git", "-C", str(repo), "add", "."], check=True)
    subprocess.run(["git", "-C", str(repo), "commit", "-qm", "base"], check=True)
    base = subprocess.check_output(["git", "-C", str(repo), "rev-parse", "HEAD"], text=True).strip()
    sibling = repo / ".worktrees" / "peer"
    sibling.parent.mkdir()
    subprocess.run([
        "git", "-C", str(repo), "worktree", "add", "--detach", str(sibling), base,
    ], check=True)

    observed, ignored, error = validate_run._git_paths(repo, base)
    assert error is None
    assert observed == set()
    assert ignored == set()

    orphan = repo / ".worktrees" / "not-registered" / "payload"
    orphan.parent.mkdir()
    orphan.write_text("must remain visible\n")
    (repo / "ordinary-secret").write_text("must remain visible\n")
    (repo / ".gitignore").write_text("/.worktrees/\nordinary-secret\n")
    _, ignored, error = validate_run._git_paths(repo, base)
    assert error is None
    assert ignored == {".worktrees/not-registered/payload", "ordinary-secret"}


def test_preflight_excludes_authorised_in_repo_run_artifacts(tmp_path):
    repo = tmp_path / "repo"
    repo.mkdir()
    subprocess.run(["git", "init", "-q", str(repo)], check=True)
    subprocess.run(["git", "-C", str(repo), "config", "user.email", "test@example.com"], check=True)
    subprocess.run(["git", "-C", str(repo), "config", "user.name", "Test"], check=True)
    (repo / "tracked.txt").write_text("base\n")
    subprocess.run(["git", "-C", str(repo), "add", "."], check=True)
    subprocess.run(["git", "-C", str(repo), "commit", "-qm", "base"], check=True)
    base = subprocess.check_output(["git", "-C", str(repo), "rev-parse", "HEAD"], text=True).strip()
    run_dir = repo / ".work" / "wf" / "change" / "run"
    run_dir.mkdir(parents=True)
    run = valid_run()
    run["authority"]["artifact_write_paths"] = [".work/wf/change/run"]
    run["implementation"]["repo_root"] = str(repo)
    run["implementation"]["base_revision"] = base
    run["scope_approval"]["digest"] = validate_run._scope_approval_digest(run)
    run["scope_approval"]["receipt_sha256"] = hashlib.sha256(scope_receipt_bytes(run)).hexdigest()
    write_scope_receipt(run, run_dir)
    assert validate_run.validate_preflight(run, run_dir) == []


def test_cli_reports_invalid_json(tmp_path):
    path = tmp_path / "RUN.json"
    path.write_text("{")
    assert validate_run.main([str(path)]) == 2
