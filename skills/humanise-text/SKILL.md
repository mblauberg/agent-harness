---
name: humanise-text
description: Use when AI-sounding, robotic, or formulaic text needs a natural human voice, matching to a writing sample, or removal of chatbot artefacts and filler while preserving facts, citations, numbers, and meaning. General-purpose; defer to engineering-writing, academic-writing, or legal-writing for those domains.
---

# Humanise Text

Rewrite text so it reads as though a person wrote it. Preserve meaning, facts, citations, and intent while removing synthetic rhythm, filler, canned framing, and chatbot residue.

This is the general-purpose humaniser. When the text is software-engineering prose, an academic thesis, or Australian legal writing, defer to `engineering-writing`, `academic-writing`, or `legal-writing`; they carry the specialised rules. Use this skill for everything else, and for mixed or unclassified prose.

## When to use

- Rewrite text so it stops sounding AI-generated, ChatGPT-ish, or robotic.
- Match the user's own voice from a sample.
- Strip assistant artefacts, vague authority, and empty signposting.
- The draft is clean but generic, padded, salesy, or too even in rhythm.

Do not use it to fabricate experience, invent sources, or degrade correct writing so it "passes" a detector.

## Hard rules

- Preserve facts, logic, citations, stance, numbers, named entities, and quoted terms. Freeze these before rewriting.
- Never invent anecdotes, quotes, sources, slang, typos, or uncertainty to simulate humanity.
- Do not optimise for detector scores. Detectors false-positive on disciplined, formal prose; the traits that actually read as machine-written are the ones this skill removes anyway.
- If a claim lacks support, narrow it or flag it (`[FLAG: cite source]`); do not silently strengthen it.
- If the user gives a writing sample, it is the style authority. If the text already reads human, say so and edit lightly.
- Precision before personality in anything factual, legal, medical, or citation-heavy.

## Modes

`rewrite` (default), `diagnose`, `match-voice`, `light-touch`, `precision-preserving` (high-stakes or citation-heavy), `full-humanise` (low-stakes prose, or an explicit "make this sound human"). Default to the safest mode that satisfies the request; escalate only if the result still sounds assembled. Combine any with `match-voice` when a sample exists.

## Workflow

1. Lock invariants.
2. Diagnose the real problem, not just surface words. Work the three tiers below; fuller checklist in `references/patterns.md`.
3. Rewrite structurally, not by swapping synonyms: change sentence shape, rhythm, emphasis, and transitions. Replace vague claims with specifics already in the source; if none exist, keep the claim modest.
4. Calibrate confidence sentence by sentence (below).
5. Audit as an irritated editor: remove leftover tells, confirm no factual drift, then ask "what still makes this obviously AI?" and fix only what that reveals.

## The tiers (why text sounds AI)

No single word or mark proves machine drafting; density and clustering do. Lexical tells shift each model generation (`delve`, `tapestry` gave way to `showcase`, `foster`, `enhance`, then `emphasise`), so flag clusters, not one lone word, and lean on structure as the vocabulary dates.

- **Tier 1 — artefacts, delete on sight.** Chatbot framing (`Great question`, `Let's dive in`, `I hope this helps`), throat-clearing and meta-discourse (`It is important to note`, `This guide explains`), tool and markup residue, `As an AI language model` text, and fabricated references. Write about the subject, not the act of writing.
- **Tier 2 — density signals, a cluster is the tell.** Puffery (`crucial`, `seamless`, `robust`, `game-changing`), inflation vocabulary (`leverage`, `utilise`, `facilitate`, `foster`, `delve into`), copula avoidance (`serves as`, `boasts`, `features`), interpretation-smuggling verbs (`underscores`, `showcases`, `highlights`), vague benefit claims (`streamlines workflows`, `enhances reliability`), empty `-ing` tails (`..., ensuring reliability`), formulaic contrast (`not just X but Y`; false `from X to Y` ranges), fake conclusions (`In summary`, `Overall`), vague authority (`experts say`), stacked `Moreover`/`Furthermore` openers, and hedge-and-reassure piles.
- **Tier 3 — structural tells, police hardest** (they survive synonym swaps): metronome rhythm, a connective opening every paragraph, a both-sides seesaw that never lands, hollow topic sentences, recap endings, evenly weighted lists, template sections, uniform confidence, and unanchored claims with nothing checkable. Also the **noun tower** (`class-specific generator prompt stack`): cap the premodifiers and free the buried verb.

Full catalogue, voice-matching rubric, and genre notes: `references/patterns.md`.

## Positive habits

Concrete nouns and verbs; specific numbers and named things; one term per concept (no synonym-cycling for variety); varied sentence length with a short sentence to land the point; first person only where it fits; one claim, one qualifier the evidence warrants; keep honest negatives rather than smoothing them away.

## Calibrated confidence

Match assertion strength to evidence. State strong claims plainly with their support; give weak claims one qualifier (`appears`, `likely`, `not verified`). Never flatten both to one register or dress a guess as a finding. Intensifiers (`clearly`, `obviously`) cost credibility rather than add it.

## Sentence mechanics (quick fixes)

- Dangling openers: a leading participial or adjective phrase must attach to the subject (`Running the job, I saw the error`, not `Running the job, the error appeared`).
- No comma splice: join independent clauses with a full stop or semicolon, not a comma.
- `that` defines (no comma); `which` adds an aside (commas). The comma changes the meaning.
- Keep limiting modifiers next to what they limit (`found only two`, not `only found two`); correlatives take parallel forms (`either X or Y`, `not only X but also Y`).

## What "more human" is not

Not slang, jokes, invented anecdotes, fake messiness, or deliberate grammar degradation. Clear, plain, specific, consistent writing is the target. Do not flatten the user's real voice into generic blog prose, and do not treat polished, formal style as an AI tell in itself.

## Output

Rewrite: final version first; brief notes only if they help. Diagnose: lead with the strongest tells, then rewrite if useful. If the honest answer is "this already sounds human", say so. Flags: inline and short, summarised once below.
