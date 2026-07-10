# Australian English House Style

Use this reference for prose-level editing. Use the forum skill for law, procedure, forms, fees, deadlines and filing method.

This reference follows mainstream Australian usage (the Australian Government Style Manual, the Macquarie Dictionary and the *Australian Guide to Legal Citation* (AGLC4)) except where a rule is marked **(skill default)**. A skill default is a deliberate drafting convention, not a national standard; project or forum rules may override it. Defaults current as at 1 June 2026; re-check cited public guidance if it is more than about 12 months old.

## Baseline

- Write in Australian English.
- Use day-month-year order for dates in prose, for example `25 May 2025`.
- Use exact times where they matter, for example `4:00 pm on 9 June 2025`.
- Use `Qld`, `Cth`, `s`, `ss`, `r`, `rr`, `para`, `paras`, `p`, `pp` where ordinary Australian legal shorthand is appropriate.
- Use `judgment`, not `judgement`, when referring to a court judgment.
- Use `filed`, `served`, `lodged`, `affirmed`, `sworn`, `annexure`, `exhibit`, `applicant`, `respondent`, `plaintiff`, `defendant`, `enforcement creditor`, and `enforcement debtor` only where the forum or form uses those labels.
- For a party acting without a lawyer, write `self-represented litigant` (Queensland courts and QCAT) or `litigant in person` (FCFCOA and other federal courts). Never write the American `pro se`.

## Current Plain Terms

Use current, ordinary words where they do the same legal work. Keep an older term only when it is part of an
exact quotation, statute or rule title, official form field, defined term, case name, document title or source
extract.

| Prefer | Avoid in new drafting | Note |
|---|---|---|
| `phone` | `telephone` | Use `phone` in requests, orders and correspondence. Preserve `telephone` only in exact rule titles or quoted source text. |
| `under` | `pursuant to` | `under r 800` is shorter and still legally precise. |
| `before` | `prior to` | Keep `prior` only where it is part of a defined legal phrase or source title. |
| `after` | `subsequent to` | Prefer the ordinary time word. |
| `use` | `utilise` | Prefer the direct verb. |
| `send`, `give` or `provide` | `furnish` | Match the rule or form if it uses a specific verb. |
| `about` or `for` | `in relation to` | Use the precise legal relationship if `about` is too broad. |

## Punctuation

- Do not use the em dash character (U+2014) in legal output **(skill default, lint-enforced)**. Mainstream Australian style permits it. For a parenthetical break in prose, use a comma, colon, semicolon, full stop or parentheses; in a document title, use a spaced hyphen (`Orders Sought - Stay, Extension and Directions`). Reserve the en dash for number, date or page ranges only.
- The en dash (`–`, U+2013) is permitted but used sparingly **(skill default)**. Its clearest use is a closed number, date or page range (`pp 12–18`, `2024–2025`). Do not use a spaced en dash as a habitual parenthetical; restructure or use other punctuation first. The deterministic lint warns on every en dash so a human keeps the count low.
- The **spaced hyphen** (` - `, a hyphen with a space each side) is **not** caught by the lint (it is neither the em nor the en dash character), so it must be policed by eye. It is acceptable in a **document title or running header** (`Orders Sought - Stay, Extension and Directions`), where sibling-document consistency favours it, but **avoid it as a clause separator in body prose, section headings or bold paragraph labels**. Prefer a colon for a heading or label gloss (`B. The Form 40 default direction: opposed`), and a comma, parentheses or semicolon for an in-sentence break. A document carrying many spaced-hyphen breaks reads as dash-overuse and an AI tell; sweep them before finalising.
- Prefer full stops for clarity. Where a semicolon or colon joins two grammatically complete, independent clauses, a full stop is usually better and reads cleaner. Reach for a comma plus a real connective (`, so`, `, and`, `, but`, `, while`, `, rather`) only where the two clauses carry a logical relation worth naming. For example, `not its scope; if a stay is granted` is better as `not its scope. If a stay is granted`, and `answers it: by declining` as `answers it. By declining`.
- Use a colon before a short list, a genuine explanation that completes the lead clause, or a label gloss (`[LABEL]: official transcript of reasons`). Do not use a colon merely to splice on a second free-standing sentence. Use a full stop.
- Use parentheses sparingly for true parenthetical detail.
- Use semicolons for their two reliable jobs: separating list or citation items that themselves contain commas (a series semicolon, for example `[2009] QCA 66; [2009] 2 Qd R 219`), and, occasionally, binding two short balanced clauses in a deliberate antithesis (`Submissions argue; they do not prove`). Default to a full stop for two ordinary independent clauses, especially where the first already carries internal commas. A submission peppered with clause-joining semicolons reads as machine rhythm. Sweep them before finalising.
- Use single quotation marks (`'...'`) for quoted words, phrases and document-field names; this is the Australian and AGLC convention. Use double quotation marks only for a quotation inside a quotation. Be consistent within a document and do not mix. Set a long quotation (more than about three lines) as an indented block without quotation marks.

