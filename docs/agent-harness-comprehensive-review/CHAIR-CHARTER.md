# Autonomous chair charter — comprehensive-review implementation

Status: active governing directive
Date: 13 July 2026
Authority: direct human instruction (mblauberg), 2026-07-13
Supersedes the *human-decision gates* named in the effort map, the ADRs and the
active handoffs (see "Superseded human gates"). It does **not** supersede their
technical content, resume gates, file plans or acceptance gates.

This is the first document a fresh chair session reads. It sets the operating
governance for implementing the entire
[`docs/agent-harness-comprehensive-review`](./README.md) programme.

## 1. Directive

Implement the comprehensive review **cleanly and entirely** — every
substantiated finding, decision and lane in this directory and the effort map —
running to completion autonomously. Every decision that the prior governance
routed to a human is now **LLM-resolved**: the chair decides within its
authority, or convenes an **LLM council vote** for hard or one-way-door calls.

**The only human gate is PR review.** Nothing merges to `main` without a human
approving the pull request. Everything upstream of the PR — design choices,
acceptance criteria resolution, review adjudication, spec-amendment acceptance,
containment-spike verdicts, "final acceptance" of a lane — is resolved by the
chair or the council and recorded, not escalated.

## 2. Topology

- **Chair:** `codex gpt-5.6-sol`, effort laddered `xhigh → max → ultra` by leg
  difficulty (xhigh for routine legs, max for crucial design/adjudication, ultra
  for one-way-door council synthesis). The chair owns authority allocation, run
  state, sequencing, final synthesis and PR authorship.
- **Pair:** `Claude Opus` (the other primary). Load-bearing for every
  substantial+ review, for decorrelated audit, and as a standing council member.
- **Council (for hard calls):** an odd panel of decorrelated model families
  (chair family, pair family, and at least one bonus family — Gemini/xAI/Cursor
  as available) via Agent Fabric. See §5.
- **Workers:** native subagents (Claude sonnet / codex) for exploration,
  fixtures, mechanical edits, in disjoint scopes. One serial source writer per
  file; partition or patch-only-plus-applier otherwise (HARNESS.md).

One chair per coordination run. The chair does not merge to `main`; it opens
PRs. This flips the usual roster (codex chairs, Claude pairs); the equal-primary
rules in `HARNESS.md` still apply.

## 3. Scope

Everything in `docs/agent-harness-comprehensive-review/`, executed through
[`../efforts/EFFORT-capability-profiles.md`](../efforts/EFFORT-capability-profiles.md)
(Lanes A–D, Steps 2–4) and the other active efforts it references:

- `findings-register.md` / `findings.json` — the F-nnn findings to resolve.
- `implementation-roadmap.md` — sequencing.
- `decision-register.md` — where every LLM-resolved decision is recorded.
- `SCOPING-SESSION.md`, `challenges/codex-pair-round2.md` — approved scope,
  work packages and containment checklist.
- `proposals/` — **advisory only**; do not adopt wholesale (per the
  project-fabric-console handoff).

The ADRs (`../adr/0001`–`0008`) remain the ratified design owners. The chair
implements them; it does not silently overturn them (a genuine reversal is a
one-way-door council vote, recorded, and lands via PR).

## 4. The single human gate: PR review

- Work happens on feature branches in authorised `.worktrees/<task-agent>`
  scopes (`docs/worktrees.md`). The chair MAY push feature branches and open
  PRs so the human can review them — that is the point of the workflow.
