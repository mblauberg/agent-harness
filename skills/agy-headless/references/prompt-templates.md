# agy / Gemini headless prompt templates

agy returns prose (no JSON mode) — always specify a structured markdown contract and the read-only
boundary. Tailor to Gemini's strengths: large context, multimodal, breadth.

## Whole-repository / long-context analysis (Gemini's sweet spot)

Use two stages for broad repos. Do not ask for unlimited full-repo proof in one call.

Stage 1 scout:

```text
Act as a best-effort sandboxed, source-read-only analyst. Map this repository broadly, but cap the run
at 80 source files or 12 minutes. Do not edit, write source files, run tests/builds, or change git
state. Return partial coverage if time is running out. Markdown sections: Coverage (paths inspected),
Overview, Components (table: name / path / role), Hotspots (ranked with file:line), Open questions.
```

Stage 2 targeted audit:

```text
Act as a source-read-only code auditor. Inspect only these hotspots: <PATHS>. Do not edit, run write
actions, or change git state. Return ranked findings; each: severity, file, line, title, explanation,
and a concrete fix. End with "what looks correct".
```

## Read-only code review

```text
Act as a read-only code reviewer. Inspect this repository for correctness risks, regressions, and
missing tests. Inspect named paths first: <PATHS>. Stop after 10 findings. Do not modify files, run
write actions, or change git state. Return ranked findings; each: severity, file, line, title,
explanation. End with "what looks correct".
```

## Architecture / contract audit

```text
Act as a read-only architecture auditor. Review the named files and repo context for contract drift,
ownership gaps, missing migration steps, and validation holes. Do not edit. Return ranked findings
with evidence (file:line) and a short fix per finding.
```

## Multimodal / document review (Gemini strength)

```text
Act as a read-only analyst. The input includes images/PDFs (screenshots, diagrams, scanned docs).
Extract the relevant content, cross-check it against [the repo / the stated facts], and report
discrepancies. Cite the page/region and the file. Do not edit anything.
```

## Deep research

```text
Act as a research analyst. Use primary or official sources where possible. Separate verified facts
from inference, include source URLs and dates, and flag claims that are unsupported or unstable.
Return: Findings (with sources), Uncertainties, What I could not verify.
```

## Cross-family LLM-as-judge (Gemini as the different-family verifier)

```text
Act as an independent reviewer from a different model family. Here is an artifact produced by another
model: <ARTIFACT>. Do not assume it is correct. List, ranked: factual errors, unsupported claims,
missed constraints, and logic gaps — each with the exact location and a fix. Then state what it gets
right. Judge only what's checkable; flag anything you cannot verify.
```
