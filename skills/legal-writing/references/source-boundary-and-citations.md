# Source Boundary And Citations

The project's agent instructions control its source-boundary rules. This reference applies those rules at drafting time.

## Before Writing A Fact

Use the project's source-routing order. Where it maintains an evidence index, use the index to locate the source,
then verify the source itself before relying on it.

Ask:

1. Have I followed the project's evidence lookup protocol?
2. What is the canonical source document?
3. What is its date?
4. Where exactly is the fact found?
5. Is the source permitted for filing-facing use?
6. Does the fact need redaction, qualification, official-source verification or user instruction?
7. Does the evidence index or matter register need updating because I found useful evidence, a stale path, an
   index error, an overlap or a new matter copy?

## Preferred Source Cues

Use the most exact cue available:

- document title and date;
- PDF page number;
- paragraph number;
- exhibit or annexure label;
- transcript page and line;
- checked/verified official-audio timestamp;
- message timestamp;
- official URL and date checked for procedural statements.

## Claim Class And Verb Choice

Before strengthening or shortening a factual sentence, classify the legal status of the proposition. Preserve
that status in the rewrite.

| Class | Safer wording |
|---|---|
| Source-proved fact | `records`, `states`, `shows`, `identifies`, `contains` |
| Sworn fact | `I say`, `I observed`, `I received`, `I paid`, `I filed` |
| Allegation or contention | `alleges`, `says`, `asserts`, `contends`, `submits` |
| Admission | `admits`, `accepts`, `does not dispute` |
| Disputed or non-admitted fact | `disputes`, `does not admit`, `has been unable to reconcile` |
| Procedural fact | `was filed`, `was served`, `was listed`, `was dismissed`, `was adjourned`, `was stayed` |
| Official-source rule | `requires`, `permits`, `prohibits`, `provides`, `directs` |
| Inference or submission | `supports`, `is consistent with`, `the Applicant submits` |
| Limitation or source boundary | `does not establish`, `is not relied on for`, `proves notice but not truth` |
| Unresolved issue | `requires verification`, `requires user instruction`, or omit from filing-facing text |

Do not upgrade an email accusation, another proceeding's submission, a PPN/DVO document, an internal note, a user
instruction or an unresolved issue into an established fact. Do not turn a contention into affidavit evidence.

## Banned Evidence Sources

Do not cite these as evidence:

- global or matter evidence indexes;
- `.work/`;
- `docs/audits/`;
- OCR scratch;
- machine transcripts (e.g. an unofficial ASR/faster-whisper transcript) unless verified and deliberately exhibited. This does **not** bar citing the official audio recording at a checked timestamp: the official recording is the authoritative record and is citable, and a party's own good-faith transcription of the audible words at a cited official-audio timestamp is permitted when framed as her transcription (not a certified verbatim quote) with an invitation to listen, per *Butera v DPP (Vic)* (1987) 164 CLR 180 and QCAT Act 2009 (Qld) s 28;
- render-check pages or images;
- generated summaries;
- agent notes;
- internal notes;
- draft reasoning notes;
- filename-only descriptions.

Internal notes may help locate a source. They do not prove a filing fact.

## Filing-Facing Citation Style

Use the style the forum expects. If none is specified, use clear embedded citations:

- `[REASONS TITLE] dated [DATE], p [PAGE] lines [LINE RANGE]`.
- `Affidavit of [DEPONENT] affirmed [DATE], para [PARAGRAPH]`.
- `[EXHIBIT], email to [RECIPIENT] dated [DATE] at [TIME]`.
- `Annexure [LABEL], [DOCUMENT TITLE] dated [DATE], p [PAGE]`.

When tightening prose, do not cut the source anchor merely to make the sentence shorter. Shorten the
sentence around the anchor instead. If a factual sentence has no anchor, either add one, qualify it as
instruction/argument, or remove the factual assertion from filing-facing text.

Naturalising edits must preserve exact quotations, exhibit labels, annexure labels, paragraph numbers, page/line
pinpoints, visible timestamps, amounts, dates and document titles.

For correspondence, treat the email thread itself as a source only where it proves transmission,
notice, receipt, response position or timing. Do not convert an email accusation into a fact unless an
independent source supports it.

## Cross-Proceeding And Chat-Export Evidence

Two recurring source-boundary cases:

- **Material from another proceeding.** Another proceeding's filed submission or affidavit may prove procedural
  status, notice, a party's stated position or an inconsistency. It does **not** prove the underlying facts
  asserted inside it. If an underlying fact matters, cite the project's canonical evidence source or a fresh sworn
  affidavit with a specific source annexure. Do not rebundle one proceeding's pack into another unless a
  specific document is needed for a specific procedural fact, or the forum directs it.
- **Message / chat exports.** `.txt` exports and derived text sidecars are internal locators only. For filing,
  cite a readable PDF or screenshot export, a filed annexure page, or a targeted redacted PDF extract, with the
  visible timestamp, participant/source and annexure/exhibit label. If a passage exists only as a `.txt`
  locator, obtain or prepare a readable PDF/screenshot before filing.

## Legal Authorities

- Verify legislation from official legislation sites.
- Verify forms, fees, practice directions and filing methods from official court or tribunal pages.
- Use AGLC-style legal citations where a formal authority citation is needed.
- Do not invent pinpoint references, case quotes or proposition support.

## Citation And Content Integrity

Fabrication is a drafting failure mode, not only an evidence one. Confabulated case names, invented
instruments and silently altered rule titles are recurring drafting-agent failures. Hard rules:

- Never introduce an authority that is not already on a verified authorities list for the matter, or that you
  have not verified yourself against a primary source (legislation site, court judgment database) in this
  session. A case you cannot locate and pinpoint-verify is a fabrication risk, not a citation: leave it out and
  record the gap.
- State each authority's holding at its true, fact-specific altitude. Inflating a narrow ruling into sweeping
  support "in ways that would surprise anyone who had read the case" is a named judicial complaint about
  machine-drafted filings, and it is checkable.
- Never invent an instrument, declaration, statutory notice, order term or finding that the baseline document
  or record does not contain, however plausible the form suggests it should exist.
- Never silently alter a rule title, statute name, court or decision-maker label while paraphrasing
  (`QCAT Rules` is not `QCATA Rules`; an adjudicator is not `the Member`). Preserve exactly; if the source
  looks wrong, flag it, do not fix it in place.
- Court AI rules bind this work and self-represented litigants expressly. Queensland courts and QCAT
  (PD 5/2025 and the generative-AI guidelines) require every legislative and authority reference to be checked
  for accuracy, with the verification itself not done by AI, and expose a party to costs where fake or
  inaccurate AI content causes delay; NSW (PN SC Gen 23) and the Federal Court (GPN-AI) are to the same
  effect. Never feed private, confidential, suppressed or privileged material to an external tool. Verify the
  current practice direction before filing in a new forum.

## Working With Uncertainty

- In internal notes, mark gaps plainly.
- In filing-facing work, either omit the fact, qualify it accurately, or use a placeholder only if the build profile permits draft placeholders.
- Do not hide conflicting figures. Preserve competing figures and identify the source of each.