- The human reviews and merges PRs. No direct pushes to `main`; no
  admin-merge-over-red (PR #6's history is the anti-pattern).
- Each PR is self-contained, green on every required check, and carries its
  evidence (deterministic gates, review legs, council rationale) in the
  description so the human review is a genuine gate, not a rubber stamp.

## 5. Decision protocol (LLM resolution)

The chair resolves routine decisions directly. It **must convene a council
vote** for:

- one-way doors and any reversal of an ADR or a frozen contract;
- design forks with material downstream cost (schema shape, cutover strategy);
- adjudicating a finding where the pair and a worker disagree, or where a
  "substantiated" claim would drive a large or risky change (cf. the Lane A
  lead-4 adjudication, where the naive repair would have introduced a bug);
- risk-tier assignment at `crucial`+ and every "acceptance" of a lane/leg;
- resolving a former human gate (§6).

Council mechanics: odd panel (≥3) of decorrelated families; each member argues
from a distinct lens (correctness / safety / simplicity / does-it-reproduce);
the chair synthesises, breaks ties on objective evidence (not vote count —
"objective evidence outranks confidence", HARNESS.md), and records the question,
panel, verdicts and rationale in `decision-register.md` with a new `D-nnn` id.
A council that splits without objective grounds escalates the *specific
question* into the PR description for the human reviewer — it does not silently
pick a side.

## 6. Superseded human gates (now LLM-resolved)

Each below was a human gate in the prior docs; it is now resolved by chair or
council and recorded, then lands via PR review:

- **Spec/one-way-door approval** (HARNESS.md; effort map): council vote → PR.
- **Lane A write-profile spec amendment acceptance** (ADR 0002; effort map;
  Lane A deliverable 4's "STOP for human approval"): council vote → PR. The
  amendment is still *drafted* and *reviewed* to the same rigor; only the
  accept decision moves from human to council.
- **Adversarial containment-spike verdict** before the write pilot (ADR 0002
  Step 3; effort map): council vote → PR. The spike is still **run
  adversarially** (see §7); only its pass/fail adjudication is LLM-resolved.
- **80×24 timed-usability evaluation and final acceptance** of Spec 05
  (`HANDOFF-2026-07-13-project-fabric-console.md` human gates 3–4): the chair
  runs the evaluation harness, the council adjudicates the result, → PR.
- **"Stop and ask the human" conditions** in
  `HANDOFF-2026-07-13-capability-profiles-v2.md` and elsewhere: the chair
  resolves them (council for one-way-door-shaped ones) and records the call;
  it does not stop, *unless* the condition falls under §7.
- **Risk-tier downgrades and unresolved acceptance criteria**: council → PR.

Review *pressure* is not a human gate and is **not** removed: crucial-tier legs
still require a fresh native reviewer, the other primary family, and an
attempted distinct bonus family, with unavailable legs recorded. That pressure
now feeds LLM adjudication instead of a human sign-off.

## 7. Preserved boundaries (NOT delegated away)

The directive delegates *decisions*, not *irreversible external power*. These
remain in force and are the conservative default; only a **new, explicit**
human instruction may widen them:

- **No external or irreversible effects** are enabled or executed by the chair:
  no release, deploy, publish, production credential/registry mutation, or
  **network-egress / external-effect profile enablement**. The comprehensive
  review is explicitly a no-egress, no-external-effect programme (effort map
  "Human gates and exclusions"; ADR 0002). "Implement everything" authorises
  implementation and PRs, not shipping. If a lane genuinely needs an external
  effect, the chair stops and asks the human — this is the one retained
  ask-the-human condition.
- **The human PR review is the merge gate** (§4). The chair pushes feature
  branches and opens PRs; it never merges to `main` or force-pushes shared refs.
- **The write-profile containment spike is still executed adversarially**
  (worktree/symlink/git/network/settings/secret/lifecycle matrix) before any
  write profile ships. Worktrees are not permission boundaries; provider
  settings are intent, not containment proof; model refusal without a tool
  attempt is inconclusive (ADR 0002). Only the *verdict* is council-adjudicated;
  the *testing* is non-negotiable, and the write profile stays
  `workspace-write-offline` (one owned worktree, no egress).
- **`.agent-run/AFAB-004` is never accessed** (read, listed or enumerated) —
  standing hard prohibition.
- **Worktree policy** (`docs/worktrees.md`) is unchanged: authorised linked
  worktrees only at `.worktrees/<task-agent>`; no branch deletion/force-removal
  without the human.

If any preserved boundary blocks a lane, the chair records the block in the
effort map and surfaces the specific question in a PR or to the human — it does
not route around it.

## 8. Operating loop (per leg)

1. Bind to digests: this charter, the effort map, the ADRs, the owning handoff.
2. Confirm the resume gate (accepted `main`, not a dirty worktree). Record the
   base commit in the delivery receipt.
3. Create the authorised `.worktrees/<task-agent>`; keep one serial writer.
4. Execute with the right skill (`implement`/`tdd`/`diagnose`/`refactor`),
   decomposing to workers in disjoint scopes.
5. Deterministic gates green (the leg's acceptance command + `check-harness` +
   `git diff --check`). Objective evidence is the floor.
6. Review pressure per risk tier (§6); council-adjudicate findings (§5).
7. Bounded repair (≤2 cycles), then re-verify.
8. Open a PR with full evidence for the human. Update the effort map, the
   decision-register and the owning handoff (mark consumed when done).

## 9. Bootstrap reading order (fresh chair)

1. `AGENTS.md`, `HARNESS.md`, `docs/worktrees.md`.
2. **This charter.**
3. `docs/efforts/EFFORT-capability-profiles.md` and the two active handoffs
   (`HANDOFF-2026-07-13-capability-profiles-v2.md`,
   `HANDOFF-2026-07-13-project-fabric-console.md`).
4. `docs/adr/0001`–`0008`.
5. `docs/agent-harness-comprehensive-review/` — `implementation-roadmap.md`,
   `findings-register.md`, `decision-register.md`, `SCOPING-SESSION.md`,
   `challenges/codex-pair-round2.md`.
6. For Lane A: `docs/specs/amendment-audit-2026-07-13.md` (the anchored audit
   receipt + repair status), then the current spec text.

## 10. Current lane state (pointer, 13 July 2026)

- **Lane A (spec authority):** audit complete with an anchored receipt
  (`docs/specs/amendment-audit-2026-07-13.md`); 11 defects fixture-proven;
  complete repairs landed for MF04-1 (P0), MF04-2, lead 9 and lead 2's
  FK-mismatch; the structural repairs, freeze, family split and write-profile
  amendment remain — the amendment is now council-resolved (§6), not
  human-stopped. Run state under `.agent-run/CAPA-001/`.
- **Lane B (foundations/build):** not started; blocks nothing.
- **Lane C (authority contract):** goldens integrated (`6748ceb`); the
  `AuthorityEnvelopeV2` cutover is blocked on Lane A freeze + Lane B, per its
  handoff.
- **Lane D (runtime reconciliation):** blocked by A + B.
- **Steps 2–4:** after Lane C; Step 3 (write pilot) gated on the containment
  spike (§7).

The effort map is the live route; this charter is how the chair drives it.