## Spelling

- Use Australian spelling: `-ise` not `-ize` (`organise`, `recognise`, `emphasise`); `-our` (`favour`, `behaviour`, `honour`); `-re` (`centre`, `metre`).
- Keep the noun/verb pairs distinct: the nouns `licence` and `practice` against the verbs `license` and `practise`; `defence` and `offence` with `-ce`.
- Use `program` (not `programme`) for all senses; `judgment` (not `judgement`) for a court decision; `acknowledgement` and `enrolment`.
- Avoid American spellings (`organize`, `defense`, `color`, `aging`, the noun `license`).
- Watch common import errors: `finalize`, `summarize`, `offense`, `honor`, `behavior`, `center`, `meter`, `labeled` and `traveling`.
- Preserve spelling in exact quotations, official document titles, form fields, filenames and source extracts even where it differs from house style.
- Verify any uncertain term against the Macquarie Dictionary.

## Capitalisation And Defined Terms

- Capitalise a defined party or instrument and then use it consistently: `the Applicant`, `the Respondent`, `the Tribunal`, `the Court`, `the QCAT Act`, `the PPP Financial Summary`.
- Define the short form once in parentheses, for example *Queensland Civil and Administrative Tribunal Act 2009* (Qld) (`the QCAT Act`), then use the short form.
- Introduce a person the same way, with single quotes and not bold: `the respondent, [FULL NAME] ('[SHORT FORM]')`, then use the defined short form in plain text. Where two people share a surname, distinguish by given name or defined short form and keep it consistent. Do not bold a party short-form in running text (see *Headings, Numbering And Document Structure*).
- Do not capitalise a generic reference (`a tribunal member`, `the parties`, `a court of competent jurisdiction`).

## Citations And Emphasis In Running Text

- Italicise case names and legislation titles: *[CASE NAME] v [CASE NAME]*, *Family Law Act 1975* (Cth), *Queensland Civil and Administrative Tribunal Act 2009* (Qld).
- Keep the jurisdiction tag and pinpoint outside the italics: *Family Law Act 1975* (Cth) s 90SM.
- Use AGLC4 style where a formal authority citation is needed; see `source-boundary-and-citations.md`.
- Use italics only for citation and genuine emphasis. Do not use bold or capitals to argue a point.

## Numbers, Money And Dates

- Use figures for money, with a thousands separator and two decimals where exactness matters: `$14,132.18`, `$1,800`.
- Preserve competing figures exactly. Do not silently round or normalise an amount.
- In prose, generally write whole numbers under ten as words and use figures from 10 up, unless the forum or a calculation needs figures throughout.
- Dates in prose use day-month-year order, for example `25 May 2025`. A date entered into an official form field follows that form's required format (for example `dd/mm/yyyy`); do not reformat a form-field value to match prose style.

## Headings, Numbering And Document Structure

This is the consolidated cross-forum house style for affidavits and submissions. It is built **up to the
strictest forum** so one shape is compliant everywhere. Verified 2026-06-08 against FCFCOA *Family Law
Rules 2021* (Cth) **r 8.15(1)(a)** (affidavit divided into consecutively numbered paragraphs, each confined
to a distinct part of the subject), **r 2.14(1)** (typed, ≥12pt Times New Roman or equivalent, 1.5 line
spacing, ~2.5cm margins, A4, consecutive page numbers) and **r 8.16(3)** (dates, numbers and money in
figures); UCPR 1999 (Qld) **r 431(5)** (affidavit body divided into paragraphs numbered consecutively, each
as far as possible confined to a distinct portion of the subject); and QCAT **Practice Direction 3 of 2024**
(≥12pt Times New Roman / 11pt Arial, ≥1.5 spacing, A4, sequential page numbers; QCAT prescribes no
paragraph scheme. *QCAT Act* s 28 minimal formality means the court rules govern by consolidation).

- **Headings**: use short, stable, descriptive headings. Lettered topic headings (`A. Purpose`,
  `B. Background`: letter, full stop, space, then Title Case) are the skill default for affidavits and
  submissions. The heading letter is a label only; it never resets paragraph numbering.
- **Paragraph numbering**: number affidavit and submission paragraphs **continuously `1` to `N` across the
  whole document**. Do **not** restart numbering under a heading. Do not use multi-level decimal numbering
  (`1.1`, `1.1.1`); no forum requires it and it splits the affidavit and submission styles. Keep one
  proposition (or one small factual cluster, in an affidavit) per numbered paragraph.
