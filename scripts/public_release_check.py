#!/usr/bin/env python3
"""Fail closed on common mistakes before this harness is published."""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
REQUIRED = {
    "README.md",
    "LICENSE",
    "MAINTAINING.md",
    "SECURITY.md",
    "THIRD_PARTY_NOTICES.md",
    "docs/ARCHITECTURE.md",
    "docs/worktrees.md",
}
FORBIDDEN_TRACKED = {
    ".DS_Store",
    ".claude/settings.local.json",
    "plugins/marketplace.json",
}
FORBIDDEN_PREFIXES = (
    ".agent-run/",
    ".worktrees/",
    ".pytest_cache/",
    "skills/tanstack-query-best-practices/",  # upstream publishes no licence
)
HOME_PATH = re.compile(r"/(?:Users|home)/[A-Za-z0-9._-]+/")
SECRET_PATTERNS = {
    "private key": re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----"),
    "GitHub token": re.compile(r"\b(?:gh[opusr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})\b"),
    "OpenAI key": re.compile(r"\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b"),
    "Anthropic key": re.compile(r"\bsk-ant-[A-Za-z0-9_-]{20,}\b"),
    "AWS access key": re.compile(r"\bAKIA[0-9A-Z]{16}\b"),
}
PERSONAL_EMAIL = re.compile(r"@(?:gmail|outlook|hotmail|icloud|yahoo)\.[A-Za-z.]+$", re.I)


def git(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", *args], cwd=ROOT, text=True, stdout=subprocess.PIPE,
        stderr=subprocess.PIPE, check=False,
    )


def tracked_files() -> list[str]:
    result = git("ls-files", "-z")
    if result.returncode:
        raise RuntimeError(result.stderr.strip() or "git ls-files failed")
    return [value for value in result.stdout.split("\0") if value]


def scan_paths(paths: list[str], root: Path = ROOT) -> list[str]:
    errors: list[str] = []
    for required in sorted(REQUIRED):
        if not (root / required).is_file():
            errors.append(f"missing required public file: {required}")
    for relative in paths:
        if relative in FORBIDDEN_TRACKED or any(relative.startswith(p) for p in FORBIDDEN_PREFIXES):
            errors.append(f"forbidden tracked path: {relative}")
            continue
        path = root / relative
        if path.is_symlink():
            errors.append(f"tracked symlink is not portable: {relative}")
            continue
        if not path.is_file():
            continue
        if path.stat().st_size > 5 * 1024 * 1024:
            errors.append(f"tracked file exceeds 5 MiB: {relative}")
            continue
        try:
            text = path.read_text()
        except (UnicodeDecodeError, OSError):
            continue
        if HOME_PATH.search(text):
            errors.append(f"personal absolute home path: {relative}")
        for label, pattern in SECRET_PATTERNS.items():
            if pattern.search(text):
                errors.append(f"possible {label}: {relative}")
    return errors


def history_errors() -> list[str]:
    errors: list[str] = []
    commits = git("rev-list", "--all")
    if commits.returncode:
        return [commits.stderr.strip() or "git rev-list failed"]
    revisions = [line for line in commits.stdout.splitlines() if line]
    if revisions:
        grep = git("grep", "-I", "-n", "-E", r"/(Users|home)/[A-Za-z0-9._-]+/", *revisions)
        if grep.returncode == 0:
            errors.append("reachable history contains a personal absolute home path")
        elif grep.returncode not in (0, 1):
            errors.append(grep.stderr.strip() or "history path scan failed")
    authors = git("log", "--all", "--format=%ae")
    if authors.returncode:
        errors.append(authors.stderr.strip() or "author scan failed")
    else:
        for email in sorted(set(authors.stdout.splitlines())):
            if PERSONAL_EMAIL.search(email.strip()):
                errors.append(f"reachable history exposes a personal email: {email.strip()}")
    return errors


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--history", action="store_true", help="scan all reachable commits too")
    args = parser.parse_args(argv)
    try:
        errors = scan_paths(tracked_files())
    except RuntimeError as exc:
        errors = [str(exc)]
    if args.history:
        errors.extend(history_errors())
    if errors:
        for error in errors:
            print(f"FAIL: {error}", file=sys.stderr)
        return 1
    print("PASS: public tree" + (" and reachable history" if args.history else "") + " clean")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
