#!/usr/bin/env python3
"""Portable heuristic linter for requirements-spec PlantUML diagrams.

This is not a full PlantUML or UML parser and does not encode a course,
document-template or provider-specific profile. Project rules remain
authoritative.
"""
from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass
from pathlib import Path


@dataclass
class Finding:
    level: str  # ERROR or WARN
    message: str


def _strip_comments(text: str) -> str:
    lines: list[str] = []
    for line in text.splitlines():
        if line.lstrip().startswith("'"):
            continue
        lines.append(line)
    return "\n".join(lines)


def _detect_type(text: str) -> str:
    clean = _strip_comments(text)
    if re.search(r"^\s*start\s*$", clean, flags=re.M) or re.search(r"^\s*:\s*.+;\s*$", clean, flags=re.M):
        return "activity"
    if re.search(r"\busecase\s+", clean) or re.search(r"\([^\n()]+\)\s+as\s+UC_", clean):
        return "usecase"
    if re.search(r"\b(package|folder)\s+", clean):
        return "package"
    return "usecase"


def _aliases_by_kind(text: str, kind: str) -> dict[str, str]:
    pattern = re.compile(rf"\b{kind}\s+\"([^\"]+)\"\s+as\s+([A-Za-z0-9_]+)")
    return {alias: label for label, alias in pattern.findall(text)}


def _package_aliases(text: str) -> dict[str, str]:
    pattern = re.compile(r"\b(?:package|folder)\s+\"([^\"]+)\"\s+as\s+([A-Za-z0-9_]+)")
    return {alias: label for label, alias in pattern.findall(text)}


def _action_labels(text: str) -> list[str]:
    return [m.group(1).strip() for m in re.finditer(r"^\s*:\s*(.+?)\s*;\s*$", text, flags=re.M)]


def lint_common(text: str) -> list[Finding]:
    findings: list[Finding] = []
    if "@startuml" not in text:
        findings.append(Finding("ERROR", "Missing @startuml."))
    if "@enduml" not in text:
        findings.append(Finding("ERROR", "Missing @enduml."))
    if re.search(r"<<?\s*extends\s*>?>", text, flags=re.I):
        findings.append(Finding("WARN", "Use the UML stereotype <<extend>>, not <<extends>>."))
    if re.search(r"<<?\s*includes\s*>?>", text, flags=re.I):
        findings.append(Finding("WARN", "Use the UML stereotype <<include>>, not <<includes>>."))
    if re.search(r"\.>[^\n:]+:\s*include\b", text, flags=re.I):
        findings.append(Finding("WARN", "Use the explicit stereotype label <<include>> instead of plain 'include'."))
    if re.search(r"\.>[^\n:]+:\s*extend\b", text, flags=re.I):
        findings.append(Finding("WARN", "Use the explicit stereotype label <<extend>> instead of plain 'extend'."))
    return findings


def lint_package(text: str) -> list[Finding]:
    findings = lint_common(text)
    clean = _strip_comments(text)
    packages = _package_aliases(clean)
    actors = _aliases_by_kind(clean, "actor")

    if not packages:
        findings.append(Finding("ERROR", "Package overview has no `package` or `folder` elements."))
    if not actors:
        findings.append(Finding("WARN", "Package overview has no actors. Confirm this is intentional."))
    if re.search(r"\busecase\s+|\([^)]+\)\s+as\s+UC_", clean):
        findings.append(Finding("ERROR", "A package-only overview should not contain individual use-case ovals; use a separate detailed view or select the usecase type."))

    return findings


def lint_usecase(text: str) -> list[Finding]:
    findings = lint_common(text)
    clean = _strip_comments(text)
    actors = _aliases_by_kind(clean, "actor")
    usecases = _aliases_by_kind(clean, "usecase")

    if not actors:
        findings.append(Finding("WARN", "Use case diagram has no actor declarations."))
    if not usecases and not re.search(r"\([^\n()]+\)\s+as\s+UC_", clean):
        findings.append(Finding("ERROR", "Use case diagram has no usecase declarations."))
    if not re.search(r"\b(rectangle|frame)\s+\"", clean):
        findings.append(Finding("WARN", "Use case diagram should include a named system/package boundary."))

    extend_count = len(re.findall(r"<<\s*extend\s*>>", clean, flags=re.I))
    if extend_count:
        note_on_link_count = len(re.findall(r"note\s+on\s+link", clean, flags=re.I))
        if note_on_link_count < extend_count:
            findings.append(Finding("WARN", "Confirm each <<extend>> condition is recorded in a nearby note or the project's linked textual requirement."))

    # Use-case-to-use-case associations without stereotype.
    for line in clean.splitlines():
        stripped = line.strip()
        # Match UC_ to UC_ with dashed, dotted, or solid arrows.
        if re.search(r"\bUC_[A-Za-z0-9_]+\b\s*([-.]+|<--|<\.\.|<\.|<-)>?\s*\bUC_[A-Za-z0-9_]+\b", stripped):
            if "<<include>>" not in stripped and "<<extend>>" not in stripped and "--|>" not in stripped and "..|>" not in stripped:
                findings.append(Finding("WARN", f"Use-case-to-use-case arrow lacks <<include>>, <<extend>>, or generalisation: `{stripped}`"))

    return findings


