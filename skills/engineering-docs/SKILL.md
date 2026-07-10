---
name: engineering-docs
description: Use when creating, updating, or archiving engineering documentation in any project — specs, stories, diagrams, runbooks, threat models, READMEs, context digests, state files, or any markdown deliverable (not ADRs where a project has its own ADR process). Also use when setting up a new project's docs layout. Project-specific variants override this skill in their own workspace.
---

# Engineering docs

Treat docs as durable, audited deliverables. Cite decisions, archive retired
docs, use Australian English and load `engineering-writing` for substantial
prose.

## Default homes

| Type | Home | Convention |
|---|---|---|
| Stories / specs | `docs/stories/` or `docs/specs/` | `NN-slug.md`, indexed |
| Architecture map | `docs/ARCHITECTURE.md` | current state; links to ADRs |
| Diagrams | `docs/diagrams/` | Mermaid, `NN-slug.md`, indexed |
| Runbooks | `docs/runbooks/` | numbered steps and verification |
| Open-decision register | `docs/OPEN_DECISIONS.md` | one row per human/owner gate; never auto-answered |
| Threat models | `docs/threat-models/` | STRIDE/LINDDUN structure |
| Rolling state | `docs/STATE.md` | rules embedded in the file (`session` skill) |
| Archive | `docs/archive/` | indexed by its README |

## Binding rules

1. Verify a decision ID against its log before citing it.
2. Regenerate generated files; never hand-edit them.
3. Keep numbered directories contiguous and update their index in the same
   change.
4. Quote and link frozen legal, compliance or gate wording; do not paraphrase.
5. **Anti-bloat**: an agent-facing doc past ~15 KB is a split/merge review
   signal, not an automatic split. Split when owners, audiences, lifecycles or
   change rates differ; merge duplicate truths or tiny files always changed
   together. Keep one canonical owner and make current claim → owner → evidence
   reachable in at most three hops. Session residue never accumulates in live
   dirs; use `session`'s context-hygiene pass.

## Diagrams

Default to **Mermaid in markdown** for GitHub and operational docs. Use
`flowchart` for routing, `sequenceDiagram` for calls, `stateDiagram-v2` for
lifecycles, `erDiagram` for schemas and a C4-style flowchart for context.

**Render and visually inspect before commit.** Parser success proves syntax,
not layout quality:

```sh
src="$(pwd)/docs/diagrams/NN-slug.md"
out="$(mktemp -d)"
(cd "$out" && mmdc -i "$src" -o check.md)
```

Keep one conceptual level per diagram. Split overview from detail when return
edges distort the main path. Check normal and narrow widths for overlap,
clipping, crossings, blank space and unreadable scaling. Apply
[diagram-quality.md](references/diagram-quality.md). Use `d2-diagrams` only
when fixed layout or publication quality justifies a rendered asset.

## Archiving (move-never-delete)

Move into the archive, update its index, and repair live citations or leave a
tombstone pointer. Preserve history across repositories with linked commits.
True deletion requires an owner decision.

## Red flags

- Unverified decision citation.
- Hand-edited generated output.
- Deleted history or an unindexed new document.
