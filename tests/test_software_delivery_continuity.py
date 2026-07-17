import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import os

import pytest


ROOT = Path(__file__).resolve().parents[1]


def load(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


DELIVERY = load(ROOT / "skills/deliver/scripts/validate_delivery.py", "continuity_delivery")
RELEASE = load(ROOT / "skills/release/scripts/validate_release.py", "continuity_release")
REFERENCE = load(ROOT / "skills/deliver/scripts/reference_runs.py", "continuity_reference")
MATERIALISE = load(ROOT / "skills/deliver/scripts/reference_evaluation.py", "continuity_materialise")
RELEASE_FIXTURE = load(ROOT / "tests/test_release.py", "continuity_release_fixture")


def git(root: Path, *args: str, text: bool = True):
    return subprocess.run(
        ["git", "-C", str(root), *args], check=True, capture_output=True, text=text,
    ).stdout


def write_json_artifact(workspace: Path, artifact_id: str, value: dict) -> dict:
    path = Path("evidence") / f"{artifact_id}.json"
    target = workspace / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(value, sort_keys=True) + "\n")
    return {
        "id": artifact_id,
        "path": path.as_posix(),
        "media_type": "application/json",
        "artifact_type": "evidence",
        "digest": "sha256:" + hashlib.sha256(target.read_bytes()).hexdigest(),
        "class": "evidence",
        "owner": "delivery-chair",
        "retention": "risk-policy",
    }


def merged_software_delivery(workspace: Path) -> dict:
    workspace.mkdir(parents=True, exist_ok=True)
    git(workspace, "init")
    git(workspace, "config", "user.email", "fixture@example.test")
    git(workspace, "config", "user.name", "Fixture")
    (workspace / "product.txt").write_text("reviewed product\n")
    git(workspace, "add", "product.txt")
    git(workspace, "commit", "-m", "reviewed head")
    head = git(workspace, "rev-parse", "HEAD").strip()
    git(workspace, "commit", "--allow-empty", "-m", "merge pull request")
    merged = git(workspace, "rev-parse", "HEAD").strip()
    tree = git(workspace, "rev-parse", "HEAD^{tree}").strip()
    archive = git(workspace, "archive", "--format=tar", merged, text=False)

    run = REFERENCE.make_reference_run("software", ROOT)
    MATERIALISE.materialise_reference_run(run, workspace, ROOT)
    run["authority"]["allowed_source_paths"] = ["."]
    run["artifacts"].append({
        "id": "merged-source",
        "git_revision": {"repository": ".", "commit": merged, "tree": tree},
        "media_type": "application/x-git-archive",
        "artifact_type": "source",
        "digest": "sha256:" + hashlib.sha256(archive).hexdigest(),
        "class": "canonical",
        "owner": "delivery-chair",
        "retention": "project-policy",
    })
    run["security"]["artifact_surfaces"].append({
        "artifact_id": "merged-source", "surfaces": ["source"],
    })
    repository = "example/project"
    run["artifacts"].extend([
        write_json_artifact(workspace, "github-pr", {
            "schema_version": 1, "contract": "github-pull-request-evidence",
            "repository": repository, "number": 42, "url": "https://example.test/pr/42",
            "head_commit": head, "merge_commit": merged, "state": "merged",
        }),
        write_json_artifact(workspace, "github-ci", {
            "schema_version": 1, "contract": "github-ci-evidence",
            "repository": repository, "commit": merged, "check": "ci-status",
            "conclusion": "success", "completed_at": "2026-07-10T00:08:30Z",
        }),
        write_json_artifact(workspace, "review-openai", {
            "schema_version": 1, "contract": "code-review-evidence",
            "repository": repository, "commit": head, "provider_family": "openai",
            "adapter": "native-subagent", "model": "runtime-resolved", "verdict": "pass",
            "reviewed_at": "2026-07-10T00:07:30Z",
        }),
        write_json_artifact(workspace, "review-anthropic", {
            "schema_version": 1, "contract": "code-review-evidence",
            "repository": repository, "commit": head, "provider_family": "anthropic",
            "adapter": "claude-code", "model": "runtime-resolved", "verdict": "pass",
            "reviewed_at": "2026-07-10T00:08:00Z",
        }),
    ])
    run["software_delivery"] = {
        "schema_version": 1,
        "contract": "software-delivery-binding",
        "canonical_artifact_id": "merged-source",
        "pull_request_artifact_id": "github-pr",
        "ci_artifact_id": "github-ci",
        "review_artifact_ids": ["review-openai", "review-anthropic"],
    }
    return run


