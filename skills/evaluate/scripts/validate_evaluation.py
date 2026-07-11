#!/usr/bin/env python3
"""Validate a hash-bound stochastic/judgement evaluation-run receipt."""

from __future__ import annotations

import argparse
from datetime import datetime
import hashlib
import json
import math
from pathlib import Path, PurePosixPath
import re
import sys
from typing import Any


CONTRACT = "evaluation-run"
SCHEMA_VERSION = 2
RUN_STATUSES = {"planned", "running", "pass", "fail", "incomplete", "cancelled"}
FINAL_STATUSES = {"pass", "fail", "incomplete", "cancelled"}
ATTEMPT_STATUSES = {"success", "timed-out", "invalid-output", "tool-error", "skipped", "excluded"}
CASE_STATUSES = {"pass", "fail", "omitted", "skipped", "excluded", "timed-out", "invalid", "tool-error"}
SEMANTIC_CASE_STATUSES = {"pass", "fail"}
DIGEST = re.compile(r"^sha256:[0-9a-f]{64}$")
HUMAN_GATE_KEYS = {
    "human_acceptance", "human_gates", "acceptance", "accepted_by", "approval", "approved_by",
}
TOP_LEVEL_FIELDS = {
    "contract", "schema_version", "evaluation_id", "kind", "created_at", "updated_at", "status",
    "decision", "artifacts", "plan", "preflight", "attempts", "case_results", "graders",
    "judgements", "adjudications", "results", "conclusion",
}
RUNTIME_DIMENSIONS = {
    "adapter", "adapter_version", "endpoint_provider", "provider_family", "requested_model",
    "actual_model", "requested_effort", "effective_effort", "capability_source",
}


def _object(value: Any, label: str, errors: list[str]) -> dict[str, Any]:
    if not isinstance(value, dict):
        errors.append(f"{label} must be an object")
        return {}
    return value


def _list(value: Any, label: str, errors: list[str]) -> list[Any]:
    if not isinstance(value, list):
        errors.append(f"{label} must be a list")
        return []
    return value


def _text(value: Any, label: str, errors: list[str], *, allow_empty: bool = False) -> str:
    if not isinstance(value, str) or (not allow_empty and not value.strip()):
        errors.append(f"{label} must be a non-empty string" if not allow_empty else f"{label} must be a string")
        return ""
    return value


