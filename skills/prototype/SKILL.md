---
name: prototype
description: Use when a design or feasibility question is answerable by building rather than debating — "will this library work", "is this approach fast enough", "what does this UX feel like" — when scoping stalls on an assumption nobody can verify from docs, or when asked to productionise, ship, or "wire in" existing spike/prototype code (the skill forbids it). Builds a timeboxed, throwaway spike to harvest a learning, then deletes the code. Not for production code (use tdd) and not for requirements questions (use grill-me/scope).
---

# prototype — spike to learn, then throw it away

Some uncertainty is cheaper to build through than to talk through. A
prototype exists to answer ONE named question; the deliverable is the
answer, never the code.

## Contract (agree before writing code)

1. **The question** — one sentence, falsifiable. "Can X stream 10k rows
   without buffering?" not "explore X".
2. **Timebox** — default 30–60 min of agent work. Hit the box with no answer
   → that IS a finding (question too big; split it or grill further).
3. **Kill criteria** — what result answers the question either way.
4. **Where it lives** — scratch dir or `spikes/<slug>/` outside production
   source. Never on the production path, never imported by real code.

## Rules

- **Vibe freely inside the box.** No tests, no review tiers, no style rules —
  this is the one place structure is waste. The discipline is the boundary,
  not the code.
- **Cheat aggressively**: hardcode data, stub auth, fake the network. Only
  the question's variable needs to be real.
- **One question per spike.** A second question mid-spike → note it, finish,
  spike it separately if it still matters.
- **Harvest, then delete.** The learning graduates (memory policy in
  `~/.agents/HARNESS.md`): finding + evidence into the spec, decision record,
  or scoping thread that spawned the question. Code is deleted or archived
  same session — a lingering spike becomes accidental production.
- **Prototype code never "graduates" to production.** Rebuild under tdd with
  the learning in hand; the spike's value was the answer, and porting vibe
  code smuggles its shortcuts in with it.

## Harvest format (into the owning doc/thread)

```markdown
**Spike:** <question>  (YYYY-MM-DD, timebox 45m)
**Answer:** yes/no/partial — <one paragraph, numbers where measured>
**Evidence:** <command run, output, or measurement>
**Implication:** <what the spec/decision now says because of this>
```

## Red flags

- "The spike works, let's ship it" → rebuild under tdd; delete the spike.
- Spike touching production files or secrets → wrong dir, stop.
- No timebox agreed → not a spike, just unscoped wandering.
- Answer known from docs/a search in <10 min → didn't need a spike.
