# Implementation run contract

`RUN.json` is the machine-readable lifecycle receipt. Markdown findings and
summaries may explain it, but do not replace it.

## Required states

```text
approved spec/design
  -> implementing
  -> verifying
  -> reviewing
  -> repairing (0..2 times)
  -> awaiting-human
  -> complete
```

Return to `scope` when implementation exposes a new requirement, non-goal,
one-way-door design choice, external authority, or acceptance criterion. Do not
hide scope drift in a repair.

## Expedited incident mode

`mode: expedited-incident` is for active service/safety impact, not deadline
pressure. It compresses scope to the smallest reversible containment change; it
does not remove human authority, risk, verification or independent review.
Record the incident reference, reason, human incident authority, follow-up
owner and UTC reconciliation deadline. Use at least `crucial` risk. After
stability, a normal scope/implementation run reconciles provisional decisions, tests,
docs and structural debt. Missed reconciliation is an explicit blocker.

## Evidence rules

- Scope supplies `risk_assessment` and `authority`. The validator derives the
  minimum risk tier from `config/risk-policy.json`; a lower declared tier needs
  a named human override and reason. Authority records bounded source/artifact
  paths, prohibited actions, disclosure, secrets, deployment, irreversible
  actions and expiry. Worker authority can only narrow it.
- `ignored_path_exemptions` may name generated cache roots such as
  `node_modules/`, `.venv/`, `build/` or `.cache/`; it cannot hide secrets,
  configuration or arbitrary ignored files from write-scope accounting.
- A human-authorised linked checkout lives only at the owning repository's
  primary root under `.worktrees/<name>` and is created through
  `${AGENTS_HOME:-$HOME/.agents}/scripts/worktree`. Run the change from that
  checkout and set `implementation.repo_root` to it. Sibling `.worktrees/`
  checkouts are protected infrastructure: they are excluded from the primary
  checkout's Git evidence but can never be authority, exemption or applied
  paths. Worktree authority does not authorise a new/delete branch or a force
  removal.
- Each acceptance criterion has a stable ID, status and evidence list.
- Verification records exact commands and exit codes. A skipped or unavailable
  check is not `pass`.
- Each reviewer record contains role, adapter, actual `provider_family`, status,
  output path and the normalised dispatcher certification fields where used:
  `dispatch_status`, `cross_family`, `certification_eligible` and
  `read_only_guarantee`.
- Provider family means model lineage (`anthropic`, `openai`, `google`, `xai`,
  `moonshot`, and so on), not the CLI carrying it.
- Record missing load-bearing lanes with `status: unavailable` and a reason.
  The validator fails when native or other-primary coverage is absent.
- Bonus-family lanes are opportunistic. Record `pass`, `failed`, `unavailable`
  or `skipped` plus a reason when they do not pass; their absence of output does
  not block the gate. Their findings remain advisory until a primary-family
  reviewer corroborates the evidence.
- `repair_cycles` counts completed repair/reverify/re-review cycles and cannot
  exceed two.
- `unresolved_blockers` is explicit even when empty.
- `updated_at` and `checkpoint` make the receipt the live recovery capsule.
  Update them before/after dispatch and at every lifecycle transition;
  `current_slice`, `next_action`, in-flight worker IDs and artifact paths must
  let a fresh operator resume without the transcript.
- Substantial and higher runs record `context_hygiene.status: pass`, the
  read-only audit command plus exit code 0, actions taken and retained recovery artifacts.
  Cleanup never erases a failed reviewer/worker receipt.
- If scope marks stochastic or judgement-bearing behaviour, `assurance`
  requires a passing `evaluate` receipt. A deterministic test exit code cannot
  stand in for product-quality evaluation.

## Paired-primary mode

`pair.mode: paired-primary` follows
`orchestrate/references/paired-primary.md`: exactly one chair, one owner per
stage, a completed/acknowledged baton ledger, and no overlapping active source
writer. The peer may certify other-primary review only when its review record
proves fresh context and no authorship or decision influence over the reviewed
surface. Degraded mode records a reason; it never silently becomes solo.

## Review coverage

- `routine`: lead plus native review as proportionate; no external receipt
  required.
- `substantial`: one passing fresh-context `native-review` from the lead family
  plus one passing `other-primary` reviewer from the other primary family.
- `crucial`: substantial coverage plus one recorded bonus-family attempt.
- `terminal`: substantial coverage plus two recorded, mutually distinct
  bonus-family attempts where available.

If the other primary is unavailable, stop at the human gate with the missing
leg recorded. Bonus-family quota/API failures are recorded but non-blocking.
When two distinct bonus families are unavailable, terminal runs record
`bonus_coverage_reason`; retries through one family do not masquerade as two
independent families and still do not block the primary-certified workflow.

## Gates

`${AGENTS_HOME:-$HOME/.agents}/skills/implement/scripts/validate_run.py RUN.json`
validates the machine gate and permits
`phase: awaiting-human` with final approval pending.

`${AGENTS_HOME:-$HOME/.agents}/skills/implement/scripts/validate_run.py --gate complete RUN.json`
additionally requires explicit human
approval and `phase: complete`.
