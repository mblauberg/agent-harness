#!/usr/bin/env python3
"""Scan engineering prose (Markdown, plain text, reST) for style hazards that
are cheap to detect: em dashes, US spellings, AI-style phrasing, chatbot
framing, internal process language, placeholders, and hyphenation hazards.

Thin wrapper around the shared engine owned by `natural-writing`
(`skills/natural-writing/scripts/style_lint.py`): this file supplies only the
engineering-specific phrase overlay (chatbot framing, throat-clearing, vague
authority, internal process language) and the curly-quote-in-code check.

Findings are prompts for review, not proof of a defect. The checker cannot
see flat rhythm, noun-stacking, uniform confidence, comma-gloss definitions,
or implicit-completion tense; those need the human passes in the references
(engineer-voice.md, style-standard.md, and the natural-writing hub). Silence
is necessary, not sufficient.
"""

from __future__ import annotations

import importlib.util
import re
import sys
from pathlib import Path

_STYLE_LINT_PATH = Path(__file__).resolve().parents[2] / "natural-writing" / "scripts" / "style_lint.py"
_spec = importlib.util.spec_from_file_location("style_lint", _STYLE_LINT_PATH)
assert _spec and _spec.loader
style_lint = importlib.util.module_from_spec(_spec)
sys.modules.setdefault("style_lint", style_lint)
_spec.loader.exec_module(style_lint)


ENGINEERING_EXTRA_PHRASES: dict[str, list[str]] = {
    "Chatbot framing": [
        "great question",
        "let's dive in",
        "i hope this helps",
        "you're absolutely right",
        "here's what you need to know",
        "in today's fast-paced world",
        "as an ai language model",
    ],
    "Throat-clearing or meta-discourse": [
        "it is important to note",
        "it should be noted",
        "it is worth noting",
        "it is worth mentioning",
        "as previously mentioned",
        "in this document we will",
        "this section explains",
        "this document describes",
        "we will now discuss",
    ],
    "Vague authority (name the source)": [
        "industry reports suggest",
        "it is widely accepted",
        "observers note",
        "experts agree",
    ],
    "Internal process language (translate to the engineering fact)": [
        "the subagent",
        "gate fired",
        "per the manifest",
        "the workflow ran",
        "oai_citation",
        "oaicite",
        "contentreference",
        "attributableindex",
        "turn0search",
        "utm_source=chatgpt.com",
    ],
}

ENGINEERING_EXTRA_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("Spaced en dash parenthetical (use other punctuation)", re.compile(" – ")),
    (
        "Placeholder (defect if deliverable-facing)",
        re.compile(r"\b(TODO|TBD|TBC|FIXME|XXX|insert (?:value|result|name)|drafting note)\b"),
    ),
]

PHRASES = {**style_lint.BASE_PHRASES, **ENGINEERING_EXTRA_PHRASES}
PATTERNS = style_lint.BASE_PATTERNS + ENGINEERING_EXTRA_PATTERNS


def _curly_quote_findings(path: Path) -> list[tuple[int, int, str, str]]:
    """Curly quotes inside code break copy-paste; only flagged within code spans."""
    text = path.read_text(encoding="utf-8")
    code_spans: list[tuple[int, int]] = []
    code_spans.extend((m.start(), m.end()) for m in re.finditer(r"```.*?```", text, re.S))
    code_spans.extend((m.start(), m.end()) for m in re.finditer(r"`[^`\n]+`", text))
    findings: list[tuple[int, int, str, str]] = []
    for match in re.finditer(r"[‘’“”]", text):
        if style_lint.is_ignored(match.start(), code_spans):
            line, col = style_lint.line_col(text, match.start())
            findings.append((line, col, "Curly quote inside code (use straight quotes)", match.group(0)))
    return findings


def main() -> int:
    return style_lint.run_cli(__doc__, phrases=PHRASES, patterns=PATTERNS, latex=False, extra_scan=_curly_quote_findings)


if __name__ == "__main__":
    raise SystemExit(main())
