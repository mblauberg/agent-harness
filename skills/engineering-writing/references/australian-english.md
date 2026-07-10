# Australian English

Use Australian English unless a project style guide, product, API, quoted source, official form field, or repository convention requires another variant. This reference is the concrete checklist. It follows the Australian Government Style Manual and the Macquarie Dictionary; verify any uncertain term against the Macquarie Dictionary.

Preserve US or other spelling exactly inside quotations, identifiers, package names, API fields, config keys, filenames, error strings, and copied source. Australian English governs the prose you author, not the code you quote.

## Spelling

- `-ise`, not `-ize`: organise, recognise, prioritise, summarise, standardise, initialise. This is the dominant Australian preference; apply it consistently rather than mixing.
- `-yse`, not `-yze`: analyse, paralyse, catalyse.
- `-our`, not `-or`: colour, behaviour, favour, honour, labour, flavour. (But keep `-or` in words that never took `-our`: error, mirror, actor, factor, vendor, cursor, iterator.)
- `-re`, not `-er`: centre, metre, litre, fibre, theatre, calibre. (Keep `-er` where the word is not from this set: parameter, diameter, filter, buffer, header, compiler, container, register.)
- `-lling`/`-lled` with a doubled `l` on inflection: travelling, modelling, cancelling, labelling, signalling, levelled. American English single-`l` forms (`traveling`, `modeling`, `labeled`) are wrong here.
- `-logue`, not `-log`, in prose: catalogue, dialogue, analogue. (Keep `log` and `dialog` where they are identifiers, CLI subcommands, or UI widget names, for example a `dialog` component or a `changelog` file.)
- Common import errors to sweep: `finalize`, `summarize`, `optimize`, `customize`, `initialize`, `organization`, `defense`, `offense`, `license` (as a noun), `color`, `behavior`, `center`, `meter`, `catalog`, `labeled`, `traveling`, `aging`, `program(me)` (see below).

## The noun/verb splits (get these exactly right)

| Noun | Verb | Note |
|---|---|---|
| licence | to license | "a driver's licence"; "we license the SDK" |
| practice | to practise | "best practice"; "we practise TDD" |
| defence | (to defend) | noun `-ce`; there is no `-se` verb form here |
| offence | (to offend) | noun `-ce` |
| advice | to advise | distinct pronunciation, easy to keep straight |

A quick test: if you can put "a" or "the" in front, it is the noun (`-ce`). If it takes an object or a subject doing it, it is the verb (`-se`). "We follow best **practice**" (noun) but "we **practise** pairing" (verb).

## Words with no `-me` in Australian English

- `program`, not `programme`, for all senses in modern Australian technical writing (a program, a training program, to program). `programme` is British and dated here.
- `judgment` for a considered decision (`engineering judgment`), matching legal usage; `judgement` is acceptable in general prose but prefer `judgment` for consistency.
- Keep `-ment` where standard: acknowledgement, enrolment (single `l`), instalment (single `l`), fulfilment.

## Dates and time

- Prose: `2 July 2026`. Day, then the month spelled out, then the year, with no comma and no ordinal suffix (`2 July`, not `2nd July` or `July 2, 2026`). Keep the day and month on one line (a non-breaking space if the tool supports it).
- Numeric: `d/m/yyyy` (day first), for example `2/7/2026`, using an unspaced forward slash. Australian order is day/month/year. Never write the American `m/d/yyyy` in prose; `07/02/2026` reads as 2 July here and as 7 February to a US reader, so avoid ambiguous numeric dates in cross-audience text and prefer the spelled-out month.
- ISO `YYYY-MM-DD` is correct and preferred in logs, filenames, changelogs, data, and anywhere sort order or machine parsing matters. Keep it; do not "Australianise" a timestamp.
- Times: `4:00 pm`, `9:30 am` (lowercase, with a space). Give the time zone when it matters (`2:00 pm AEST`).

## Numbers, money, measurement

- In prose, spell out whole numbers under 10 and use numerals from 10 up (`three retries`, `12 nodes`), unless the value is a measurement, version, count in a table, or part of a calculation, where numerals are clearer throughout.
- Use `per cent` (two words) in running prose; use `%` in tables, UI text, metrics, and technical values.
- Thousands separator with a comma from four digits: `1,024`, `14,132`. (Not in identifiers, ports, years, or code.)
- Currency: symbol then numerals, no space: `$500,000`, `$1,800`. Australian dollars are the default; write `A$` or `AUD` only where a second currency is in play.
- Units: a space between value and unit (`10 MB`, `200 ms`, `2.5 GB`), except `%` and degrees.

