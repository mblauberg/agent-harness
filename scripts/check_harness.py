#!/usr/bin/env python3
"""Static checks for the global agent harness."""

from __future__ import annotations

import re
from pathlib import Path
import sys

import yaml


ROOT = Path(__file__).resolve().parents[1]
RETIRED_NAMES = {
    "au-legal-writing-style",
    "clear-engineering-writing",
    "clean-writing",
    "eng-docs",
    "humanise-text",
    "multi-agent-orchestration",
    "skill-optimizer",
    "vercel-react-best-practices",
    "wayfinder",
    "write-a-skill",
}


def skill_errors() -> list[str]:
    errors: list[str] = []
    link_pattern = re.compile(r"\[[^]]+\]\(([^)]+)\)")
    for skill in sorted((ROOT / "skills").glob("*/SKILL.md")):
        text = skill.read_text()
        match = re.match(r"^---\n(.*?)\n---\n", text, re.DOTALL)
        if not match:
            errors.append(f"{skill.relative_to(ROOT)}: missing YAML frontmatter")
            continue
        try:
            frontmatter = yaml.safe_load(match.group(1))
        except yaml.YAMLError as exc:
            errors.append(f"{skill.relative_to(ROOT)}: invalid YAML: {exc}")
            continue
        if not isinstance(frontmatter, dict):
            errors.append(f"{skill.relative_to(ROOT)}: frontmatter must be a mapping")
            continue
        expected = skill.parent.name
        if frontmatter.get("name") != expected:
            errors.append(
                f"{skill.relative_to(ROOT)}: name {frontmatter.get('name')!r} != directory {expected!r}"
            )
        description = frontmatter.get("description")
        if not isinstance(description, str) or not description.startswith("Use"):
            errors.append(f"{skill.relative_to(ROOT)}: description must start with 'Use'")
        elif len(description) > 1024:
            errors.append(f"{skill.relative_to(ROOT)}: description exceeds 1024 characters")
        for target in link_pattern.findall(text):
            if target.startswith(("http://", "https://", "#", "/")):
                continue
            relative = target.split("#", 1)[0]
            if relative and not (skill.parent / relative).exists():
                errors.append(f"{skill.relative_to(ROOT)}: broken link {target}")
    return errors


def stale_name_errors() -> list[str]:
    errors: list[str] = []
    roots = [ROOT / "README.md", ROOT / "HARNESS.md", ROOT / "MAINTAINING.md", ROOT / "skills"]
    for root in roots:
        paths = [root] if root.is_file() else root.rglob("*")
        for path in paths:
            if not path.is_file() or ".backups" in path.parts or path.suffix in {".pyc", ".png"}:
                continue
            try:
                text = path.read_text()
            except UnicodeDecodeError:
                continue
            for name in RETIRED_NAMES:
                pattern = rf"(?<![A-Za-z0-9-]){re.escape(name)}(?![A-Za-z0-9-])"
                if re.search(pattern, text):
                    errors.append(f"{path.relative_to(ROOT)}: retired name {name}")
    return errors


def main() -> int:
    errors = skill_errors() + stale_name_errors()
    if errors:
        for error in errors:
            print(f"FAIL: {error}", file=sys.stderr)
        return 1
    count = len(list((ROOT / "skills").glob("*/SKILL.md")))
    print(f"PASS: {count} skills; frontmatter, local links and retired names clean")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
