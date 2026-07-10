#!/usr/bin/env python3
"""Scan engineering prose (Markdown, plain text, reST) for style hazards that are
cheap to detect: em dashes, US spellings, AI-style phrasing, chatbot framing,
internal process language, placeholders, and hyphenation hazards.

Findings are prompts for review, not proof of a defect. The checker cannot see
flat rhythm, noun-stacking, uniform confidence, comma-gloss definitions, or
implicit-completion tense; those need the human passes in the references
(engineer-voice.md, style-standard.md). Silence is necessary, not sufficient.

Code fences, inline code, and YAML frontmatter are skipped, so identifiers and
quoted examples are not flagged. Placeholders (TODO/TBD/FIXME) are legitimate in
working drafts and code; treat those findings as a check that the text is not
deliverable-facing.
"""

from __future__ import annotations

import argparse
import re
from pathlib import Path


PHRASES: dict[str, list[str]] = {
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
    "AI-style or inflated phrasing": [
        "delves into",
        "pivotal",
        "crucial",
        "transformative",
        "groundbreaking",
        "cutting-edge",
        "seamless",
        "seamlessly",
        "showcases",
        "underscores",
        "serves as a testament",
        "a testament to",
        "highlights the importance",
        "leverages",
        "leveraging",
        "holistic",
        "multifaceted",
        "meticulous",
        "myriad",
        "plethora",
        "paramount",
        "tapestry",
        "in the realm of",
        "game-changing",
        "world-class",
        "next-generation",
        "state-of-the-art",
        "first and foremost",
        "each and every",
        "robust",
        "comprehensive",
    ],
    "Vague authority (name the source)": [
        "industry reports suggest",
        "it is widely accepted",
        "observers note",
        "experts agree",
    ],
    "Vague benefit claim (give the number or mechanism)": [
        "enhances reliability",
        "enhances performance",
        "ensures reliability",
        "ensures quality",
        "improves productivity",
        "supports scalability",
        "drives impact",
        "streamlines",
    ],
    "Copula avoidance or inflated verb": [
        "serves as",
        "stands as",
        "boasts",
        "plays a role",
        "plays a vital role",
        "plays a key role",
        "plays a crucial role",
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
    "US spelling candidate": [
        "analyze",
        "analyzed",
        "analyzing",
        "organize",
        "organized",
        "organizing",
        "recognize",
        "recognized",
        "optimize",
        "optimized",
        "optimizing",
        "initialize",
        "initialized",
        "customize",
        "finalize",
        "summarize",
        "behavior",
        "color",
        "favor",
        "flavor",
        "modeling",
        "labeling",
        "labeled",
        "traveling",
        "canceled",
        "centered",
        "defense",
        "offense",
        "catalog",
        "programme",
    ],
    "Complex word (prefer a simpler one)": [
        "utilise",
        "utilised",
        "utilising",
        "utilize",
        "commence",
        "commenced",
        "prior to",
        "in order to",
        "endeavour to",
        "ascertain",
        "aforementioned",
        "facilitate",
        "facilitates",
        "pursuant to",
        "for the purpose of",
        "has the ability to",
        "it is possible to",
        "the fact that",
    ],
}

PATTERNS = [
    ("Em dash", re.compile("—")),
    ("Spaced en dash parenthetical (use other punctuation)", re.compile(" – ")),
    (
        "Placeholder (defect if deliverable-facing)",
        re.compile(r"\b(TODO|TBD|TBC|FIXME|XXX|insert (?:value|result|name)|drafting note)\b"),
    ),
    ("Negative-parallelism padding", re.compile(r"\bnot (only|just|merely)\b", re.I)),
    ("Overall/In conclusion as an opener", re.compile(r"(?m)^\s*(?:[Oo]verall|In conclusion|In summary|Ultimately)\b")),
    (
        "Adverb-LY hyphen (no hyphen after an -ly adverb)",
        re.compile(
            r"\b(?:highly|clearly|fully|newly|rapidly|widely|closely|broadly|tightly|loosely"
            r"|poorly|badly|heavily|finely|partly|wholly|purely|simply|directly|carefully"
            r"|randomly|statistically|formally|naturally|locally|globally|recently|previously"
            r"|increasingly|deeply|nearly|largely|mostly|readily|equally|strongly|weakly"
            r"|densely|sparsely|manually|automatically|empirically|theoretically|significantly"
            r"|substantially|relatively|inherently|explicitly|implicitly|publicly|properly)"
            r"-(?!fledged|fashioned)[a-z]+\b",
            re.I,
        ),
    ),
    (
        "Should-be-closed compound (modern AU)",
        re.compile(
            r"\b(?:data-set|hyper-parameter|pre-processing|pre-process(?:ed|ing)|on-line|e-mail"
            r"|co-ordinat[a-z]*|co-operat[a-z]*|web-site|data-base|hyper-link)\b",
            re.I,
        ),
    ),
    ("Stacked hyphen chain of 4+ words (consider recasting)", re.compile(r"\b[A-Za-z]+(?:-[A-Za-z]+){3,}\b")),
    ("'X-versus-Y' hyphen stack (recast as a phrase)", re.compile(r"\b[A-Za-z]+-versus-[A-Za-z-]+\b", re.I)),
]

# Idiomatic 4+ segment hyphen chains that are correct, not noun towers.
CHAIN_OK = frozenset({"state-of-the-art", "out-of-distribution", "end-to-end", "out-of-the-box"})


def phrase_pattern(phrase: str) -> re.Pattern[str]:
    parts = [re.escape(part) for part in phrase.split()]
    body = r"\s+".join(parts)
    return re.compile(rf"(?<![A-Za-z]){body}(?![A-Za-z])", re.I)


def ignored_spans(text: str, suffix: str) -> list[tuple[int, int]]:
    spans: list[tuple[int, int]] = []
    if suffix in {".md", ".markdown"} and text.startswith("---\n"):
        end = text.find("\n---\n", 4)
        if end != -1:
            spans.append((0, end + 5))

    fence = re.compile(r"```.*?```", re.S)
    spans.extend((match.start(), match.end()) for match in fence.finditer(text))
    spans.extend((match.start(), match.end()) for match in re.finditer(r"`[^`\n]+`", text))
    # Markdown link targets and bare URLs are identifiers, not prose.
    spans.extend((match.start(), match.end()) for match in re.finditer(r"\]\([^)\s]+\)", text))
    spans.extend((match.start(), match.end()) for match in re.finditer(r"https?://\S+", text))
    return spans


def is_ignored(index: int, spans: list[tuple[int, int]]) -> bool:
    return any(start <= index < end for start, end in spans)


def is_table_separator_line(text: str, index: int) -> bool:
    line_start = text.rfind("\n", 0, index) + 1
    line_end = text.find("\n", index)
    if line_end == -1:
        line_end = len(text)
    line = text[line_start:line_end].strip()
    return bool(line) and set(line) <= {"|", "-", ":", " "}


def line_col(text: str, index: int) -> tuple[int, int]:
    line = text.count("\n", 0, index) + 1
    line_start = text.rfind("\n", 0, index) + 1
    return line, index - line_start + 1


def code_spans(text: str) -> list[tuple[int, int]]:
    spans: list[tuple[int, int]] = []
    spans.extend((m.start(), m.end()) for m in re.finditer(r"```.*?```", text, re.S))
    spans.extend((m.start(), m.end()) for m in re.finditer(r"`[^`\n]+`", text))
    return spans


def scan(path: Path) -> list[tuple[int, int, str, str]]:
    text = path.read_text(encoding="utf-8")
    spans = ignored_spans(text, path.suffix.lower())
    findings: list[tuple[int, int, str, str]] = []

    # Curly quotes inside code break copy-paste; scanned only within code spans.
    in_code = code_spans(text)
    for match in re.finditer(r"[‘’“”]", text):
        if is_ignored(match.start(), in_code):
            line, col = line_col(text, match.start())
            findings.append((line, col, "Curly quote inside code (use straight quotes)", match.group(0)))

    for label, pattern in PATTERNS:
        for match in pattern.finditer(text):
            if is_ignored(match.start(), spans) or is_table_separator_line(text, match.start()):
                continue
            if label.startswith("Stacked hyphen chain") and match.group(0).lower() in CHAIN_OK:
                continue
            line, col = line_col(text, match.start())
            findings.append((line, col, label, match.group(0)))

    for label, phrases in PHRASES.items():
        for phrase in phrases:
            for match in phrase_pattern(phrase).finditer(text):
                if is_ignored(match.start(), spans):
                    continue
                line, col = line_col(text, match.start())
                findings.append((line, col, label, match.group(0)))

    versus_positions = {
        (line, col) for line, col, label, _ in findings if label.startswith("'X-versus-Y'")
    }
    findings = [
        finding
        for finding in findings
        if not (finding[2].startswith("Stacked hyphen chain") and (finding[0], finding[1]) in versus_positions)
    ]

    return sorted(findings)


def prose_word_count(path: Path) -> int:
    """Count condensable prose words for the condense-pass delta (before/after).
    Code fences, inline code, frontmatter, and URLs are blanked first. The count
    measures size only; the cut decision stays with the human or agent."""
    text = path.read_text(encoding="utf-8")
    spans = ignored_spans(text, path.suffix.lower())
    chars = list(text)
    for start, end in spans:
        for index in range(start, min(end, len(chars))):
            chars[index] = " "
    return len(re.findall(r"[A-Za-z]+(?:['-][A-Za-z]+)*", "".join(chars)))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("paths", nargs="+", type=Path)
    parser.add_argument(
        "--wordcount",
        action="store_true",
        help="print the prose word count (code/frontmatter stripped) instead of style findings",
    )
    args = parser.parse_args()

    if args.wordcount:
        missing = False
        for path in args.paths:
            if not path.exists():
                print(f"{path}: missing")
                missing = True
                continue
            print(f"{path}: {prose_word_count(path)} prose words")
        return 1 if missing else 0

    any_findings = False
    for path in args.paths:
        if not path.exists():
            print(f"{path}: missing")
            any_findings = True
            continue
        findings = scan(path)
        if findings:
            any_findings = True
            print(f"{path}: {len(findings)} finding(s)")
            for line, col, label, snippet in findings:
                print(f"  {line}:{col}: {label}: {snippet!r}")
        else:
            print(f"{path}: no findings")
    return 1 if any_findings else 0


if __name__ == "__main__":
    raise SystemExit(main())
