# Style Standard

Use this reference when the task needs more than a light rewrite.

## Clarity

- Use precise, unambiguous words.
- Define technical terms and abbreviations on first use, unless the audience clearly knows them.
- Put the main point before supporting detail.
- Keep one idea per paragraph or list item.
- Put conditions before consequences when order matters.
- Keep related words together, especially subjects, verbs, objects, and conditions.
- Use concrete nouns and verbs.
- State what is true before explaining what is not true, unless contrast is the point.
- Place the sentence's most important idea at the end when emphasis helps the reader remember it.

Prefer:

```text
The API returns 401 when the token expires.
```

Avoid:

```text
An authentication issue may occur in certain situations.
```

## Composition

- Start paragraphs with the point, then give evidence, context, or consequence.
- Use one paragraph for one topic. Split when the reader must track a new condition, cause, actor, or consequence.
- Use parallel structure for parallel ideas: same grammar, same order, same level of detail.
- Keep cause and effect close together.
- Keep modifiers beside the words they modify.
- Avoid a loose chain of clauses joined by `and`, `but`, or `because`. Split or reorder it.
- End sections with the decision, risk, next action, or remaining uncertainty, not a generic conclusion.

## Concision

- Remove words that do not help the reader act, understand, or decide.
- Prefer short sentences, but do not remove precision to hit a number.
- Replace `in order to` with `to`.
- Replace `it is possible to` with the direct action.
- Replace `there is` and `there are` when they hide the subject.
- Replace `the fact that` with the fact itself.
- Replace negative phrasing with direct phrasing when it is clearer: `not supported` can become `unsupported`; `does not pass` can become `fails`.
- Remove repeated qualifiers such as `very`, `really`, `basically`, `actually`, `potentially`, and `quite`.

## Accuracy

- Report exact values with appropriate precision.
- State units, time zones, versions, platforms, and jurisdictions when they affect meaning.
- Keep numbers, identifiers, commands, flags, error text, and file paths exact.
- Distinguish observations from interpretations.
- Do not strengthen claims beyond the evidence.
- Use `[FLAG: cite source]`, `[FLAG: verify value]`, or `[FLAG: define term]` when support is missing.

## Claim discipline

Classify a claim before wording it, and make the verb match the evidence class:

| Class | Meaning | Safer verbs |
|---|---|---|
| observed | directly measured, run, or reproduced | `measured`, `recorded`, `observed`, `reproduced`, `returns` |
| inferred | supported by evidence, not directly measured | `suggests`, `indicates`, `is consistent with`, `likely` |
| designed | what the code or contract requires | `rejects`, `enforces`, `validates`, `retries`, `caps` |
| limitation | what was not measured, tested, or included | `not tested`, `not measured`, `does not establish` |
| planned | specified but not built or not run | `planned`, `scheduled`, `is intended to`, `will` |
| pending | placeholder or unverified result | `pending`, `unverified`, `[FLAG: verify]` |

- **The implicit-completion tense trap.** Neutral present tense silently asserts that planned work is done: `The service handles failover` reads as shipped behaviour. If it is unbuilt or untested, scope it (`the design routes failover through the standby region`) or state the status. README feature lists claim only what ships today.
- **Comparatives carry their number.** Ban bare `faster`, `better`, `improved`, `higher`, `more scalable` on their own. Give the measurement and its conditions, or point to it: `cold start dropped from 3.1 s to 0.9 s (M2, cache warm)`, not `startup is much faster`.
- **State the scope of the evidence.** `Passes the integration suite on Linux` is a different claim from `works`. Name the environment, versions, data, and load under which a result held.
- **Do not mix classes in one sentence** when it creates ambiguity; split the observed part from the inference and the plan.

## Objectivity

- Avoid blame, hype, and moral judgement.
- Describe behaviour and impact.
- Acknowledge conflicting evidence when it materially changes the conclusion.
- Name the source of an interpretation when the reader needs to know who made it.

## Australian English

Use Australian English unless the project, product, API, quoted source, or repository convention requires another variant. The full mechanics checklist (spelling, the licence/practice noun-verb splits, `program` not `programme`, dates, numbers, terminology, punctuation) lives in `australian-english.md`. In short: `-ise`/`-yse`, `-our`, `-re`, doubled-`l` inflections; `per cent` in prose and `%` in values; dates spelled out (`2 July 2026`); no em dash.

## Editing Checklist

1. What must not change?
2. Who is the reader?
3. What should the reader do, know, or decide?
4. Can the first sentence say the point directly?
5. Can any word be removed without losing meaning?
6. Are terms consistent?
7. Are uncertainty and evidence handled honestly?
8. Does the text use Australian English?
9. Does each paragraph or list item have one job?
10. Are related words and conditions kept together?
