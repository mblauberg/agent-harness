#!/usr/bin/env python3
"""Render the README skill catalogue and headline count from the skills on disk."""

from __future__ import annotations

import argparse
from collections import Counter
import difflib
from pathlib import Path
import re
import sys


ROOT = Path(__file__).resolve().parents[1]
README_PATH = ROOT / "README.md"
SKILLS_DIR = ROOT / "skills"
START_MARKER = "<!-- skill-catalogue:start -->"
END_MARKER = "<!-- skill-catalogue:end -->"
# skills/_shared holds resources reused by several skills. It has no SKILL.md and
# the installer never links it, so it is not a skill and never appears in the count.
NOT_A_SKILL = {"_shared"}
AREA_ROW = re.compile(r"^\|\s*(?P<area>[^|]+?)\s*\|\s*(?P<skills>.+?)\s*\|\s*$")
SKILL_LINK = re.compile(r"`(?P<name>[a-z0-9][a-z0-9-]*)`\]\(skills/(?P<dir>[a-z0-9][a-z0-9-]*)/SKILL\.md\)")
FENCE = re.compile(r"^\s*(```|~~~)")
# Any number a reader would take as "how many skills there are". The number and the
# noun may be separated by adjectives: the drift this gate exists to stop ("34 reusable
# Agent Skills") survived an adjacency-only pattern precisely because "reusable" sat in
# the gap. The gap admits lowercase words only, so punctuation ends it and unrelated
# numbers ("Python 3.11+ ... an Agent Skills client") cannot be captured across it.
COUNT_CLAIM = re.compile(
    r"\b(?P<count>\d+)(?P<gap>[- ](?:[a-z]+[- ]){0,3})(?P<noun>Agent Skills|skills|skill)\b"
)


class CatalogueError(ValueError):
    pass


def installed_skills() -> list[str]:
    """The single source of truth: one directory with a SKILL.md is one skill."""
    if not SKILLS_DIR.is_dir():
        raise CatalogueError(f"missing skills directory: {SKILLS_DIR}")
    names = sorted(
        path.parent.name
        for path in SKILLS_DIR.glob("*/SKILL.md")
        if path.parent.name not in NOT_A_SKILL
    )
    if not names:
        raise CatalogueError("no skills found on disk")
    return names


def split_readme(text: str) -> tuple[str, str, str]:
    # Exactly one pair. A second block would sit outside the rendered region and drift
    # unchecked, which is the same class of bug as an unguarded headline integer.
    starts, ends = text.count(START_MARKER), text.count(END_MARKER)
    if starts != 1 or ends != 1:
        raise CatalogueError(
            f"README needs exactly one {START_MARKER} / {END_MARKER} pair, "
            f"found {starts} start and {ends} end markers"
        )
    start, end = text.find(START_MARKER), text.find(END_MARKER)
    if end < start:
        raise CatalogueError(f"README has {END_MARKER} before {START_MARKER}")
    return text[: start + len(START_MARKER)], text[start + len(START_MARKER) : end], text[end:]


def parse_areas(block: str) -> list[tuple[str, list[str]]]:
    """Read the Area groupings out of the current catalogue. Areas and their order
    are editorial, so the generator preserves them instead of inventing its own."""
    areas: list[tuple[str, list[str]]] = []
    for line in block.splitlines():
        row = AREA_ROW.match(line)
        if not row:
            continue
        area = row.group("area")
        if area in {"Area", "---"} or set(area) <= {"-", ":"}:
            continue
        names = []
        for link in SKILL_LINK.finditer(row.group("skills")):
            if link.group("name") != link.group("dir"):
                raise CatalogueError(f"catalogue link for {link.group('name')} points at skills/{link.group('dir')}")
            names.append(link.group("name"))
        if names:
            areas.append((area, names))
    if not areas:
        raise CatalogueError("catalogue has no Area rows to preserve")
    # Cardinality, not membership. A skill listed twice keeps the set identical while
    # the table lies about the library, so compare counts and refuse duplicates.
    listed = Counter(name for _, names in areas for name in names)
    duplicated = sorted(name for name, times in listed.items() if times > 1)
    if duplicated:
        raise CatalogueError(f"catalogue lists these skill(s) more than once: {', '.join(duplicated)}")
    return areas


