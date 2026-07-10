#!/usr/bin/env python3
"""Collect privacy-safe skill-event aggregates from an explicitly approved scope."""

from __future__ import annotations

import argparse
from collections import Counter
from contextlib import contextmanager
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import sys
import tempfile
from typing import Any


SUPPORTED = {
    "codex-session-jsonl-v1": ("codex", "codex-jsonl-v1"),
    "claude-session-jsonl-v1": ("claude", "claude-jsonl-v1"),
}
EVENTS = {"candidate", "selected", "started", "completed", "abandoned", "corrected"}
UTC = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")


class CollectionError(ValueError):
    pass


def _utc(value: str, field: str) -> datetime:
    if not isinstance(value, str) or not UTC.fullmatch(value):
        raise CollectionError(f"{field} must be an ISO UTC second timestamp")
    try:
        return datetime.fromisoformat(value[:-1] + "+00:00")
    except ValueError as exc:
        raise CollectionError(f"{field} is not a real timestamp") from exc


def _sha_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def _sha_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _day_floor(value: datetime) -> str:
    return value.replace(hour=0, minute=0, second=0, microsecond=0).isoformat().replace("+00:00", "Z")


def _day_ceil(value: datetime) -> str:
    floor = value.replace(hour=0, minute=0, second=0, microsecond=0)
    if value != floor:
        from datetime import timedelta
        floor += timedelta(days=1)
    return floor.isoformat().replace("+00:00", "Z")


def _source_files(root: Path) -> list[Path]:
    if root.is_symlink():
        raise CollectionError("source root must not be a symlink")
    if not root.is_dir():
        raise CollectionError("source root must be an existing directory")
    resolved_root = root.resolve(strict=True)
    files = []
    for path in root.rglob("*"):
        if path.is_symlink():
            raise CollectionError("source tree must not contain symlinks")
        if not path.is_file() or path.suffix != ".jsonl":
            continue
        try:
            resolved = path.resolve(strict=True)
            resolved.relative_to(resolved_root)
        except (OSError, ValueError) as exc:
            raise CollectionError("source file resolves outside the approved root") from exc
        files.append(resolved)
    return sorted(files)


def _file_identity(value: os.stat_result) -> tuple[int, int, int, int, int, int]:
    return (
        value.st_dev,
        value.st_ino,
        value.st_mode,
        value.st_size,
        value.st_mtime_ns,
        value.st_ctime_ns,
    )


def _source_snapshot(root: Path) -> dict[str, Any]:
    resolved_root = root.resolve(strict=True)
    files = _source_files(root)
    identities: dict[Path, tuple[int, int, int, int, int, int]] = {}
    for path in files:
        try:
            observed = os.stat(path, follow_symlinks=False)
        except OSError as exc:
            raise CollectionError("source file changed while building the approval snapshot") from exc
        if not stat.S_ISREG(observed.st_mode) or path.is_symlink():
            raise CollectionError("source file changed while building the approval snapshot")
        identities[path] = _file_identity(observed)
    return {
        "root": resolved_root,
        "files": files,
        "identities": identities,
        "manifest_sha256": _manifest(resolved_root, files, identities),
    }


def _manifest(
    root: Path,
    files: list[Path],
    identities: dict[Path, tuple[int, int, int, int, int, int]],
) -> str:
    rows = []
    for path in files:
        device, inode, mode, size, mtime_ns, ctime_ns = identities[path]
        rows.append({
            "relative_name_sha256": _sha_bytes(path.relative_to(root).as_posix().encode()),
            "device": device,
            "inode": inode,
            "mode": mode,
            "size": size,
            "mtime_ns": mtime_ns,
            "ctime_ns": ctime_ns,
        })
    return _sha_bytes(json.dumps(rows, sort_keys=True, separators=(",", ":")).encode())


