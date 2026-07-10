# Debate, panels & cross-family judgement

Use panels to create independent defect pressure. Do not treat panel agreement as ground truth.

## Patterns

| Pattern | Use for | Risk |
|---|---|---|
| Independent reviewers | broad defect discovery, source audits, security review | duplicate work without scoped briefs |
| Small jury | high-stakes judgement where no single checker is enough | false confidence from correlated errors |
| Adversarial red-team | finding weaknesses, attack paths, overclaims | over-criticising correct work |
| Debate | clarifying disagreements with limited turns | convergence on confident falsehoods |
| Sparse topology | many reviewers where communication cost matters | missed synthesis if no strong judge resolves |

## Rules

- Give reviewers the artifact and check rubric, not your scratchpad.
- Vary prompt framing across families to reduce correlation.
- Ask for locations, evidence, and fixes, not global scores alone.
- Let weak/cheap models scout; do not let them veto stronger grounded work.
- Escalate real disagreement to objective checks, a stronger judge, or the human.
- Prefer sparse, bounded communication over open-ended debate loops.

## Vote handling

Use voting only for low-stakes or objective candidate filtering. For high-stakes findings, require at
least one of:

- direct source support;
- reproducible command/test;
- exact quote/location;
- arithmetic/schema reconciliation;
- human decision.

## Evidence council (adapted from LLM Council)

Karpathy's LLM Council uses three stages: independent first opinions,
anonymised peer ranking, then a chairman synthesis. Retain the independence,
identity masking and chair; replace global ranking with claim-level evidence
adjudication.

1. **Blind first pass.** Each reviewer receives the same source packet plus a
   distinct lens. It cannot see other answers. Store each output separately.
2. **Anonymised cross-examination.** Strip provider/author identity, randomise
   order, and give reviewers compact claim packets. They mark each claim
   `supported`, `contradicted`, or `needs-evidence`, with a falsification check.
   They do not score prose quality or vote on truth.
3. **Chair reduction.** The accountable chair deduplicates findings, checks
   anchors, runs objective falsifiers, preserves material dissent and emits one
   evidence map. The chair may reject the entire council result.

Do not let a reviewer judge its own authored surface. Avoid showing all raw
responses to every model when claim packets suffice; this reduces anchoring and
context cost. Use a fresh-context reducer for crucial decisions. A council adds
pressure, not authority: deterministic gates and human one-way-door decisions
still win.

## Research anchors

- LLM-as-judge and self-preference literature: same-model or same-family judges can favour outputs that
  look like their own.
- Multi-agent debate studies: debate and voting can improve some tasks, but communication topology and
  judge quality matter; majority voting can amplify shared hallucinations.
- Google Research debate-topology work: sparse communication can improve debate efficiency and reduce
  unnecessary message flooding.
- Andrej Karpathy, `karpathy/llm-council`: independent opinions, anonymised
  peer review/ranking and a chairman synthesis. The harness deliberately
  replaces ranking with evidence adjudication.
