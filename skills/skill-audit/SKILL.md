---
name: skill-audit
description: "Use for read-only audit of existing Agent Skills: triggers, overlap, portability, token cost, security, and effectiveness evidence. For audit-plus-action work, the action/lifecycle owner is primary and skill-audit is a companion. Not for a new skill or edits; use skill-authoring or implement."
---

# Skill audit

Assess skill discoverability, focus, portability and effectiveness. This skill
is read-only: report evidence; never edit skills.
When a request combines audit with revision, evaluation, export or documentation,
the action-owning lifecycle remains primary and `skill-audit` is its companion.

## Evidence modes

Default to static analysis and frozen routing fixtures. Do not inspect session
history, private memory or project content merely because it exists.

For personal work, a direct human request authorises read-only analysis of the
named local histories. Do not require a second privacy receipt,
redaction pass, retention date or minimum-cell suppression. Read histories in
place; keep temporary excerpts local and run-owned; never commit raw transcripts
or promote them to project truth. Ask only when roots or the useful time window
are materially ambiguous. Unsupported or unattributable evidence is `N/A`,
never zero.

An aggregate or paraphrased report to the human in the same authorised
session is local delivery, not sharing/export, and needs no second
disclosure confirmation. Run-owned scratch is allowed. Separate
authority is required before creating a persistent repository/shared artifact,
sending raw excerpts to another provider, or disclosing to a new audience or
external destination. When authorised, confirm with the human the audience,
destination and whether excerpts are allowed; exclude secrets and out-of-scope
third-party content.

## Workflow

1. Resolve target skills from the canonical catalogue and deduplicate links.
2. Check frontmatter/YAML, trigger and exclusion clarity,
   adjacent-skill conflicts, broken paths/tools, instruction density, body size,
   progressive disclosure, complete provider-rendered catalogue budget,
   provider-sidecar parity, provenance/licence, authority/state writes, scripts,
   hooks/MCP/network surfaces and deterministic fixtures.
3. If local history analysis was requested, classify provenance before
   calculating signals: human, platform metadata, notification, managed worker,
   skill injection, command or unknown. Never infer selection from a skill
   merely being loaded, and state small-sample limitations.
4. Use balanced, frozen routing evals for undertrigger and overtrigger
   claims. A raw keyword match is only a candidate, not ground truth.
5. Report all dimensions from `references/method.md`; mark missing evidence
   `N/A` and keep static facts separate from behavioural estimates.

For a plugin/package intake, pin source and commit, inventory every component
and digest, inspect manifests, installers, hooks, binaries, MCP/app endpoints,
network/data retention, permissions, update/rollback and licence boundaries.
Do not execute third-party code during static intake. Recommend a plugin only
for a coherent distribution/runtime boundary; otherwise extract small licensed
mechanisms into existing local owners.

## Output

Return a compact table with score, evidence and confidence, then P0/P1/P2
findings. Every behavioural rate names its numerator, denominator, source,
window and limitations. Suggested description changes must name the confusion
case and a balanced regression fixture. Prefer tiering detail into references;
merge or split only when triggers, authority, artifacts and completion gates
support a stable boundary.
