#!/usr/bin/env python3
"""Validate that an effort map is a link-only route, not a work-state store."""

from __future__ import annotations

import argparse
from pathlib import Path
import re


TITLE_RE = re.compile(r"^# EFFORT:\s*\S.*$")
LINK_RE = re.compile(r"\[[^\]]+\]\([^)]+\)")
ROUTE_ROW_RE = re.compile(r"^-\s+\[[^\]]+\]\([^)]+\)$")
STATEFUL_ROUTE_RE = re.compile(r"^\s*-\s+\[[ xX>]\]\s+")
LIVE_NARRATION_RE = re.compile(
    r"\b(?:status|owner|dependencies?|user gates?)\s*(?:is|are|:)\s*\S+|"
    r"\b(?:blocked by|depends on|waiting on)\b",
    re.IGNORECASE,
)
ROUTE_NARRATION_RE = re.compile(
    r"\b(active|blocked|complete(?:d)?|current|done|in progress|integrated|"
    r"owner|owns|pending|remaining|waiting)\b|\bdepends\s*:",
    re.IGNORECASE,
)
HANDOFF_RE = re.compile(r"\bhandoff\b", re.IGNORECASE)
HEADING_MATCHERS = {
    "destination": lambda line: line == "## Destination",
    "route": lambda line: line == "## Route" or line.startswith("## Route ("),
    "invariants": lambda line: line == "## Invariants" or line.startswith("## Invariants "),
}


def _section(lines: list[str], heading_index: int) -> list[str]:
    start = heading_index + 1
    end = next(
        (index for index in range(start, len(lines)) if lines[index].startswith("## ")),
        len(lines),
    )
    return lines[start:end]


def validate(path: Path) -> list[str]:
    try:
        lines = path.read_text().splitlines()
    except OSError as exc:
        return [f"cannot read work map: {exc}"]

    errors: list[str] = []
    title_indices = [index for index, line in enumerate(lines) if TITLE_RE.fullmatch(line)]
    if len(title_indices) != 1:
        errors.append("work map must contain exactly one # EFFORT title")

    if any(re.match(r"^\s*(Updated|Status):", line, re.IGNORECASE) for line in lines):
        errors.append("work map must not restate live status or freshness")

    prose_without_links = LINK_RE.sub("", "\n".join(lines))
    if LIVE_NARRATION_RE.search(prose_without_links):
        errors.append("work map must not narrate live work state")

    headings: dict[str, int] = {}
    for name, matcher in HEADING_MATCHERS.items():
        matches = [index for index, line in enumerate(lines) if matcher(line)]
        if len(matches) != 1:
            errors.append(f"required {name} heading must appear exactly once")
        else:
            headings[name] = matches[0]
    if len(headings) != len(HEADING_MATCHERS):
        return errors

    if title_indices:
        title_index = title_indices[0]
        if not title_index < headings["destination"] < headings["route"] < headings["invariants"]:
            errors.append("work map sections must follow title, Destination, Route, Invariants order")
        if any(line.strip() for line in lines[:title_index]) or any(
            line.strip() for line in lines[title_index + 1:headings["destination"]]
        ):
            errors.append("work map prelude permits only the title")

    known_heading_indices = set(headings.values())
    extra_headings = [
        line for index, line in enumerate(lines)
        if line.startswith("## ") and index not in known_heading_indices
    ]
    if extra_headings:
        errors.append("work map permits only Destination, Route and Invariants sections")

    route_rows = [
        line.strip()
        for line in _section(lines, headings["route"])
        if line.strip()
    ]
    if not route_rows:
        errors.append("route must contain at least one linked row")
        return errors

    for row in route_rows:
        prose = LINK_RE.sub("", row)
        if STATEFUL_ROUTE_RE.match(row):
            errors.append("route rows must not encode live state with checkboxes")
        if not LINK_RE.search(row):
            errors.append(f"route row must contain a link: {row}")
        if not ROUTE_ROW_RE.fullmatch(row):
            errors.append(f"route section permits only link rows: {row}")
        if ROUTE_NARRATION_RE.search(prose):
            errors.append(f"route rows must link, not narrate live state: {row}")
        if HANDOFF_RE.search(prose):
            errors.append(f"temporary handoffs stay outside route maps: {row}")

    invariant_rows = [
        line.strip()
        for line in _section(lines, headings["invariants"])
        if line.strip()
    ]
    if not invariant_rows:
        errors.append("invariants must contain at least one linked row")
    for row in invariant_rows:
        if not ROUTE_ROW_RE.fullmatch(row):
            errors.append(f"invariants section permits only link rows: {row}")

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
    print(f"PASS: valid link-only work map {args.path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