def assign(skills: list[str], areas: list[tuple[str, list[str]]]) -> list[tuple[str, list[str]]]:
    """Keep each area's editorial order, drop skills that left the tree, and refuse
    to guess an area for a skill that has none."""
    known = {name: area for area, names in areas for name in names}
    orphans = [name for name in skills if name not in known]
    if orphans:
        listed = ", ".join(orphans)
        raise CatalogueError(
            f"no Area for skill(s) on disk: {listed}. "
            f"Add each to an Area row between the {START_MARKER} and {END_MARKER} "
            "markers in README.md, then re-run this script."
        )
    on_disk = set(skills)
    return [(area, [name for name in names if name in on_disk]) for area, names in areas]


def render_block(assigned: list[tuple[str, list[str]]], count: int) -> str:
    lines = [
        "",
        "<details>",
        f"<summary>All {count} skills</summary>",
        "",
        "| Area | Skills |",
        "|---|---|",
    ]
    for area, names in assigned:
        if not names:
            continue
        cells = ", ".join(f"[`{name}`](skills/{name}/SKILL.md)" for name in names)
        lines.append(f"| {area} | {cells} |")
    lines += ["", "</details>", ""]
    return "\n".join(lines)


def render_counts(text: str, count: int) -> tuple[str, int]:
    """Rewrite every stated skill count in prose, and report how many were found.
    Fenced blocks are sample output, so they are left alone."""
    lines = text.splitlines(keepends=True)
    fenced = False
    claims = 0
    for index, line in enumerate(lines):
        if FENCE.match(line):
            fenced = not fenced
            continue
        if fenced:
            continue
        claims += len(COUNT_CLAIM.findall(line))
        lines[index] = COUNT_CLAIM.sub(
            lambda match: f"{count}{match.group('gap')}{match.group('noun')}", line
        )
    return "".join(lines), claims


def render(text: str) -> tuple[str, int, int]:
    skills = installed_skills()
    head, block, tail = split_readme(text)
    assigned = assign(skills, parse_areas(block))
    rendered_head, head_claims = render_counts(head, len(skills))
    rendered_tail, tail_claims = render_counts(tail, len(skills))
    # Fail closed. A README that states no count at all cannot drift, but it also
    # cannot be checked: silence would make this gate pass by saying nothing, which
    # is the failure mode it exists to prevent.
    if head_claims + tail_claims == 0:
        raise CatalogueError(
            "README states no skill count in prose, so the headline cannot be verified. "
            "State the count (for example '33 Agent Skills') outside a fenced block."
        )
    rendered = rendered_head + render_block(assigned, len(skills)) + rendered_tail
    return rendered, len(skills), sum(1 for _, names in assigned if names)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check",
        action="store_true",
        help="report drift and exit non-zero without writing anything",
    )
    parser.add_argument("--readme", type=Path, default=README_PATH)
    args = parser.parse_args(argv)
    try:
        current = args.readme.read_text()
        rendered, count, areas = render(current)
    except (OSError, CatalogueError) as exc:
        print(f"FAIL: {exc}", file=sys.stderr)
        return 1
    name = args.readme.name
    if args.check:
        if rendered != current:
            diff = difflib.unified_diff(
                current.splitlines(keepends=True),
                rendered.splitlines(keepends=True),
                fromfile=f"{name} (on disk)",
                tofile=f"{name} (rendered from skills/)",
            )
            sys.stdout.writelines(diff)
            print(
                f"FAIL: {name} skill catalogue is stale; run scripts/render_skill_catalogue.py",
                file=sys.stderr,
            )
            return 1
        print(f"PASS: {name} catalogue and headline count match {count} skills in {areas} areas")
        return 0
    if rendered != current:
        args.readme.write_text(rendered)
        print(f"rendered: {name} updated to {count} skills in {areas} areas")
    else:
        print(f"rendered: {name} already matches {count} skills in {areas} areas")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