def accept_for_release(run: dict, *, observing: bool = False) -> None:
    run["human_gates"]["acceptance"] = {
        "status": "approved", "approver": "human", "evidence": "acceptance-approval",
    }
    run["state_history"].extend([
        {"state": "accepted", "at": "2026-07-10T00:09:00Z", "evidence_ids": ["acceptance-approval"]},
        {"state": "awaiting_release", "at": "2026-07-10T00:10:00Z", "evidence_ids": ["acceptance-approval"]},
    ])
    run["status"] = "awaiting_release"
    run["checkpoint"].update({"current_slice": "awaiting-release", "next_action": "await release authority"})
    if observing:
        run["human_gates"]["release"] = {
            "status": "approved", "approver": "human", "evidence": "release-approval",
        }
        run["state_history"].append({
            "state": "observing", "at": "2026-07-10T00:11:00Z", "evidence_ids": ["release-approval"],
        })
        run["status"] = "observing"
        run["checkpoint"].update({"current_slice": "observing", "next_action": "observe release"})
        run["observation"]["status"] = "active"


def test_merged_software_binding_is_hash_verified_and_rejects_reviewed_tree_drift(tmp_path):
    run = merged_software_delivery(tmp_path)
    DELIVERY.validate(run, ROOT, workspace_root=tmp_path, verify_hashes=True)

    pr_path = tmp_path / "evidence/github-pr.json"
    pr = json.loads(pr_path.read_text())
    pr["head_commit"] = run["software_delivery"]["canonical_artifact_id"]
    pr_path.write_text(json.dumps(pr) + "\n")
    artifact = next(item for item in run["artifacts"] if item["id"] == "github-pr")
    artifact["digest"] = "sha256:" + hashlib.sha256(pr_path.read_bytes()).hexdigest()
    with pytest.raises(DELIVERY.Invalid, match="does not bind the merged revision"):
        DELIVERY.validate(run, ROOT, workspace_root=tmp_path, verify_hashes=True)


def test_merged_software_delivery_progresses_through_ready_and_complete_release_validation(tmp_path):
    ready_workspace = tmp_path / "ready"
    run = merged_software_delivery(ready_workspace)
    accept_for_release(run)
    (ready_workspace / "RUN.json").write_text(json.dumps(run))
    release = RELEASE_FIXTURE.valid_receipt()
    release["action_type"] = "activate"
    release["target"] = {
        "id": "local-agent-fabric", "kind": "environment",
        "environment_tier": "development", "disclosure": "private",
    }
    release["release_authority"].update({
        "action_types": ["activate"], "target_ids": ["local-agent-fabric"],
        "target_environment_tiers": ["development"], "external_communication": False,
    })
    release["artifact"] = {
        "id": "merged-source",
        "digest": next(item for item in run["artifacts"] if item["id"] == "merged-source")["digest"],
        "acceptance_receipt": "RUN.json",
    }
    release["release_authority"]["artifact_ids"] = ["merged-source"]
    assert RELEASE.validate(release, "ready", workspace_root=ready_workspace) == []

    complete_workspace = tmp_path / "complete"
    run = merged_software_delivery(complete_workspace)
    accept_for_release(run, observing=True)
    (complete_workspace / "RUN.json").write_text(json.dumps(run))
    complete = RELEASE_FIXTURE.complete_receipt()
    complete.update({"action_type": release["action_type"], "target": release["target"]})
    complete["release_authority"].update(release["release_authority"])
    complete["artifact"] = {
        "id": "merged-source",
        "digest": next(item for item in run["artifacts"] if item["id"] == "merged-source")["digest"],
        "acceptance_receipt": "RUN.json",
    }
    assert RELEASE.validate(complete, "complete", workspace_root=complete_workspace) == []