@contextmanager
def _open_approved_source(
    path: Path,
    root: Path,
    approved_identity: tuple[int, int, int, int, int, int],
):
    """Read only the filesystem object captured in the approved snapshot."""
    resolved_root = root.resolve(strict=True)
    if path.is_symlink():
        raise CollectionError("source file became a symlink after approval")
    try:
        path.resolve(strict=True).relative_to(resolved_root)
    except (OSError, ValueError) as exc:
        raise CollectionError("source file moved outside the approved root") from exc
    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
    try:
        descriptor = os.open(path, flags)
    except OSError as exc:
        raise CollectionError("source file could not be opened without following links") from exc
    handle = os.fdopen(descriptor, "r", encoding="utf-8", errors="replace")
    try:
        if _file_identity(os.fstat(handle.fileno())) != approved_identity:
            raise CollectionError("source file changed after approval")
        yield handle
        if _file_identity(os.fstat(handle.fileno())) != approved_identity:
            raise CollectionError("source file changed while being collected")
        if path.is_symlink() or _file_identity(os.stat(path, follow_symlinks=False)) != approved_identity:
            raise CollectionError("source path changed while being collected")
    except OSError as exc:
        raise CollectionError("source file changed while being collected") from exc
    finally:
        handle.close()


def _build_scope_proposal(
    *,
    source_root: Path,
    destination_path: Path,
    source_schema: str,
    platform: str,
    started_at: str,
    ended_at: str,
    skills: list[str],
    persistence: str,
    retention_until: str,
    minimum_cell_size: int,
) -> tuple[dict[str, Any], dict[str, Any]]:
    if source_schema not in SUPPORTED:
        raise CollectionError(f"unsupported source schema: {source_schema}")
    expected_platform, _ = SUPPORTED[source_schema]
    if platform != expected_platform:
        raise CollectionError("platform does not match source schema")
    start = _utc(started_at, "started_at")
    end = _utc(ended_at, "ended_at")
    retention = _utc(retention_until, "retention_until")
    if start >= end:
        raise CollectionError("scope time range must be increasing")
    if retention <= end:
        raise CollectionError("retention must follow the evidence window")
    if persistence not in {"local-private", "portable-aggregate"}:
        raise CollectionError("unsupported persistence")
    if not skills or any(not isinstance(skill, str) or not skill for skill in skills):
        raise CollectionError("at least one skill is required")
    if isinstance(minimum_cell_size, bool) or minimum_cell_size < 1:
        raise CollectionError("minimum_cell_size must be positive")
    snapshot = _source_snapshot(source_root)
    source_root = snapshot["root"]
    destination = destination_path.expanduser().resolve(strict=False)
    try:
        destination.relative_to(source_root)
    except ValueError:
        pass
    else:
        raise CollectionError("destination must be outside the approved source root")
    if destination_path.is_symlink():
        raise CollectionError("destination must not be a symlink")
    proposal = {
        "schema_version": 1,
        "scope": {
            "started_at": started_at,
            "ended_at": ended_at,
            "platforms": [platform],
            "skills": sorted(set(skills)),
            "persistence": persistence,
            "retention_until": retention_until,
            "minimum_cell_size": minimum_cell_size,
        },
        "source": {
            "schema": source_schema,
            "file_count": len(snapshot["files"]),
            "manifest_sha256": snapshot["manifest_sha256"],
            "root_identity_sha256": _sha_bytes(str(source_root).encode()),
        },
        "disclosure": {
            "destination": "local-private" if persistence == "local-private" else "portable-aggregate",
            "canonical_destination": str(destination),
            "destination_identity_sha256": _sha_bytes(str(destination).encode()),
            "content_allowed": False,
            "raw_identifiers_allowed": False,
        },
        "authority": {
            "status": "pending-human-approval",
            "approved_by": "",
            "evidence": "",
        },
    }
    return proposal, snapshot


def build_scope_proposal(
    *,
    source_root: Path,
    destination_path: Path,
    source_schema: str,
    platform: str,
    started_at: str,
    ended_at: str,
    skills: list[str],
    persistence: str,
    retention_until: str,
    minimum_cell_size: int,
) -> dict[str, Any]:
    proposal, _snapshot = _build_scope_proposal(
        source_root=source_root,
        destination_path=destination_path,
        source_schema=source_schema,
        platform=platform,
        started_at=started_at,
        ended_at=ended_at,
        skills=skills,
        persistence=persistence,
        retention_until=retention_until,
        minimum_cell_size=minimum_cell_size,
    )
    return proposal


