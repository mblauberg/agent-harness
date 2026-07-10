#!/usr/bin/env python3
"""Validate a portable RELEASE.json readiness or terminal receipt."""

from __future__ import annotations

import argparse
from datetime import datetime
import importlib.util
import json
import math
from pathlib import Path
import re
import shlex
import sys
from typing import Any


ROOT = Path(__file__).resolve().parents[3]
WINDOW_DURATION = re.compile(r"^(\d+)([smhd])$")


def load_delivery_validator():
    path = ROOT / "skills" / "deliver" / "scripts" / "validate_delivery.py"
    spec = importlib.util.spec_from_file_location("release_delivery_validator", path)
    if not spec or not spec.loader:
        raise RuntimeError("cannot load delivery validator")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


DELIVERY_VALIDATOR = load_delivery_validator()


def mapping(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def items(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def timestamp(value: Any) -> bool:
    if not isinstance(value, str) or not value.endswith("Z"):
        return False
    try:
        datetime.fromisoformat(value[:-1] + "+00:00")
        return True
    except ValueError:
        return False


def parse_timestamp(value: Any) -> datetime | None:
    if not timestamp(value):
        return None
    return datetime.fromisoformat(str(value)[:-1] + "+00:00")


def passing_checks(values: Any, field: str) -> list[str]:
    errors: list[str] = []
    checks = items(values)
    if not checks:
        return [f"{field} must not be empty"]
    for index, raw in enumerate(checks):
        check = mapping(raw)
        exit_code = check.get("exit_code")
        if not check.get("command") or not isinstance(exit_code, int) or isinstance(exit_code, bool) or exit_code != 0:
            errors.append(f"{field}[{index}] must record command and exit_code 0")
    return errors


def recorded_checks(values: Any, field: str) -> list[str]:
    errors: list[str] = []
    checks = items(values)
    if not checks:
        return [f"{field} must not be empty"]
    for index, raw in enumerate(checks):
        check = mapping(raw)
        if not check.get("command") or not isinstance(check.get("exit_code"), int) or isinstance(check.get("exit_code"), bool):
            errors.append(f"{field}[{index}] must record command and integer exit_code")
    return errors


def command_tokens(value: Any) -> list[str] | None:
    if isinstance(value, list) and value and all(isinstance(item, str) and item for item in value):
        return value
    if not isinstance(value, str) or not value or re.search(r"[;&|><$`()\n\r]", value):
        return None
    try:
        tokens = shlex.split(value)
    except ValueError:
        return None
    return tokens or None


def authorised_commands(values: Any, field: str, prefixes: list[Any]) -> list[str]:
    errors: list[str] = []
    allowed = [command_tokens(prefix) for prefix in prefixes]
    for index, raw in enumerate(items(values)):
        tokens = command_tokens(mapping(raw).get("command"))
        if tokens is None:
            errors.append(f"{field}[{index}] must be argv or shell-free text")
        elif not any(prefix and tokens[:len(prefix)] == prefix for prefix in allowed):
            errors.append(f"{field}[{index}] is outside release authority")
    return errors


def validate(
    receipt: dict[str, Any], gate: str, base_dir: Path | None = None,
    workspace_root: Path | None = None,
) -> list[str]:
    errors: list[str] = []
    if receipt.get("schema_version") != 1:
        errors.append("schema_version must be 1")
    for field in ("release_id", "target", "owner"):
        if not receipt.get(field):
            errors.append(f"{field} is required")
    if not timestamp(receipt.get("updated_at")):
        errors.append("updated_at must be a UTC timestamp")

    artifact = mapping(receipt.get("artifact"))
    for field in ("id", "source_revision", "change_receipt"):
        if not artifact.get(field):
            errors.append(f"artifact.{field} is required")
    if base_dir is not None and artifact.get("change_receipt"):
        change_path = Path(artifact["change_receipt"])
        change_path = change_path if change_path.is_absolute() else base_dir / change_path
        try:
            change = json.loads(change_path.read_text())
        except (OSError, json.JSONDecodeError):
            errors.append("artifact.change_receipt must reference a readable accepted change receipt")
        else:
            if isinstance(change, dict) and change.get("schema_version") == 1 and change.get("contract") == "delivery-run":
                try:
                    live_root = (workspace_root or base_dir)
                    project_policy = mapping(change.get("project_policy"))
                    project_policy_path = (live_root / project_policy["path"]) if live_root and project_policy.get("path") else None
                    DELIVERY_VALIDATOR.validate(
                        change, ROOT, receipt_dir=change_path.parent,
                        workspace_root=live_root, project_policy_path=project_policy_path,
                        verify_hashes=True,
                    )
                except DELIVERY_VALIDATOR.Invalid:
                    errors.append("artifact.change_receipt must be a valid neutral delivery receipt")
                if gate == "ready" and change.get("status") != "awaiting_release":
                    errors.append("artifact.change_receipt must be awaiting_release at the ready gate")
                if gate == "complete" and (
                    change.get("status") not in {"observing", "closed"}
                    or mapping(mapping(change.get("human_gates")).get("release")).get("status") != "approved"
                ):
                    errors.append("terminal release requires canonical observing state and approved release gate")
                observation_status = mapping(change.get("observation")).get("status")
                if gate == "complete" and (
                    (change.get("status") == "observing" and observation_status not in {"active", "pass"})
                    or (change.get("status") == "closed" and observation_status != "pass")
                ):
                    errors.append("terminal release requires active or passing canonical observation")
                delivered = next((item for item in items(change.get("artifacts")) if mapping(item).get("id") == artifact.get("id")), None)
                if not delivered or mapping(delivered).get("digest") != artifact.get("source_revision"):
                    errors.append("artifact.source_revision must match the accepted delivery artifact digest")
            else:
                errors.append("artifact.change_receipt must use the canonical delivery-run contract")
    authority = mapping(receipt.get("release_authority"))
    if not authority.get("approved_by") or not timestamp(authority.get("expires_at")):
        errors.append("release_authority requires approved_by and UTC expires_at")
    expiry = parse_timestamp(authority.get("expires_at"))
    updated = parse_timestamp(receipt.get("updated_at"))
    if expiry and updated and expiry <= updated:
        errors.append("release_authority must cover the release checkpoint")
    if receipt.get("target") not in items(authority.get("targets")):
        errors.append("release_authority does not include target")
    if artifact.get("id") not in items(authority.get("artifact_ids")):
        errors.append("release_authority does not include artifact")
    prefixes = authority.get("allowed_command_prefixes")
    if not isinstance(prefixes, list) or not prefixes or any(command_tokens(item) is None for item in prefixes):
        errors.append("release_authority.allowed_command_prefixes must not be empty")
        prefixes = []
    if authority.get("secrets_access") not in {"none", "use-without-disclosure"}:
        errors.append("release_authority.secrets_access is invalid")
    for field in ("external_communication", "irreversible_migration"):
        if not isinstance(authority.get(field), bool):
            errors.append(f"release_authority.{field} must be boolean")
    errors.extend(passing_checks(receipt.get("readiness_checks"), "readiness_checks"))
    errors.extend(authorised_commands(receipt.get("readiness_checks"), "readiness_checks", prefixes))

    rollout = mapping(receipt.get("rollout"))
    if not rollout.get("plan") or not rollout.get("blast_radius_cap"):
        errors.append("rollout must record plan and blast_radius_cap")
    if not items(rollout.get("stop_conditions")):
        errors.append("rollout.stop_conditions must not be empty")

    rollback = mapping(receipt.get("rollback"))
    for field in ("plan", "owner", "time_bound"):
        if not rollback.get(field):
            errors.append(f"rollback.{field} is required")
    if receipt.get("target") == "production" and rollback.get("tested") is not True:
        errors.append("production rollback must be tested")
    migration = mapping(receipt.get("migration"))
    if migration.get("type") not in {"none", "reversible", "stateful", "destructive"}:
        errors.append("migration.type is invalid")
    migration_required = migration.get("type") != "none"
    if migration.get("required") is not migration_required:
        errors.append("migration.required must agree with migration.type")
    if migration_required:
        for field in ("plan", "order", "compatibility_window", "recovery_point"):
            if not migration.get(field):
                errors.append(f"required migration needs {field}")
    if migration.get("type") == "destructive" or migration.get("backward_compatible") is False:
        if authority.get("irreversible_migration") is not True or not migration.get("approved_by"):
            errors.append("destructive/non-compatible migration requires explicit irreversible authority")

    observability = mapping(receipt.get("observability"))
    for field in ("window", "signals", "owner", "rollback_or_containment", "sampling_and_privacy", "close_condition"):
        if not observability.get(field):
            errors.append(f"observability.{field} is required")
    thresholds = [mapping(item) for item in items(observability.get("success_thresholds"))]
    if not observability.get("baseline") or not thresholds:
        errors.append("observability baseline and success_thresholds are required")
    threshold_ids: set[str] = set()
    for index, threshold in enumerate(thresholds):
        threshold_id = threshold.get("id")
        limit = threshold.get("limit")
        if not isinstance(threshold_id, str) or not threshold_id or threshold_id in threshold_ids:
            errors.append(f"observability.success_thresholds[{index}] requires a unique id")
        else:
            threshold_ids.add(threshold_id)
        if threshold.get("direction") not in {"lte", "gte"} or not isinstance(limit, (int, float)) or isinstance(limit, bool) or not math.isfinite(float(limit)):
            errors.append(f"observability.success_thresholds[{index}] requires direction and numeric limit")
    if set(items(observability.get("signals"))) != threshold_ids:
        errors.append("observability.signals must match success threshold ids")

    if gate == "ready":
        if receipt.get("status") != "awaiting-promotion":
            errors.append("status must be awaiting-promotion at the ready gate")
        return errors

    promotion = mapping(receipt.get("human_promotion"))
    if promotion.get("status") != "approved" or not promotion.get("approved_by"):
        errors.append("human_promotion must be approved by a named human")
    if not timestamp(promotion.get("approved_at")):
        errors.append("human_promotion.approved_at must be a UTC timestamp")
    execution = mapping(receipt.get("execution"))
    terminal_status = receipt.get("status")
    if terminal_status == "complete":
        errors.extend(passing_checks(execution.get("commands"), "execution.commands"))
    else:
        errors.extend(recorded_checks(execution.get("commands"), "execution.commands"))
    errors.extend(authorised_commands(execution.get("commands"), "execution.commands", prefixes))
    if not timestamp(execution.get("started_at")) or not timestamp(execution.get("finished_at")):
        errors.append("execution start and finish timestamps are required")
    approved_at = parse_timestamp(promotion.get("approved_at"))
    started_at = parse_timestamp(execution.get("started_at"))
    finished_at = parse_timestamp(execution.get("finished_at"))
    if approved_at and started_at and approved_at > started_at:
        errors.append("release execution cannot start before promotion approval")
    if started_at and finished_at and started_at > finished_at:
        errors.append("release execution cannot finish before it starts")
    if expiry and finished_at and expiry < finished_at:
        errors.append("release authority must remain valid through execution completion")
    if terminal_status == "complete":
        errors.extend(passing_checks(observability.get("checks"), "observability.checks"))
    else:
        errors.extend(recorded_checks(observability.get("checks"), "observability.checks"))
    errors.extend(authorised_commands(observability.get("checks"), "observability.checks", prefixes))
    if terminal_status == "complete":
        window_match = WINDOW_DURATION.fullmatch(str(observability.get("window", "")))
        window_started = parse_timestamp(observability.get("window_started_at"))
        window_ended = parse_timestamp(observability.get("window_ended_at"))
        if not window_match or not window_started or not window_ended or window_ended <= window_started:
            errors.append("observability requires a typed increasing terminal window")
        else:
            amount = int(window_match.group(1))
            seconds = amount * {"s": 1, "m": 60, "h": 3600, "d": 86400}[window_match.group(2)]
            if (window_ended - window_started).total_seconds() < seconds:
                errors.append("observability window is shorter than declared")
            if finished_at and window_started < finished_at:
                errors.append("observability window cannot start before release execution finishes")
            if updated and updated < window_ended:
                errors.append("terminal receipt must be updated after the observation window")
        measured = {mapping(item).get("threshold_id"): mapping(item) for item in items(observability.get("checks"))}
        for threshold in thresholds:
            threshold_id = threshold.get("id")
            check = measured.get(threshold_id)
            value = check.get("measured_value") if check else None
            if not check or not isinstance(value, (int, float)) or isinstance(value, bool) or not math.isfinite(float(value)) or not items(check.get("evidence")):
                errors.append(f"observability threshold {threshold_id} needs a measured value and evidence")
                continue
            observed_at = parse_timestamp(check.get("observed_at"))
            if not observed_at or (window_started and observed_at < window_started) or (window_ended and observed_at > window_ended):
                errors.append(f"observability threshold {threshold_id} needs a measurement inside the window")
            passed = value <= threshold["limit"] if threshold.get("direction") == "lte" else value >= threshold["limit"]
            if not passed:
                errors.append(f"observability threshold {threshold_id} was not met")
    if terminal_status == "rolled-back":
        rollback_execution = mapping(receipt.get("rollback_execution"))
        errors.extend(passing_checks(rollback_execution.get("commands"), "rollback_execution.commands"))
        errors.extend(authorised_commands(rollback_execution.get("commands"), "rollback_execution.commands", prefixes))
        errors.extend(passing_checks(rollback_execution.get("restoration_checks"), "rollback_execution.restoration_checks"))
        errors.extend(authorised_commands(rollback_execution.get("restoration_checks"), "rollback_execution.restoration_checks", prefixes))
        rollback_started = parse_timestamp(rollback_execution.get("started_at"))
        rollback_finished = parse_timestamp(rollback_execution.get("finished_at"))
        if not rollback_started or not rollback_finished:
            errors.append("rollback_execution start and finish timestamps are required")
        elif rollback_started > rollback_finished:
            errors.append("rollback execution cannot finish before it starts")
        if expiry and rollback_finished and expiry < rollback_finished:
            errors.append("release authority must remain valid through rollback completion")
        if finished_at and rollback_started and rollback_started < finished_at:
            errors.append("rollback execution cannot start before release execution finishes")
    outcome = mapping(receipt.get("outcome"))
    if receipt.get("status") not in {"complete", "rolled-back", "failed"}:
        errors.append("terminal status must be complete, rolled-back, or failed")
    if outcome.get("status") != receipt.get("status") or not items(outcome.get("evidence")):
        errors.append("outcome must match terminal status and contain evidence")
    if receipt.get("status") != "complete" and not outcome.get("follow_up_owner"):
        errors.append("non-success terminal outcome requires follow_up_owner")
    return errors


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("receipt", type=Path)
    parser.add_argument("--gate", choices=("ready", "complete"), default="ready")
    parser.add_argument("--workspace-root", type=Path, default=Path.cwd())
    args = parser.parse_args(argv)
    try:
        receipt = json.loads(args.receipt.read_text())
    except (OSError, json.JSONDecodeError) as exc:
        print(f"invalid release receipt: {exc}", file=sys.stderr)
        return 2
    errors = validate(receipt if isinstance(receipt, dict) else {}, args.gate, args.receipt.parent, args.workspace_root.resolve())
    if errors:
        for error in errors:
            print(f"FAIL: {error}", file=sys.stderr)
        return 1
    print(f"PASS: {args.gate} gate")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
