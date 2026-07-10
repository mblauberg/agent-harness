#!/usr/bin/env python3
"""Validate aggregate-only skill telemetry without reading its source data."""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any


ROOT_KEYS = {
    "schema_version", "collection_id", "generated_at", "status", "scope",
    "privacy", "adapters", "events", "aggregates", "limitations",
}
FORBIDDEN_KEYS = {
    "prompt", "prompts", "message", "messages", "response", "responses",
    "content", "contents", "path", "paths", "cwd", "session_id", "user_id",
    "username", "project", "project_name", "tool_arguments", "tool_results",
}
EVENTS = {"candidate", "selected", "started", "completed", "abandoned", "corrected"}
STATUSES = {"complete", "partial", "failed"}
ADAPTER_STATUSES = {"pass", "partial", "failed"}
HASH = re.compile(r"^[0-9a-f]{64}$")
TOKEN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*$")
BUCKET = re.compile(r"^\d{4}-(?:W\d{2}|\d{2}-\d{2})$")
SIGNALS = {"explicit-receipt", "explicit-tool", "deterministic-adapter", "local-classifier"}
PLATFORMS = {"claude", "codex", "pi", "cursor", "copilot", "kiro", "gemini", "xai", "other"}
ADAPTER_IDS = {"receipt-v1", "claude-jsonl-v1", "codex-jsonl-v1", "routing-eval-v1"}
SOURCE_SCHEMAS = {"delivery-receipt-v1", "claude-session-jsonl-v1", "codex-session-jsonl-v1", "routing-eval-v1"}
REASON_CODES = {"", "unsupported-source-schema", "records-rejected", "source-unavailable", "out-of-scope", "adapter-error"}
LIMITATION_CODES = {"partial-platform-coverage", "missing-opportunity-denominator", "unsupported-source-schema", "adapter-partial", "telemetry-unavailable", "small-cells-suppressed"}
DENOMINATOR_SOURCES = {"routing-eval-v1", "explicit-receipts-v1"}
COLLECTION_ID = re.compile(r"^STEL-[0-9a-f]{16,64}$")


class Invalid(ValueError):
    pass


def fail(condition: bool, message: str) -> None:
    if condition:
        raise Invalid(message)


def utc(value: Any, field: str) -> datetime:
    fail(not isinstance(value, str), f"{field} must be a UTC timestamp")
    fail(not value.endswith("Z"), f"{field} must end in Z")
    try:
        return datetime.fromisoformat(value[:-1] + "+00:00")
    except ValueError as exc:
        raise Invalid(f"{field} is not an ISO timestamp") from exc


def rounded_day(value: Any, field: str) -> datetime:
    observed = utc(value, field)
    fail(any((observed.hour, observed.minute, observed.second, observed.microsecond)), f"{field} must be rounded to a UTC day")
    return observed


def hash_value(value: Any, field: str) -> None:
    fail(not isinstance(value, str) or not HASH.fullmatch(value), f"{field} must be a SHA-256 hex digest")


def token(value: Any, field: str, *, allow_empty: bool = False) -> None:
    if allow_empty and value == "":
        return
    fail(not isinstance(value, str) or not TOKEN.fullmatch(value), f"{field} must be a machine token")


def bucket_window(value: str, field: str) -> tuple[datetime, datetime]:
    fail(not BUCKET.fullmatch(value), f"{field} is not a day or ISO week bucket")
    try:
        if "-W" in value:
            year, week = value.split("-W")
            start = datetime.fromisocalendar(int(year), int(week), 1).replace(tzinfo=timezone.utc)
            return start, start + timedelta(days=7)
        start = datetime.fromisoformat(value).replace(tzinfo=timezone.utc)
        return start, start + timedelta(days=1)
    except ValueError as exc:
        raise Invalid(f"{field} is not a real calendar bucket") from exc


def no_forbidden_keys(value: Any, prefix: str = "$") -> None:
    if isinstance(value, dict):
        for key, child in value.items():
            fail(key.lower() in FORBIDDEN_KEYS, f"forbidden telemetry key at {prefix}.{key}")
            no_forbidden_keys(child, f"{prefix}.{key}")
    elif isinstance(value, list):
        for index, child in enumerate(value):
            no_forbidden_keys(child, f"{prefix}[{index}]")


