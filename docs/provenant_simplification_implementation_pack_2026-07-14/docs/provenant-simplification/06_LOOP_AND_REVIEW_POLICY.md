# Loop and review policy

## 1. Principle

Adaptive execution is permitted. Unbounded execution is not.

Every material loop has:

- a goal;
- durable state;
- a verification oracle;
- progress criteria;
- ceilings;
- terminal states;
- an escalation path.

## 2. Loop hierarchy

### Action loop

A provider session chooses and performs bounded actions.

Kernel responsibilities:

- authority;
- tool and workspace constraints;
- turn and time budget;
- interruption and cancellation.

### Repair loop

```text
failed verification or blocking finding
→ diagnose
→ repair
→ re-verify
→ re-review where required
```

Default maximum: two repair cycles unless risk policy or explicit authority states otherwise.

### Delivery loop

One WorkItem progresses to accepted artefact or stopped state.

### Initiative loop

Coordinates independent WorkItems and integration barriers. It does not author source itself.

### Improvement loop

Produces proposals and evaluation evidence. It never silently modifies the harness.

## 3. Mandatory terminal states

A loop ends as:

- `succeeded`;
- `awaiting-human`;
- `blocked`;
- `failed`;
- `cancelled`;
- `expired`;
- `degraded`;
- `scope-drift`.

Avoid generic “continue” states without explicit ceilings.

## 4. No-progress detection

Stop or escalate when any condition occurs:

- the same action and normalised result repeat;
- the same error repeats beyond threshold;
- states oscillate without new evidence;
- the diff and verification state remain unchanged;
- a reviewer repeats a blocker after materially equivalent repairs;
- budget or wall-time ceiling is reached;
- authority or lease expires;
- provider continuity is lost without a valid checkpoint;
- scope or acceptance criteria change materially;
- an external effect becomes ambiguous.

## 5. Checkpoint contents

For substantial and higher work:

- current objective and status;
- approved digest;
- effective authority digest;
- current owner and provider session;
- changed artefacts;
- checks run and current result;
- material decisions;
- open blockers;
- next action;
- remaining budget;
- recovery instruction.

Do not checkpoint raw reasoning unless it is required evidence.

## 6. Review planner

### Binding gates today

Risk/oracle-adjusted review is **accepted in principle but not yet in force**
(ADR 0008). Two gates bind every delivery now and are not weakened by anything
in this pack:

| Surface | Binding rule today |
|---|---|
| `HARNESS.md` coverage table (lines 78-90) | The other primary is load-bearing for **substantial and above**; blanket other-primary review for substantial work |
| Spec 05 deliveries (`docs/specs/05-project-fabric-console.md §15`) | The mandated **four-slot certifying review profile** (`native`, other-primary, Cursor/Grok, Agy/Gemini), resolved as `spec05-four-slot-v1` |

Neither gate may be relaxed by chair judgement, by the target table below, or
by a per-run exception.

### Deriving pressure (target)

Review pressure is derived from:

- risk;
- blast radius;
- novelty;
- uncertainty;
- security and privacy exposure;
- oracle strength;
- existing test quality;
- change size and dependency cone;
- prior reviewer yield.

### Minimum patterns — FUTURE STATE, not in force

**This table is the target, not current policy.** It does not authorise reduced
review today. It activates only when the single atomic review-policy migration
lands as a unit — the coordinated `HARNESS.md` coverage-table amendment plus the
Spec 05 review-profile amendment, defined in `08_REPOSITORY_CHANGE_MAP.md §4`.
Until then the binding gates above apply, and any pattern below that implies
*less* review than they require is inert.

| Pattern | Required review (target) |
|---|---|
| Routine, strong oracle, local reversible change | deterministic checks; review optional |
| Substantial, mixed oracle | fresh-context independent review |
| Novel or weak-oracle design | other primary or specialist review |
| Crucial authority, auth, privacy, migration or effect code | other primary plus appropriate specialist/human gate |
| Normative documentation change | owner or independent semantic review |
| Pure presentation/non-normative correction | render/link/checks as applicable |

The chair may add review. It cannot remove policy-required review.

## 7. Independence

A participant may certify only when it:

- did not author the reviewed source surface;
- did not decide the material design under review;
- receives a fresh or appropriately isolated context;
- has access to the approved outcome, artefact/diff and verification evidence.

The chair may adjudicate but does not certify its own decision.

## 8. Reviewer input boundary

Provide:

- approved objective and non-goals;
- acceptance criteria;
- diff or artefacts;
- relevant dependency cone;
- deterministic results;
- explicit review lenses;
- known limitations.

Do not provide:

- the author's persuasive self-assessment as the primary evidence;
- irrelevant transcripts;
- unverified claims;
- hidden authority assumptions.

## 9. Findings

A blocking finding requires:

- source or artefact anchor;
- concrete failure mechanism;
- impact;
- violated criterion or invariant;
- validation or reproduction path;
- confidence and uncertainty.

Do not block by model vote alone.

## 10. Review economics

Track:

- useful findings;
- duplicate findings;
- false blockers;
- repair value;
- cost and latency;
- escaped defects.

Use these data to narrow or strengthen future policy. Reviewer diversity is a tool, not an objective.
