#!/usr/bin/env python3
"""Validate that a PAUSED mission STATE is a real, resumable idle-frontier pause."""

from __future__ import annotations

import argparse
from pathlib import Path
import re


FIELD_RE = {
    name: re.compile(rf"^- \*\*{re.escape(name)}:\*\*\s*(.+?)\s*$", re.MULTILINE)
    for name in ("Run status", "Conductor lease", "In flight", "Next up", "Resume protocol")
}
RESUME_TRIGGERS = {
    "human-directive",
    "gate-answer",
    "external-completion",
    "material-change",
    "explicit-restart",
}
ACTIVE_STATUSES = {"PENDING", "LEASED"}
TERMINAL_STATUSES = {"DONE", "BLOCKED", "DEFERRED"}
QUEUE_HEADER = ("id", "status", "depends-on", "lease-owner", "lease-expiry", "notes")
QUEUE_TIER_RE = re.compile(r"^##\s+Tier\s+\S", re.IGNORECASE | re.MULTILINE)


def _section(text: str, heading: str) -> str:
    match = re.search(
        rf"^## {re.escape(heading)}\s*$\n(.*?)(?=^## |\Z)",
        text,
        re.MULTILINE | re.DOTALL,
    )
    return match.group(1).strip() if match else ""


def _first_value(section: str, prefix: str = "") -> str:
    for line in section.splitlines():
        value = line.strip()
        if not value or value.startswith("<!--") or value.startswith("-->"):
            continue
        if prefix:
            match = re.fullmatch(rf"{re.escape(prefix)}:\s*(.+)", value, re.IGNORECASE)
            if match:
                return match.group(1).strip()
            continue
        return value
    return ""


def _field(text: str, name: str, fallback_section: str = "", fallback_prefix: str = "") -> str:
    match = FIELD_RE[name].search(text)
    if match:
        return match.group(1).strip()
    section = _section(text, fallback_section) if fallback_section else ""
    return _first_value(section, fallback_prefix)


def _queue_has_active_rows(path: Path) -> tuple[bool, str | None]:
    """QUEUE.md is the single durable queue + item-lease ledger. A row with
    status PENDING (selectable) or LEASED (in-flight) means the mission is
    not idle."""
    try:
        text = path.read_text()
    except OSError as exc:
        return False, f"cannot read canonical queue: {exc}"
    if not QUEUE_TIER_RE.search(text):
        return False, "canonical queue lacks a '## Tier ...' section"
    for line in text.splitlines():
        value = line.strip()
        if not value.startswith("|") or not value.endswith("|"):
            continue
        # Split on unescaped pipes so a legitimately escaped '\|' inside notes
        # stays within one cell rather than inflating the column count.
        cells = [cell.strip() for cell in re.split(r"(?<!\\)\|", value[1:-1])]
        normalized = tuple(cell.lower() for cell in cells)
        if normalized == QUEUE_HEADER:
            continue  # header row
        if cells and all(re.fullmatch(r":?-{3,}:?", cell) for cell in cells):
            continue  # separator row
        if len(cells) != len(QUEUE_HEADER):
            # Fail closed: a malformed queue row is not proof of idleness.
            return True, f"malformed queue row (expected {len(QUEUE_HEADER)} cells): {value}"
        status = cells[1].strip("`").upper()
        if status in ACTIVE_STATUSES:
            return True, None
        if status not in TERMINAL_STATUSES:
            # Fail closed: a typo'd or ad-hoc status is not proof of idleness.
            return True, (
                f"unrecognized queue status '{status}' — controlled vocabulary "
                "is PENDING, LEASED, DONE, BLOCKED, DEFERRED"
            )
    return False, None


def validate(
    path: Path,
    queue_path: Path | None = None,
) -> list[str]:
    try:
        text = path.read_text()
    except OSError as exc:
        return [f"cannot read state: {exc}"]

    status = _field(text, "Run status", "Heartbeat")
    lease = _field(text, "Conductor lease", "Heartbeat", "CONDUCTOR LEASE")
    in_flight = _field(text, "In flight", "Heartbeat")
    next_up = _field(text, "Next up", "Heartbeat")
    resume = _field(text, "Resume protocol", "Heartbeat", "RESUME PROTOCOL")
    errors: list[str] = []

    if not re.fullmatch(
        r"PAUSED\s+(?:—|-)\s+reason:\s*idle-frontier",
        status,
        re.IGNORECASE,
    ):
        errors.append("run status must be exactly PAUSED — reason: idle-frontier")
    if lease.lower() not in {"released", "release-on-driver-exit"}:
        errors.append("idle pause must record lease release-on-driver-exit or released")
    if in_flight.lower() not in {"none", "(none)"}:
        errors.append("idle pause requires an empty in-flight ledger")
    if not re.fullmatch(
        r"\(?none\s+(?:—|-)\s+dry(?:\s+after\s+bounded\s+re-enumeration)?\)?",
        next_up,
        re.IGNORECASE,
    ):
        errors.append("idle pause requires an empty dry next-up frontier sentinel")
    normalized_resume = " ".join(resume.split()).lower()
    resume_match = re.fullmatch(
        r"restart-on:\s*([a-z-]+(?:\s*,\s*[a-z-]+)*)",
        normalized_resume,
    )
    resume_triggers = (
        [item.strip() for item in resume_match.group(1).split(",")]
        if resume_match
        else []
    )
    if (
        not resume_triggers
        or len(resume_triggers) != len(set(resume_triggers))
        or any(trigger not in RESUME_TRIGGERS for trigger in resume_triggers)
    ):
        errors.append("idle pause requires a structured external resume trigger")
    queue_has_rows, queue_error = _queue_has_active_rows(
        queue_path or path.parent / "QUEUE.md"
    )
    if queue_error:
        errors.append(queue_error)
    elif queue_has_rows:
        errors.append("canonical queue still has PENDING or LEASED rows")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("state", type=Path)
    parser.add_argument("--queue", type=Path)
    parser.add_argument("--quiet", action="store_true")
    args = parser.parse_args()
    errors = validate(args.state, args.queue)
    if errors:
        if not args.quiet:
            for error in errors:
                print(f"ERROR: {error}")
        return 1
    if not args.quiet:
        print(f"PASS: valid idle pause {args.state}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
