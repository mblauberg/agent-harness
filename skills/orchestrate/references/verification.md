# Cross-family verification

Cross-family review works because different families miss different things, so an outside judge catches
errors a self-check won't. That gain is **decorrelation pressure, not magic** — and it is fragile.
Protect it.

## Why self-verification is weak

A model self-grading shares the latent cause of its own error (hallucinated premise, missed constraint,
"house style"). It also exhibits **self-preference** — it favours outputs that look like its own. A
different family removes that specific bias. (The bias is real but smaller than folklore; treat the
effect as "may reduce", not "removes".)

## The four rules

1. **Different family, always.** Never let the generating model be the final judge of its own output.
2. **Independence is earned, not assumed.** Two things silently re-correlate cross-family errors:
   - **Shared context / scratchpad** — if the verifier reads your reasoning, it inherits your framing.
     Give it the **artifact only**, plus the minimum it needs, not your scratchpad.
   - **Shared prompt template** — identical phrasing pushes different models toward the same answer.
     **Vary the framing** of the verification prompt.
   When it matters, **measure** overlap: run two families on a small set and check how often they agree
   *and are both wrong*. If overlap is high, the second opinion is buying little.
3. **Scout ≠ veto.** Match judge competence to task difficulty. A weaker/cheaper cross-family model may
   *flag* candidates for review, but must **never override** a stronger model's nuanced output — on hard
   items a weak judge throws false rejections of correct work. Escalate real disagreement to a strong
   judge or to ground truth.
4. **Objective checks beat taste.** Prefer locally-checkable verification — does the cited source exist
   and say that? does the test pass? does the number reconcile? does the quote match? — over holistic
   "is this good?". Holistic judging is the most bias-prone and adversary-fragile mode.

## How to run a verification pass

1. Isolate the **artifact** (the claim, draft, diff, or answer) and its **checkable anchors**
   (sources, tests, figures).
2. Pick a verifier family + tier by role (`routing-and-tiers.md`); auth-preflight it.
   If no safe/data-authorised different-family route exists, write
   `CROSS-FAMILY-NOT-RUN: <missing tool | auth/quota | data policy | no read-only mode | user constraint>`
   to the run traces and final gate.
3. Send a **clean, minimal** prompt: the artifact, the specific checks, and a defect taxonomy
   ("look for: fabricated citations, unsupported numbers, missed constraints, logic gaps…").
   Ask for a ranked list of problems with location + fix, and an explicit "what it gets right".
4. For high-stakes work, use **two** different families (a small jury) when cost/data policy allow it.
   Don't simple-majority-vote — weigh by competence and by whether a flag is objectively checkable.
5. **Beware debate convergence:** multi-round debate can settle on a confident *falsehood* if the
   models share a blind spot or the judge rewards confidence. Keep an objective anchor in the loop.
6. Fold corrections; record unresolved disagreements in the scratchpad for a user decision.

For debate, panel, and sparse-communication patterns, see `debate-and-panels.md`.

## Anti-patterns

- Same model (or same family) verifying itself.
- Pasting your full chain-of-thought to the "independent" verifier.
- Letting a cheap scout veto the flagship.
- Treating a single cross-family thumbs-up as proof on a high-stakes, non-objective claim.
- Majority-voting hallucinations as equal to reasoning.