- **Sub-paragraphs**: one hierarchy only: `(a)`, `(b)`, `(c)`, then `(i)`, `(ii)`, `(iii)`. Use **block**
  sub-paragraphs (each on its own indented line) when a paragraph enumerates three or more discrete items,
  sets out relief or orders, or lists anything that will be cross-referenced. Keep a brief two-item aside
  **inline** in the sentence (`to address (a) X and (b) Y`). In Markdown source, write the literal marker
  `(a)` (not `a.`) and indent the sub-list four spaces so it renders as `(a)`.
- **Bolding**: bold only: section headings; the deponent's name at the formal commencement
  (`I, **[FULL NAME]**,`) and in the jurat; and an exhibit or annexure label on its **first**
  introduction (`**[ANNEXURE LABEL]**`), plain after that. Do **not** bold a party short-form in running text: define
  it once with single quotes, `('Mr Lee')`, then use it plain. Do not bold money amounts, and never use
  bold or capitals to argue a point (see *Citations And Emphasis*).
- **Cross-references**: if prose cites a paragraph number (`paragraph 66`), remember the rendered number is
  the continuous one. Adding or removing a whole paragraph shifts every later number and breaks the
  reference: prefer sentence-level edits, or keep the paragraph count fixed, or fix every reference.
- **Forum divergence kept**: the Queensland Magistrates Court affidavit is built into the official Form 46
  template, which flattens Markdown bold and renders paragraphs as `n.` with a hanging indent; the official
  form governs there, but the source-level rules above (single-quote short forms, continuous numbering,
  block sub-paragraphs) still apply.

## Sentence Style

For the full legal concision and anti-AI procedure, use `legal-concision-and-anti-ai.md`.

- Put the answer, issue, request or relief before background.
- Prefer active voice: `Ms Lee filed the application`, not `the application was filed by Ms Lee`.
- Passive voice is acceptable where the actor is unknown, irrelevant or legally less important than the thing done.
- Keep related words together. Put the actor, action and object close to each other.
- Avoid double negatives.
- Avoid long openings before the main verb.
- Use concrete dates, amounts, document names and exhibit labels.
- Aim for short, scannable sentences: average around 20 words, and treat any sentence over about 24 words or
  carrying three or more list items as a split-or-tabulate prompt. This is an editing prompt, not a hard
  filing rule (canonical statement; the argument-structure and validation references apply it). Legal accuracy
  and pinpoint source anchors come first.
- Write positive sentences where possible: state what is sought, proved or disputed rather than building
  the sentence around what is not being said.
- Keep honest legal negatives where the absence is the fact: non-service, non-filing, non-payment,
  non-admission, no order, no finding, no concession, inability to reconcile or an issue under appeal.
- Vary sentence length where it helps the reader. Use a short sentence for the operative request, consequence
  or qualification. Do not add roughness, warmth or drama just to avoid a polished rhythm.

## Natural Legal Prose

- Write like a careful person making a record: formal enough for court, direct enough to understand quickly.
- Prefer concrete legal and evidentiary verbs: `filed`, `served`, `lodged`, `affirmed`, `sworn`, `paid`,
  `received`, `observed`, `recorded`, `annexed`, `exhibited`, `disputed`, `admitted`, `refused`.
- Keep the human actor in view where it is accurate: `Ms Lee filed`, `Mr Lee wrote`, `the registry sealed`.
  Passive voice is still proper where the document, step or result matters more than the actor.
- Keep defined terms, party labels, form labels, statutory language and accepted affidavit/submission formulae.
  Do not vary them for rhythm.
- Do not over-smooth a source-backed fact into a generic summary. Keep the date, amount, document name, exhibit
  label or visible source cue that makes the fact provable.
- Do not flatten uncertainty. Keep `alleged`, `disputed`, `not admitted`, `under appeal`, `unable to reconcile`
  and similar limits where they define the legal status.
- Repair dense noun piles by moving qualifiers into clauses. Keep the defined legal term, but avoid stacking
  several defined terms before an abstract noun.

## Paragraph Style

- Use one topic per paragraph.
- Start a paragraph with the proposition the reader needs, then support it.
- In affidavits and witness statements, use one fact or small factual cluster per numbered paragraph.
- In submissions, start each section with the proposition the reader must decide.
- In correspondence, state the request, deadline and practical next step early.
- Split long procedural history into a chronology or annexure table rather than carrying it in prose.

## Tone

- Formal, restrained and direct.
- Do not sound promotional, theatrical, sarcastic, soulless, over-formal, chatty or American.
- Do not overstate. Say what the document proves and what remains alleged, disputed or for source-backed analysis and user instruction.
- Prefer `the Applicant submits` in submissions and `I say` or `I observed` in affidavit evidence where appropriate.
- In correspondence, sound like a careful person writing for a record: courteous, practical and specific.