def test_release_refuses_legacy_software_receipt_without_post_merge_binding(tmp_path):
    run = REFERENCE.make_reference_run("software", ROOT)
    MATERIALISE.materialise_reference_run(run, tmp_path, ROOT)
    accept_for_release(run)
    (tmp_path / "RUN.json").write_text(json.dumps(run))
    release = RELEASE_FIXTURE.valid_receipt()
    RELEASE_FIXTURE.bind_accepted_artifact(release, run)
    assert "software promotion requires the canonical post-merge delivery binding" in RELEASE.validate(
        release, "ready", workspace_root=tmp_path,
    )


def test_binder_materialises_the_post_merge_chain_without_advancing_acceptance(tmp_path):
    run = merged_software_delivery(tmp_path)
    pr = json.loads((tmp_path / "evidence/github-pr.json").read_text())
    ci = json.loads((tmp_path / "evidence/github-ci.json").read_text())
    review_sources = []
    source_dir = tmp_path / "review-source"
    source_dir.mkdir()
    for name in ("review-openai", "review-anthropic"):
        source = source_dir / f"{name}.json"
        source.write_bytes((tmp_path / "evidence" / f"{name}.json").read_bytes())
        review_sources.append(source)
    generated = {"merged-source", "github-pr", "github-ci", "review-openai", "review-anthropic"}
    run["artifacts"] = [item for item in run["artifacts"] if item["id"] not in generated]
    run["security"]["artifact_surfaces"] = [
        item for item in run["security"]["artifact_surfaces"] if item["artifact_id"] != "merged-source"
    ]
    del run["software_delivery"]
    for artifact_id in generated - {"merged-source"}:
        (tmp_path / "evidence" / f"{artifact_id}.json").unlink()
    receipt = tmp_path / "RUN.json"
    receipt.write_text(json.dumps(run))
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    gh = bin_dir / "gh"
    gh.write_text(
        "#!/bin/sh\n"
        "printf 'invoked\\n' >> \"$GH_MARKER\"\n"
        "case \"$*\" in\n"
        "  *check-runs*) printf '%s\\n' \"$GH_CHECKS_JSON\" ;;\n"
        "  *pulls*) printf '%s\\n' \"$GH_PR_JSON\" ;;\n"
        "  *) exit 9 ;;\n"
        "esac\n"
    )
    gh.chmod(0o755)
    marker = tmp_path / "gh-invocations"
    environment = {
        **os.environ,
        "PATH": f"{bin_dir}:{os.environ['PATH']}",
        "GH_MARKER": str(marker),
        "GH_PR_JSON": json.dumps({
            "number": pr["number"], "state": "closed", "merged_at": "2026-07-10T00:08:00Z",
            "html_url": pr["url"], "head": {"sha": pr["head_commit"]},
            "merge_commit_sha": pr["merge_commit"],
        }),
        "GH_CHECKS_JSON": json.dumps({"check_runs": [{
            "name": "ci-status", "head_sha": pr["merge_commit"], "status": "completed",
            "conclusion": "success", "completed_at": ci["completed_at"],
        }]}),
    }
    command = [
        str(ROOT / "skills/implement/scripts/bind_merged_delivery.py"), str(receipt),
        "--workspace-root", str(tmp_path), "--repository", pr["repository"],
        "--pr-number", str(pr["number"]),
        *[argument for source in review_sources for argument in ("--review-artifact", str(source))],
    ]
    denied_receipt = receipt.read_bytes()
    denied = subprocess.run(command, env=environment, capture_output=True, text=True)
    assert denied.returncode == 1
    assert "allowlist api.github.com" in denied.stdout
    assert receipt.read_bytes() == denied_receipt
    assert not marker.exists()
    assert not (tmp_path / "github").exists()
    assert not receipt.with_name("RUN.json.lock").exists()

    run["authority"].update({
        "secrets_access": "use-without-disclosure",
        "secret_refs": ["github-cli-auth"],
        "network": {"tool_egress": "allowlist", "allowed_hosts": ["api.github.com"]},
    })
    receipt.write_text(json.dumps(run))
    first = subprocess.Popen(command, env=environment, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    second = subprocess.Popen(command, env=environment, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    results = [first.communicate(), second.communicate()]
    assert sorted((first.returncode, second.returncode)) == [0, 1], results
    bound = json.loads(receipt.read_text())
    assert bound["status"] == "awaiting_acceptance"
    assert bound["human_gates"]["acceptance"]["status"] == "pending"
    DELIVERY.validate(bound, ROOT, workspace_root=tmp_path, verify_hashes=True)
