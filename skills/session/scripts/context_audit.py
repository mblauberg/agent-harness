#!/usr/bin/env python3
"""Read-only audit of project context, logs, handoffs and agent scratch."""

from __future__ import annotations

import argparse
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import sys


SKIP_PARTS = {".git", ".worktrees", "node_modules", ".venv", "venv", ".backups", "archive"}
SCRATCH_NAMES = re.compile(r"^(?:\.temp|temp[-_.]|scratch[-_.]|.*\.(?:tmp|scratch|bak|orig)|.*\.bak[-_.].*)", re.I)
FRESHNESS = re.compile(r"^(?:updated|last updated|last verified|as of)\s*:\s*(\S+)", re.I | re.M)
HANDOFF_FIELD = re.compile(r"^(?:-\s*)?(?:\*\*)?(Status|Effort|Leg|Supersedes|Consumed-at)(?:\*\*)?\s*:\s*(.+?)\s*$", re.I | re.M)


@dataclass(frozen=True)
class Finding:
    severity: str
    code: str
    path: str
    detail: str


def skipped(path: Path, root: Path) -> bool:
    rel = path.relative_to(root)
    parts = set(rel.parts)
    return bool(parts & SKIP_PARTS)


def is_hot_markdown(path: Path, root: Path) -> bool:
    rel = path.relative_to(root)
    return path.name in {"SKILL.md", "AGENTS.md", "CLAUDE.md", "STATE.md"} or "docs" in rel.parts or "handoffs" in rel.parts


def has_freshness(text: str) -> bool:
    match = FRESHNESS.search(text)
    if not match or match.group(1).startswith("<"):
        return False
    value = match.group(1)
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return parsed.tzinfo is not None
    except ValueError:
        return False


