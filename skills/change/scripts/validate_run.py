#!/usr/bin/env python3
"""Validate a portable change RUN.json receipt."""

from __future__ import annotations

import argparse
from datetime import datetime
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import subprocess
import sys
from typing import Any


ROOT = Path(__file__).resolve().parents[3]
RISK_POLICY = json.loads((ROOT / "config" / "risk-policy.json").read_text())
TIER_ORDER = RISK_POLICY["tier_order"]
TIERS = set(TIER_ORDER)
RISK_FACTORS = RISK_POLICY["factors"]
SAFE_IGNORED_EXEMPTION = re.compile(r"^(?:node_modules|\.venv|venv|dist|build|\.cache|__pycache__)(?:/|$)")
PROTECTED_WORKTREE_ROOT = ".worktrees"


def _load_module(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    if not spec or not spec.loader:
        raise RuntimeError(f"cannot load validator: {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


EVALUATION_VALIDATOR = _load_module(
    ROOT / "skills" / "evaluate" / "scripts" / "validate_evaluation.py",
    "harness_validate_evaluation",
)


def _mapping(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def _utc_timestamp(value: Any) -> bool:
    if not isinstance(value, str) or not value.endswith("Z"):
        return False
    try:
        datetime.fromisoformat(value[:-1] + "+00:00")
        return True
    except ValueError:
        return False


def _parse_utc(value: Any) -> datetime | None:
    if not _utc_timestamp(value):
        return None
    return datetime.fromisoformat(str(value)[:-1] + "+00:00")


def _check_artifact_paths(values: list[Any], base_dir: Path, field: str) -> list[str]:
    errors: list[str] = []
    root = base_dir.resolve()
    for value in values:
        if not isinstance(value, str) or not value:
            errors.append(f"{field} entries must be non-empty strings")
            continue
        path = Path(value)
        target = path if path.is_absolute() else root / path
        try:
            target.resolve().relative_to(root)
        except ValueError:
            errors.append(f"{field} path escapes the run directory: {value}")
            continue
        if not target.is_file():
            errors.append(f"{field} path does not exist: {value}")
    return errors


def _scope_contains(path: str, scope: str) -> bool:
    clean_path = path.rstrip("/")
    clean_scope = scope.rstrip("/")
    return clean_scope in {"", "."} or clean_path == clean_scope or clean_path.startswith(clean_scope + "/")


def _is_shared_worktree_path(path: str) -> bool:
    return Path(path).parts[:1] == (PROTECTED_WORKTREE_ROOT,)


def _registered_sibling_worktree_scopes(repo_root: Path) -> tuple[set[str], str | None]:
    result = subprocess.run(
        ["git", "-C", str(repo_root), "worktree", "list", "--porcelain", "-z"],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False,
    )
    if result.returncode != 0:
        return set(), result.stderr.decode(errors="replace").strip()
    scopes: set[str] = set()
    for field in result.stdout.split(b"\0"):
        if not field.startswith(b"worktree "):
            continue
        target = Path(field[len(b"worktree "):].decode(errors="surrogateescape")).resolve()
        try:
            relative = target.relative_to(repo_root.resolve())
        except ValueError:
            continue
        if len(relative.parts) == 2 and relative.parts[0] == PROTECTED_WORKTREE_ROOT:
            scopes.add(relative.as_posix())
    return scopes, None


def _file_sha256(path: Path) -> str | None:
    if not path.is_file():
        return None
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _result_revision(base_revision: str, applied: list[dict[str, Any]]) -> str:
    rows = []
    for item in sorted(applied, key=lambda value: str(value.get("path", ""))):
        rows.append({
            "path": item.get("path"),
            "operation": item.get("operation"),
            "sha256": item.get("sha256", ""),
            "before_sha256": item.get("before_sha256", ""),
        })
    payload = json.dumps({"base_revision": base_revision, "applied_paths": rows}, sort_keys=True, separators=(",", ":"))
    return "sha256:" + hashlib.sha256(payload.encode()).hexdigest()


def _scope_approval_digest(run: dict[str, Any]) -> str:
    spec = _mapping(run.get("spec"))
    payload = {
        "risk_tier": run.get("risk_tier"),
        "risk_assessment": run.get("risk_assessment"),
        "authority": run.get("authority"),
        "spec": {
            "status": spec.get("status"),
            "approved_by": spec.get("approved_by"),
            "acceptance_criteria_ids": [
                _mapping(item).get("id") for item in _list(spec.get("acceptance_criteria"))
            ],
        },
        "design": run.get("design"),
        "assurance_policy": {
            "evaluation_required": _mapping(run.get("assurance")).get("evaluation_required"),
            "reason": _mapping(run.get("assurance")).get("reason"),
        },
    }
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return "sha256:" + hashlib.sha256(encoded.encode()).hexdigest()


def _validate_scope_receipt(run: dict[str, Any], base_dir: Path | None) -> list[str]:
    approval = _mapping(run.get("scope_approval"))
    if base_dir is None:
        return []
    value = approval.get("receipt")
    digest = approval.get("receipt_sha256")
    if not isinstance(value, str) or not value or not re.fullmatch(r"[0-9a-f]{64}", str(digest)):
        return ["scope_approval requires a receipt path and SHA-256"]
    path_errors = _check_artifact_paths([value], base_dir, "scope_approval.receipt")
    if path_errors:
        return path_errors
    path = Path(value) if Path(value).is_absolute() else base_dir / value
    if path.stat().st_mode & 0o222:
        return ["scope_approval receipt must be write-protected after human approval"]
    if _file_sha256(path) != digest:
        return ["scope_approval receipt SHA-256 does not match"]
    try:
        receipt = json.loads(path.read_text())
    except (OSError, json.JSONDecodeError):
        return ["scope_approval receipt must contain valid JSON"]
    expected = {
        "approved_by": approval.get("approved_by"),
        "approved_at": approval.get("approved_at"),
        "binding_digest": approval.get("digest"),
    }
    if not isinstance(receipt, dict) or any(receipt.get(key) != value for key, value in expected.items()):
        return ["scope_approval receipt does not match the approved binding"]
    return []


def validate_preflight(run: dict[str, Any], base_dir: Path | None = None) -> list[str]:
    errors: list[str] = []
    if run.get("schema_version") != 1 or not run.get("task_id"):
        errors.append("preflight requires schema_version 1 and task_id")
    tier = run.get("risk_tier")
    if tier not in TIERS:
        errors.append("risk_tier must be routine, substantial, crucial, or terminal")
    if run.get("lead_family") not in {"anthropic", "openai"}:
        errors.append("lead_family must be anthropic or openai")
    minimum = _minimum_risk(run, errors)
    if tier in TIERS and TIER_ORDER.index(tier) < TIER_ORDER.index(minimum):
        errors.append(f"risk_tier is below derived minimum {minimum} at preflight")
    errors.extend(_validate_authority(run, tier))
    spec = _mapping(run.get("spec"))
    if spec.get("status") != "approved" or not spec.get("approved_by"):
        errors.append("preflight requires an approved spec")
    criteria = [_mapping(item) for item in _list(spec.get("acceptance_criteria"))]
    if not criteria or any(not item.get("id") for item in criteria):
        errors.append("preflight requires acceptance criterion ids")
    if _mapping(run.get("design")).get("status") not in {"approved", "not-required"}:
        errors.append("preflight requires approved or not-required design")
    approval = _mapping(run.get("scope_approval"))
    if not approval.get("approved_by") or not _utc_timestamp(approval.get("approved_at")):
        errors.append("scope_approval requires approved_by and UTC approved_at")
    if approval.get("digest") != _scope_approval_digest(run):
        errors.append("scope_approval digest does not bind current risk, authority, spec and design")
    errors.extend(_validate_scope_receipt(run, base_dir))
    implementation = _mapping(run.get("implementation"))
    repo_value = implementation.get("repo_root")
    base_revision = implementation.get("base_revision")
    if not isinstance(repo_value, str) or not repo_value or not isinstance(base_revision, str) or not base_revision:
        errors.append("preflight requires implementation.repo_root and base_revision")
    else:
        repo_root = Path(repo_value).expanduser().resolve()
        head = subprocess.run(
            ["git", "-C", str(repo_root), "rev-parse", "HEAD"], text=True,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False,
        )
        if head.returncode != 0 or head.stdout.strip() != base_revision:
            errors.append("preflight base_revision must equal the target repository HEAD")
        else:
            observed, ignored, git_error = _git_paths(repo_root, base_revision)
            if base_dir is not None:
                try:
                    run_rel = base_dir.resolve().relative_to(repo_root).as_posix()
                except ValueError:
                    run_rel = ""
                artifact_scopes = _list(_mapping(run.get("authority")).get("artifact_write_paths"))
                if run_rel and any(_scope_contains(run_rel, scope) for scope in artifact_scopes):
                    observed = {path for path in observed if not _scope_contains(path, run_rel)}
                    ignored = {path for path in ignored if not _scope_contains(path, run_rel)}
            exemptions = _list(_mapping(run.get("authority")).get("ignored_path_exemptions"))
            unexpected_ignored = {path for path in ignored if not any(_scope_contains(path, item) for item in exemptions)}
            if git_error or observed or unexpected_ignored:
                errors.append("preflight requires a clean tracked, untracked and non-exempt ignored baseline")
    return errors


def _git_paths(repo_root: Path, base_revision: str) -> tuple[set[str], set[str], str | None]:
    sibling_scopes, worktree_error = _registered_sibling_worktree_scopes(repo_root)
    if worktree_error:
        return set(), set(), worktree_error
    commands = [
        ["git", "-C", str(repo_root), "diff", "--name-only", "-z", base_revision, "--"],
        ["git", "-C", str(repo_root), "ls-files", "--others", "--exclude-standard", "-z"],
    ]
    paths: set[str] = set()
    for command in commands:
        result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
        if result.returncode != 0:
            return set(), set(), result.stderr.decode(errors="replace").strip()
        paths.update(item.decode(errors="surrogateescape") for item in result.stdout.split(b"\0") if item)
    ignored_result = subprocess.run(
        ["git", "-C", str(repo_root), "ls-files", "--others", "--ignored", "--exclude-standard", "-z"],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False,
    )
    if ignored_result.returncode != 0:
        return set(), set(), ignored_result.stderr.decode(errors="replace").strip()
    ignored: set[str] = set()
    for item in ignored_result.stdout.split(b"\0"):
        if not item:
            continue
        path = item.decode(errors="surrogateescape")
        if not any(_scope_contains(path, scope) for scope in sibling_scopes):
            ignored.add(path)
    return paths, ignored, None


def _validate_implementation(
    run: dict[str, Any], tier: str | None, verify_live: bool = False,
    run_dir: Path | None = None,
) -> list[str]:
    errors: list[str] = []
    implementation = _mapping(run.get("implementation"))
    if implementation.get("status") != "complete":
        return ["implementation.status must be complete"]
    if not implementation.get("result_revision"):
        errors.append("implementation.result_revision is required")
    if not implementation.get("repo_root") or not implementation.get("base_revision"):
        errors.append("implementation repo_root and base_revision are required")
    applied = [_mapping(item) for item in _list(implementation.get("applied_paths"))]
    if tier in {"substantial", "crucial", "terminal"} and not applied:
        errors.append("implementation.applied_paths must not be empty")
    authority = _mapping(run.get("authority"))
    allowed = _list(authority.get("source_write_paths"))
    prohibited = _list(authority.get("prohibited_paths"))
    seen: set[str] = set()
    for index, item in enumerate(applied):
        path = item.get("path")
        operation = item.get("operation")
        digest = item.get("sha256")
        if not isinstance(path, str) or not path or Path(path).is_absolute() or ".." in Path(path).parts:
            errors.append(f"implementation.applied_paths[{index}].path must be safe and repo-relative")
            continue
        path = path.rstrip("/")
        if _is_shared_worktree_path(path):
            errors.append(f"implementation path targets protected .worktrees infrastructure: {path}")
        if path in seen:
            errors.append(f"implementation.applied_paths contains duplicate path: {path}")
        seen.add(path)
        if operation not in {"add", "modify", "delete"}:
            errors.append(f"implementation.applied_paths[{index}].operation is invalid")
        if operation == "delete":
            if not isinstance(item.get("before_sha256"), str) or not re.fullmatch(r"[0-9a-f]{64}", item["before_sha256"]):
                errors.append(f"implementation.applied_paths[{index}].before_sha256 is required for delete")
        elif not isinstance(digest, str) or not re.fullmatch(r"[0-9a-f]{64}", digest):
            errors.append(f"implementation.applied_paths[{index}].sha256 must be lowercase SHA-256")
        if not any(_scope_contains(path, scope) for scope in allowed):
            errors.append(f"implementation path is outside source_write_paths: {path}")
        if any(_scope_contains(path, scope) for scope in prohibited):
            errors.append(f"implementation path is prohibited: {path}")
    expected_revision = _result_revision(str(implementation.get("base_revision", "")), applied)
    if implementation.get("result_revision") != expected_revision:
        errors.append("implementation.result_revision does not match the applied-path manifest")
    if not verify_live or errors:
        return errors

    repo_root = Path(str(implementation.get("repo_root"))).expanduser().resolve()
    base_revision = str(implementation.get("base_revision"))
    if not repo_root.is_dir():
        return errors + ["implementation.repo_root must be an existing directory"]
    observed, ignored, git_error = _git_paths(repo_root, base_revision)
    if git_error:
        return errors + [f"implementation git evidence failed: {git_error}"]

    if run_dir is not None:
        try:
            run_rel = run_dir.resolve().relative_to(repo_root).as_posix()
        except ValueError:
            run_rel = ""
        if run_rel:
            artifact_scopes = _list(_mapping(run.get("authority")).get("artifact_write_paths"))
            if not any(_scope_contains(run_rel, scope) for scope in artifact_scopes):
                errors.append("in-repository run directory is outside authority.artifact_write_paths")
            else:
                observed = {path for path in observed if not _scope_contains(path, run_rel)}
                ignored = {path for path in ignored if not _scope_contains(path, run_rel)}

    if _list(implementation.get("preexisting_paths")):
        errors.append("live implementation gate requires a clean baseline; preexisting_paths must be empty")

    exemptions = _list(_mapping(run.get("authority")).get("ignored_path_exemptions"))
    unexpected_ignored = {
        path for path in ignored
        if not any(_scope_contains(path, exemption) for exemption in exemptions)
    }

    expected_paths = {str(item.get("path", "")).rstrip("/") for item in applied}
    actual_run_paths = observed | unexpected_ignored
    if expected_paths != actual_run_paths:
        errors.append(
            "implementation.applied_paths does not match live git changes: "
            f"expected={sorted(expected_paths)} actual={sorted(actual_run_paths)}"
        )
    for index, item in enumerate(applied):
        path = str(item.get("path"))
        operation = item.get("operation")
        current = _file_sha256(repo_root / path)
        base = subprocess.run(
            ["git", "-C", str(repo_root), "show", f"{base_revision}:{path}"],
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            check=False,
        )
        base_digest = hashlib.sha256(base.stdout).hexdigest() if base.returncode == 0 else None
        if operation in {"add", "modify"} and current != item.get("sha256"):
            errors.append(f"implementation.applied_paths[{index}] does not match live post-image hash")
        if operation == "add" and base_digest is not None:
            errors.append(f"implementation.applied_paths[{index}] claims add for an existing base path")
        if operation == "modify" and base_digest is None and path not in {p.get('path') for p in _list(implementation.get('preexisting_paths')) if isinstance(p, dict)}:
            errors.append(f"implementation.applied_paths[{index}] claims modify without a base/preexisting path")
        if operation == "delete":
            if current is not None:
                errors.append(f"implementation.applied_paths[{index}] delete path still exists")
            if base_digest != item.get("before_sha256"):
                errors.append(f"implementation.applied_paths[{index}] delete before_sha256 does not match base")
    return errors


def _validate_review_council(
    run: dict[str, Any], tier: str | None, repairs: int | None, base_dir: Path | None
) -> list[str]:
    if tier not in {"substantial", "crucial", "terminal"}:
        return []
    errors: list[str] = []
    council = _mapping(run.get("review_council"))
    implementation = _mapping(run.get("implementation"))
    if council.get("status") != "pass":
        errors.append("review_council.status must be pass")
    if council.get("reviewed_revision") != implementation.get("result_revision"):
        errors.append("review_council must review the final implementation revision")
    lenses = [_mapping(item) for item in _list(council.get("lenses"))]
    names = [item.get("name") for item in lenses]
    if len(lenses) < 2 or len(set(names)) != len(names) or "correctness-spec" not in names:
        errors.append("review_council needs 2+ distinct lenses including correctness-spec")
    council_paths: list[str] = []
    passing_reviews = [_mapping(item) for item in _list(run.get("reviews")) if _mapping(item).get("status") == "pass"]
    for index, lens in enumerate(lenses):
        output_path = lens.get("output_path")
        if lens.get("blind") is not True or not output_path:
            errors.append(f"review_council.lenses[{index}] must be blind with output_path")
        elif not re.fullmatch(r"[0-9a-f]{64}", str(lens.get("sha256", ""))):
            errors.append(f"review_council.lenses[{index}] must record output sha256")
        elif lens.get("reviewed_revision") != implementation.get("result_revision"):
            errors.append(f"review_council.lenses[{index}] must bind the final revision")
        elif not any(
            review.get("role") == lens.get("review_role")
            and review.get("provider_family") == lens.get("actor_family")
            and review.get("adapter") == lens.get("adapter")
            and review.get("output_path") == output_path
            for review in passing_reviews
        ):
            errors.append(f"review_council.lenses[{index}] is not bound to a passing reviewer")
        if isinstance(output_path, str) and output_path:
            council_paths.append(output_path)
        if base_dir is not None and isinstance(output_path, str) and output_path:
            errors.extend(_check_artifact_paths([output_path], base_dir, f"review_council.lenses[{index}].output_path"))
            target = Path(output_path) if Path(output_path).is_absolute() else base_dir / output_path
            if target.is_file() and _file_sha256(target) != lens.get("sha256"):
                errors.append(f"review_council.lenses[{index}] sha256 does not match output")
    challenge = _mapping(council.get("challenge"))
    if challenge.get("anonymized") is not True or challenge.get("randomized") is not True or not challenge.get("output_path"):
        errors.append("review_council challenge must be anonymized, randomized and recorded")
    reduction = _mapping(council.get("reduction"))
    if reduction.get("fresh_context") is not True or not reduction.get("output_path"):
        errors.append("review_council reduction must be fresh-context and recorded")
    if not isinstance(reduction.get("unresolved_dissent"), list) or reduction.get("unresolved_dissent"):
        errors.append("review_council unresolved_dissent must be an empty list at the gate")
    if base_dir is not None:
        for field, value in (("challenge.output_path", challenge.get("output_path")), ("reduction.output_path", reduction.get("output_path"))):
            if value:
                errors.extend(_check_artifact_paths([value], base_dir, f"review_council.{field}"))
    for section, value in (("challenge", challenge), ("reduction", reduction)):
        path = value.get("output_path")
        if isinstance(path, str) and path:
            council_paths.append(path)
        if not re.fullmatch(r"[0-9a-f]{64}", str(value.get("sha256", ""))):
            errors.append(f"review_council.{section} must record output sha256")
        elif base_dir is not None and isinstance(path, str):
            target = Path(path) if Path(path).is_absolute() else base_dir / path
            if target.is_file() and _file_sha256(target) != value.get("sha256"):
                errors.append(f"review_council.{section} sha256 does not match output")
    if len(council_paths) != len(set(council_paths)):
        errors.append("review_council artifacts must use distinct output paths")
    if isinstance(repairs, int) and repairs > 0 and council.get("post_repair_review") is not True:
        errors.append("review_council must record a post-repair review")
    return errors


def _minimum_risk(run: dict[str, Any], errors: list[str]) -> str:
    assessment = _mapping(run.get("risk_assessment"))
    minimum = "routine"
    for factor, choices in RISK_FACTORS.items():
        value = assessment.get(factor)
        if value not in choices:
            errors.append(f"risk_assessment.{factor} must be one of: {', '.join(choices)}")
            continue
        tier = choices[value]
        if TIER_ORDER.index(tier) > TIER_ORDER.index(minimum):
            minimum = tier
    return minimum


def _validate_authority(run: dict[str, Any], tier: str | None) -> list[str]:
    errors: list[str] = []
    authority = _mapping(run.get("authority"))
    if tier in {"substantial", "crucial", "terminal"} and not authority:
        return ["authority is required for substantial and higher runs"]
    if not authority:
        return errors
    if not authority.get("approved_by") or not _utc_timestamp(authority.get("expires_at")):
        errors.append("authority requires approved_by and UTC expires_at")
    expiry = _parse_utc(authority.get("expires_at"))
    updated = _parse_utc(run.get("updated_at"))
    if expiry and updated and expiry <= updated:
        errors.append("authority expires_at must be after the run checkpoint")
    for field in ("source_write_paths", "artifact_write_paths", "prohibited_paths", "prohibited_actions", "ignored_path_exemptions"):
        values = authority.get(field)
        if not isinstance(values, list) or any(not isinstance(item, str) or not item for item in values):
            errors.append(f"authority.{field} must be a list of non-empty strings")
        elif field != "prohibited_actions":
            for value in values:
                path = Path(value)
                if path.is_absolute() or ".." in path.parts:
                    errors.append(f"authority.{field} entries must be safe repo-relative paths")
                if field in {"source_write_paths", "artifact_write_paths", "ignored_path_exemptions"} and _is_shared_worktree_path(value):
                    errors.append(f"authority.{field} cannot target protected .worktrees infrastructure")
    for value in _list(authority.get("ignored_path_exemptions")):
        if isinstance(value, str) and not SAFE_IGNORED_EXEMPTION.match(value.rstrip("/") + "/"):
            errors.append("authority.ignored_path_exemptions may name generated cache roots only")
    if authority.get("external_disclosure") not in {"forbidden", "scoped", "allowed"}:
        errors.append("authority.external_disclosure must be forbidden, scoped, or allowed")
    providers = authority.get("disclosure_providers")
    if not isinstance(providers, list) or any(not isinstance(item, str) or not item for item in providers):
        errors.append("authority.disclosure_providers must be a list of non-empty strings")
    if authority.get("external_disclosure") == "scoped" and not providers:
        errors.append("scoped external disclosure requires disclosure_providers")
    if authority.get("secrets_access") not in {"none", "read", "use-without-disclosure"}:
        errors.append("authority.secrets_access is invalid")
    for field in ("deployment", "irreversible_actions"):
        if not isinstance(authority.get(field), bool):
            errors.append(f"authority.{field} must be boolean")
    prohibited = _list(authority.get("prohibited_actions"))
    if authority.get("deployment") is True and "deployment" in prohibited:
        errors.append("authority cannot both allow and prohibit deployment")
    if authority.get("irreversible_actions") is True and "irreversible-action" in prohibited:
        errors.append("authority cannot both allow and prohibit irreversible actions")
    return errors


def _validate_pair(run: dict[str, Any], base_dir: Path | None = None) -> list[str]:
    errors: list[str] = []
    pair = _mapping(run.get("pair"))
    if not pair or pair.get("mode", "solo") == "solo":
        return errors
    if pair.get("mode") != "paired-primary":
        return ["pair.mode must be solo or paired-primary"]
    chair = pair.get("chair_family")
    peer = pair.get("peer_family")
    if {chair, peer} != {"anthropic", "openai"}:
        errors.append("paired-primary requires distinct anthropic and openai chair/peer families")
    if chair != run.get("lead_family"):
        errors.append("pair.chair_family must equal lead_family")
    if pair.get("status") not in {"complete", "degraded"}:
        errors.append("paired-primary must be complete or degraded at the human gate")
    if pair.get("status") == "degraded" and not pair.get("degradation_reason"):
        errors.append("degraded paired-primary requires degradation_reason")
    stages = [_mapping(item) for item in _list(pair.get("stage_ledger"))]
    implementation = _mapping(run.get("implementation"))
    if not stages:
        errors.append("paired-primary stage_ledger must not be empty")
    active = [item for item in stages if item.get("status") == "active"]
    if active:
        errors.append("paired-primary cannot have an active stage at the human gate")
    stage_ids: list[str] = []
    owner_families: set[str] = set()
    prior_result = ""
    pair_artifact_paths: list[str] = []
    for index, stage in enumerate(stages):
        stage_id = stage.get("stage")
        if not isinstance(stage_id, str) or not stage_id:
            errors.append(f"pair.stage_ledger[{index}] requires a stage id")
        elif stage_id in stage_ids:
            errors.append(f"pair.stage_ledger contains duplicate stage id: {stage_id}")
        else:
            stage_ids.append(stage_id)
        if stage.get("owner_family") not in {"anthropic", "openai"}:
            errors.append(f"pair.stage_ledger[{index}] needs one valid owner_family")
        else:
            owner_families.add(stage["owner_family"])
            expected_peer = "anthropic" if stage["owner_family"] == "openai" else "openai"
            if stage.get("peer_family") != expected_peer:
                errors.append(f"pair.stage_ledger[{index}] must acknowledge the other primary as peer")
        if stage.get("status") != "complete" or stage.get("acknowledged") is not True:
            errors.append(f"pair.stage_ledger[{index}] must be complete and acknowledged")
        stage_artifacts = [stage.get("assignment_path"), stage.get("acknowledgement_path"), stage.get("output_path")]
        if any(not isinstance(value, str) or not value for value in stage_artifacts):
            errors.append(f"pair.stage_ledger[{index}] requires assignment, acknowledgement and output artifacts")
        elif base_dir is not None:
            errors.extend(_check_artifact_paths(stage_artifacts, base_dir, f"pair.stage_ledger[{index}].artifacts"))
        if isinstance(stage.get("generation"), bool) or stage.get("generation") != index + 1:
            errors.append(f"pair.stage_ledger[{index}].generation must be {index + 1}")
        for kind, path in zip(("assignment", "acknowledgement", "output"), stage_artifacts):
            digest = stage.get(f"{kind}_sha256")
            if isinstance(path, str) and path:
                pair_artifact_paths.append(path)
            if not re.fullmatch(r"[0-9a-f]{64}", str(digest or "")):
                errors.append(f"pair.stage_ledger[{index}].{kind}_sha256 is required")
            elif base_dir is not None and isinstance(path, str) and path:
                target = Path(path) if Path(path).is_absolute() else base_dir / path
                if target.is_file() and _file_sha256(target) != digest:
                    errors.append(f"pair.stage_ledger[{index}].{kind}_sha256 does not match artifact")
        checks = [_mapping(item) for item in _list(stage.get("checks"))]
        if not checks or any(not item.get("command") or item.get("exit_code") != 0 for item in checks):
            errors.append(f"pair.stage_ledger[{index}] requires passing objective checks")
        if not isinstance(stage.get("human_gates"), list):
            errors.append(f"pair.stage_ledger[{index}].human_gates must be a list")
        if not stage.get("base_revision") or not stage.get("result_revision"):
            errors.append(f"pair.stage_ledger[{index}] requires base_revision and result_revision")
        if prior_result and stage.get("base_revision") != prior_result:
            errors.append(f"pair.stage_ledger[{index}] breaks revision-chain continuity")
        prior_result = stage.get("result_revision", prior_result)
        writer_scopes: list[tuple[str, str]] = []
        for writer_index, raw_writer in enumerate(_list(stage.get("writers"))):
            writer = _mapping(raw_writer)
            actor = writer.get("actor_family")
            paths = writer.get("paths")
            if actor not in {"anthropic", "openai"} or not isinstance(paths, list) or not paths:
                errors.append(f"pair.stage_ledger[{index}].writers[{writer_index}] is invalid")
                continue
            for raw_path in paths:
                if not isinstance(raw_path, str) or not raw_path or Path(raw_path).is_absolute() or ".." in Path(raw_path).parts:
                    errors.append(f"pair.stage_ledger[{index}] writer path must be safe and relative")
                    continue
                writer_scopes.append((actor, raw_path.rstrip("/")))
        for left_index, (left_actor, left_path) in enumerate(writer_scopes):
            for right_actor, right_path in writer_scopes[left_index + 1 :]:
                overlap = left_path == right_path or left_path.startswith(right_path + "/") or right_path.startswith(left_path + "/")
                if left_actor != right_actor and overlap:
                    errors.append(f"pair.stage_ledger[{index}] has overlapping cross-family writer scopes")
    if pair.get("status") == "complete" and owner_families != {"anthropic", "openai"}:
        errors.append("completed paired-primary run requires stage ownership by both primaries")
    if stages and stages[0].get("base_revision") != implementation.get("base_revision"):
        errors.append("paired-primary first stage must start from implementation.base_revision")
    if stages and stages[-1].get("result_revision") != implementation.get("result_revision"):
        errors.append("paired-primary final stage must end at implementation.result_revision")
    applied_paths = {item.get("path") for item in _list(implementation.get("applied_paths")) if isinstance(item, dict)}
    claimed_paths = {
        path
        for stage in stages
        for writer in _list(stage.get("writers"))
        if isinstance(writer, dict)
        for path in _list(writer.get("paths"))
        if isinstance(path, str)
    }
    if applied_paths and not applied_paths.issubset(claimed_paths):
        errors.append("paired-primary writer ledger must cover implementation.applied_paths")
    if len(pair_artifact_paths) != len(set(pair_artifact_paths)):
        errors.append("paired-primary stages must use distinct assignment, acknowledgement and output artifacts")
    return errors


def validate(
    run: dict[str, Any], gate: str = "machine", base_dir: Path | None = None,
    verify_live: bool | None = None,
) -> list[str]:
    errors: list[str] = []
    if run.get("schema_version") != 1:
        errors.append("schema_version must be 1")
    if not run.get("task_id"):
        errors.append("task_id is required")
    mode = run.get("mode", "normal")
    if mode not in {"normal", "expedited-incident"}:
        errors.append("mode must be normal or expedited-incident")

    tier = run.get("risk_tier")
    if tier not in TIERS:
        errors.append("risk_tier must be routine, substantial, crucial, or terminal")
    lead_family = run.get("lead_family")
    if lead_family not in {"anthropic", "openai"}:
        errors.append("lead_family must be anthropic or openai")
    minimum_tier = _minimum_risk(run, errors)
    scope_approval = _mapping(run.get("scope_approval"))
    if not scope_approval.get("approved_by") or not _utc_timestamp(scope_approval.get("approved_at")):
        errors.append("scope_approval requires approved_by and UTC approved_at")
    if scope_approval.get("digest") != _scope_approval_digest(run):
        errors.append("scope_approval digest does not bind current risk, authority, spec and design")
    errors.extend(_validate_scope_receipt(run, base_dir))
    if tier in TIERS and TIER_ORDER.index(tier) < TIER_ORDER.index(minimum_tier):
        override = _mapping(run.get("risk_override"))
        if not override.get("approved_by") or not override.get("reason"):
            errors.append(f"risk_tier is below derived minimum {minimum_tier}; human override required")
    if mode == "expedited-incident":
        expedited = _mapping(run.get("expedited"))
        if tier in TIERS and TIER_ORDER.index(tier) < TIER_ORDER.index("crucial"):
            errors.append("expedited-incident requires crucial or terminal risk")
        for field in ("reason", "authorised_by", "incident_reference", "follow_up_owner"):
            if not expedited.get(field):
                errors.append(f"expedited.{field} is required")
        if not _utc_timestamp(expedited.get("reconcile_by")):
            errors.append("expedited.reconcile_by must be a UTC timestamp")
        elif _parse_utc(run.get("updated_at")) and _parse_utc(expedited.get("reconcile_by")) <= _parse_utc(run.get("updated_at")):
            errors.append("expedited.reconcile_by must be after the run checkpoint")
        if expedited.get("severity") not in {"SEV-1", "SEV-2", "SEV-3"}:
            errors.append("expedited.severity must be SEV-1, SEV-2 or SEV-3")
        if expedited.get("incident_state") not in {"mitigated", "resolved"}:
            errors.append("expedited.incident_state must be mitigated or resolved at the machine gate")
        impact = _mapping(expedited.get("impact_window"))
        if not _utc_timestamp(impact.get("started_at")):
            errors.append("expedited impact_window.started_at is required")
        if impact.get("ended_at") and not _utc_timestamp(impact.get("ended_at")):
            errors.append("expedited impact_window.ended_at must be UTC when present")
        if not _list(expedited.get("affected_systems")) or not _list(expedited.get("evidence")):
            errors.append("expedited incident requires affected_systems and evidence")
        if expedited.get("communication_status") not in {"not-required", "active", "complete"}:
            errors.append("expedited.communication_status is invalid")
        if not expedited.get("postmortem_owner") or not expedited.get("action_tracker"):
            errors.append("expedited incident requires postmortem_owner and action_tracker")
    errors.extend(_validate_authority(run, tier))

    if tier in {"substantial", "crucial", "terminal"}:
        if not _utc_timestamp(run.get("updated_at")):
            errors.append("updated_at must be a UTC timestamp for substantial and higher runs")
        checkpoint = _mapping(run.get("checkpoint"))
        generation = checkpoint.get("generation")
        if not isinstance(generation, int) or isinstance(generation, bool) or generation < 0:
            errors.append("checkpoint.generation must be a non-negative integer")
        if not checkpoint.get("current_slice") or not checkpoint.get("next_action"):
            errors.append("checkpoint must record current_slice and next_action")
        if not isinstance(checkpoint.get("in_flight"), list):
            errors.append("checkpoint.in_flight must be a list")
        elif checkpoint.get("in_flight"):
            errors.append("checkpoint.in_flight must be empty at the human gate")
        artifact_paths = _list(checkpoint.get("artifact_paths"))
        if not artifact_paths:
            errors.append("checkpoint.artifact_paths must not be empty")
        hygiene = _mapping(run.get("context_hygiene"))
        if hygiene.get("status") != "pass":
            errors.append("context_hygiene.status must be pass")
        if not hygiene.get("audit_command"):
            errors.append("context_hygiene.audit_command is required")
        if hygiene.get("audit_exit_code") != 0:
            errors.append("context_hygiene.audit_exit_code must be 0")
        retained = _list(hygiene.get("retained"))
        if not retained:
            errors.append("context_hygiene.retained must not be empty")
        if base_dir is not None:
            errors.extend(_check_artifact_paths(artifact_paths, base_dir, "checkpoint.artifact_paths"))
            errors.extend(_check_artifact_paths(retained, base_dir, "context_hygiene.retained"))

    assurance = _mapping(run.get("assurance"))
    if assurance.get("evaluation_required") is True:
        if assurance.get("status") != "pass" or not assurance.get("receipt"):
            errors.append("required evaluation assurance must pass with a receipt")
        elif base_dir is not None:
            receipt_value = assurance.get("receipt")
            path_errors = _check_artifact_paths([receipt_value], base_dir, "assurance.receipt")
            errors.extend(path_errors)
            if not path_errors:
                receipt_path = Path(receipt_value)
                receipt_path = receipt_path if receipt_path.is_absolute() else base_dir / receipt_path
                try:
                    evaluation = json.loads(receipt_path.read_text())
                except (OSError, json.JSONDecodeError):
                    errors.append("assurance.receipt must contain valid evaluation JSON")
                else:
                    evaluation_errors = EVALUATION_VALIDATOR.validate(
                        evaluation if isinstance(evaluation, dict) else {}
                    )
                    if evaluation_errors or evaluation.get("status") != "pass":
                        errors.append("assurance.receipt must pass the evaluation validator")
        else:
            errors.append("required evaluation assurance cannot be validated without a run directory")
    elif assurance and assurance.get("status") not in {"not-required", "pass"}:
        errors.append("assurance.status must be not-required or pass")

    errors.extend(_validate_pair(run, base_dir))

    spec = _mapping(run.get("spec"))
    if spec.get("status") != "approved":
        errors.append("spec.status must be approved")
    if not spec.get("approved_by"):
        errors.append("spec.approved_by is required")
    criteria = _list(spec.get("acceptance_criteria"))
    if not criteria:
        errors.append("spec.acceptance_criteria must not be empty")
    for index, criterion in enumerate(criteria):
        item = _mapping(criterion)
        if item.get("status") != "pass" or not _list(item.get("evidence")):
            errors.append(f"acceptance criterion {index} must pass with evidence")

    design_status = _mapping(run.get("design")).get("status")
    if design_status not in {"approved", "not-required"}:
        errors.append("design.status must be approved or not-required")
    live_gate = base_dir is not None if verify_live is None else verify_live
    errors.extend(_validate_implementation(run, tier, verify_live=live_gate, run_dir=base_dir))

    verification = _mapping(run.get("verification"))
    checks = _list(verification.get("checks"))
    if verification.get("status") != "pass":
        errors.append("verification.status must be pass")
    if not checks:
        errors.append("verification.checks must not be empty")
    for index, check in enumerate(checks):
        item = _mapping(check)
        if not item.get("command") or item.get("exit_code") != 0:
            errors.append(f"verification check {index} must have a command and exit_code 0")

    repairs = run.get("repair_cycles")
    if not isinstance(repairs, int) or isinstance(repairs, bool) or not 0 <= repairs <= 2:
        errors.append("repair_cycles must be between 0 and 2")
    errors.extend(_validate_review_council(run, tier, repairs, base_dir))
    blockers = run.get("unresolved_blockers")
    if not isinstance(blockers, list):
        errors.append("unresolved_blockers must be a list")
    elif blockers:
        errors.append("unresolved_blockers must be empty")

    reviews = [_mapping(item) for item in _list(run.get("reviews"))]
    passing = [item for item in reviews if item.get("status") == "pass"]
    passing_paths = [item.get("output_path") for item in passing if item.get("output_path")]
    if len(passing_paths) != len(set(passing_paths)):
        errors.append("passing reviews must use distinct output paths")
    for index, item in enumerate(passing):
        if not item.get("adapter") or not item.get("provider_family"):
            errors.append(f"passing review {index} must record adapter and provider_family")
        if not item.get("output_path"):
            errors.append(f"passing review {index} must record output_path")
        elif base_dir is not None:
            errors.extend(_check_artifact_paths([item.get("output_path")], base_dir, f"reviews[{index}].output_path"))
            target = Path(item["output_path"]) if Path(item["output_path"]).is_absolute() else base_dir / item["output_path"]
            if target.is_file() and _file_sha256(target) != item.get("sha256"):
                errors.append(f"passing review {index} sha256 does not match output")
        if not re.fullmatch(r"[0-9a-f]{64}", str(item.get("sha256", ""))):
            errors.append(f"passing review {index} must record output sha256")
        if item.get("reviewed_revision") != _mapping(run.get("implementation")).get("result_revision"):
            errors.append(f"passing review {index} must bind the final implementation revision")
    other_primary = [item for item in passing if item.get("role") == "other-primary"]
    native_review = [item for item in passing if item.get("role") == "native-review"]
    if tier in {"substantial", "crucial", "terminal"}:
        if not other_primary:
            errors.append("required other-primary review is missing")
        else:
            expected_primary = "anthropic" if lead_family == "openai" else "openai"
            if any(item.get("provider_family") != expected_primary for item in other_primary):
                errors.append(
                    f"other-primary review must use {expected_primary} for an {lead_family} lead"
                )
            for item in other_primary:
                route_value = item.get("route_receipt")
                if not route_value:
                    errors.append("other-primary review must reference a dispatcher route receipt")
                elif base_dir is not None:
                    path_errors = _check_artifact_paths([route_value], base_dir, "other-primary.route_receipt")
                    errors.extend(path_errors)
                    if not path_errors:
                        route_path = Path(route_value) if Path(route_value).is_absolute() else base_dir / route_value
                        try:
                            route = json.loads(route_path.read_text())
                        except (OSError, json.JSONDecodeError):
                            errors.append("other-primary route receipt must contain valid JSON")
                        else:
                            expected = {
                                "status": "ok", "provider_family": expected_primary,
                                "cross_family": True, "certification_eligible": True,
                            }
                            if any(route.get(key) != value for key, value in expected.items()):
                                errors.append("other-primary route receipt does not certify the review")
                            if route.get("read_only_guarantee") not in {"enforced", "oauth_safe_mode"}:
                                errors.append("other-primary route receipt lacks enforced read-only guarantee")
                            route_output = route.get("output_path")
                            review_output = item.get("output_path")
                            if not isinstance(route_output, str) or not route_output or not isinstance(review_output, str) or not review_output:
                                errors.append("other-primary route receipt must bind its output path")
                            else:
                                route_target = Path(route_output) if Path(route_output).is_absolute() else base_dir / route_output
                                review_target = Path(review_output) if Path(review_output).is_absolute() else base_dir / review_output
                                if route_target.resolve() != review_target.resolve():
                                    errors.append("other-primary route receipt output does not match the review artifact")
                            for field in ("status", "provider_family", "cross_family", "certification_eligible", "read_only_guarantee"):
                                if item.get({"status": "dispatch_status"}.get(field, field)) != route.get(field):
                                    errors.append(f"other-primary copied {field} disagrees with route receipt")
                if item.get("dispatch_status") != "ok":
                    errors.append("other-primary review dispatch_status must be ok")
                if item.get("cross_family") is not True or item.get("certification_eligible") is not True:
                    errors.append("other-primary review must carry certified cross-family lineage")
                if item.get("read_only_guarantee") not in {"enforced", "oauth_safe_mode"}:
                    errors.append("other-primary review must have an enforced read-only guarantee")
                if _mapping(run.get("pair")).get("mode") == "paired-primary":
                    independence = _mapping(item.get("independence"))
                    if independence.get("fresh_context") is not True:
                        errors.append("paired other-primary review must use fresh context")
                    if independence.get("authored_reviewed_surface") is not False:
                        errors.append("paired other-primary reviewer cannot author the reviewed surface")
                    if independence.get("decision_influence_on_reviewed_surface") is not False:
                        errors.append("paired other-primary reviewer cannot influence the reviewed decision")
        if not native_review:
            errors.append("required fresh-context native review is missing")
        elif any(item.get("provider_family") != lead_family for item in native_review):
            errors.append(f"native review must use the lead family {lead_family}")
        for item in native_review + other_primary:
            independence = _mapping(item.get("independence"))
            if independence.get("fresh_context") is not True:
                errors.append("load-bearing review must use fresh context")
            if independence.get("authored_reviewed_surface") is not False:
                errors.append("load-bearing reviewer cannot author the reviewed surface")
            if independence.get("decision_influence_on_reviewed_surface") is not False:
                errors.append("load-bearing reviewer cannot influence the reviewed decision")

    bonus_needed = {"crucial": 1, "terminal": 2}.get(tier, 0)
    bonus = [
        item for item in reviews if str(item.get("role", "")).startswith("bonus-family-")
    ]
    if len(bonus) < bonus_needed:
        errors.append(f"{tier} tier must record {bonus_needed} bonus-family review attempt(s)")
    distinct_bonus_families = {item.get("provider_family") for item in bonus if item.get("provider_family")}
    if tier == "terminal" and len(distinct_bonus_families) < 2 and not run.get("bonus_coverage_reason"):
        errors.append("terminal tier with fewer than two distinct bonus families must record bonus_coverage_reason")
    primary_families = {"anthropic", "openai"}
    for index, item in enumerate(bonus):
        family = item.get("provider_family")
        if family in primary_families:
            errors.append(f"bonus-family review {index} must not relabel a primary family")
        if item.get("status") != "pass" and not item.get("reason"):
            errors.append(f"non-passing bonus-family review {index} must record a reason")

    phase = run.get("phase")
    if gate == "machine":
        if phase != "awaiting-human":
            errors.append("phase must be awaiting-human at the machine gate")
    elif gate == "complete":
        if phase != "complete":
            errors.append("phase must be complete")
        human = _mapping(run.get("human_final"))
        if human.get("status") != "approved":
            errors.append("human_final.status must be approved")
        if not human.get("approved_by"):
            errors.append("human_final.approved_by is required")
    else:
        errors.append("gate must be machine or complete")

    return errors


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("run", type=Path)
    parser.add_argument("--gate", choices=("preflight", "machine", "complete"), default="machine")
    args = parser.parse_args(argv)
    try:
        run = json.loads(args.run.read_text())
    except (OSError, json.JSONDecodeError) as exc:
        print(f"invalid run receipt: {exc}", file=sys.stderr)
        return 2
    if not isinstance(run, dict):
        print("invalid run receipt: root must be an object", file=sys.stderr)
        return 2
    errors = validate_preflight(run, args.run.parent) if args.gate == "preflight" else validate(run, gate=args.gate, base_dir=args.run.parent)
    if errors:
        for error in errors:
            print(f"FAIL: {error}", file=sys.stderr)
        return 1
    print(f"PASS: {args.gate} gate")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
