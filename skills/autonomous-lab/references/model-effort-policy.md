# Model and effort policy

`~/.agents/HARNESS.md` owns the dated family roster and substitution policy.
This file maps task classes to durable aliases and reasoning effort inside an
autonomous lab. Runtime discovery resolves every alias to a concrete model at
bootstrap; record that resolution in the run context.

## Stable aliases

| Alias | Use |
|---|---|
| `flagship` | Requirements, architecture, interfaces, one-way doors, synthesis, adjudication, all judges/refuters/finalizers and hard repairs. |
| `workhorse` | Bounded research lenses, ordinary vertical implementation under an approved contract, docs drafts and medium-complexity extraction. |
| `scout` | Inventory, locating, deduplication, formatting, queue hygiene and other schema-forced mechanical work. |

Aliases are roles, not model IDs. Never pass a literal alias to a provider API
that does not support it. Resolve it through the operator's current model list.
An unavailable alias moves upward (`scout` → `workhorse` → `flagship`), never
silently downward. Record every substitution.

## Standing rules

1. **Judgement stays flagship.** Cheap breadth may feed a decision; it never
   makes it. No scout/workhorse judge, ADR verdict, boundary choice or final
   synthesis.
2. **Code is contract-first.** A flagship defines public interfaces, invariants
   and test contracts. Workhorse agents may implement bounded vertical slices.
   Scout agents do not author production behaviour.
3. **Review is independent.** Every material implementation receives a fresh
   flagship review plus the other primary where required. Bonus-family attempts
   follow HARNESS.md but never become load-bearing.
4. **Failure raises quality.** Repeated disagreement, ambiguity or failed
   verification escalates model and effort. It never triggers an unrecorded
   downgrade.
5. **Model choice follows reversal cost.** File length and token volume do not
   decide the tier; authority, ambiguity, blast radius and oracle quality do.

## Effort tiers

| Effort | Use |
|---|---|
| `low` | Deterministic transforms and formatting. |
| `medium` | Schema-bound extraction, inventory and routine implementation with a strong test oracle. |
| `high` | Research, design, implementation, review and synthesis requiring judgement. |
| `xhigh` | One-way-door and hard-gate design, adversarial review and difficult repair. |
| `max` | One singular terminal synthesis or deepest refutation; never spray across a fan-out. |
| `ultra` | Eligible GPT-5.6 Codex lead: maximum reasoning plus proactive native subagent delegation for a substantial-to-terminal workflow graph. |

If a runtime exposes a narrower effort scale, map to the closest supported
level and record the mapping. `ultra` is an orchestration posture as well as an
effort tier; it is not a model ID. Do not apply it to Claude or a brokered model
without runtime proof.
Treat Ultra eligibility as a route capability, not a free-form label. An
explicit unsupported request fails closed. If an eligible role default cannot
be satisfied, record the effective fallback and why it was selected.

## Task matrix

| Task | Alias | Effort |
|---|---|---|
| One-way-door design, hard-gate ADR, public contract/interface | `flagship` | `xhigh` |
| Terminal synthesis or deepest refutation | `flagship` | `max` |
| Codex lead over a cleanly partitionable substantial/terminal run | `flagship` | `ultra` when eligible; otherwise `max`/`xhigh` plus explicit fan-out |
| Ordinary architecture, planning, adjudication and code review | `flagship` | `high` |
| Corpus-wide consistency review | `flagship` | `high` |
| Research fan-out lens | `workhorse` | `high` |
| Ordinary vertical implementation under approved tests/contracts | `workhorse` | `medium`–`high` |
| Docs/story/diagram draft | `workhorse` | `high`; flagship review if load-bearing |
| Structured extraction and inventory | `scout` | `medium` |
| Persist, format, rename and queue hygiene | `scout` | `low` |
| Hard-gate external verification | other primary plus opportunistic bonus families | HARNESS.md ladder |

## Workflow wiring

Resolve models once, then pass concrete IDs per stage. Pseudocode:

```js
const models = args.resolvedModels // concrete runtime IDs, recorded in run context

agent({ task: designContract(item), model: models.flagship, effort: 'xhigh' })
agent({ task: implementSlice(item), model: models.workhorse, effort: 'high' })
agent({ task: inventory(shard), model: models.scout, effort: 'medium' })
agent({ task: refute(result), model: models.flagship, effort: 'high' })
```

Each workflow header states its alias/effort choices. If the runtime inherits a
session model when `model` is omitted, omission is allowed only when bootstrap
proved and recorded that the inherited model resolves to the required alias.

## Convergence

- A workhorse change touching an unapproved boundary, public type, dependency
  direction or invariant is rejected and re-routed to flagship.
- A scout output containing judgement is rejected and re-run at workhorse or
  flagship.
- Two failed repair/review cycles stop at the human gate with evidence.
- Objective gates and RED-on-mutation checks carry the guarantee; model prestige
  does not rescue a decorative or skipped gate.
