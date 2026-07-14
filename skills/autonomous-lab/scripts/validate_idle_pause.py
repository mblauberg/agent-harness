#!/usr/bin/env python3
"""Validate that a PAUSED lab state is a real, resumable idle-frontier pause."""

from __future__ import annotations

import argparse
from pathlib import Path
import re


FIELD_RE = {
    name: re.compile(rf"^- \*\*{re.escape(name)}:\*\*\s*(.+?)\s*$", re.MULTILINE)
    for name in ("Run status", "Orchestrator lease", "In flight", "Next up", "Resume protocol")
}
IDLE_QUEUE_STATUSES = {
    "DECIDED", "FORKED", "FOLDED", "MERGED", "DEFERRED",
    "HUMAN-TIE-BREAK",
}
RESUME_TRIGGERS = {
    "human-directive",
    "gate-answer",
    "external-completion",
    "material-change",
    "explicit-restart",
}
QUEUE_HEADER = ("item", "status", "depends on", "scope / next evidence")
QUEUE_TIERS_HEADING = "## Tiers (dependency-ordered; tier-0 = foundational one-way-doors)"


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


def _ledger_has_in_flight_rows(path: Path) -> tuple[bool, str | None]:
    try:
        text = path.read_text()
    except OSError as exc:
        return False, f"cannot read canonical run ledger: {exc}"
    section = _section(text, "In-flight")
    if not section:
        return False, "canonical run ledger lacks an In-flight section"
    for line in section.splitlines():
        value = line.strip()
        if not value.startswith("|"):
            continue
        cells = [cell.strip() for cell in value.strip("|").split("|")]
        if not cells or cells[0].lower() == "run-id":
            continue
        if all(re.fullmatch(r"-+", cell) for cell in cells):
            continue
        if any(cells):
            return True, None
    return False, None


def _queue_has_selectable_rows(path: Path) -> tuple[bool, str | None]:
    try:
        text = path.read_text()
    except OSError as exc:
        return False, f"cannot read canonical decision queue: {exc}"
    tier_headings = [
        line
        for line in text.splitlines()
        if re.match(r"^##(?!#)\s*tiers", line, re.IGNORECASE)
    ]
    if tier_headings != [QUEUE_TIERS_HEADING]:
        return False, "canonical decision queue must contain exactly one canonical Tiers heading"
    match = re.search(
        rf"^{re.escape(QUEUE_TIERS_HEADING)}\n(.*?)(?=^## |\Z)",
        text,
        re.MULTILINE | re.DOTALL,
    )
    if not match:
        return False, "canonical decision queue lacks a Tiers section"
    section = re.sub(r"<!--.*?-->", "", match.group(1), flags=re.DOTALL)
    tier_seen = False
    has_schema = False
    awaiting_separator = False
    for line in section.splitlines():
        value = line.strip()
        if not value:
            continue
        if value.startswith("### "):
            if not re.fullmatch(r"### Tier \S.*", value):
                return False, "canonical decision queue has unparseable tier content"
            if tier_seen and (awaiting_separator or not has_schema):
                return False, "canonical decision queue has unparseable tier content"
            tier_seen = True
            has_schema = False
            awaiting_separator = False
            continue
        if value == "(none yet)":
            return False, "canonical decision queue has unparseable tier content"
        if not tier_seen:
            return False, "canonical decision queue has unparseable tier content"
        if not value.startswith("|") or not value.endswith("|"):
            return False, "canonical decision queue has unparseable tier content"
        cells = [
            cell.strip().replace(r"\|", "|")
            for cell in re.split(r"(?<!\\)\|", value[1:-1])
        ]
        if len(cells) != len(QUEUE_HEADER):
            return False, "canonical decision queue has unparseable tier content"
        normalized_cells = tuple(cell.lower() for cell in cells)
        if normalized_cells == QUEUE_HEADER:
            if awaiting_separator or has_schema:
                return False, "canonical decision queue has unparseable tier content"
            awaiting_separator = True
            has_schema = False
            continue
        if all(re.fullmatch(r":?-{3,}:?", cell) for cell in cells):
            if not awaiting_separator:
                return False, "canonical decision queue has unparseable tier content"
            awaiting_separator = False
            has_schema = True
            continue
        if not has_schema or awaiting_separator:
            return False, "canonical decision queue has unparseable tier content"
        status = cells[1].strip("`").upper()
        dispositions = [part.strip() for part in status.split("/")]
        if not dispositions or any(
            disposition not in IDLE_QUEUE_STATUSES
            and not disposition.endswith("-GATED")
            for disposition in dispositions
        ):
            return True, None
    if not tier_seen or awaiting_separator or not has_schema:
        return False, "canonical decision queue has unparseable tier content"
    return False, None


def validate(
    path: Path,
    runs_path: Path | None = None,
    queue_path: Path | None = None,
) -> list[str]:
    try:
        text = path.read_text()
    except OSError as exc:
        return [f"cannot read state: {exc}"]

    status = _field(text, "Run status", "Run status")
    lease = _field(text, "Orchestrator lease", "Run status", "ORCHESTRATOR LEASE")
    in_flight = _field(text, "In flight", "In flight")
    next_up = _field(text, "Next up", "Next up")
    resume = _field(text, "Resume protocol", "Run status", "RESUME PROTOCOL")
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
    has_rows, ledger_error = _ledger_has_in_flight_rows(
        runs_path or path.parent / ".orchestrator" / "runs.md"
    )
    if ledger_error:
        errors.append(ledger_error)
    elif has_rows:
        errors.append("canonical run ledger still has in-flight work")
    queue_has_rows, queue_error = _queue_has_selectable_rows(
        queue_path or path.parent / "DECISION_QUEUE.md"
    )
    if queue_error:
        errors.append(queue_error)
    elif queue_has_rows:
        errors.append("canonical decision queue still has selectable work")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("state", type=Path)
    parser.add_argument("--runs", type=Path)
    parser.add_argument("--queue", type=Path)
    parser.add_argument("--quiet", action="store_true")
    args = parser.parse_args()
    errors = validate(args.state, args.runs, args.queue)
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
