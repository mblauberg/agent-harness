# Autonomous chair charter (preserved authority envelope)

Provenance: extracted from
`docs/agent-harness-comprehensive-review/CHAIR-CHARTER.md` (active governing
directive, 13 July 2026) before that directory's deletion. This file preserves
the parts of the charter that appear nowhere else in the pack: the D-021 human
authority statement, the superseded-human-gates record (§6) and the
preserved-boundaries safety envelope (§7). The §6 and §7 text below is
**verbatim**.

## 1. OPEN HUMAN DECISION — carry-over of the authority envelope

**Read this before relying on anything below.**

The charter's stated scope was "implementing the entire
`docs/agent-harness-comprehensive-review` programme." **That programme is
superseded by this simplification pack.** Whether the D-021 human authority
envelope — and in particular the §7 preserved boundaries — carries over to the
pack's implementation, or lapses with the superseded programme, is a **live
binding question that only the human can answer.** It is not resolved here and
must not be silently dropped.

Until the human rules:

- Treat the §7 preserved boundaries as **still in force** (they are the safe,
  conservative default).
- Do not assume the §6 gate-supersession (LLM-resolution of former human gates)
  automatically re-applies to pack work packages; surface it for the human when
  a pack work package would rely on it.

Record the human's ruling as a new decision (see `15_DECISION_REGISTER.md`,
D-021 row).

## 2. D-021 authority statement (verbatim from the charter header + register)

- Status: active governing directive.
- Date: 13 July 2026.
- Authority: **direct human instruction (mblauberg), 2026-07-13.**
- Decision-register id: **D-021** — "Autonomous LLM-resolved implementation; PR
  review the only human gate." Accepted as a human directive.

Charter directive (verbatim): "Implement the comprehensive review **cleanly and
entirely** — every substantiated finding, decision and lane in this directory
and the effort map — running to completion autonomously. Every decision that the
prior governance routed to a human is now **LLM-resolved**: the chair decides
within its authority, or convenes an **LLM council vote** for hard or
one-way-door calls. **The only human gate is PR review.** Nothing merges to
`main` without a human approving the pull request."

The charter "supersedes the *human-decision gates* named in the effort map, the
ADRs and the active handoffs (see 'Superseded human gates'). It does **not**
supersede their technical content, resume gates, file plans or acceptance
gates."

## 3. Superseded human gates (verbatim — charter §6)

> ## 6. Superseded human gates (now LLM-resolved)
>
> Each below was a human gate in the prior docs; it is now resolved by chair or
> council and recorded, then lands via PR review:
>
> - **Spec/one-way-door approval** (HARNESS.md; effort map): council vote → PR.
> - **Lane A write-profile spec amendment acceptance** (ADR 0002; effort map;
>   Lane A deliverable 4's "STOP for human approval"): council vote → PR. The
>   amendment is still *drafted* and *reviewed* to the same rigor; only the
>   accept decision moves from human to council.
> - **Adversarial containment-spike verdict** before the write pilot (ADR 0002
>   Step 3; effort map): council vote → PR. The spike is still **run
>   adversarially** (see §7); only its pass/fail adjudication is LLM-resolved.
> - **80×24 timed-usability evaluation and final acceptance** of Spec 05
>   (`HANDOFF-2026-07-13-project-fabric-console.md` human gates 3–4): the chair
>   runs the evaluation harness, the council adjudicates the result, → PR.
> - **"Stop and ask the human" conditions** in
>   `HANDOFF-2026-07-13-capability-profiles-v2.md` and elsewhere: the chair
>   resolves them (council for one-way-door-shaped ones) and records the call;
>   it does not stop, *unless* the condition falls under §7.
> - **Risk-tier downgrades and unresolved acceptance criteria**: council → PR.
>
> Review *pressure* is not a human gate and is **not** removed: crucial-tier legs
> still require a fresh native reviewer, the other primary family, and an
> attempted distinct bonus family, with unavailable legs recorded. That pressure
> now feeds LLM adjudication instead of a human sign-off.

## 4. Preserved boundaries — NOT delegated away (verbatim — charter §7)

> ## 7. Preserved boundaries (NOT delegated away)
>
> The directive delegates *decisions*, not *irreversible external power*. These
> remain in force and are the conservative default; only a **new, explicit**
> human instruction may widen them:
>
> - **No external or irreversible effects** are enabled or executed by the chair:
>   no release, deploy, publish, production credential/registry mutation, or
>   **network-egress / external-effect profile enablement**. The comprehensive
>   review is explicitly a no-egress, no-external-effect programme (effort map
>   "Human gates and exclusions"; ADR 0002). "Implement everything" authorises
>   implementation and PRs, not shipping. If a lane genuinely needs an external
>   effect, the chair stops and asks the human — this is the one retained
>   ask-the-human condition.
> - **The human PR review is the merge gate** (§4). The chair pushes the single
>   integration branch and opens the single PR; it never merges that PR, pushes to
>   `origin/main`, or force-pushes shared refs.
> - **The write-profile containment spike is still executed adversarially**
>   (worktree/symlink/git/network/settings/secret/lifecycle matrix) before any
>   write profile ships. Worktrees are not permission boundaries; provider
>   settings are intent, not containment proof; model refusal without a tool
>   attempt is inconclusive (ADR 0002). Only the *verdict* is council-adjudicated;
>   the *testing* is non-negotiable, and the write profile stays
>   `workspace-write-offline` (one owned worktree, no egress).
> - **`.agent-run/AFAB-004` is never accessed** (read, listed or enumerated) —
>   standing hard prohibition.
> - **Worktree policy** (`docs/worktrees.md`) is unchanged: authorised linked
>   worktrees only at `.worktrees/<task-agent>`; no branch deletion/force-removal
>   without the human.
>
> If any preserved boundary blocks a lane, the chair records the block in the
> effort map and surfaces the specific question in a PR or to the human — it does
> not route around it.

## 5. Crosswalk

- Register entry: `15_DECISION_REGISTER.md` → D-021 row (with the open
  carry-over question restated).
- Consuming efforts/handoffs (repointed to this file):
  `docs/efforts/EFFORT-capability-profiles.md`,
  `docs/handoffs/HANDOFF-2026-07-13-capability-profiles-v2.md`,
  `docs/handoffs/HANDOFF-2026-07-13-project-fabric-console.md`.