def audit(
    root: Path,
    *,
    max_markdown_kb: int = 15,
    max_log_mb: int = 5,
    max_state_lines: int = 120,
    stale_handoff_days: int = 30,
    now: datetime | None = None,
) -> list[Finding]:
    root = root.resolve()
    now = now or datetime.now(timezone.utc)
    findings: list[Finding] = []

    for path in root.rglob("*"):
        if not path.is_file() or skipped(path, root):
            continue
        rel = path.relative_to(root).as_posix()
        try:
            size = path.stat().st_size
        except OSError:
            continue

        if path.suffix.lower() == ".md" and is_hot_markdown(path, root) and size > max_markdown_kb * 1024:
            findings.append(Finding("warning", "large-agent-doc", rel, f"{size} bytes exceeds {max_markdown_kb} KiB split/merge signal"))
        if path.suffix.lower() in {".log", ".jsonl"} and size > max_log_mb * 1024 * 1024:
            findings.append(Finding("warning", "large-raw-log", rel, f"{size} bytes exceeds {max_log_mb} MiB rotation/retention signal"))
        if path.parent == root and SCRATCH_NAMES.match(path.name):
            findings.append(Finding("warning", "root-scratch", rel, "unscoped repo-root scratch candidate; inspect ownership before removal"))

        if path.name == "STATE.md":
            try:
                lines = path.read_text(errors="replace").splitlines()
            except OSError:
                continue
            if len(lines) > max_state_lines:
                findings.append(Finding("warning", "state-over-cap", rel, f"{len(lines)} lines exceeds {max_state_lines}"))
            if not has_freshness("\n".join(lines[:12])):
                findings.append(Finding("warning", "state-freshness-missing", rel, "no anchored Updated/Last verified/As of field in first 12 lines"))

        if "handoffs" in path.parts:
            age_days = (now - datetime.fromtimestamp(path.stat().st_mtime, timezone.utc)).days
            if age_days > stale_handoff_days:
                findings.append(Finding("warning", "stale-live-handoff", rel, f"{age_days} days old; archive if consumed"))

    run_dirs: set[Path] = set()
    for run_root in root.rglob(".agent-run"):
        if run_root.is_dir() and not skipped(run_root, root):
            run_dirs.update(path for path in run_root.iterdir() if path.is_dir())
    for work_root in root.rglob(".work"):
        wf_root = work_root / "wf"
        if not wf_root.is_dir() or skipped(work_root, root):
            continue
        for workflow_dir in wf_root.iterdir():
            if workflow_dir.is_dir():
                run_dirs.update(path for path in workflow_dir.iterdir() if path.is_dir())
    for run_dir in sorted(run_dirs):
        rel = run_dir.relative_to(root).as_posix()
        required = ["MANIFEST.md", "RUN_RECEIPT.json", "SYNTHESIS.md", "FINAL_GATE.md"]
        if run_dir.parent.name in {"implement", "change"}:  # retain legacy run readability
            required.append("RUN.json")
        missing = [
            name
            for name in required
            if not (run_dir / name).is_file()
        ]
        if missing:
            findings.append(Finding("error", "incomplete-run-index", rel, "missing " + ", ".join(missing)))

    active_handoffs: dict[tuple[str, str], str] = {}
    for path in root.rglob("HANDOFF-*.md"):
        if not path.is_file() or skipped(path, root):
            continue
        rel_path = path.relative_to(root)
        rel = rel_path.as_posix()
        try:
            fields = {key.lower(): value.strip().lower() for key, value in HANDOFF_FIELD.findall(path.read_text(errors="replace")[:4096])}
        except OSError:
            continue
        missing_fields = {"status", "effort", "leg", "supersedes", "consumed-at"} - set(fields)
        if missing_fields:
            findings.append(Finding("error", "handoff-metadata-missing", rel, "missing " + ", ".join(sorted(missing_fields))))
        status = fields.get("status")
        if status not in {"active", "consumed"}:
            continue
        archived = "archive" in rel_path.parts
        if status == "consumed" and not archived:
            findings.append(Finding("error", "consumed-handoff-live", rel, "consumed handoff must move to the archive"))
        if status == "consumed" and fields.get("consumed-at", "pending") in {"", "pending", "none"}:
            findings.append(Finding("error", "consumed-handoff-date-missing", rel, "consumed handoff must record Consumed-at"))
        if status == "active" and archived:
            findings.append(Finding("error", "active-handoff-archived", rel, "active handoff must stay in the live handoff directory"))
        effort = fields.get("effort", "none")
        leg = fields.get("leg", "none")
        key = (effort, leg)
        if status == "active" and not archived and key != ("none", "none"):
            if key in active_handoffs:
                findings.append(Finding("error", "duplicate-active-handoff", rel, f"same effort/leg as {active_handoffs[key]}"))
            else:
                active_handoffs[key] = rel

    return sorted(findings, key=lambda item: (item.severity, item.code, item.path))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("root", nargs="?", default=".", type=Path)
    parser.add_argument("--max-markdown-kb", type=int, default=15)
    parser.add_argument("--max-log-mb", type=int, default=5)
    parser.add_argument("--max-state-lines", type=int, default=120)
    parser.add_argument("--stale-handoff-days", type=int, default=30)
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--strict", action="store_true", help="exit 1 on structural errors")
    parser.add_argument("--warnings-as-errors", action="store_true", help="also fail on advisory signals")
    args = parser.parse_args(argv)
    if not args.root.is_dir():
        print(f"context audit root is not a directory: {args.root}", file=sys.stderr)
        return 2
    findings = audit(
        args.root,
        max_markdown_kb=args.max_markdown_kb,
        max_log_mb=args.max_log_mb,
        max_state_lines=args.max_state_lines,
        stale_handoff_days=args.stale_handoff_days,
    )
    if args.json:
        print(json.dumps({"root": str(args.root.resolve()), "findings": [asdict(item) for item in findings]}, indent=2))
    elif findings:
        for item in findings:
            print(f"{item.severity}: {item.code}: {item.path}: {item.detail}")
    else:
        print("clean: no context-hygiene signals")
    has_errors = any(item.severity == "error" for item in findings)
    return 1 if has_errors or (args.warnings_as_errors and findings) else 0


if __name__ == "__main__":
    raise SystemExit(main())