def write_output(path: Path, result: dict[str, Any]) -> None:
    if path.is_symlink():
        raise CollectionError("destination became a symlink")
    destination = path.expanduser().resolve(strict=False)
    parent = destination.parent
    if not parent.is_dir():
        raise CollectionError("destination parent must already exist")
    temporary: Path | None = None
    try:
        with tempfile.NamedTemporaryFile("w", dir=parent, prefix=".telemetry-", suffix=".tmp", delete=False) as handle:
            temporary = Path(handle.name)
            json.dump(result, handle, indent=2)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        if path.is_symlink() or destination != path.expanduser().resolve(strict=False):
            raise CollectionError("destination identity changed before write")
        os.replace(temporary, destination)
    finally:
        if temporary and temporary.exists():
            temporary.unlink()


def _approved_receipt(path: Path, expected: dict[str, Any]) -> tuple[dict[str, Any], str]:
    try:
        raw = path.read_bytes()
        receipt = json.loads(raw)
    except (OSError, json.JSONDecodeError) as exc:
        raise CollectionError(f"scope receipt is unreadable: {exc}") from exc
    if not isinstance(receipt, dict):
        raise CollectionError("scope receipt must be an object")
    authority = receipt.get("authority")
    if not isinstance(authority, dict) or authority.get("status") != "approved" or not authority.get("approved_by") or not authority.get("evidence"):
        raise CollectionError("scope receipt requires explicit human approval")
    comparable = dict(receipt)
    comparable["authority"] = expected["authority"]
    if comparable != expected:
        raise CollectionError("approved scope receipt does not match the requested collection scope")
    return receipt, _sha_bytes(raw)


def _record_event(
    value: Any,
    *,
    platform: str,
    skills: set[str],
    start: datetime,
    end: datetime,
) -> tuple[str, str, str, str, str] | None:
    if not isinstance(value, dict) or value.get("type") != "skill_event":
        return None
    if value.get("skill") not in skills or value.get("event") not in EVENTS:
        return None
    timestamp = value.get("timestamp")
    try:
        observed = _utc(timestamp, "record timestamp")
    except CollectionError:
        return None
    if observed < start or observed >= end:
        return None
    return observed.date().isoformat(), platform, value["skill"], value["event"], "deterministic-adapter"


