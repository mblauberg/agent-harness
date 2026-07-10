---
name: engineering-docs
description: Use when creating, updating, or archiving engineering documentation in any project — specs, stories, diagrams, runbooks, threat models, READMEs, context digests, state files, or any markdown deliverable (not ADRs where a project has its own ADR process). Also use when setting up a new project's docs layout. Project-specific variants override this skill in their own workspace.
---

# engineering-docs — engineering docs as durable deliverables

Docs are professional deliverables with an audit trail, not notes. Every
claim that rests on a decision cites it; every retired doc is archived, never
deleted. Prose: load `engineering-writing` for substantial drafting.
Australian English.

## Doc homes (default layout — new projects start here, existing projects keep theirs)

| Type | Home | Convention |
|---|---|---|
| Stories / specs | `docs/stories/` or `docs/specs/` | `NN-slug.md`, numbered, indexed |
| Architecture map | `docs/ARCHITECTURE.md` | living current-state; points at ADRs, never restates them |
| Diagrams | `docs/diagrams/` | Mermaid-in-markdown, `NN-slug.md`, registered in `00-index.md` |
| Runbooks | `docs/runbooks/` | `NN-slug.md`, registered in `00-index.md`; numbered steps, ops voice, verify block |
| Open-decision register | `docs/OPEN_DECISIONS.md` | one row per human/owner gate; never auto-answered |
| Threat models | `docs/threat-models/` | STRIDE/LINDDUN structure |
| Rolling state | `docs/STATE.md` | rules embedded in the file (`session` skill) |
| Archive | `docs/archive/` | indexed by its README |

## Binding rules

1. **Citations are verified, never invented** — before citing a decision ID,
   grep the decision log for the exact row.
2. **Generated files are never hand-edited** — regenerate via their tool.
3. **Numbered dirs stay contiguous and indexed** — adding `11-x.md` means
   updating `00-index.md` in the same commit.
4. **Frozen language stays byte-frozen** — legal/compliance/gate wording is
   quoted and linked, never paraphrased.
5. **Anti-bloat**: an agent-facing doc past ~15 KB is a split/merge review
   signal, not an automatic split. Split when owners, audiences, lifecycles or
   change rates differ; merge duplicate truths or tiny files always changed
   together. Keep one canonical owner and make current claim → owner → evidence
   reachable in at most three hops. Session residue never accumulates in live
   dirs; use `session`'s context-hygiene pass.

## Diagrams

Default **Mermaid in markdown** — renders on GitHub, diffs as text, any agent
can edit. One concern per diagram; a `> ` call-out of the load-bearing
invariant; a traces-to line citing real decisions/paths. Pick by what the
reader must grasp: flow → `flowchart`; who-calls-whom → `sequenceDiagram`;
lifecycle → `stateDiagram-v2`; schema → `erDiagram`; system context →
C4-style flowchart. Escalate to D2 (`d2-diagrams` skill) only for
publication-quality figures.

**Validate before commit** (a broken block ships as a grey error box):

```sh
mmdc -i docs/diagrams/NN-slug.md -o "$(mktemp -d)/check.md"  # exit 0 = renders
```

## Archiving (move-never-delete)

1. `git mv` into the archive dir (keep internal paths stable). Cross-repo:
   `cp` + `git rm`, two commits, each citing the other's hash.
2. Add the row to the archive index README.
3. Live citations of the old path get a tombstone pointer or a same-commit fix.
4. True deletion is an owner decision — record it, don't do it.

## Red flags

- Citing a decision you didn't verify → grep the log first.
- Hand-editing a generated index → regenerate it.
- Deleting anything historical → archive instead.
- New doc with no index entry → orphaned the day it lands.
