from __future__ import annotations

import importlib.util
import os
import re
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SKILL_ROOT = ROOT / "skills" / "legal-writing"


def _surface_text() -> str:
    paths = sorted(SKILL_ROOT.rglob("*.md"))
    paths.extend(sorted(SKILL_ROOT.rglob("*.py")))
    return "\n".join(path.read_text(encoding="utf-8") for path in paths)


def test_global_legal_writing_has_no_forum_specific_corpus() -> None:
    text = _surface_text()
    banned = {
        "Queensland": r"\bQueensland\b",
        "QCAT": r"\bQCAT\b",
        "QCATA": r"\bQCATA\b",
        "FCFCOA": r"\bFCFCOA\b",
        "PPN": r"\bPPN\b",
        "PPD": r"\bPPD\b",
        "DVO": r"\bDVO\b",
    }

    for label, pattern in banned.items():
        assert not re.search(pattern, text, re.IGNORECASE), label


def test_global_references_do_not_embed_current_forum_rules() -> None:
    text = "\n".join(
        path.read_text(encoding="utf-8")
        for path in sorted((SKILL_ROOT / "references").glob("*.md"))
    )
    forbidden_rule_shapes = {
        "dated verification snapshot": r"\b(?:verified|current) as (?:at|of) 20\d{2}\b",
        "numeric form recipe": r"\bForm\s+\d+[A-Z]?\b",
        "fixed rule citation": r"\br\s+\d+(?:\.\d+)*(?:\([a-z0-9]+\))*\b",
        "fixed typography requirement": r"(?:≥|at least)\s*\d+(?:\.\d+)?\s*(?:pt|cm)\b",
        "fixed page cap": r"\b\d+[ -]page (?:cap|limit|norm)\b",
    }

    for label, pattern in forbidden_rule_shapes.items():
        assert not re.search(pattern, text, re.IGNORECASE), label


def test_portable_adapter_retains_authority_and_safety_gates() -> None:
    adapter = (SKILL_ROOT / "references" / "forum-and-document-recipes.md").read_text(
        encoding="utf-8"
    )
    verification = (
        SKILL_ROOT / "references" / "verification-and-escalation.md"
    ).read_text(encoding="utf-8")
    safety = (
        SKILL_ROOT / "references" / "family-violence-and-redaction.md"
    ).read_text(encoding="utf-8")

    assert "current official source" in adapter
    assert "This skill supplies no universal page cap" in adapter
    assert "date checked" in adapter
    assert "Drafting and verification do not authorise" in verification
    assert "application, allegation, police-issued instrument, interim measure, final" in safety
    assert "Never assume redaction" in safety


def test_lint_uses_generic_safety_instrument_overstatement_rule() -> None:
    module_path = SKILL_ROOT / "scripts" / "lint_legal_style.py"
    spec = importlib.util.spec_from_file_location("legal_style_lint", module_path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    patterns = dict(module.FAIL_PATTERNS)
    safety_pattern = patterns["safety-instrument overstatement"]
    assert safety_pattern.search("The protection notice proves family violence.")
    assert not safety_pattern.search(
        "The reasons at paragraph 18 establish the finding relied on."
    )


def test_legal_lint_fails_closed_for_missing_or_empty_inputs(tmp_path) -> None:
    script = SKILL_ROOT / "scripts" / "lint_legal_style.py"
    missing = subprocess.run(
        [sys.executable, str(script), str(tmp_path / "missing")],
        capture_output=True,
        text=True,
    )
    assert missing.returncode == 1
    assert "FAIL missing path" in missing.stderr
    assert "FAIL no Markdown files resolved" in missing.stderr

    empty = tmp_path / "empty"
    empty.mkdir()
    rejected = subprocess.run(
        [sys.executable, str(script), str(empty)],
        capture_output=True,
        text=True,
    )
    assert rejected.returncode == 1
    assert "FAIL no Markdown files resolved" in rejected.stderr

    allowed = subprocess.run(
        [sys.executable, str(script), "--allow-empty", str(empty)],
        capture_output=True,
        text=True,
    )
    assert allowed.returncode == 0


def test_legal_lint_fails_closed_for_unreadable_directory(tmp_path) -> None:
    if os.name != "posix":
        return
    script = SKILL_ROOT / "scripts" / "lint_legal_style.py"
    unreadable = tmp_path / "unreadable"
    unreadable.mkdir()
    unreadable.chmod(0)
    try:
        result = subprocess.run(
            [sys.executable, str(script), "--allow-empty", str(unreadable)],
            capture_output=True,
            text=True,
        )
    finally:
        unreadable.chmod(0o700)
    assert result.returncode == 1
    assert "FAIL unreadable directory" in result.stderr