def _finite(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(float(value))


def _integer(value: Any, label: str, errors: list[str], *, minimum: int | None = None) -> int | None:
    if isinstance(value, bool) or not isinstance(value, int) or (minimum is not None and value < minimum):
        suffix = f" >= {minimum}" if minimum is not None else ""
        errors.append(f"{label} must be an integer{suffix}")
        return None
    return value


def _time(value: Any, label: str, errors: list[str]) -> datetime | None:
    if not isinstance(value, str) or not value.endswith("Z"):
        errors.append(f"{label} must be a UTC timestamp ending in Z")
        return None
    try:
        parsed = datetime.fromisoformat(value[:-1] + "+00:00")
    except ValueError:
        errors.append(f"{label} must be a valid UTC timestamp")
        return None
    return parsed


def _digest(value: Any, label: str, errors: list[str]) -> str:
    if not isinstance(value, str) or not DIGEST.fullmatch(value):
        errors.append(f"{label} must be sha256:<64 lowercase hex>")
        return ""
    return value


def _strict_string_list(value: Any, label: str, errors: list[str], *, nonempty: bool = False) -> list[str]:
    rows = _list(value, label, errors)
    if nonempty and not rows:
        errors.append(f"{label} must not be empty")
    for index, item in enumerate(rows):
        _text(item, f"{label}[{index}]", errors)
    return [item for item in rows if isinstance(item, str) and item]


def _inside(root: Path, target: Path) -> bool:
    try:
        target.relative_to(root)
        return True
    except ValueError:
        return False


def _reject_human_gate_claims(value: Any, label: str, errors: list[str]) -> None:
    if isinstance(value, dict):
        forbidden = HUMAN_GATE_KEYS & set(value)
        if forbidden:
            errors.append(f"{label} cannot claim human acceptance: {', '.join(sorted(forbidden))}")
        for key, child in value.items():
            _reject_human_gate_claims(child, f"{label}.{key}", errors)
    elif isinstance(value, list):
        for index, child in enumerate(value):
            _reject_human_gate_claims(child, f"{label}[{index}]", errors)


def _safe_relative_path(value: Any, label: str, errors: list[str]) -> str:
    path = _text(value, label, errors)
    if not path:
        return ""
    if any(ord(character) < 32 or ord(character) == 127 for character in path):
        errors.append(f"{label} must not contain control characters")
        return ""
    pure = PurePosixPath(path)
    if pure.is_absolute() or path.startswith("~") or "\\" in path or any(part in {"", ".", ".."} for part in pure.parts):
        errors.append(f"{label} must be a safe relative POSIX path")
        return ""
    return path


def _validate_artifacts(
    value: Any,
    errors: list[str],
    *,
    receipt_dir: Path | None,
    verify_hashes: bool,
) -> dict[str, dict[str, Any]]:
    rows = _list(value, "artifacts", errors)
    artifacts: dict[str, dict[str, Any]] = {}
    root: Path | None = None
    if receipt_dir is not None:
        try:
            root = receipt_dir.resolve()
        except (OSError, ValueError) as exc:
            errors.append(f"receipt_dir cannot be resolved: {exc}")
    for index, raw in enumerate(rows):
        item = _object(raw, f"artifacts[{index}]", errors)
        artifact_id = _text(item.get("id"), f"artifacts[{index}].id", errors)
        if artifact_id in artifacts:
            errors.append(f"duplicate artifact id: {artifact_id}")
        path = _safe_relative_path(item.get("path"), f"artifacts[{index}].path", errors)
        _text(item.get("media_type"), f"artifacts[{index}].media_type", errors)
        digest = _digest(item.get("digest"), f"artifacts[{index}].digest", errors)
        for field in ("owner", "retention", "data_policy"):
            _text(item.get(field), f"artifacts[{index}].{field}", errors)
        if root is not None and path:
            try:
                target = (root / path).resolve(strict=False)
            except (OSError, ValueError) as exc:
                errors.append(f"artifact {artifact_id or index} path cannot be resolved: {exc}")
                target = None
            if target is None:
                pass
            elif not _inside(root, target):
                errors.append(f"artifact {artifact_id or index} escapes receipt_dir")
            elif verify_hashes:
                if not target.is_file():
                    errors.append(f"artifact {artifact_id or index} is not a readable file")
                elif digest:
                    try:
                        actual = "sha256:" + hashlib.sha256(target.read_bytes()).hexdigest()
                    except OSError as exc:
                        errors.append(f"artifact {artifact_id or index} cannot be read: {exc}")
                    else:
                        if actual != digest:
                            errors.append(f"artifact {artifact_id or index} digest mismatch")
        if artifact_id:
            artifacts[artifact_id] = item
    return artifacts


def _artifact_ref(value: Any, label: str, artifacts: dict[str, dict[str, Any]], errors: list[str]) -> str:
    artifact_id = _text(value, label, errors)
    if artifact_id and artifact_id not in artifacts:
        errors.append(f"{label} references unknown artifact: {artifact_id}")
    return artifact_id


def _validate_lineage(
    value: Any,
    label: str,
    errors: list[str],
    *,
    family: str | None = None,
    success: bool = True,
) -> dict[str, Any]:
    lineage = _object(value, label, errors)
    for field in (
        "adapter", "adapter_version", "endpoint_provider", "provider_family",
        "requested_model", "requested_effort", "capability_source", "session_id",
    ):
        _text(lineage.get(field), f"{label}.{field}", errors)
    if family and lineage.get("provider_family") != family:
        errors.append(f"{label}.provider_family must match the planned family")
    actual_model = lineage.get("actual_model")
    effective_effort = lineage.get("effective_effort")
    if success:
        _text(actual_model, f"{label}.actual_model", errors)
        _text(effective_effort, f"{label}.effective_effort", errors)
    else:
        if actual_model is not None and not isinstance(actual_model, str):
            errors.append(f"{label}.actual_model must be a string when present")
        if effective_effort is not None and not isinstance(effective_effort, str):
            errors.append(f"{label}.effective_effort must be a string when present")
    substituted = (
        isinstance(actual_model, str)
        and actual_model
        and actual_model != lineage.get("requested_model")
    ) or (
        isinstance(effective_effort, str)
        and effective_effort
        and effective_effort != lineage.get("requested_effort")
    )
    reason = lineage.get("substitution_reason", "")
    if not isinstance(reason, str):
        errors.append(f"{label}.substitution_reason must be a string")
    elif substituted and not reason.strip():
        errors.append(f"{label}.substitution_reason is required for substituted model or effort")
    return lineage


def _validate_usage(value: Any, label: str, errors: list[str]) -> None:
    usage = _object(value, label, errors)
    unavailable = usage.get("unavailable_reason", "")
    if unavailable:
        _text(unavailable, f"{label}.unavailable_reason", errors)
        return
    for field in ("input_tokens", "output_tokens"):
        _integer(usage.get(field), f"{label}.{field}", errors, minimum=0)
    if "cached_input_tokens" in usage:
        _integer(usage.get("cached_input_tokens"), f"{label}.cached_input_tokens", errors, minimum=0)


def _validate_plan(
    value: Any,
    artifacts: dict[str, dict[str, Any]],
    errors: list[str],
) -> dict[str, Any]:
    plan = _object(value, "plan", errors)
    artifact_id = _artifact_ref(plan.get("artifact_id"), "plan.artifact_id", artifacts, errors)
    plan_digest = _digest(plan.get("digest"), "plan.digest", errors)
    if artifact_id in artifacts and plan_digest and artifacts[artifact_id].get("digest") != plan_digest:
        errors.append("plan.digest must match its artifact digest")
    frozen_at = _time(plan.get("frozen_at"), "plan.frozen_at", errors)
    _digest(plan.get("shared_runtime_digest"), "plan.shared_runtime_digest", errors)

    dataset = _object(plan.get("dataset"), "plan.dataset", errors)
    for field in ("id", "version", "holdout_boundary"):
        _text(dataset.get(field), f"plan.dataset.{field}", errors)
    _artifact_ref(dataset.get("artifact_id"), "plan.dataset.artifact_id", artifacts, errors)
    provenance = _object(dataset.get("provenance"), "plan.dataset.provenance", errors)
    for field in ("source", "consent_or_license", "data_policy"):
        _text(provenance.get(field), f"plan.dataset.provenance.{field}", errors)
    development_digest = _digest(dataset.get("development_split_digest"), "plan.dataset.development_split_digest", errors)
    holdout_digest = _digest(dataset.get("holdout_split_digest"), "plan.dataset.holdout_split_digest", errors)
    if development_digest and holdout_digest and development_digest == holdout_digest:
        errors.append("development and holdout split digests must differ")

    arms: dict[str, dict[str, Any]] = {}
    roles: dict[str, list[dict[str, Any]]] = {}
    allowed_roles = {"candidate", "treatment", "control", "baseline", "without", "previous"}
    for index, raw in enumerate(_list(plan.get("arms"), "plan.arms", errors)):
        arm = _object(raw, f"plan.arms[{index}]", errors)
        arm_id = _text(arm.get("id"), f"plan.arms[{index}].id", errors)
        role = arm.get("role")
        if role not in allowed_roles:
            errors.append(f"plan.arms[{index}].role is invalid")
        applicability = arm.get("applicability")
        if applicability not in {"required", "not-applicable"}:
            errors.append(f"plan.arms[{index}].applicability must be required or not-applicable")
        reason = arm.get("reason", "")
        if not isinstance(reason, str):
            errors.append(f"plan.arms[{index}].reason must be a string")
        if applicability == "required":
            _artifact_ref(arm.get("manifest_artifact_id"), f"plan.arms[{index}].manifest_artifact_id", artifacts, errors)
            _digest(arm.get("configuration_digest"), f"plan.arms[{index}].configuration_digest", errors)
        elif not isinstance(reason, str) or not reason.strip():
            errors.append(f"plan.arms[{index}] not-applicable requires a reason")
        overrides = _strict_string_list(
            arm.get("runtime_overrides", []), f"plan.arms[{index}].runtime_overrides", errors
        )
        if len(overrides) != len(set(overrides)) or any(field not in RUNTIME_DIMENSIONS for field in overrides):
            errors.append(f"plan.arms[{index}].runtime_overrides are invalid")
        if arm_id in arms:
            errors.append(f"duplicate arm id: {arm_id}")
        elif arm_id:
            arms[arm_id] = arm
        if isinstance(role, str):
            roles.setdefault(role, []).append(arm)
    if len(roles.get("candidate", [])) != 1 or roles.get("candidate", [{}])[0].get("applicability") != "required":
        errors.append("plan.arms requires exactly one required candidate role")

    schedule = _object(plan.get("schedule"), "plan.schedule", errors)
    cases: dict[str, dict[str, Any]] = {}
    for index, raw in enumerate(_list(schedule.get("cases"), "plan.schedule.cases", errors)):
        case = _object(raw, f"plan.schedule.cases[{index}]", errors)
        case_id = _text(case.get("id"), f"plan.schedule.cases[{index}].id", errors)
        _text(case.get("category"), f"plan.schedule.cases[{index}].category", errors)
        if not isinstance(case.get("critical"), bool):
            errors.append(f"plan.schedule.cases[{index}].critical must be boolean")
        if case_id in cases:
            errors.append(f"duplicate case id: {case_id}")
        elif case_id:
            cases[case_id] = case
    if not cases:
        errors.append("plan.schedule.cases must not be empty")

    families = _strict_string_list(schedule.get("families"), "plan.schedule.families", errors, nonempty=True)
    if len(families) != len(set(families)):
        errors.append("plan.schedule.families must be unique")
    repetitions = _integer(schedule.get("repetitions"), "plan.schedule.repetitions", errors, minimum=1) or 0
    variance_policy = schedule.get("variance_policy")
    if variance_policy not in {"repeated", "not-applicable"}:
        errors.append("plan.schedule.variance_policy must be repeated or not-applicable")
    if variance_policy == "repeated" and repetitions < 2:
        errors.append("repeated variance policy requires at least two repetitions")
    if variance_policy == "not-applicable":
        if repetitions != 1:
            errors.append("not-applicable variance policy requires exactly one repetition")
        _text(schedule.get("variance_reason"), "plan.schedule.variance_reason", errors)
    elif not isinstance(schedule.get("variance_reason", ""), str):
        errors.append("plan.schedule.variance_reason must be a string")
    seeds = _list(schedule.get("seeds"), "plan.schedule.seeds", errors)
    if repetitions and len(seeds) != repetitions:
        errors.append("plan.schedule.seeds must contain one seed per repetition")
    if any(isinstance(seed, bool) or not isinstance(seed, (int, str)) or seed == "" for seed in seeds):
        errors.append("plan.schedule.seeds must contain non-empty scalar seeds")
    if len({str(seed) for seed in seeds}) != len(seeds):
        errors.append("plan.schedule.seeds must be unique")

    shards: dict[str, list[str]] = {}
    assigned_cases: list[str] = []
    for index, raw in enumerate(_list(schedule.get("shards"), "plan.schedule.shards", errors)):
        shard = _object(raw, f"plan.schedule.shards[{index}]", errors)
        shard_id = _text(shard.get("id"), f"plan.schedule.shards[{index}].id", errors)
        case_ids = _strict_string_list(shard.get("case_ids"), f"plan.schedule.shards[{index}].case_ids", errors, nonempty=True)
        if any(case_id not in cases for case_id in case_ids):
            errors.append(f"plan.schedule.shards[{index}] references unknown case")
        if len(case_ids) != len(set(case_ids)):
            errors.append(f"plan.schedule.shards[{index}].case_ids must be unique")
        if shard_id in shards:
            errors.append(f"duplicate shard id: {shard_id}")
        elif shard_id:
            shards[shard_id] = case_ids
        assigned_cases.extend(case_ids)
    if sorted(assigned_cases) != sorted(cases):
        errors.append("plan.schedule.shards must partition every case exactly once")
    timeout_seconds = _integer(schedule.get("timeout_seconds"), "plan.schedule.timeout_seconds", errors, minimum=1) or 0
    _text(schedule.get("ordering"), "plan.schedule.ordering", errors)
    retry_policy = _object(schedule.get("retry_policy"), "plan.schedule.retry_policy", errors)
    if retry_policy.get("mode") not in {"none", "retain-all-predeclared"}:
        errors.append("plan.schedule.retry_policy.mode is invalid")
    max_retries = _integer(retry_policy.get("max_retries"), "plan.schedule.retry_policy.max_retries", errors, minimum=0)
    if retry_policy.get("mode") == "none" and max_retries not in {None, 0}:
        errors.append("retry policy none requires max_retries 0")
    exclusion_policy = _object(schedule.get("exclusion_policy"), "plan.schedule.exclusion_policy", errors)
    if exclusion_policy.get("mode") not in {"none", "predeclared-only"}:
        errors.append("plan.schedule.exclusion_policy.mode is invalid")
    predeclared_exclusions: set[str] = set()
    for index, raw in enumerate(_list(exclusion_policy.get("predeclared"), "plan.schedule.exclusion_policy.predeclared", errors)):
        exclusion = _object(raw, f"plan.schedule.exclusion_policy.predeclared[{index}]", errors)
        case_id = _text(exclusion.get("case_id"), f"plan.schedule.exclusion_policy.predeclared[{index}].case_id", errors)
        _text(exclusion.get("reason"), f"plan.schedule.exclusion_policy.predeclared[{index}].reason", errors)
        if case_id not in cases:
            errors.append(f"predeclared exclusion references unknown case: {case_id}")
        if case_id in predeclared_exclusions:
            errors.append(f"duplicate predeclared exclusion: {case_id}")
        predeclared_exclusions.add(case_id)
    if exclusion_policy.get("mode") == "none" and predeclared_exclusions:
        errors.append("exclusion policy none cannot predeclare exclusions")

    requirements: dict[str, dict[str, Any]] = {}
    for index, raw in enumerate(_list(plan.get("preflight_requirements"), "plan.preflight_requirements", errors)):
        requirement = _object(raw, f"plan.preflight_requirements[{index}]", errors)
        requirement_id = _text(requirement.get("id"), f"plan.preflight_requirements[{index}].id", errors)
        applicability = requirement.get("applicability")
        if applicability not in {"required", "not-applicable"}:
            errors.append(f"plan.preflight_requirements[{index}].applicability is invalid")
        reason = requirement.get("reason", "")
        if not isinstance(reason, str):
            errors.append(f"plan.preflight_requirements[{index}].reason must be a string")
        elif applicability == "not-applicable" and not reason.strip():
            errors.append(f"plan.preflight_requirements[{index}] not-applicable requires a reason")
        if requirement_id in requirements:
            errors.append(f"duplicate preflight requirement: {requirement_id}")
        elif requirement_id:
            requirements[requirement_id] = requirement
    if not requirements:
        errors.append("plan.preflight_requirements must not be empty")

    metrics: dict[str, dict[str, Any]] = {}
    for index, raw in enumerate(_list(plan.get("metrics"), "plan.metrics", errors)):
        metric = _object(raw, f"plan.metrics[{index}]", errors)
        name = _text(metric.get("name"), f"plan.metrics[{index}].name", errors)
        for field in ("unit", "aggregation"):
            _text(metric.get(field), f"plan.metrics[{index}].{field}", errors)
        if metric.get("aggregation") != "mean":
            errors.append(f"plan.metrics[{index}].aggregation must be mean in schema v2")
        direction = metric.get("direction")
        if direction not in {"gte", "lte", "eq"}:
            errors.append(f"plan.metrics[{index}].direction is invalid")
        for field in ("threshold", "minimum", "maximum", "regression_margin"):
            if not _finite(metric.get(field)):
                errors.append(f"plan.metrics[{index}].{field} must be finite numeric")
        minimum = metric.get("minimum")
        maximum = metric.get("maximum")
        threshold = metric.get("threshold")
        if _finite(minimum) and _finite(maximum) and float(minimum) >= float(maximum):
            errors.append(f"plan.metrics[{index}] minimum must be below maximum")
        if _finite(minimum) and _finite(maximum) and _finite(threshold) and not float(minimum) <= float(threshold) <= float(maximum):
            errors.append(f"plan.metrics[{index}].threshold must be inside its range")
        if _finite(metric.get("regression_margin")) and float(metric["regression_margin"]) < 0:
            errors.append(f"plan.metrics[{index}].regression_margin must be non-negative")
        target_arm = metric.get("target_arm_id")
        if target_arm not in arms or arms.get(target_arm, {}).get("applicability") != "required":
            errors.append(f"plan.metrics[{index}].target_arm_id must reference a required arm")
        baselines = _strict_string_list(metric.get("baseline_arm_ids"), f"plan.metrics[{index}].baseline_arm_ids", errors)
        if target_arm in baselines or len(baselines) != len(set(baselines)) or any(arm_id not in arms for arm_id in baselines):
            errors.append(f"plan.metrics[{index}].baseline_arm_ids are invalid")
        if not isinstance(metric.get("critical"), bool):
            errors.append(f"plan.metrics[{index}].critical must be boolean")
        if name in metrics:
            errors.append(f"duplicate metric name: {name}")
        elif name:
            normalized = dict(metric)
            normalized["direction"] = direction if direction in {"gte", "lte", "eq"} else "gte"
            normalized["threshold"] = float(threshold) if _finite(threshold) else 0.0
            normalized["minimum"] = float(minimum) if _finite(minimum) else 0.0
            normalized["maximum"] = float(maximum) if _finite(maximum) else 1.0
            normalized["regression_margin"] = (
                float(metric["regression_margin"]) if _finite(metric.get("regression_margin")) else 0.0
            )
            normalized["target_arm_id"] = target_arm if isinstance(target_arm, str) else ""
            normalized["baseline_arm_ids"] = baselines
            metrics[name] = normalized
    if not metrics:
        errors.append("plan.metrics must not be empty")

    grader_policy = _object(plan.get("grader_policy"), "plan.grader_policy", errors)
    required_graders = _strict_string_list(grader_policy.get("required_grader_ids"), "plan.grader_policy.required_grader_ids", errors, nonempty=True)
    if len(required_graders) != len(set(required_graders)):
        errors.append("plan.grader_policy.required_grader_ids must be unique")
    if grader_policy.get("independent") is not True:
        errors.append("plan.grader_policy.independent must be true")
    if grader_policy.get("blinded") is not True:
        errors.append("plan.grader_policy.blinded must be true")
    if grader_policy.get("self_judging") != "forbidden":
        errors.append("plan.grader_policy.self_judging must be forbidden")
    _text(grader_policy.get("disagreement_protocol"), "plan.grader_policy.disagreement_protocol", errors)

    safety = _object(plan.get("safety"), "plan.safety", errors)
    applicability = safety.get("applicability")
    if applicability not in {"required", "not-applicable"}:
        errors.append("plan.safety.applicability must be required or not-applicable")
    safety_cases = _strict_string_list(safety.get("case_ids"), "plan.safety.case_ids", errors)
    if any(case_id not in cases for case_id in safety_cases):
        errors.append("plan.safety.case_ids reference unknown cases")
    if applicability == "required":
        if not safety_cases:
            errors.append("required safety evaluation needs case_ids")
        for case_id in safety_cases:
            if cases.get(case_id, {}).get("critical") is not True:
                errors.append(f"safety case must be critical: {case_id}")
    else:
        _text(safety.get("reason"), "plan.safety.reason", errors)
        if safety_cases:
            errors.append("not-applicable safety cannot list case_ids")

    return {
        "raw": plan,
        "frozen_at": frozen_at,
        "shared_runtime_digest": plan.get("shared_runtime_digest"),
        "arms": arms,
        "active_arms": {arm_id: arm for arm_id, arm in arms.items() if arm.get("applicability") == "required"},
        "roles": roles,
        "cases": cases,
        "families": families,
        "repetitions": repetitions,
        "seeds": seeds,
        "shards": shards,
        "timeout_seconds": timeout_seconds,
        "retry_policy": retry_policy,
        "predeclared_exclusions": predeclared_exclusions,
        "requirements": requirements,
        "metrics": metrics,
        "required_graders": required_graders,
        "grader_policy": grader_policy,
        "safety_cases": set(safety_cases),
    }


def _validate_preflight(
    value: Any,
    plan: dict[str, Any],
    artifacts: dict[str, dict[str, Any]],
    errors: list[str],
    *,
    final: bool,
    require_success: bool,
    frozen_at: datetime | None,
    updated_at: datetime | None,
) -> tuple[dict[str, dict[str, Any]], datetime | None]:
    results: dict[str, dict[str, Any]] = {}
    latest: datetime | None = None
    for index, raw in enumerate(_list(value, "preflight", errors)):
        item = _object(raw, f"preflight[{index}]", errors)
        item_id = _text(item.get("id"), f"preflight[{index}].id", errors)
        requirement = plan["requirements"].get(item_id)
        if requirement is None:
            errors.append(f"preflight[{index}] is not declared in the frozen plan")
        if item_id in results:
            errors.append(f"duplicate preflight result: {item_id}")
        status = item.get("status")
        if status not in {"pass", "fail", "not-applicable"}:
            errors.append(f"preflight[{index}].status is invalid")
        if requirement:
            if requirement.get("applicability") == "not-applicable":
                if status != "not-applicable":
                    errors.append(f"preflight {item_id} must be not-applicable")
            elif status == "not-applicable":
                errors.append(f"required preflight {item_id} cannot be not-applicable")
            elif require_success and status != "pass":
                errors.append(f"preflight {item_id} must be pass")
        started = _time(item.get("started_at"), f"preflight[{index}].started_at", errors)
        completed = _time(item.get("completed_at"), f"preflight[{index}].completed_at", errors)
        if started and completed and completed < started:
            errors.append(f"preflight[{index}] completes before it starts")
        if frozen_at and started and started < frozen_at:
            errors.append(f"preflight[{index}] starts before the plan was frozen")
        if updated_at and completed and completed > updated_at:
            errors.append(f"preflight[{index}].completed_at follows updated_at")
        if completed and (latest is None or completed > latest):
            latest = completed
        if status in {"pass", "fail"}:
            _artifact_ref(item.get("evidence_artifact_id"), f"preflight[{index}].evidence_artifact_id", artifacts, errors)
            exit_code = _integer(item.get("exit_code"), f"preflight[{index}].exit_code", errors)
            if status == "pass" and exit_code not in {None, 0}:
                errors.append(f"passing preflight {item_id} must have exit_code 0")
        else:
            _text(item.get("reason"), f"preflight[{index}].reason", errors)
        if item_id:
            results[item_id] = item
    if final and set(results) != set(plan["requirements"]):
        errors.append("final receipt must account for every preflight requirement")
    return results, latest


def _validate_attempts(
    value: Any,
    plan: dict[str, Any],
    artifacts: dict[str, dict[str, Any]],
    errors: list[str],
    *,
    final: bool,
    latest_preflight: datetime | None,
) -> tuple[dict[str, dict[str, Any]], dict[str, tuple[str, str, int, str]]]:
    attempts: dict[str, dict[str, Any]] = {}
    cells: dict[str, tuple[str, str, int, str]] = {}
    base_cells: dict[tuple[str, str, int, str], list[str]] = {}
    rows = _list(value, "attempts", errors)
    for index, raw in enumerate(rows):
        item = _object(raw, f"attempts[{index}]", errors)
        attempt_id = _text(item.get("id"), f"attempts[{index}].id", errors)
        if attempt_id in attempts:
            errors.append(f"duplicate attempt id: {attempt_id}")
        arm_id = item.get("arm_id")
        family = item.get("family")
        repetition = item.get("repetition")
        shard_id = item.get("shard_id")
        if arm_id not in plan["active_arms"]:
            errors.append(f"attempts[{index}].arm_id is not an active planned arm")
        if family not in plan["families"]:
            errors.append(f"attempts[{index}].family is not planned")
        repetition_value = _integer(repetition, f"attempts[{index}].repetition", errors, minimum=1)
        if repetition_value and repetition_value > plan["repetitions"]:
            errors.append(f"attempts[{index}].repetition exceeds the plan")
        if shard_id not in plan["shards"]:
            errors.append(f"attempts[{index}].shard_id is not planned")
        if repetition_value and repetition_value <= len(plan["seeds"]) and item.get("seed") != plan["seeds"][repetition_value - 1]:
            errors.append(f"attempts[{index}].seed does not match the frozen plan")
        arm = plan["active_arms"].get(arm_id, {})
        expected_manifest = artifacts.get(arm.get("manifest_artifact_id"), {}).get("digest")
        bindings = {
            "plan_digest": plan["raw"].get("digest"),
            "shared_runtime_digest": plan.get("shared_runtime_digest"),
            "arm_manifest_digest": expected_manifest,
            "arm_configuration_digest": arm.get("configuration_digest"),
        }
        for field, expected_binding in bindings.items():
            actual_binding = _digest(item.get(field), f"attempts[{index}].{field}", errors)
            if actual_binding and expected_binding and actual_binding != expected_binding:
                errors.append(f"attempts[{index}].{field} must match the frozen plan")
        status = item.get("status")
        if status not in ATTEMPT_STATUSES:
            errors.append(f"attempts[{index}].status is invalid")
        started = _time(item.get("started_at"), f"attempts[{index}].started_at", errors)
        completed = _time(item.get("completed_at"), f"attempts[{index}].completed_at", errors)
        if started and completed and completed < started:
            errors.append(f"attempts[{index}] completes before it starts")
        if plan["frozen_at"] and started and started < plan["frozen_at"]:
            errors.append(f"attempts[{index}] starts before the plan was frozen")
        if latest_preflight and started and started < latest_preflight:
            errors.append(f"attempts[{index}] starts before deterministic preflight completed")
        if started and completed:
            duration = (completed - started).total_seconds()
            timeout = plan.get("timeout_seconds", 0)
            if status == "success" and timeout and duration > timeout:
                errors.append(f"attempts[{index}] successful duration exceeds the frozen timeout")
            if status == "timed-out" and timeout and duration < timeout:
                errors.append(f"attempts[{index}] timed-out before the frozen timeout elapsed")
        _artifact_ref(item.get("route_receipt_artifact_id"), f"attempts[{index}].route_receipt_artifact_id", artifacts, errors)
        _artifact_ref(item.get("input_artifact_id"), f"attempts[{index}].input_artifact_id", artifacts, errors)
        output_id = item.get("output_artifact_id", "")
        if status == "success":
            _artifact_ref(output_id, f"attempts[{index}].output_artifact_id", artifacts, errors)
        elif output_id:
            _artifact_ref(output_id, f"attempts[{index}].output_artifact_id", artifacts, errors)
            _text(item.get("reason"), f"attempts[{index}].reason", errors)
        else:
            _text(item.get("reason"), f"attempts[{index}].reason", errors)
        timer_evidence = item.get("timer_evidence_artifact_id", "")
        if status == "timed-out":
            _artifact_ref(timer_evidence, f"attempts[{index}].timer_evidence_artifact_id", artifacts, errors)
        elif timer_evidence:
            _artifact_ref(timer_evidence, f"attempts[{index}].timer_evidence_artifact_id", artifacts, errors)
        _validate_lineage(item.get("lineage"), f"attempts[{index}].lineage", errors, family=family if isinstance(family, str) else None, success=status == "success")
        _validate_usage(item.get("usage"), f"attempts[{index}].usage", errors)
        retry_of = item.get("retry_of", "")
        if not isinstance(retry_of, str):
            errors.append(f"attempts[{index}].retry_of must be a string")
            retry_of = ""
        cell = (str(arm_id), str(family), int(repetition_value or 0), str(shard_id))
        if attempt_id:
            attempts[attempt_id] = item
            cells[attempt_id] = cell
            if not retry_of:
                base_cells.setdefault(cell, []).append(attempt_id)

    retry_counts: dict[tuple[str, str, int, str], int] = {}
    seen_ids: set[str] = set()
    for index, item in enumerate(rows):
        if not isinstance(item, dict):
            continue
        attempt_id = item.get("id")
        retry_of = item.get("retry_of", "")
        if retry_of:
            if plan["retry_policy"].get("mode") != "retain-all-predeclared":
                errors.append(f"attempt {attempt_id} is a retry but retries were not predeclared")
            parent = attempts.get(retry_of)
            if retry_of not in seen_ids or parent is None:
                errors.append(f"attempt {attempt_id} retry_of must reference an earlier retained attempt")
            elif cells.get(attempt_id) != cells.get(retry_of):
                errors.append(f"attempt {attempt_id} retry cell differs from its parent")
            elif item.get("input_artifact_id") != parent.get("input_artifact_id"):
                errors.append(f"attempt {attempt_id} retry input differs from its parent")
            elif parent.get("status") == "success":
                errors.append(f"attempt {attempt_id} cannot retry a successful attempt")
            else:
                parent_completed = _time(parent.get("completed_at"), f"attempt {retry_of}.completed_at", [])
                started = _time(item.get("started_at"), f"attempt {attempt_id}.started_at", [])
                if parent_completed and started and started < parent_completed:
                    errors.append(f"attempt {attempt_id} starts before its retry parent completed")
            cell = cells.get(attempt_id)
            if cell:
                retry_counts[cell] = retry_counts.get(cell, 0) + 1
        if isinstance(attempt_id, str):
            seen_ids.add(attempt_id)
    maximum = plan["retry_policy"].get("max_retries")
    if isinstance(maximum, int):
        for cell, count in retry_counts.items():
            if count > maximum:
                errors.append(f"retry count exceeds the frozen maximum for {cell}")

    expected = {
        (arm_id, family, repetition, shard_id)
        for arm_id in plan["active_arms"]
        for family in plan["families"]
        for repetition in range(1, plan["repetitions"] + 1)
        for shard_id in plan["shards"]
    }
    if final:
        observed = set(base_cells)
        missing = expected - observed
        extra = observed - expected
        if missing:
            errors.append(f"final receipt is missing {len(missing)} planned base attempts")
        if extra:
            errors.append(f"final receipt has {len(extra)} unplanned base attempts")
        for cell, ids in base_cells.items():
            if len(ids) != 1:
                errors.append(f"planned attempt cell must have exactly one base attempt: {cell}")
    paired_inputs: dict[tuple[str, int, str], set[str]] = {}
    paired_attempts: dict[tuple[str, int, str], list[str]] = {}
    for cell, ids in base_cells.items():
        _, family, repetition, shard_id = cell
        for attempt_id in ids:
            input_id = attempts.get(attempt_id, {}).get("input_artifact_id")
            if isinstance(input_id, str):
                paired_inputs.setdefault((family, repetition, shard_id), set()).add(input_id)
            paired_attempts.setdefault((family, repetition, shard_id), []).append(attempt_id)
    if any(len(input_ids) > 1 for input_ids in paired_inputs.values()):
        errors.append("paired arms must use the same input artifact for each family/repetition/shard cell")
    for group, attempt_ids in paired_attempts.items():
        if not attempt_ids:
            continue
        reference = attempts[attempt_ids[0]]
        reference_lineage = _object(reference.get("lineage"), "attempt.lineage", [])
        reference_arm = plan["active_arms"].get(reference.get("arm_id"), {})
        for attempt_id in attempt_ids[1:]:
            attempt = attempts[attempt_id]
            lineage = _object(attempt.get("lineage"), "attempt.lineage", [])
            arm = plan["active_arms"].get(attempt.get("arm_id"), {})
            allowed = set(reference_arm.get("runtime_overrides", [])) | set(arm.get("runtime_overrides", []))
            drift = sorted(
                field for field in RUNTIME_DIMENSIONS
                if field not in allowed and lineage.get(field) != reference_lineage.get(field)
            )
            if drift:
                errors.append(
                    f"paired arms have undeclared runtime drift for {group}: {', '.join(drift)}"
                )
    return attempts, cells


def _scores(
    value: Any,
    label: str,
    metrics: dict[str, dict[str, Any]],
    errors: list[str],
    *,
    required: bool,
) -> dict[str, float]:
    scores = _object(value, label, errors)
    if required and set(scores) != set(metrics):
        errors.append(f"{label} must contain exactly the declared metrics")
    if not required and scores:
        errors.append(f"{label} must be empty for a non-semantic result")
    valid: dict[str, float] = {}
    for name, score in scores.items():
        if name not in metrics:
            errors.append(f"{label} contains undeclared metric: {name}")
            continue
        if not _finite(score):
            errors.append(f"{label}.{name} must be finite numeric")
            continue
        minimum = float(metrics[name]["minimum"])
        maximum = float(metrics[name]["maximum"])
        if not minimum <= float(score) <= maximum:
            errors.append(f"{label}.{name} is outside its declared range")
        valid[name] = float(score)
    return valid


def _validate_case_results(
    value: Any,
    plan: dict[str, Any],
    attempts: dict[str, dict[str, Any]],
    artifacts: dict[str, dict[str, Any]],
    errors: list[str],
    *,
    final: bool,
) -> dict[tuple[str, str], dict[str, Any]]:
    results: dict[tuple[str, str], dict[str, Any]] = {}
    rows = _list(value, "case_results", errors)
    mapped = {
        "timed-out": "timed-out",
        "invalid-output": "invalid",
        "tool-error": "tool-error",
        "skipped": "skipped",
        "excluded": "excluded",
    }
    for index, raw in enumerate(rows):
        item = _object(raw, f"case_results[{index}]", errors)
        attempt_id = _text(item.get("attempt_id"), f"case_results[{index}].attempt_id", errors)
        case_id = _text(item.get("case_id"), f"case_results[{index}].case_id", errors)
        attempt = attempts.get(attempt_id)
        if attempt is None:
            errors.append(f"case_results[{index}] references unknown attempt")
        elif case_id not in plan["shards"].get(attempt.get("shard_id"), []):
            errors.append(f"case_results[{index}] case is outside its attempt shard")
        key = (attempt_id, case_id)
        if key in results:
            errors.append(f"duplicate case result: {attempt_id}/{case_id}")
        status = item.get("status")
        if status not in CASE_STATUSES:
            errors.append(f"case_results[{index}].status is invalid")
        if attempt:
            attempt_status = attempt.get("status")
            if attempt_status == "success" and status not in {"pass", "fail", "omitted", "invalid"}:
                errors.append(f"case_results[{index}].status contradicts its successful attempt")
            if attempt_status in mapped and status != mapped[attempt_status]:
                errors.append(f"case_results[{index}].status contradicts its attempt status")
        _scores(item.get("scores"), f"case_results[{index}].scores", plan["metrics"], errors, required=status in SEMANTIC_CASE_STATUSES)
        evidence_id = item.get("evidence_artifact_id", "")
        unavailable = item.get("evidence_unavailable_reason", "")
        if bool(evidence_id) == bool(unavailable):
            errors.append(f"case_results[{index}] requires evidence_artifact_id xor evidence_unavailable_reason")
        elif evidence_id:
            _artifact_ref(evidence_id, f"case_results[{index}].evidence_artifact_id", artifacts, errors)
        else:
            _text(unavailable, f"case_results[{index}].evidence_unavailable_reason", errors)
        reason = item.get("reason", "")
        if not isinstance(reason, str):
            errors.append(f"case_results[{index}].reason must be a string")
        elif status not in SEMANTIC_CASE_STATUSES and not reason.strip():
            errors.append(f"case_results[{index}] non-semantic status requires a reason")
        if status == "excluded" and case_id not in plan["predeclared_exclusions"]:
            errors.append(f"case_results[{index}] exclusion was not predeclared")
        if attempt_id and case_id:
            results[key] = item

    expected = {
        (attempt_id, case_id)
        for attempt_id, attempt in attempts.items()
        for case_id in plan["shards"].get(attempt.get("shard_id"), [])
    }
    if final:
        missing = expected - set(results)
        extra = set(results) - expected
        if missing:
            errors.append(f"final receipt is missing {len(missing)} planned case results")
        if extra:
            errors.append(f"final receipt has {len(extra)} unplanned case results")
    return results


def _validate_graders(
    value: Any,
    plan: dict[str, Any],
    artifacts: dict[str, dict[str, Any]],
    errors: list[str],
    *,
    required: bool,
    latest_attempt: datetime | None,
    updated_at: datetime | None,
) -> dict[str, dict[str, Any]]:
    graders: dict[str, dict[str, Any]] = {}
    for index, raw in enumerate(_list(value, "graders", errors)):
        item = _object(raw, f"graders[{index}]", errors)
        grader_id = _text(item.get("id"), f"graders[{index}].id", errors)
        if grader_id in graders:
            errors.append(f"duplicate grader id: {grader_id}")
        if item.get("type") not in {"deterministic", "ground-truth", "model", "human"}:
            errors.append(f"graders[{index}].type is invalid")
        _artifact_ref(item.get("rubric_artifact_id"), f"graders[{index}].rubric_artifact_id", artifacts, errors)
        if item.get("independent_of_generators") is not True:
            errors.append(f"graders[{index}] must be independent of generators")
        if item.get("blinded") is not True:
            errors.append(f"graders[{index}] must be blinded")
        if item.get("conflict") != "none":
            errors.append(f"graders[{index}].conflict must be none for an independent grader")
        started = _time(item.get("started_at"), f"graders[{index}].started_at", errors)
        completed = _time(item.get("completed_at"), f"graders[{index}].completed_at", errors)
        if started and completed and completed < started:
            errors.append(f"graders[{index}] completes before it starts")
        if latest_attempt and started and started < latest_attempt:
            errors.append(f"grader starts before generation attempts completed: {grader_id}")
        if updated_at and completed and completed > updated_at:
            errors.append(f"graders[{index}].completed_at follows updated_at")
        lineage = _validate_lineage(item.get("lineage"), f"graders[{index}].lineage", errors, success=True)
        route_id = lineage.get("route_receipt_artifact_id", "")
        if item.get("type") == "model":
            _artifact_ref(route_id, f"graders[{index}].lineage.route_receipt_artifact_id", artifacts, errors)
        elif route_id:
            _artifact_ref(route_id, f"graders[{index}].lineage.route_receipt_artifact_id", artifacts, errors)
        _artifact_ref(item.get("input_artifact_id"), f"graders[{index}].input_artifact_id", artifacts, errors)
        _artifact_ref(item.get("output_artifact_id"), f"graders[{index}].output_artifact_id", artifacts, errors)
        _validate_usage(item.get("usage"), f"graders[{index}].usage", errors)
        if grader_id:
            graders[grader_id] = item
    if required and not set(plan["required_graders"]) <= set(graders):
        errors.append("final receipt is missing required graders")
    if required:
        required_sessions = [
            _object(graders.get(grader_id, {}).get("lineage"), "grader.lineage", []).get("session_id")
            for grader_id in plan["required_graders"]
            if grader_id in graders
        ]
        if len(required_sessions) != len(set(required_sessions)):
            errors.append("required graders must use distinct sessions")
    return graders


def _validate_judgements(
    value: Any,
    adjudication_value: Any,
    plan: dict[str, Any],
    attempts: dict[str, dict[str, Any]],
    case_results: dict[tuple[str, str], dict[str, Any]],
    graders: dict[str, dict[str, Any]],
    artifacts: dict[str, dict[str, Any]],
    errors: list[str],
    *,
    final: bool,
) -> bool:
    rows = _list(value, "judgements", errors)
    judgements: dict[tuple[str, str, str], dict[str, Any]] = {}
    ids: set[str] = set()
    for index, raw in enumerate(rows):
        item = _object(raw, f"judgements[{index}]", errors)
        judgement_id = _text(item.get("id"), f"judgements[{index}].id", errors)
        if judgement_id in ids:
            errors.append(f"duplicate judgement id: {judgement_id}")
        ids.add(judgement_id)
        grader_id = item.get("grader_id")
        attempt_id = item.get("attempt_id")
        case_id = item.get("case_id")
        if grader_id not in graders:
            errors.append(f"judgements[{index}] references unknown grader")
        if (attempt_id, case_id) not in case_results:
            errors.append(f"judgements[{index}] references unknown case result")
        if item.get("outcome") not in {"pass", "fail"}:
            errors.append(f"judgements[{index}].outcome must be pass or fail")
        _scores(item.get("scores"), f"judgements[{index}].scores", plan["metrics"], errors, required=True)
        _artifact_ref(item.get("evidence_artifact_id"), f"judgements[{index}].evidence_artifact_id", artifacts, errors)
        key = (str(grader_id), str(attempt_id), str(case_id))
        if key in judgements:
            errors.append(f"duplicate judgement: {key}")
        judgements[key] = item
        grader = graders.get(grader_id, {})
        attempt = attempts.get(attempt_id, {})
        if (
            grader.get("type") == "model"
            and plan["grader_policy"].get("self_judging") == "forbidden"
            and _object(grader.get("lineage"), "grader.lineage", []).get("provider_family")
            == _object(attempt.get("lineage"), "attempt.lineage", []).get("provider_family")
        ):
            errors.append(f"judgements[{index}] uses the generating family as its own model judge")

    semantic_keys = {key for key, result in case_results.items() if result.get("status") in SEMANTIC_CASE_STATUSES}
    expected = {
        (grader_id, attempt_id, case_id)
        for grader_id in plan["required_graders"]
        for attempt_id, case_id in semantic_keys
    }
    if final:
        missing = expected - set(judgements)
        if missing:
            errors.append(f"final receipt is missing {len(missing)} required judgements")

    adjudications: dict[tuple[str, str], dict[str, Any]] = {}
    for index, raw in enumerate(_list(adjudication_value, "adjudications", errors)):
        item = _object(raw, f"adjudications[{index}]", errors)
        attempt_id = item.get("attempt_id")
        case_id = item.get("case_id")
        key = (str(attempt_id), str(case_id))
        if key in adjudications:
            errors.append(f"duplicate adjudication: {key}")
        if key not in semantic_keys:
            errors.append(f"adjudications[{index}] references a non-semantic case result")
        adjudicator_id = item.get("adjudicator_id")
        if adjudicator_id not in graders:
            errors.append(f"adjudications[{index}] references unknown adjudicator")
        if adjudicator_id in plan["required_graders"]:
            errors.append(f"adjudications[{index}] adjudicator must be fresh")
        adjudicator = graders.get(adjudicator_id, {})
        adjudicator_lineage = _object(adjudicator.get("lineage"), "adjudicator.lineage", [])
        attempt = attempts.get(attempt_id, {})
        attempt_lineage = _object(attempt.get("lineage"), "attempt.lineage", [])
        required_graders = [graders.get(grader_id, {}) for grader_id in plan["required_graders"]]
        required_lineages = [
            _object(grader.get("lineage"), "grader.lineage", []) for grader in required_graders
        ]
        if (
            adjudicator.get("type") == "model"
            and adjudicator_lineage.get("provider_family") == attempt_lineage.get("provider_family")
        ):
            errors.append(f"adjudications[{index}] adjudicator uses the generating family")
        prohibited_sessions = {attempt_lineage.get("session_id")} | {
            lineage.get("session_id") for lineage in required_lineages
        }
        if adjudicator_lineage.get("session_id") in prohibited_sessions:
            errors.append(f"adjudications[{index}] adjudicator session must be fresh")
        if adjudicator.get("type") == "model":
            prohibited_routes = {attempt.get("route_receipt_artifact_id")} | {
                lineage.get("route_receipt_artifact_id") for lineage in required_lineages
            }
            if adjudicator_lineage.get("route_receipt_artifact_id") in prohibited_routes:
                errors.append(f"adjudications[{index}] adjudicator route must be fresh")
        required_completed = [
            parsed for grader in required_graders
            if (parsed := _time(grader.get("completed_at"), "grader.completed_at", [])) is not None
        ]
        adjudicator_started = _time(adjudicator.get("started_at"), "adjudicator.started_at", [])
        if required_completed and adjudicator_started and adjudicator_started <= max(required_completed):
            errors.append(f"adjudications[{index}] adjudicator must start after required judgements complete")
        if item.get("status") not in {"resolved", "unresolved"}:
            errors.append(f"adjudications[{index}].status is invalid")
        _artifact_ref(item.get("evidence_artifact_id"), f"adjudications[{index}].evidence_artifact_id", artifacts, errors)
        if item.get("status") == "resolved":
            if item.get("final_outcome") not in {"pass", "fail"}:
                errors.append(f"adjudications[{index}].final_outcome is invalid")
            _scores(item.get("final_scores"), f"adjudications[{index}].final_scores", plan["metrics"], errors, required=True)
        adjudications[key] = item

    unresolved = False
    for attempt_id, case_id in semantic_keys:
        required = [judgements.get((grader_id, attempt_id, case_id)) for grader_id in plan["required_graders"]]
        required = [item for item in required if item]
        signatures = {
            (item.get("outcome"), tuple(sorted(_object(item.get("scores"), "scores", []).items())))
            for item in required
        }
        disagreement = len(signatures) > 1
        adjudication = adjudications.get((attempt_id, case_id))
        result = case_results[(attempt_id, case_id)]
        if disagreement:
            if adjudication is None and final:
                errors.append(f"disagreement lacks adjudication: {attempt_id}/{case_id}")
                unresolved = True
            elif adjudication and adjudication.get("status") == "unresolved":
                unresolved = True
            elif adjudication:
                if result.get("status") != adjudication.get("final_outcome") or result.get("scores") != adjudication.get("final_scores"):
                    errors.append(f"case result does not match resolved adjudication: {attempt_id}/{case_id}")
        elif adjudication is not None:
            errors.append(f"adjudication exists without a grader disagreement: {attempt_id}/{case_id}")
        elif required:
            first = required[0]
            if result.get("status") != first.get("outcome") or result.get("scores") != first.get("scores"):
                errors.append(f"case result does not match its required judgement: {attempt_id}/{case_id}")
    return unresolved


def _direction_pass(direction: str, value: float, threshold: float) -> bool:
    if direction == "gte":
        return value >= threshold
    if direction == "lte":
        return value <= threshold
    return math.isclose(value, threshold, rel_tol=1e-12, abs_tol=1e-12)


def _comparison_pass(direction: str, target: float, baseline: float, margin: float) -> bool:
    if direction == "gte":
        return target >= baseline - margin
    if direction == "lte":
        return target <= baseline + margin
    return abs(target - baseline) <= margin


def _arm_metric(
    metric_name: str,
    arm_id: str,
    metric: dict[str, Any],
    case_results: dict[tuple[str, str], dict[str, Any]],
    attempts: dict[str, dict[str, Any]],
) -> tuple[float, int, float]:
    rows = [result for (attempt_id, _), result in case_results.items() if attempts.get(attempt_id, {}).get("arm_id") == arm_id]
    denominator = len(rows)
    minimum = float(metric["minimum"])
    numerator = sum(
        float(_object(result.get("scores"), "scores", []).get(metric_name, minimum))
        if result.get("status") in SEMANTIC_CASE_STATUSES
        else minimum
        for result in rows
    )
    value = numerator / denominator if denominator else float("nan")
    return numerator, denominator, value


def _validate_results(
    value: Any,
    plan: dict[str, Any],
    attempts: dict[str, dict[str, Any]],
    case_results: dict[tuple[str, str], dict[str, Any]],
    artifacts: dict[str, dict[str, Any]],
    errors: list[str],
) -> tuple[bool, dict[str, int], set[str]]:
    results = _object(value, "results", errors)
    allowed = {"accounting", "attempt_accounting", "metrics", "failure_artifact_ids"}
    unknown = set(results) - allowed
    if unknown:
        errors.append(f"results contains unsupported fields: {', '.join(sorted(unknown))}")
    accounting = _object(results.get("accounting"), "results.accounting", errors)
    names = {
        "planned": None,
        "passed": "pass",
        "failed": "fail",
        "omitted": "omitted",
        "skipped": "skipped",
        "excluded": "excluded",
        "timed_out": "timed-out",
        "invalid": "invalid",
        "tool_errors": "tool-error",
    }
    observed_counts = {name: (len(case_results) if status is None else sum(item.get("status") == status for item in case_results.values())) for name, status in names.items()}
    unknown_accounting = set(accounting) - set(names)
    if unknown_accounting:
        errors.append(f"results.accounting contains unsupported fields: {', '.join(sorted(unknown_accounting))}")
    for name, observed in observed_counts.items():
        declared = accounting.get(name)
        _integer(declared, f"results.accounting.{name}", errors, minimum=0)
        if isinstance(declared, int) and not isinstance(declared, bool) and declared != observed:
            errors.append(f"results.accounting.{name} does not match retained case rows")
    terminal_sum = sum(observed_counts[name] for name in names if name != "planned")
    if terminal_sum != observed_counts["planned"]:
        errors.append("results accounting does not conserve planned case rows")

    attempt_accounting = _object(results.get("attempt_accounting"), "results.attempt_accounting", errors)
    attempt_names = {
        "planned": None,
        "base_planned": "base",
        "retries": "retry",
        "succeeded": "success",
        "timed_out": "timed-out",
        "invalid_output": "invalid-output",
        "tool_errors": "tool-error",
        "skipped": "skipped",
        "excluded": "excluded",
    }
    observed_attempts = {
        "planned": len(attempts),
        "base_planned": sum(not item.get("retry_of") for item in attempts.values()),
        "retries": sum(bool(item.get("retry_of")) for item in attempts.values()),
        **{
            name: sum(item.get("status") == status for item in attempts.values())
            for name, status in attempt_names.items()
            if name not in {"planned", "base_planned", "retries"}
        },
    }
    unknown_attempt_accounting = set(attempt_accounting) - set(attempt_names)
    if unknown_attempt_accounting:
        errors.append(
            "results.attempt_accounting contains unsupported fields: "
            + ", ".join(sorted(unknown_attempt_accounting))
        )
    for name, observed in observed_attempts.items():
        declared = attempt_accounting.get(name)
        _integer(declared, f"results.attempt_accounting.{name}", errors, minimum=0)
        if isinstance(declared, int) and not isinstance(declared, bool) and declared != observed:
            errors.append(f"results.attempt_accounting.{name} does not match retained attempts")
    if observed_attempts["base_planned"] + observed_attempts["retries"] != observed_attempts["planned"]:
        errors.append("attempt accounting does not conserve base attempts and retries")
    terminal_attempts = sum(
        observed_attempts[name]
        for name in ("succeeded", "timed_out", "invalid_output", "tool_errors", "skipped", "excluded")
    )
    if terminal_attempts != observed_attempts["planned"]:
        errors.append("attempt accounting does not conserve terminal attempt states")

    declared_metrics: dict[str, dict[str, Any]] = {}
    metric_evidence: set[str] = set()
    for index, raw in enumerate(_list(results.get("metrics"), "results.metrics", errors)):
        item = _object(raw, f"results.metrics[{index}]", errors)
        name = _text(item.get("name"), f"results.metrics[{index}].name", errors)
        metric = plan["metrics"].get(name)
        if metric is None:
            errors.append(f"results.metrics[{index}] is undeclared: {name}")
            continue
        if name in declared_metrics:
            errors.append(f"duplicate result metric: {name}")
        declared_metrics[name] = item
        if item.get("target_arm_id") != metric.get("target_arm_id"):
            errors.append(f"results.metrics[{index}].target_arm_id differs from the frozen plan")
        numerator, denominator, value_observed = _arm_metric(name, metric["target_arm_id"], metric, case_results, attempts)
        for field, expected in (("numerator", numerator), ("denominator", denominator), ("value", value_observed)):
            actual = item.get(field)
            if not _finite(actual) or not math.isclose(float(actual), float(expected), rel_tol=1e-9, abs_tol=1e-9):
                errors.append(f"results.metrics[{index}].{field} does not match retained rows")
        comparisons: dict[str, dict[str, Any]] = {}
        for comp_index, raw_comp in enumerate(_list(item.get("comparisons"), f"results.metrics[{index}].comparisons", errors)):
            comparison = _object(raw_comp, f"results.metrics[{index}].comparisons[{comp_index}]", errors)
            arm_id = comparison.get("arm_id")
            if arm_id in comparisons:
                errors.append(f"duplicate comparison arm for metric {name}: {arm_id}")
            comparisons[str(arm_id)] = comparison
            if arm_id not in metric.get("baseline_arm_ids", []):
                errors.append(f"results.metrics[{index}] has undeclared comparison arm: {arm_id}")
                continue
            arm = plan["arms"].get(arm_id, {})
            if arm.get("applicability") != "required":
                errors.append(f"results.metrics[{index}] compares a not-applicable arm: {arm_id}")
                continue
            baseline_numerator, baseline_denominator, baseline_value = _arm_metric(name, arm_id, metric, case_results, attempts)
            delta = value_observed - baseline_value
            passed = _comparison_pass(metric["direction"], value_observed, baseline_value, float(metric["regression_margin"]))
            expected_fields = {
                "numerator": baseline_numerator,
                "denominator": baseline_denominator,
                "value": baseline_value,
                "delta": delta,
            }
            for field, expected in expected_fields.items():
                actual = comparison.get(field)
                if not _finite(actual) or not math.isclose(float(actual), float(expected), rel_tol=1e-9, abs_tol=1e-9):
                    errors.append(f"results.metrics[{index}].comparisons[{comp_index}].{field} does not match retained rows")
            if comparison.get("passed") is not passed:
                errors.append(f"results.metrics[{index}].comparisons[{comp_index}].passed is incorrect")
        required_baselines = {
            arm_id for arm_id in metric.get("baseline_arm_ids", [])
            if plan["arms"].get(arm_id, {}).get("applicability") == "required"
        }
        if set(comparisons) != required_baselines:
            errors.append(f"results.metrics[{index}] must account for every applicable comparison arm")
        threshold_passed = _direction_pass(metric["direction"], value_observed, float(metric["threshold"])) if math.isfinite(value_observed) else False
        overall_passed = threshold_passed and all(comp.get("passed") is True for comp in comparisons.values())
        if item.get("passed") is not overall_passed:
            errors.append(f"results.metrics[{index}].passed is incorrect")
        evidence_id = _artifact_ref(item.get("evidence_artifact_id"), f"results.metrics[{index}].evidence_artifact_id", artifacts, errors)
        if evidence_id:
            metric_evidence.add(evidence_id)
    if set(declared_metrics) != set(plan["metrics"]):
        errors.append("results.metrics must contain exactly the declared metrics")
    failure_artifacts = _strict_string_list(results.get("failure_artifact_ids"), "results.failure_artifact_ids", errors)
    for index, artifact_id in enumerate(failure_artifacts):
        _artifact_ref(artifact_id, f"results.failure_artifact_ids[{index}]", artifacts, errors)
    if any(item.get("status") == "fail" for item in case_results.values()) and not failure_artifacts:
        errors.append("semantic failures require a bounded failure artifact")
    metrics_pass = bool(declared_metrics) and all(item.get("passed") is True for item in declared_metrics.values())
    return metrics_pass, observed_counts, metric_evidence


def inspect_legacy_v1(receipt: Any) -> list[str]:
    """Inspect legacy shape only. A clean result is never a schema-v2 gate."""
    errors: list[str] = []
    if not isinstance(receipt, dict):
        return ["legacy receipt root must be an object"]
    if receipt.get("schema_version") != 1:
        errors.append("legacy inspection requires schema_version 1")
    for field in ("evaluation_id", "decision"):
        _text(receipt.get(field), f"legacy.{field}", errors)
    _time(receipt.get("updated_at"), "legacy.updated_at", errors)
    dataset = _object(receipt.get("dataset"), "legacy.dataset", errors)
    for field in ("id", "version", "provenance", "holdout_boundary", "data_policy"):
        _text(dataset.get(field), f"legacy.dataset.{field}", errors)
    runtime = _object(receipt.get("runtime"), "legacy.runtime", errors)
    models = _strict_string_list(runtime.get("models"), "legacy.runtime.models", errors, nonempty=True)
    if len(models) != len(set(models)):
        errors.append("legacy.runtime.models must be unique")
    configuration = _object(runtime.get("configuration"), "legacy.runtime.configuration", errors)
    if not configuration:
        errors.append("legacy.runtime.configuration must not be empty")
    _text(runtime.get("sample_policy"), "legacy.runtime.sample_policy", errors)
    seed_policy = runtime.get("seed_policy")
    if seed_policy not in {"fixed", "not-applicable"}:
        errors.append("legacy.runtime.seed_policy must be fixed or not-applicable")
    seeds = _list(runtime.get("seeds"), "legacy.runtime.seeds", errors)
    if seed_policy == "fixed" and (
        not seeds or any(isinstance(seed, bool) or not isinstance(seed, (int, str)) or seed == "" for seed in seeds)
    ):
        errors.append("legacy fixed seed policy requires scalar seeds")
    definitions: dict[str, tuple[str, float]] = {}
    for index, raw in enumerate(_list(receipt.get("metrics"), "legacy.metrics", errors)):
        metric = _object(raw, f"legacy.metrics[{index}]", errors)
        name = metric.get("name")
        direction = metric.get("direction")
        threshold = metric.get("threshold")
        if not isinstance(name, str) or not name or direction not in {"gte", "lte", "eq"} or not _finite(threshold):
            errors.append(f"legacy.metrics[{index}] requires name, direction and finite threshold")
        elif name in definitions:
            errors.append(f"duplicate legacy metric: {name}")
        else:
            definitions[name] = (direction, float(threshold))
    if not definitions:
        errors.append("legacy.metrics must not be empty")
    safety_applicability = receipt.get("safety_applicability")
    safety_cases = _list(receipt.get("safety_cases"), "legacy.safety_cases", errors)
    if safety_applicability not in {"required", "not-applicable"}:
        errors.append("legacy.safety_applicability is invalid")
    if safety_applicability == "required" and not safety_cases:
        errors.append("legacy required safety evaluation needs cases")
    safety_failed = False
    safety_ids: set[str] = set()
    for index, raw in enumerate(safety_cases):
        case = _object(raw, f"legacy.safety_cases[{index}]", errors)
        case_id = case.get("id")
        if not isinstance(case_id, str) or not case_id or case_id in safety_ids:
            errors.append(f"legacy.safety_cases[{index}] requires a unique id")
        else:
            safety_ids.add(case_id)
        evidence = _strict_string_list(case.get("evidence"), f"legacy.safety_cases[{index}].evidence", errors, nonempty=True)
        if case.get("status") not in {"pass", "fail"}:
            errors.append(f"legacy.safety_cases[{index}].status is invalid")
        if case.get("status") != "pass" or not evidence:
            safety_failed = True
    baseline = _object(receipt.get("baseline"), "legacy.baseline", errors)
    _text(baseline.get("id"), "legacy.baseline.id", errors)
    budget = baseline.get("regression_budget")
    if not _finite(budget) or float(budget) < 0:
        errors.append("legacy.baseline.regression_budget must be finite and non-negative")
    baseline_values: dict[str, float] = {}
    for index, raw in enumerate(_list(baseline.get("metrics"), "legacy.baseline.metrics", errors)):
        metric = _object(raw, f"legacy.baseline.metrics[{index}]", errors)
        if not isinstance(metric.get("name"), str) or not _finite(metric.get("value")):
            errors.append(f"legacy.baseline.metrics[{index}] requires name and finite value")
        elif metric["name"] in baseline_values:
            errors.append(f"duplicate legacy baseline metric: {metric['name']}")
        else:
            baseline_values[metric["name"]] = float(metric["value"])
    evaluator = _object(receipt.get("evaluator"), "legacy.evaluator", errors)
    _text(evaluator.get("rubric_version"), "legacy.evaluator.rubric_version", errors)
    if evaluator.get("independent") is not True:
        errors.append("legacy.evaluator.independent must be true")
    _text(evaluator.get("disagreement_protocol"), "legacy.evaluator.disagreement_protocol", errors)
    results = _object(receipt.get("results"), "legacy.results", errors)
    observed: dict[str, float] = {}
    for index, raw in enumerate(_list(results.get("metrics"), "legacy.results.metrics", errors)):
        metric = _object(raw, f"legacy.results.metrics[{index}]", errors)
        if not isinstance(metric.get("name"), str) or not _finite(metric.get("value")):
            errors.append(f"legacy.results.metrics[{index}] requires name and finite value")
        elif metric["name"] in observed:
            errors.append(f"duplicate legacy result metric: {metric['name']}")
        else:
            observed[metric["name"]] = float(metric["value"])
    failed: list[str] = []
    for name, (direction, threshold) in definitions.items():
        if name not in observed:
            errors.append(f"legacy results missing metric: {name}")
            continue
        value = observed[name]
        if not _direction_pass(direction, value, threshold):
            failed.append(name)
        if name not in baseline_values:
            errors.append(f"legacy baseline missing metric: {name}")
        elif _finite(budget) and not _comparison_pass(direction, value, baseline_values[name], float(budget)):
            failed.append(f"{name} baseline regression")
    if receipt.get("status") not in {"pass", "fail"}:
        errors.append("legacy status must be pass or fail")
    conclusion = _object(receipt.get("conclusion"), "legacy.conclusion", errors)
    if conclusion.get("status") != receipt.get("status"):
        errors.append("legacy conclusion status must match receipt status")
    _strict_string_list(conclusion.get("limitations"), "legacy.conclusion.limitations", errors)
    _strict_string_list(conclusion.get("evidence"), "legacy.conclusion.evidence", errors, nonempty=True)
    if receipt.get("status") == "pass" and failed:
        errors.append("legacy passing conclusion violates thresholds or baseline")
    if receipt.get("status") == "pass" and safety_failed:
        errors.append("legacy passing conclusion has failed safety cases")
    return errors


def _verify_frozen_plan(
    plan: dict[str, Any],
    artifacts: dict[str, dict[str, Any]],
    receipt_dir: Path,
    errors: list[str],
) -> None:
    artifact = artifacts.get(plan.get("artifact_id"))
    if not artifact or not isinstance(artifact.get("path"), str):
        return
    try:
        root = receipt_dir.resolve(strict=True)
        target = (root / artifact["path"]).resolve(strict=True)
    except (OSError, ValueError) as exc:
        errors.append(f"frozen plan artifact path cannot be resolved: {exc}")
        return
    if not _inside(root, target):
        errors.append("frozen plan artifact escapes receipt_dir")
        return
    if not target.is_file():
        errors.append("frozen plan artifact is not a regular file")
        return
    try:
        frozen = _load_json(target)
    except (OSError, json.JSONDecodeError, ValueError) as exc:
        errors.append(f"frozen plan artifact is not readable JSON: {exc}")
        return
    expected = {key: value for key, value in plan.items() if key not in {"artifact_id", "digest"}}
    if frozen != expected:
        errors.append("frozen plan artifact does not match the receipt plan")


def validate(
    receipt: Any,
    *,
    receipt_dir: Path | None = None,
    verify_hashes: bool = False,
    require_pass: bool = False,
    expected_evaluation_id: str | None = None,
    expected_plan_digest: str | None = None,
    expected_delivery_run_id: str | None = None,
) -> list[str]:
    errors: list[str] = []
    if not isinstance(receipt, dict):
        return ["receipt root must be an object"]
    if receipt.get("schema_version") == 1:
        return ["legacy schema_version 1 is non-gating; rerun from a frozen evaluation-run schema v2 plan"]
    if receipt.get("contract") != CONTRACT or receipt.get("schema_version") != SCHEMA_VERSION:
        return [f"receipt must use contract {CONTRACT} schema_version {SCHEMA_VERSION}"]
    unknown_top = set(receipt) - TOP_LEVEL_FIELDS
    if unknown_top:
        errors.append(f"unknown top-level fields: {', '.join(sorted(unknown_top))}")
    if require_pass and not verify_hashes:
        errors.append("require_pass requires verify_hashes")
    if verify_hashes and receipt_dir is None:
        errors.append("verify_hashes requires receipt_dir")
    _reject_human_gate_claims(receipt, "receipt", errors)

    for field in ("evaluation_id", "kind"):
        _text(receipt.get(field), field, errors)
    if require_pass and not expected_evaluation_id:
        errors.append("require_pass needs expected_evaluation_id from the enclosing delivery anchor")
    if expected_evaluation_id is not None and receipt.get("evaluation_id") != expected_evaluation_id:
        errors.append("evaluation_id does not match expected_evaluation_id")
    created_at = _time(receipt.get("created_at"), "created_at", errors)
    updated_at = _time(receipt.get("updated_at"), "updated_at", errors)
    if created_at and updated_at and updated_at < created_at:
        errors.append("updated_at precedes created_at")
    status = receipt.get("status")
    if status not in RUN_STATUSES:
        errors.append("status must be planned, running, pass, fail, incomplete or cancelled")
    if require_pass and status != "pass":
        errors.append("evaluation receipt is not a machine pass")

    decision = _object(receipt.get("decision"), "decision", errors)
    for field in ("question", "owner"):
        _text(decision.get(field), f"decision.{field}", errors)
    _strict_string_list(decision.get("unacceptable_failures"), "decision.unacceptable_failures", errors, nonempty=True)
    enclosing = decision.get("enclosing_delivery_run_id", "")
    if not isinstance(enclosing, str):
        errors.append("decision.enclosing_delivery_run_id must be a string")
    if require_pass and not expected_delivery_run_id:
        errors.append("require_pass needs expected_delivery_run_id from the enclosing delivery anchor")
    if require_pass and not enclosing:
        errors.append("machine gate requires a non-empty decision.enclosing_delivery_run_id")
    if expected_delivery_run_id is not None and enclosing != expected_delivery_run_id:
        errors.append("decision.enclosing_delivery_run_id does not match expected_delivery_run_id")

    artifacts = _validate_artifacts(receipt.get("artifacts"), errors, receipt_dir=receipt_dir, verify_hashes=verify_hashes)
    plan = _validate_plan(receipt.get("plan"), artifacts, errors)
    if require_pass and not expected_plan_digest:
        errors.append("require_pass needs expected_plan_digest frozen before execution")
    if expected_plan_digest is not None:
        expected_digest = _digest(expected_plan_digest, "expected_plan_digest", errors)
        if expected_digest and plan["raw"].get("digest") != expected_digest:
            errors.append("plan.digest does not match expected_plan_digest")
    if verify_hashes and receipt_dir is not None:
        _verify_frozen_plan(plan["raw"], artifacts, receipt_dir, errors)
    if created_at and plan["frozen_at"] and plan["frozen_at"] < created_at:
        errors.append("plan.frozen_at precedes created_at")
    if updated_at and plan["frozen_at"] and plan["frozen_at"] > updated_at:
        errors.append("plan.frozen_at follows updated_at")
    if receipt.get("kind") == "skill-quality":
        for role in ("candidate", "without", "previous"):
            if len(plan["roles"].get(role, [])) != 1:
                errors.append(f"skill-quality plan requires exactly one {role} arm")
        without = plan["roles"].get("without", [{}])[0]
        if without.get("applicability") != "required":
            errors.append("skill-quality without arm must be required")
        if any(arm.get("runtime_overrides") for arm in plan["active_arms"].values()):
            errors.append("skill-quality arms cannot declare runtime overrides")

    final = status in FINAL_STATUSES
    preflight, latest_preflight = _validate_preflight(
        receipt.get("preflight"), plan, artifacts, errors,
        final=final, require_success=status == "pass",
        frozen_at=plan["frozen_at"], updated_at=updated_at,
    )
    attempts, _ = _validate_attempts(
        receipt.get("attempts"), plan, artifacts, errors, final=final, latest_preflight=latest_preflight
    )
    if attempts and any(requirement_id not in preflight for requirement_id in plan["requirements"]):
        errors.append("attempts cannot start before every deterministic preflight disposition is recorded")
    if any(item.get("status") == "fail" for item in preflight.values()) and any(
        item.get("status") != "skipped" for item in attempts.values()
    ):
        errors.append("failed deterministic preflight requires the frozen generation schedule to be skipped")
    attempt_completions = [
        parsed for item in attempts.values()
        if (parsed := _time(item.get("completed_at"), "attempt.completed_at", [])) is not None
    ]
    latest_attempt = max(attempt_completions, default=None)
    if updated_at and latest_attempt and latest_attempt > updated_at:
        errors.append("attempt.completed_at follows updated_at")
    case_results = _validate_case_results(receipt.get("case_results"), plan, attempts, artifacts, errors, final=final)
    semantic_results_exist = any(item.get("status") in SEMANTIC_CASE_STATUSES for item in case_results.values())
    graders = _validate_graders(
        receipt.get("graders"), plan, artifacts, errors,
        required=final and semantic_results_exist,
        latest_attempt=latest_attempt, updated_at=updated_at,
    )
    unresolved = _validate_judgements(
        receipt.get("judgements"), receipt.get("adjudications"), plan, attempts,
        case_results, graders, artifacts, errors, final=final,
    )

    results_value = receipt.get("results")
    metrics_pass = False
    accounting: dict[str, int] = {}
    metric_evidence: set[str] = set()
    if final:
        metrics_pass, accounting, metric_evidence = _validate_results(
            results_value, plan, attempts, case_results, artifacts, errors
        )
    elif results_value is not None:
        errors.append("planned or running receipt must not contain final results")

    conclusion = _object(receipt.get("conclusion"), "conclusion", errors)
    if conclusion.get("machine_only") is not True:
        errors.append("conclusion.machine_only must be true; human acceptance is owned outside evaluation")
    passed_gates = _strict_string_list(conclusion.get("passed_gates"), "conclusion.passed_gates", errors)
    failed_gates = _strict_string_list(conclusion.get("failed_gates"), "conclusion.failed_gates", errors)
    limitations = _strict_string_list(conclusion.get("limitations"), "conclusion.limitations", errors)
    evidence_ids = _strict_string_list(conclusion.get("evidence_artifact_ids"), "conclusion.evidence_artifact_ids", errors)
    allowed_gates = set(plan["metrics"]) | set(plan["requirements"]) | {
        "safety", "critical-case", "runtime", "accounting", "coverage",
        "grader-disagreement", "cancelled",
    }
    unsupported_gates = (set(passed_gates) | set(failed_gates)) - allowed_gates
    if unsupported_gates:
        errors.append(f"conclusion contains unsupported gate values: {', '.join(sorted(unsupported_gates))}")
    for index, artifact_id in enumerate(evidence_ids):
        _artifact_ref(artifact_id, f"conclusion.evidence_artifact_ids[{index}]", artifacts, errors)
    expected_conclusion = "pending" if status in {"planned", "running"} else status
    if conclusion.get("status") != expected_conclusion:
        errors.append("conclusion.status must match receipt lifecycle status")
    if status in {"planned", "running"}:
        if attempts and status == "planned":
            errors.append("planned receipt cannot contain attempts")
        if status == "planned" and any((receipt.get(name) or []) for name in ("preflight", "case_results", "graders", "judgements", "adjudications")):
            errors.append("planned receipt cannot contain execution or judgement rows")
        if passed_gates or failed_gates or evidence_ids:
            errors.append("pending conclusion cannot claim final gates or evidence")
    elif status == "pass":
        blocking_infra = sum(accounting.get(name, 0) for name in ("omitted", "skipped", "excluded", "timed_out", "invalid", "tool_errors"))
        critical_failures = [
            (attempt_id, case_id)
            for (attempt_id, case_id), result in case_results.items()
            if attempts.get(attempt_id, {}).get("arm_id") == next(
                (arm_id for arm_id, arm in plan["arms"].items() if arm.get("role") == "candidate"), ""
            )
            and plan["cases"].get(case_id, {}).get("critical") is True
            and result.get("status") != "pass"
        ]
        if not metrics_pass:
            errors.append("passing conclusion violates a metric threshold or comparison")
        if blocking_infra:
            errors.append("passing conclusion has omitted, skipped, excluded, timed-out, invalid or tool-error rows")
        if critical_failures:
            errors.append("passing conclusion has critical candidate case failures")
        if unresolved:
            errors.append("passing conclusion has unresolved grader disagreement")
        if not passed_gates or failed_gates or not evidence_ids:
            errors.append("passing conclusion requires passed_gates, no failed_gates and typed evidence")
        if not set(plan["metrics"]) <= set(passed_gates):
            errors.append("passing conclusion.passed_gates must include every declared metric")
        if not metric_evidence <= set(evidence_ids):
            errors.append("passing conclusion evidence must include every metric evidence artifact")
        if not limitations:
            errors.append("passing conclusion must state distribution limitations")
    else:
        if not failed_gates and not limitations:
            errors.append("non-passing final conclusion requires failed_gates or limitations")
    return errors


def _load_json(path: Path) -> dict[str, Any]:
    def no_duplicates(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
        result: dict[str, Any] = {}
        for key, value in pairs:
            if key in result:
                raise ValueError(f"duplicate JSON key: {key}")
            result[key] = value
        return result

    value = json.loads(path.read_text(), object_pairs_hook=no_duplicates)
    if not isinstance(value, dict):
        raise ValueError("receipt root must be an object")
    return value


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("receipt", type=Path)
    parser.add_argument("--receipt-dir", type=Path, help="artifact root; defaults to the receipt directory")
    parser.add_argument("--verify-hashes", action="store_true")
    parser.add_argument("--require-pass", action="store_true", help="reject planned, running or non-passing results")
    parser.add_argument("--expected-evaluation-id", help="evaluation ID anchored by the enclosing delivery receipt")
    parser.add_argument("--expected-plan-digest", help="pre-execution plan digest anchored by delivery")
    parser.add_argument("--expected-delivery-run-id", help="enclosing canonical delivery run ID")
    parser.add_argument("--legacy-v1", action="store_true", help="inspect schema v1 without treating it as a gate")
    args = parser.parse_args(argv)
    try:
        data = _load_json(args.receipt)
    except (OSError, json.JSONDecodeError, ValueError) as exc:
        print(f"invalid evaluation receipt: {exc}", file=sys.stderr)
        return 2
    if data.get("schema_version") == 1 and args.legacy_v1:
        legacy_errors = inspect_legacy_v1(data)
        if legacy_errors:
            for error in legacy_errors:
                print(f"FAIL: {error}", file=sys.stderr)
            return 1
        print("LEGACY: schema v1 is structurally inspectable but non-gating; rerun from a frozen schema-v2 plan", file=sys.stderr)
        return 3
    errors = validate(
        data,
        receipt_dir=args.receipt_dir or args.receipt.parent,
        verify_hashes=args.verify_hashes,
        require_pass=args.require_pass,
        expected_evaluation_id=args.expected_evaluation_id,
        expected_plan_digest=args.expected_plan_digest,
        expected_delivery_run_id=args.expected_delivery_run_id,
    )
    if errors:
        for error in errors:
            print(f"FAIL: {error}", file=sys.stderr)
        return 1
    if data.get("status") == "pass" and args.require_pass and args.verify_hashes:
        print("PASS: machine evaluation gate; human acceptance remains external")
    elif data.get("status") == "pass":
        print("PASS: evaluation result is structurally valid; use --verify-hashes --require-pass for a machine gate")
    else:
        print(f"PASS: evaluation receipt is structurally valid at status {data.get('status')}; not a machine gate")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
