---
name: skill-audit
description: "Use for read-only audit of existing Agent Skills: triggers, overlap, portability, token cost, security, and effectiveness evidence. Not for a new skill or edits; use skill-authoring or implement."
---

# Skill audit

Assess whether skills are discoverable, focused, portable and effective. This
skill is read-only: return an evidence-backed report, never edit the skills.

## Privacy boundary

Default to static analysis and versioned routing fixtures. Do not scan provider
transcripts, private memory or project content merely because those stores
exist. Historical session analysis requires explicit human authority naming the
roots or receipts, time window, target skills, disclosure destination and
retention. Show that scope before reading content.

Use `scripts/collect_telemetry.py --dry-run-scope` to emit the proposed scope
without reading source bodies. Collection requires the matching receipt with
explicit human approval; unsupported schemas fail before traversal.

Persist metadata-only aggregates: day/week bucket, platform, skill, event and
count. Never persist prompts, responses, tool arguments/results, file content,
absolute paths, usernames, project names, session IDs or free-text reactions.
Evidence snippets require separate opt-in, local redaction and a private
run-owned artifact; public reports use synthetic or paraphrased examples.
Absent or unsupported telemetry is `N/A`, never zero usage.

Use `scripts/validate_telemetry.py` before relying on a telemetry artifact.

## Workflow

1. Resolve target skills from the canonical catalogue and deduplicate links.
2. Run static checks: frontmatter/YAML, trigger and exclusion clarity,
   adjacent-skill conflicts, broken paths/tools, instruction density, body size,
   progressive disclosure, complete provider-rendered catalogue budget,
   provider-sidecar parity, provenance/licence, authority/state writes, scripts,
   hooks/MCP/network surfaces and deterministic fixtures.
3. If authorised telemetry exists, verify its scope and privacy receipt, then
   calculate trigger, completion, correction and cost signals. Never infer
   invocation from a skill being loaded into context.
4. Use balanced, versioned routing evals for undertrigger and overtrigger
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