def collect(
    *,
    scope_receipt: Path,
    root: Path,
    source_root: Path,
    destination_path: Path,
    source_schema: str,
    platform: str,
    started_at: str,
    ended_at: str,
    skills: list[str],
    persistence: str,
    retention_until: str,
    minimum_cell_size: int,
    generated_at: str | None = None,
) -> dict[str, Any]:
    expected, snapshot = _build_scope_proposal(
        source_root=source_root,
        destination_path=destination_path,
        source_schema=source_schema,
        platform=platform,
        started_at=started_at,
        ended_at=ended_at,
        skills=skills,
        persistence=persistence,
        retention_until=retention_until,
        minimum_cell_size=minimum_cell_size,
    )
    _, receipt_sha = _approved_receipt(scope_receipt, expected)
    catalogue = {path.parent.name for path in (root / "skills").glob("*/SKILL.md")}
    scoped_skills = set(expected["scope"]["skills"])
    if not scoped_skills <= catalogue:
        raise CollectionError("scope receipt contains an unknown skill")

    source_root = snapshot["root"]
    files = snapshot["files"]
    start = _utc(started_at, "started_at")
    end = _utc(ended_at, "ended_at")
    generated_at = generated_at or datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    generated = _utc(generated_at, "generated_at")
    if generated < end:
        raise CollectionError("generated_at must not precede the evidence window")

    counts: Counter[tuple[str, str, str, str, str]] = Counter()
    read = emitted = rejected = 0
    for path in files:
        with _open_approved_source(path, source_root, snapshot["identities"][path]) as handle:
            for line in handle:
                read += 1
                try:
                    value = json.loads(line)
                except json.JSONDecodeError:
                    rejected += 1
                    continue
                event = _record_event(value, platform=platform, skills=scoped_skills, start=start, end=end)
                if event is None:
                    rejected += 1
                    continue
                counts[event] += 1
                emitted += 1

    suppressed = 0
    event_rows = []
    for (bucket, event_platform, skill, event, signal), count in sorted(counts.items()):
        if persistence == "portable-aggregate" and count < minimum_cell_size:
            suppressed += 1
            continue
        event_rows.append({
            "bucket": bucket,
            "platform": event_platform,
            "skill": skill,
            "event": event,
            "signal": signal,
            "confidence": 1.0,
            "count": count,
        })

    totals: dict[str, Counter[str]] = {skill: Counter() for skill in sorted(scoped_skills)}
    for event in event_rows:
        totals[event["skill"]][event["event"]] += event["count"]
    aggregates = []
    for skill in sorted(scoped_skills):
        values = totals[skill]
        unknown = values["selected"] - values["completed"] - values["abandoned"]
        aggregates.append({
            "skill": skill,
            "opportunities": values["candidate"],
            "selections": values["selected"],
            "completions": values["completed"],
            "corrections": values["corrected"],
            "unknown_outcomes": max(0, unknown),
            "denominator_source": "explicit-receipts-v1",
        })

    _, adapter_id = SUPPORTED[source_schema]
    implementation_sha = _sha_file(Path(__file__))
    limitations = []
    if rejected:
        limitations.append("adapter-partial")
    if suppressed:
        limitations.append("small-cells-suppressed")
    return {
        "schema_version": 1,
        "collection_id": "STEL-" + _sha_bytes((receipt_sha + generated_at).encode())[:16],
        "generated_at": _day_ceil(generated),
        "status": "partial" if rejected else "complete",
        "scope": {
            "receipt_sha256": receipt_sha,
            "started_at": _day_floor(start),
            "ended_at": _day_ceil(end),
            "platforms": [platform],
            "skills": sorted(scoped_skills),
        },
        "privacy": {
            "mode": "metadata-only",
            "persistence": persistence,
            "content_captured": False,
            "raw_identifiers_captured": False,
            "redaction_policy_id": "skill-telemetry-v1",
            "minimum_cell_size": minimum_cell_size,
            "suppressed_cells": suppressed,
            "retention_until": _day_ceil(_utc(retention_until, "retention_until")),
        },
        "adapters": [{
            "id": adapter_id,
            "implementation_sha256": implementation_sha,
            "source_schema": source_schema,
            "source_manifest_sha256": expected["source"]["manifest_sha256"],
            "records_read": read,
            "records_emitted": emitted,
            "records_rejected": rejected,
            "status": "partial" if rejected else "pass",
            "reason": "records-rejected" if rejected else "",
        }],
        "events": event_rows,
        "aggregates": aggregates,
        "limitations": limitations,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-root", required=True, type=Path)
    parser.add_argument("--source-schema", required=True)
    parser.add_argument("--platform", required=True)
    parser.add_argument("--start", required=True, dest="started_at")
    parser.add_argument("--end", required=True, dest="ended_at")
    parser.add_argument("--skill", required=True, action="append", dest="skills")
    parser.add_argument("--persistence", choices=("local-private", "portable-aggregate"), default="local-private")
    parser.add_argument("--retention-until", required=True)
    parser.add_argument("--minimum-cell-size", type=int, default=5)
    parser.add_argument("--dry-run-scope", action="store_true")
    parser.add_argument("--scope-receipt", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[3])
    args = parser.parse_args(argv)
    values = {
        "source_root": args.source_root,
        "destination_path": args.output,
        "source_schema": args.source_schema,
        "platform": args.platform,
        "started_at": args.started_at,
        "ended_at": args.ended_at,
        "skills": args.skills,
        "persistence": args.persistence,
        "retention_until": args.retention_until,
        "minimum_cell_size": args.minimum_cell_size,
    }
    try:
        if args.dry_run_scope:
            if args.scope_receipt or not args.output:
                raise CollectionError("dry-run scope requires planned --output and no scope receipt")
            print(json.dumps(build_scope_proposal(**values), indent=2))
            return 0
        if not args.scope_receipt or not args.output:
            raise CollectionError("collection requires --scope-receipt and --output")
        result = collect(scope_receipt=args.scope_receipt, root=args.root.resolve(), **values)
        write_output(args.output, result)
    except (OSError, CollectionError) as exc:
        print(f"FAIL: {exc}", file=sys.stderr)
        return 1
    print(f"PASS: wrote aggregate-only telemetry to {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