## Terminology (prefer the Australian or plain term)

| Prefer | Avoid | Note |
|---|---|---|
| mobile / mobile phone | cell / cellphone | |
| autumn | fall | |
| public holiday | national holiday / federal holiday | |
| GST | sales tax / VAT | Australian goods and services tax |
| ABN, ACN | EIN / tax ID | Australian business/company numbers |
| postcode | zip code | |
| CV | resume / résumé | in an Australian professional context |
| enrol, enrolment | enroll, enrollment | |
| org chart / organisation | organization | |
| whilst / while | (both fine; prefer `while`) | `whilst` is acceptable but reads formal |

Use the plain word over the inflated one, the same as US-neutral engineering style: `use` not `utilise`, `about` not `in relation to`, `before` not `prior to`, `under` not `pursuant to`, `to` not `in order to`, `help` not `facilitate`.

## Hyphenation

- Hyphenate a compound modifier before the noun (`a well-tested module`, `a rate-limited endpoint`), not after it (`the module is well tested`).
- Never hyphenate an `-ly` adverb plus adjective or participle: `highly available`, `statistically significant`, `fully qualified`, not `highly-available`.
- Use the closed modern forms: `dataset`, `email`, `online`, `website`, `database`, `preprocessing`, `hyperparameter`, `coordinate`, `cooperate`, `hyperlink`, not their hyphenated ancestors.
- Treat a stacked chain of four or more hyphenated words (`end-to-end-encrypted-message-relay design`) as a recast prompt: usually a noun tower wearing hyphens (see engineer-voice.md). Keep genuine fixed idioms (`state-of-the-art`, `out-of-distribution`) where the field uses them.
- Do not mass-de-hyphenate correct technical compounds, and preserve hyphens inside identifiers, flags, and package names exactly.

## Punctuation in Australian technical prose

- Avoid the em dash (`—`, U+2014). Use a comma, colon, semicolon, parentheses, or a full stop. Two clauses that each stand alone usually read better as two sentences.
- The en dash (`–`, U+2013) is for closed numeric, date, or page ranges only (`pp 12–18`, `2024–2025`, `ports 8000–8100`). Do not use a spaced en dash as a habitual parenthetical.
- The spaced hyphen (` - `) escapes em-dash bans and linting, so police it by eye. It is acceptable in a title or heading where sibling documents already use it; avoid it as a clause separator in body prose. A document carrying many spaced-hyphen breaks reads as dash overuse and an AI tell. Prefer a colon for a label gloss and a comma, parentheses, or a full stop for an in-sentence break.
- Use semicolons for their two reliable jobs: separating list items that themselves contain commas, and occasionally binding two short balanced clauses in deliberate antithesis. Default to a full stop for two ordinary independent clauses; prose peppered with clause-joining semicolons reads as machine rhythm.
- Use a colon before a list, a genuine explanation that completes the lead clause, or a label gloss. Do not use a colon to splice on a second free-standing sentence, or to reproduce an em-dash pivot.
- Single quotation marks for quoted words and field names (`the 'Submit' button`); double only for a quotation inside a quotation. Be consistent within a document. (Exception: keep the exact quote characters when reproducing code or copied strings.)
- Sentence case for headings by default; match the repository if it uses Title Case consistently.
- No serial (Oxford) comma is the default Australian style, but use one wherever it removes ambiguity. Consistency within a document matters more than the rule.

## Australian English checklist

1. Spelling swept for `-ise`, `-yse`, `-our`, `-re`, doubled-`l` inflections, and the common US imports.
2. `licence`/`license` and `practice`/`practise` correct for noun vs verb; `program` not `programme`.
3. Dates spelled out in prose (`2 July 2026`), ISO in logs/data, no American `m/d/yyyy` in prose.
4. `per cent` in prose, `%` in tables and values; currency and units formatted correctly.
5. No em dash; en dash only for ranges; no spaced hyphens as clause separators; single quotation marks.
6. Hyphenation correct: no `-ly` adverb hyphens, closed modern compounds, no four-word hyphen chains.
7. US spelling preserved only inside identifiers, quotes, and copied source.