def lint_activity(text: str) -> list[Finding]:
    findings = lint_common(text)
    clean = _strip_comments(text)
    start_count = len(re.findall(r"^\s*start\s*$", clean, flags=re.M))
    end_count = len(re.findall(r"^\s*(stop|end|kill|detach)\s*$", clean, flags=re.M))
    actions = _action_labels(clean)
    if start_count == 0:
        findings.append(Finding("ERROR", "Activity diagram has no `start`."))
    elif start_count > 1:
        findings.append(Finding("WARN", f"Activity diagram has {start_count} starting points. Confirm this matches the project's activity semantics."))
    if end_count < 1:
        findings.append(Finding("ERROR", "Activity diagram should have at least one ending point (`stop`, `end`, `kill`, or `detach`)."))
    if not actions:
        findings.append(Finding("ERROR", "Activity diagram has no action nodes (`:Verb Noun;`)."))
    # Empty swimlane detection: a swimlane header followed immediately by another swimlane header
    # (no action lines in between) is a structural defect.
    lane_positions: list[tuple[int, str]] = []
    for i, line in enumerate(clean.splitlines()):
        m = re.match(r"^\s*\|([^|]+)\|\s*$", line)
        if m:
            lane_positions.append((i, m.group(1).strip()))
    for idx, (line_no, lane) in enumerate(lane_positions):
        next_boundary = lane_positions[idx + 1][0] if idx + 1 < len(lane_positions) else len(clean.splitlines())
        block = clean.splitlines()[line_no + 1:next_boundary]
        has_action = any(re.match(r"^\s*:\s*.+;\s*$", b) for b in block)
        has_decision = any(re.match(r"^\s*(if|else|elseif|endif|fork|end fork|end merge|stop|end|start)\b", b) for b in block)
        if not has_action and not has_decision:
            findings.append(Finding("ERROR", f"Swimlane `{lane}` (line {line_no + 1}) contains no actions or control flow. Empty swimlanes are a hard defect — remove the lane or move work into it."))

    if_count = len(re.findall(r"^\s*if\s*\(", clean, flags=re.M))
    endif_count = len(re.findall(r"^\s*endif\b", clean, flags=re.M))
    if if_count != endif_count:
        findings.append(Finding("ERROR", f"Decision blocks not balanced: {if_count} if / {endif_count} endif."))

    for line_no, line in enumerate(clean.splitlines(), start=1):
        if re.match(r"^\s*if\s*\(", line):
            if not re.search(r"\)\s*then\s*\([^)]*\)", line):
                findings.append(Finding("ERROR", f"Line {line_no}: decision must have a labelled question and first guard, e.g. `if (Valid?) then (yes)`."))
        if re.match(r"^\s*else\b", line):
            if not re.search(r"else\s*\([^)]*\)", line):
                findings.append(Finding("ERROR", f"Line {line_no}: else branch must have a guard, e.g. `else (no)`."))
        if re.search(r"^\s*elseif\s*\(", line) and not re.search(r"\)\s*then\s*\([^)]*\)", line):
            findings.append(Finding("ERROR", f"Line {line_no}: elseif branch must have a guard label."))

    forks = len(re.findall(r"^\s*fork\s*$", clean, flags=re.M))
    fork_ends = len(re.findall(r"^\s*end\s+(fork|merge)\s*$", clean, flags=re.M))
    if forks != fork_ends:
        findings.append(Finding("ERROR", f"Fork blocks not balanced: {forks} fork / {fork_ends} end fork|end merge."))

    # A title helps trace the render back to its source requirement.
    if not re.search(r"^title\s+", clean, flags=re.M):
        findings.append(Finding("WARN", "Activity diagram is missing a title. Use the project's identifier and naming convention."))

    return findings


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Heuristically lint portable requirements-spec PlantUML notation.")
    parser.add_argument("path", type=Path, help="PlantUML .puml file")
    parser.add_argument("--type", choices=["auto", "package", "usecase", "activity"], default="auto")
    parser.add_argument("--strict", action="store_true", help="Treat warnings as failures")
    args = parser.parse_args(argv)

    try:
        text = args.path.read_text(encoding="utf-8")
    except Exception as exc:
        print(f"ERROR: could not read {args.path}: {exc}", file=sys.stderr)
        return 2

    diagram_type = _detect_type(text) if args.type == "auto" else args.type
    if diagram_type == "package":
        findings = lint_package(text)
    elif diagram_type == "usecase":
        findings = lint_usecase(text)
    else:
        findings = lint_activity(text)

    print(f"{args.path}: detected {diagram_type} diagram")
    if not findings:
        print("OK: no findings")
        return 0

    for finding in findings:
        stream = sys.stderr if finding.level == "ERROR" else sys.stdout
        print(f"{finding.level}: {finding.message}", file=stream)

    has_error = any(f.level == "ERROR" for f in findings)
    has_warn = any(f.level == "WARN" for f in findings)
    return 1 if has_error or (args.strict and has_warn) else 0


if __name__ == "__main__":
    raise SystemExit(main())
