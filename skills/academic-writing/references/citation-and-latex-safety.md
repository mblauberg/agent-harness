# Citation And LaTeX Safety

Use this reference when editing citation-heavy prose, thesis LaTeX, captions, tables, equations, or result text.

## Citation Discipline

Never invent citation keys. Preserve existing `\cite{...}` keys exactly unless the user explicitly asks to replace them with known valid keys.

If a claim needs support and no citation is present, add a flag:

```text
[FLAG: cite source]
```

Do not fabricate a likely key. Do not rename keys for style.

## Source Integration

Citations should support claims, not decorate sentences.

Weak:

```text
Forecast accuracy matters in operational planning \cite{a,b,c}.
```

Better:

```text
Prior work evaluates short-term demand forecasts mainly with aggregate error metrics, while fewer studies report calibration across low-volume regions \cite{a,b,c}.
```

Use citations to support:

- factual background
- definitions
- prior methods
- empirical claims
- comparisons
- evaluation conventions
- limitation statements

Avoid citation dumping. If five sources are cited together, the sentence should explain the shared claim.

## IEEE-Style Prose Habits

For IEEE-style numbered bibliographies:

- Keep citations close to the claim they support.
- Do not use citation keys as nouns in final prose.
- Prefer `Prior work... \cite{key}` over `\cite{key} shows...` unless the author identity matters.
- Use author names when the argumentative contrast depends on the authors.
- Keep reference order stable by preserving existing LaTeX source order where possible.

Per the IEEE Editorial Style Manual, write in [1], not in reference [1], and do not make a bracketed number the grammatical subject ([1] shows ...). A numbered reference generally should not carry the author's name inline (In Patel [1] ...).

## LaTeX Invariants

Preserve exactly unless explicitly asked:

- `\cite{...}`
- `\Cref{...}`, `\cref{...}`, `\ref{...}`, `\autoref{...}`
- `\label{...}`
- project-defined commands and their arguments, such as `\result{...}`
- equations and math environments
- table column alignment
- figure paths
- bibliography commands
- glossary/acronym commands

Do not rewrite macro arguments for style. A macro argument can be a contract with generated artefacts.

## Cross-References

Keep references specific:

```text
\Cref{tab:primary-results} reports the primary outcome.
```

Avoid vague references:

```text
The table below highlights important results.
```

When a paragraph references multiple figures or tables, ensure each reference has a distinct role.

Use `\cref` mid-sentence and `\Cref` (auto-capitalised) at the start of a sentence; never open a sentence with a lowercase `\cref` or a bare bracketed number. Preserve the existing `\Cref`/`\cref` split when editing; do not flatten `\Cref` to `\cref`.

## Equations And Symbols

Do not change symbols while polishing prose. If notation is unclear, flag it:

```text
[FLAG: define symbol before use]
```

Good equation prose:

```text
Equation~\ref{eq:pattern-score} scores candidate pattern evidence for retrieval. It does not produce the final risk label.
```

Avoid:

```text
The equation elegantly captures the relationship.
```

## Tables And Result Macros

Treat generated result macros as locked:

```latex
\result{PRIMARY_METRIC}
```

Do not replace them with guessed numbers. Do not hide unresolved tokens. If the prose overclaims a pending token, rewrite the claim as conditional or flag it.

Good:

```text
Values in \Cref{tab:primary-results} are populated by the project's verified results source and remain provisional until its declared checks pass.
```

## Common LaTeX Hazards

Watch for:

- deleting braces around macros
- changing `_` in macro names or labels
- replacing `~` in non-breaking references
- introducing unescaped `%`, `_`, `&`, or `#`
- changing table alignment while editing prose
- converting LaTeX `---` into a visible style problem instead of replacing the sentence punctuation

Keep the non-breaking tilde before `\ref`, `\cite`, and `\eqref`, and put a non-breaking space between a number and its unit or percent sign (siunitx `\num`/`\qty`/`\SI`, or a thin `\,`), so a value never splits across a line. cleveref's `\cref`/`\Cref` already insert the non-breaking space, so prefer them over a manual `Fig.~\ref`.

## Citation-Safe Editing Checklist

- Every citation key is preserved or explicitly verified.
- Unsupported claims are flagged.
- Citations sit near the claim they support.
- LaTeX commands and arguments are unchanged.
- Result macros are not converted into numbers.
- Cross-references still point to the same artefact.