def non_negative_int(value: Any, field: str) -> None:
    fail(isinstance(value, bool) or not isinstance(value, int) or value < 0, f"{field} must be a non-negative integer")


def skill_catalogue(root: Path) -> set[str]:
    return {path.parent.name for path in (root / "skills").glob("*/SKILL.md")}


def validate(data: Any, root: Path) -> None:
    fail(not isinstance(data, dict), "telemetry root must be an object")
    fail(set(data) != ROOT_KEYS, f"root keys must be exactly {sorted(ROOT_KEYS)}")
    fail(data["schema_version"] != 1, "unsupported schema_version")
    fail(data["status"] not in STATUSES, "invalid status")
    fail(not isinstance(data["collection_id"], str) or not COLLECTION_ID.fullmatch(data["collection_id"]), "collection_id must be an opaque STEL identifier")
    generated = rounded_day(data["generated_at"], "generated_at")
    no_forbidden_keys(data)

    scope = data["scope"]
    fail(not isinstance(scope, dict), "scope must be an object")
    fail(set(scope) != {"receipt_sha256", "started_at", "ended_at", "platforms", "skills"}, "invalid scope keys")
    hash_value(scope["receipt_sha256"], "scope.receipt_sha256")
    start = rounded_day(scope["started_at"], "scope.started_at")
    end = rounded_day(scope["ended_at"], "scope.ended_at")
    fail(start >= end, "scope time range must be increasing")
    fail(not scope["platforms"], "scope.platforms must be non-empty")
    for index, platform in enumerate(scope["platforms"]):
        fail(platform not in PLATFORMS, f"unknown platform code at scope.platforms[{index}]")
    catalogue = skill_catalogue(root)
    fail(not scope["skills"] or any(skill not in catalogue for skill in scope["skills"]), "scope contains an unknown skill")

    privacy = data["privacy"]
    required_privacy = {
        "mode", "persistence", "content_captured", "raw_identifiers_captured",
        "redaction_policy_id", "minimum_cell_size", "suppressed_cells", "retention_until",
    }
    fail(not isinstance(privacy, dict) or set(privacy) != required_privacy, "invalid privacy keys")
    fail(privacy["mode"] != "metadata-only", "privacy.mode must be metadata-only")
    fail(privacy["persistence"] not in {"local-private", "portable-aggregate"}, "invalid persistence")
    fail(privacy["content_captured"] is not False, "content_captured must be false")
    fail(privacy["raw_identifiers_captured"] is not False, "raw_identifiers_captured must be false")
    fail(privacy["redaction_policy_id"] != "skill-telemetry-v1", "unknown redaction policy")
    non_negative_int(privacy["minimum_cell_size"], "privacy.minimum_cell_size")
    fail(privacy["minimum_cell_size"] < 1, "minimum_cell_size must be positive")
    non_negative_int(privacy["suppressed_cells"], "privacy.suppressed_cells")
    retention = rounded_day(privacy["retention_until"], "privacy.retention_until")
    fail(end > generated, "scope.end must not be after generated_at")
    fail(generated >= retention, "retention_until must be after generated_at")

    fail(not isinstance(data["adapters"], list) or not data["adapters"], "at least one adapter is required")
    for index, adapter in enumerate(data["adapters"]):
        required = {
            "id", "implementation_sha256", "source_schema", "source_manifest_sha256",
            "records_read", "records_emitted", "records_rejected", "status", "reason",
        }
        fail(not isinstance(adapter, dict) or set(adapter) != required, f"invalid adapter keys at {index}")
        fail(adapter["id"] not in ADAPTER_IDS, f"unknown adapter code at {index}")
        fail(adapter["source_schema"] not in SOURCE_SCHEMAS, f"unknown source schema at {index}")
        hash_value(adapter["implementation_sha256"], f"adapters[{index}].implementation_sha256")
        hash_value(adapter["source_manifest_sha256"], f"adapters[{index}].source_manifest_sha256")
        for field in ("records_read", "records_emitted", "records_rejected"):
            non_negative_int(adapter[field], f"adapters[{index}].{field}")
        fail(adapter["records_emitted"] + adapter["records_rejected"] != adapter["records_read"], f"adapter {index} accounting does not conserve records")
        fail(adapter["status"] not in ADAPTER_STATUSES, f"invalid adapter status at {index}")
        fail(adapter["status"] != "pass" and not adapter["reason"], f"non-passing adapter {index} needs a reason")
        fail(adapter["reason"] not in REASON_CODES, f"unknown adapter reason code at {index}")

    event_keys: set[tuple[str, str, str, str, str]] = set()
    event_totals: dict[tuple[str, str], dict[str, int]] = {}
    for index, event in enumerate(data["events"]):
        required = {"bucket", "platform", "skill", "event", "signal", "confidence", "count"}
        fail(not isinstance(event, dict) or set(event) != required, f"invalid event keys at {index}")
        bucket_start, bucket_end = bucket_window(event["bucket"], f"events[{index}].bucket")
        fail(bucket_end <= start or bucket_start >= end, f"event {index} bucket is outside the scope window")
        fail(event["skill"] not in catalogue or event["skill"] not in scope["skills"], f"event {index} uses an unscoped skill")
        fail(event["platform"] not in scope["platforms"], f"event {index} uses an unscoped platform")
        fail(event["event"] not in EVENTS, f"invalid event type at {index}")
        fail(event["signal"] not in SIGNALS, f"invalid signal at {index}")
        fail(not isinstance(event["confidence"], (int, float)) or isinstance(event["confidence"], bool) or not 0 <= event["confidence"] <= 1, f"invalid confidence at {index}")
        non_negative_int(event["count"], f"events[{index}].count")
        key = (event["bucket"], event["platform"], event["skill"], event["event"], event["signal"])
        fail(key in event_keys, f"duplicate event cell at {index}")
        event_keys.add(key)
        total_key = (event["platform"], event["skill"])
        totals = event_totals.setdefault(total_key, {name: 0 for name in EVENTS})
        totals[event["event"]] += event["count"]
        if privacy["persistence"] == "portable-aggregate":
            fail(event["count"] < privacy["minimum_cell_size"], f"portable event {index} violates minimum cell size")

    aggregate_skills: set[str] = set()
    for index, aggregate in enumerate(data["aggregates"]):
        required = {"skill", "opportunities", "selections", "completions", "corrections", "unknown_outcomes", "denominator_source"}
        fail(not isinstance(aggregate, dict) or set(aggregate) != required, f"invalid aggregate keys at {index}")
        fail(aggregate["skill"] not in scope["skills"], f"aggregate {index} uses an unscoped skill")
        fail(aggregate["skill"] in aggregate_skills, f"duplicate aggregate skill at {index}")
        aggregate_skills.add(aggregate["skill"])
        for field in required - {"skill", "denominator_source"}:
            non_negative_int(aggregate[field], f"aggregates[{index}].{field}")
        fail(not aggregate["denominator_source"], f"aggregate {index} needs denominator_source")
        fail(aggregate["denominator_source"] not in DENOMINATOR_SOURCES, f"unknown denominator source at {index}")
        fail(aggregate["selections"] > aggregate["opportunities"], f"aggregate {index} selections exceed opportunities")
        fail(aggregate["completions"] + aggregate["unknown_outcomes"] > aggregate["selections"], f"aggregate {index} outcomes exceed selections")
        totals = {name: 0 for name in EVENTS}
        for (platform, skill), values in event_totals.items():
            if skill == aggregate["skill"]:
                for event_name, count in values.items():
                    totals[event_name] += count
        expected = {
            "opportunities": totals["candidate"],
            "selections": totals["selected"],
            "completions": totals["completed"],
            "corrections": totals["corrected"],
            "unknown_outcomes": totals["selected"] - totals["completed"] - totals["abandoned"],
        }
        fail(expected["unknown_outcomes"] < 0, f"aggregate {index} event outcomes exceed selections")
        for field, value in expected.items():
            fail(aggregate[field] != value, f"aggregate {index}.{field} does not reconcile with events")
    fail(not isinstance(data["limitations"], list), "limitations must be a list")
    for index, limitation in enumerate(data["limitations"]):
        fail(limitation not in LIMITATION_CODES, f"unknown limitation code at {index}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("telemetry", type=Path)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[3])
    args = parser.parse_args()
    try:
        validate(json.loads(args.telemetry.read_text()), args.root.resolve())
    except (OSError, json.JSONDecodeError, Invalid) as exc:
        print(f"FAIL: {exc}", file=sys.stderr)
        return 1
    print("PASS: privacy-safe skill telemetry")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
