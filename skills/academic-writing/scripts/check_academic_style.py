#!/usr/bin/env python3
"""Scan academic prose for style hazards that are cheap to detect."""

from __future__ import annotations

import argparse
import re
from pathlib import Path


PHRASES: dict[str, list[str]] = {
    "AI-style or inflated phrasing": [
        "it is important to note",
        "it should be noted",
        "in conclusion",
        "delves into",
        "pivotal",
        "crucial",
        "transformative",
        "groundbreaking",
        "cutting-edge",
        "seamless",
        "showcases",
        "underscores",
        "serves as a testament",
        "highlights the importance",
        "leverages",
        "holistic",
        "multifaceted",
        "meticulous",
        "myriad",
        "plethora",
        "paramount",
        "tapestry",
        "in the realm of",
        "a testament to",
    ],
    "Vague benefit claim": [
        "enhances reliability",
        "enhances performance",
        "ensures reliability",
        "supports scalability",
        "drives impact",
        "streamlines",
    ],
    "Meta-discourse or report-referential": [
        "for this thesis report",
        "this thesis report",
        "the aim of this report is",
        "this write-up",
        "we will now discuss",
        "the present study sets out",
        "as the reader will see",
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
    "US spelling candidate": [
        "analyze",
        "analyzed",
        "analyzing",
        "organize",
        "organized",
        "organizing",
        "recognize",
        "recognized",
        "recognizing",
        "behavior",
        "color",
        "modeling",
        "labeling",
        "center",
        "paralyze",
        "catalyze",
    ],
    "Complex word (prefer a simpler one)": [
        "utilise",
        "utilised",
        "utilising",
        "commence",
        "commences",
        "commenced",
        "prior to",
        "in order to",
        "endeavour",
        "ascertain",
        "elucidate",
        "aforementioned",
        "hitherto",
        "facilitate",
        "facilitates",
    ],
}

PATTERNS = [
    ("Em dash", re.compile("—")),
    ("LaTeX prose em dash marker", re.compile(r"(?<!-)---(?!-)")),
    ("Generic placeholder", re.compile(r"\b(TODO|TBD|FIXME|insert result|citation needed)\b", re.I)),
    ("Citation placeholder", re.compile(r"\\cite\{(?:todo|TODO|missing|source|citation|ref)\}")),
    ("Likely unescaped percent in prose", re.compile(r"(?<!\\)\d+%")),
    ("Negative-parallelism padding", re.compile(r"\bnot (only|just|merely)\b", re.I)),
    ("Overall as a paragraph opener", re.compile(r"(?m)^\s*[Oo]verall\b")),
    (
        "Adverb-LY hyphen (AU: no hyphen after an -ly adverb)",
        re.compile(
            r"\b(?:highly|clearly|fully|newly|rapidly|widely|closely|broadly|tightly|loosely"
            r"|poorly|badly|heavily|finely|partly|wholly|purely|simply|directly|carefully"
            r"|randomly|statistically|formally|naturally|locally|globally|recently|previously"
            r"|increasingly|deeply|nearly|largely|mostly|readily|equally|strongly|weakly"
            r"|densely|sparsely|manually|automatically|empirically|theoretically|significantly"
            r"|substantially|relatively|inherently|explicitly|implicitly)-(?!fledged|fashioned)[a-z]+\b",
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

NON_PROSE_COMMANDS = {
    "cite",
    "citep",
    "citet",
    "Cref",
    "cref",
    "ref",
    "autoref",
    "eqref",
    "label",
    "result",
    "metric",
    "model",
    "path",
    "url",
    "includegraphics",
    "bibliography",
    "bibliographystyle",
    "begin",
    "end",
    "input",
    "include",
    "gls",
    "glspl",
    "Gls",
    "acrshort",
    "acrlong",
    "acrfull",
}

# Commands whose braced argument is verbatim code/identifiers, not prose. Their
# bodies must be skipped or they trip US-spelling/hyphenation rules on legitimate
# identifiers (e.g. \texttt{data-set}, \texttt{analyze}).
VERBATIM_ARG_COMMANDS = {
    "texttt",
    "verb",
    "lstinline",
    "mintinline",
    "code",
    "ttfamily",
}

# Idiomatic 4+ segment hyphen chains that are correct, not noun-towers.
CHAIN_OK = frozenset({"state-of-the-art", "out-of-distribution"})


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
    if suffix in {".tex", ".latex", ".sty", ".cls"}:
        verbatim_env = re.compile(
            r"\\begin\{(?:verbatim|lstlisting|minted|Verbatim)\}.*?"
            r"\\end\{(?:verbatim|lstlisting|minted|Verbatim)\}",
            re.S,
        )
        spans.extend((match.start(), match.end()) for match in verbatim_env.finditer(text))
        # LaTeX line comments are not prose; an escaped \% is a literal percent, not a comment.
        spans.extend((match.start(), match.end()) for match in re.finditer(r"(?<!\\)%[^\n]*", text))
        spans.extend((match.start(), match.end()) for match in re.finditer(r"\\[A-Za-z@]+\*?", text))
        command_with_args = re.compile(r"\\([A-Za-z@]+)\*?(?:\s*\[[^\]]*\])?(?:\s*\{[^{}]*\})+")
        for match in command_with_args.finditer(text):
            if match.group(1) in NON_PROSE_COMMANDS or match.group(1) in VERBATIM_ARG_COMMANDS:
                spans.append((match.start(), match.end()))
        # \href{url}{text}: skip only the URL argument; the display text is prose.
        href_url = re.compile(r"\\href\s*\{[^{}]*\}")
        spans.extend((match.start(), match.end()) for match in href_url.finditer(text))
        # Inline verbatim: any non-letter delimiter (\verb#..#, \verb|..|), plus the
        # optional [options] and brace forms used by \lstinline/\mintinline.
        inline_verb = re.compile(
            r"\\(?:verb|lstinline|mintinline)\*?(?:\[[^\]]*\])?"
            r"(?:([^A-Za-z\s*{])(?:(?!\1)[^\n])*?\1|\{[^{}]*\})"
        )
        spans.extend((match.start(), match.end()) for match in inline_verb.finditer(text))
        math = re.compile(r"(?<!\\)\$[^$]*?\$|\\\(.*?\\\)|\\\[.*?\\\]", re.S)
        spans.extend((match.start(), match.end()) for match in math.finditer(text))
        math_env = re.compile(
            r"\\begin\{(equation|align|gather|multline|eqnarray|alignat|flalign)\*?\}"
            r".*?\\end\{\1\*?\}",
            re.S,
        )
        spans.extend((match.start(), match.end()) for match in math_env.finditer(text))
        spans.extend((match.start(), match.end()) for match in re.finditer(r"\\.", text))
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


def scan(path: Path) -> list[tuple[int, int, str, str]]:
    text = path.read_text(encoding="utf-8")
    spans = ignored_spans(text, path.suffix.lower())
    findings: list[tuple[int, int, str, str]] = []

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
                index = match.start()
                if is_ignored(index, spans):
                    continue
                line, col = line_col(text, index)
                findings.append((line, col, label, match.group(0)))

    # Drop a stacked-chain finding that duplicates a more specific X-versus-Y
    # finding at the same position (e.g. IID-versus-non-IID matched by both).
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
    """Count condensable prose words: blank out the same LaTeX/math/verbatim spans
    the style scan ignores, then count alphabetic word tokens. This serves the
    Condense Pass delta contract (report words before and after); it deliberately
    does NOT score "bloat". Genuine bloat versus load-bearing content (defined
    terms, honest negatives, moved-not-deleted detail) needs reading meaning,
    which a regex cannot do. The checker measures size and surfaces candidates;
    the cut decision stays with the human or agent."""
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
        help="print the prose word count (LaTeX/math/verbatim stripped) instead of style findings",
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
