#!/usr/bin/env python3
"""Validate structural invariants shared by current and newly authored work maps."""

from __future__ import annotations

import argparse
from datetime import date, datetime
from pathlib import Path
import re


INLINE_HEADER_RE = re.compile(
    r"^# EFFORT:\s*.+?\s+Updated:\s*(.+?)\s+Status:\s*(.+?)\s*$"
)
TITLE_RE = re.compile(r"^# EFFORT:\s*\S.*$")
UPDATED_RE = re.compile(r"^Updated:\s*(\S.*)$")
STATUS_RE = re.compile(r"^Status:\s*(\S.*)$")
ROUTE_RE = re.compile(r"^\s*-\s+\[([x> ])\]\s+(.+?)\s*$")
HANDOFF_RE = re.compile(
    r"\bhandoff\s*:\s*(\[[^\]]+\]\([^)]+\)|\S+)", re.IGNORECASE
)
DAY_PREFIX_RE = re.compile(
    r"^(\d{4}-\d{2}-\d{2}|\d{1,2}\s+[A-Za-z]+\s+\d{4})(?:\s|:)"
)
HEADING_MATCHERS = {
    "destination": lambda line: line == "## Destination",
    "route": lambda line: line == "## Route" or line.startswith("## Route ("),
    "invariants": lambda line: line == "## Invariants" or line.startswith("## Invariants "),
    "trail": lambda line: line == "## Trail" or line.startswith("## Trail ("),
}


def _section(lines: list[str], heading_index: int) -> list[str]:
    start = heading_index + 1
    end = next(
        (index for index in range(start, len(lines)) if lines[index].startswith("## ")),
        len(lines),
    )
    return lines[start:end]


def _day(value: str) -> date | None:
    try:
        return date.fromisoformat(value)
    except ValueError:
        pass
    for pattern in ("%d %B %Y", "%d %b %Y"):
        try:
            return datetime.strptime(value, pattern).date()
        except ValueError:
            continue
    return None


def _route_rows(lines: list[str]) -> list[tuple[str, str]]:
    rows: list[tuple[str, str]] = []
    state = ""
    text = ""
    for line in lines:
        match = ROUTE_RE.fullmatch(line)
        if match:
            if state:
                rows.append((state, text))
            state, text = match.groups()
        elif state and line.strip() and not line.lstrip().startswith("-"):
            text += " " + line.strip()
    if state:
        rows.append((state, text))
    return rows


def _posture(value: str) -> str:
    normalised = value.strip().lower()
    if re.match(r"^(done|complete(?:d)?|closed|archived)\b", normalised):
        return "done"
    if re.match(r"^blocked\b", normalised):
        return "blocked"
    return "active"


def _header(lines: list[str], errors: list[str]) -> str | None:
    nonempty = [(index, line) for index, line in enumerate(lines) if line.strip()]
    if not nonempty:
        errors.append("work map is empty")
        return None
    first_index, first = nonempty[0]
    inline = INLINE_HEADER_RE.fullmatch(first)
    if inline:
        updated, status = inline.groups()
    else:
        if not TITLE_RE.fullmatch(first) or sum(bool(TITLE_RE.fullmatch(line)) for line in lines) != 1:
            errors.append("work map must contain exactly one # EFFORT title")
            return None
        prelude_end = next(
            (index for index in range(first_index + 1, len(lines)) if lines[index].startswith("## ")),
            len(lines),
        )
        updated_rows = [
            match.group(1)
            for line in lines[first_index + 1:prelude_end]
            if (match := UPDATED_RE.fullmatch(line))
        ]
        status_rows = [
            match.group(1)
            for line in lines[first_index + 1:prelude_end]
            if (match := STATUS_RE.fullmatch(line))
        ]
        if len(updated_rows) != 1 or len(status_rows) != 1:
            errors.append("work map needs one Updated line and one Status line before sections")
            return None
        updated, status = updated_rows[0], status_rows[0]
    if _day(updated) is None:
        errors.append("Updated must be an ISO or day-month-name date")
    return _posture(status)


def validate(path: Path) -> list[str]:
    try:
        lines = path.read_text().splitlines()
    except OSError as exc:
        return [f"cannot read work map: {exc}"]

    errors: list[str] = []
    status = _header(lines, errors)
    headings: dict[str, int] = {}
    for name, matcher in HEADING_MATCHERS.items():
        matches = [index for index, line in enumerate(lines) if matcher(line)]
        if len(matches) != 1:
            errors.append(f"required {name} heading must appear exactly once")
        else:
            headings[name] = matches[0]
    if len(headings) != len(HEADING_MATCHERS):
        return errors

    route_rows = _route_rows(_section(lines, headings["route"]))
    if not route_rows:
        errors.append("route must contain at least one [x], [>] or [ ] leg")
    active = [row for state, row in route_rows if state == ">"]
    pending = [row for state, row in route_rows if state == " "]
    completed = [row for state, row in route_rows if state == "x"]

    if len(active) > 1:
        errors.append("map permits at most one active [>] leg")
    if status == "done" and (active or pending):
        errors.append("done map cannot contain active [>] or pending [ ] legs")
    for row in active:
        if not HANDOFF_RE.search(row):
            errors.append("active [>] leg must name a non-empty handoff target")
    for row in completed:
        if re.search(r"\bhandoff\b", row, re.IGNORECASE):
            errors.append("completed [x] leg still names a handoff")

    trail_lines = [
        line.strip()[2:]
        for line in _section(lines, headings["trail"])
        if line.strip().startswith("- ")
    ]
    if len(trail_lines) > 20:
        errors.append("trail exceeds 20 curated route transitions")
    trail_days: list[date] = []
    for line in trail_lines:
        match = DAY_PREFIX_RE.match(line)
        parsed = _day(match.group(1)) if match else None
        if parsed is None:
            errors.append(f"trail row must begin with a valid date: {line}")
        else:
            trail_days.append(parsed)
    if any(later > earlier for earlier, later in zip(trail_days, trail_days[1:])):
        errors.append("trail must be newest first")

    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("path", type=Path)
    args = parser.parse_args()
    errors = validate(args.path)
    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        return 1
    print(f"PASS: valid work map {args.path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
