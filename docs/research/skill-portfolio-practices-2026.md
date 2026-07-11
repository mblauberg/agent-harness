# Agent skill portfolio: 2026 research and refactor

Status: Implementation research and decision record
Evidence cut-off: 11 July 2026
Baseline: [Agentic delivery harness: 2026 research synthesis](agentic-sdlc-harness-2026.md)

## Executive decision

The portfolio should remain a small set of lifecycle owners, bounded techniques,
domain overlays and presentation policies. Public repositories are useful for
discovering mechanisms and failure cases; popularity is not evidence that an
entire pack belongs here. This review therefore adapts individual ideas only
when they have a distinct trigger, authority boundary, output and verification
gate.

The resulting portfolio has 34 skills: the existing 31 plus `refactor`,
`frontend-review` and a rewritten cross-agent `caveman`. No existing skill was
retired. The main improvements are contract repair, clearer composition,
catalogue-wide discovery limits, behavioural routing fixtures, deterministic
safety checks and evidence-bearing review. `release` now promotes any accepted
artifact through a separately authorised deploy, publish, share, send or
activation action.

SOLID and adjacent engineering principles belong in `code-review` and
`refactor`, but only as hypothesis generators. A principle name is never a
finding. A reviewer must still identify a concrete mechanism, present impact,
source evidence and a safe validation route. This avoids both pattern worship
and the opposite failure of ignoring well-established design diagnostics.

## Method and boundaries

This pass combined:

- a live audit of every `skills/*/SKILL.md`, its references, scripts, provider
  metadata and evaluation fixtures;
- a nearest-neighbour routing analysis across lifecycle, technique, topology,
  continuity, writing, domain and presentation skills;
- current primary guidance from OpenAI, the Agent Skills specification,
  Anthropic, Google, GitHub, W3C, OWASP and NIST;
- source and licence inspection of respected public skill collections; and
- a static and behavioural audit of Caveman at commit
  `0d95a81d35a9f2d123a5e9430d1cfc43d55f1bb0`.

No private provider transcript was mined. Evaluation inputs are synthetic or
run-owned. Public pack contents were not imported wholesale. Concepts are
summarised; copied or substantially adapted components require their own
licence notice and provenance.

## Current evidence and local consequence

| Evidence | Consequence |
|---|---|
| [OpenAI Build skills](https://learn.chatgpt.com/docs/build-skills) documents progressive disclosure and an initial catalogue budget of 2% of context or 8,000 characters when context size is unknown. | Validate the rendered catalogue as a whole, not only each description. Keep discovery text front-loaded and boundaries explicit. |
| [Agent Skills description guidance](https://agentskills.io/skill-creation/optimizing-descriptions) recommends realistic positives, near-miss negatives, repeated trials, fixed train/validation splits and fresh held-out cases. | Static YAML is a fast contract check; actual clean-context selection is the routing gate. Adjacent-skill confusion cases are mandatory. |
| [Agent Skills evaluation guidance](https://agentskills.io/skill-creation/evaluating-skills) compares with-skill, without-skill or previous-skill outputs, uses deterministic graders before judgement, and records timing/tokens. | Quality-bearing skills need versioned receipts, failed-case retention and blinded judgement only where objective checks cannot decide. |
| [Google's agent-scaling research](https://research.google/blog/towards-a-science-of-scaling-agent-systems-when-and-why-agent-systems-work/) finds gains on decomposable work and penalties on sequential/tool-dense work, with uncoordinated agents amplifying errors. | `orchestrate` needs a decomposability/tool-density preflight, one chair, bounded workers, non-overlapping writes and a central evidence reduction. More agents is not itself a quality measure. |
| [OWASP agentic security and governance](https://genai.owasp.org/resource/state-of-agentic-ai-security-and-governance/) emphasises identity, permission inheritance, inter-agent validation, memory poisoning, budgets, circuit breakers and kill switches. | Authority cannot propagate implicitly through a skill, plugin, worker or tool description. Long and multi-agent runs need identities, budgets, payload schemas and stop evidence. |
| [W3C WCAG 2.2](https://www.w3.org/TR/WCAG22/) defines a 24 by 24 CSS pixel AA target-size minimum with exceptions; 44 by 44 is enhanced guidance. | Frontend skills must not manufacture conformance scores. Record tested, failed, untested and not-applicable surfaces, and distinguish standards from product targets. |
| [Google engineering review practices](https://google.github.io/eng-practices/review/reviewer/looking-for.html), [OWASP secure code review](https://cheatsheetseries.owasp.org/cheatsheets/Secure_Code_Review_Cheat_Sheet.html) and current provider review guidance converge on intent, full-context inspection and evidence. | Review begins at the diff but follows the dependency cone, including callers, schemas, tests, migrations, dependencies and generated surfaces. Unknown coverage remains unknown. |

## Portfolio architecture

| Class | Owners | Rule |
|---|---|---|
| Lifecycle | `scope`, `deliver`, `implement`, `release`, `retrospect` | Exactly one owner controls each state transition and human gate. |
| Techniques | `grill-me`, `prototype`, `diagnose`, `tdd`, `refactor`, `code-review`, `evaluate` | A method inherits authority from the lifecycle owner and cannot declare delivery complete. |
| Topology | `orchestrate`, `autonomous-lab` | Allocate bounded workers and recovery state; never broaden authority or certify their own output. |
| Continuity | `session`, `work-map` | Write only an authorised canonical state surface; one writer at a time. |
| Artifact and prose | engineering, academic, legal and natural writing/document skills | Preserve the split between artifact ownership and prose transformation. Project-specific owners override global defaults. |
| Domain/tool overlays | frontend, React, TanStack, TypeScript, web standards, Playwright and diagram skills | Add specialist evidence or operate a named tool without stealing lifecycle ownership. |
| Harness maintenance | `skill-audit`, `skill-authoring` | Existing-skill diagnosis and new-skill creation stay separate and use the same evaluation/supply-chain gates. |
| Presentation | `caveman` | Alters chat density only; it grants no source, tool, external-action or completion authority. |

The highest-value routing edges are now explicit: `diagnose` versus
`implement`, `tdd` versus `refactor`, `code-review` versus review-and-fix,
`frontend-review` versus `frontend-design`, `session` versus `work-map`, and
bounded `orchestrate` versus run-until-human-STOP `autonomous-lab`.

## SOLID and broader engineering practice

The portfolio uses principles at three levels:

1. `code-review` uses them to ask falsifiable questions about a present change.
2. `refactor` uses them to choose a smaller structural seam while holding
   observable behaviour constant.
3. `implement` owns the authorised change, deterministic verification,
   independent review and human acceptance gate.

The useful probes are:

- single responsibility as cohesion and one clear policy/state owner;
- open/closed only when a recurring extension already causes distributed
  conditionals, not for hypothetical futures;
- Liskov substitution as caller-visible preconditions, postconditions, errors
  and invariants;
- interface segregation as unnecessary data, method or permission coupling;
- dependency inversion and information hiding as stable policy being insulated
  from volatile infrastructure, without merely relocating complexity;
- YAGNI, knowledge duplication, explicit states/invariants, idempotency,
  failure atomicity, concurrency/cancellation, observability and operational
  ownership.

These are diagnostic lenses, not universal abstraction mandates. A blocking
finding still needs a source anchor, mechanism, impact and validation route.
Refactoring starts from green characterisation/equivalence evidence, proceeds
in reviewable slices, and deletes only after callers and fallback paths are
proved absent.

## Caveman decomposition

Only the core response-style capability warrants a standalone skill.

| Upstream capability | Local disposition |
|---|---|
| `caveman` | Original compact rewrite under the same descriptive name; adaptive, full and ultra levels; exactness and high-stakes suspension rules. |
| commit wording | Merge into `engineering-writing`; it does not justify another catalogue entry. |
| compact review | Merge presentation into `code-review` while retaining mechanism, impact, fix and evidence. |
| Cavecrew worker returns | Use the existing `orchestrate` worker contract without the brand or fixed provider models. |
| stats | Retire. It scans private session JSONL and uses a hard-coded counterfactual rather than a real baseline. |
| compress | Retire. It sends named file content to Anthropic/Claude, overwrites primary files and validates fewer invariants than it promises. |
| shrink | Do not port. Regex-rewriting MCP descriptions is a routing and semantic supply-chain risk. |
| help, init, hooks and fixed agents | Retire or leave to platform installers. Static help drifts; hidden persistence and cross-agent writes are not portable skill behaviour. |

The upstream root security claim that compression is local-only conflicts with
the implementation path that sends file content through an API or authenticated
CLI. That contradiction is a decisive reason not to import the plugin's
compression machinery. The upstream output-token headline also omits the skill
prompt, retries, input/cache/reasoning tokens and fidelity; it cannot justify a
global default for already terse models.

The local skill therefore preserves negation, uncertainty, conditions,
obligations, order, units, dates, citations, identifiers, commands, code,
quotes and errors. It suspends aggressive compression for high-stakes,
irreversible or ordered material. Artifact prose remains with its domain owner
unless the human explicitly requests Caveman treatment of the artifact itself.

### Current-model evaluation

A synthetic 16-case development set compared four arms—no style layer, a
one-line concise control, the rewritten local skill and the legacy skill—on the
current Claude and Codex primary routes, twice each. All invocations and failures
were retained. An opposite-family blind judge scored correctness, completeness,
clarity/actionability, contract fidelity and reread burden after deterministic
format/fact checks.

The result does **not** support a universal token-saving claim:

- On Claude, the local arm cost about USD 0.698 across the two runs versus USD
  0.633 for the one-line control and USD 0.848 for baseline. It was cheaper than
  baseline but about 10% dearer than the concise control. The legacy arm cost
  about USD 0.778 and carried the largest input treatment.
- On Codex, local and concise arms had nearly identical total reported tokens;
  caching differed between trials, so no universal billed-cost conclusion is
  justified. The local responses were slightly shorter in rendered words.
- The blind judge found no hard failure in local Codex-family answers. One
  Claude-family local answer called an unverified registry record a record
  “confirming” the claim. The skill was tightened to prohibit adding that
  evidence relationship. A three-case, three-trial-per-family regression then
  preserved attribution, non-causation and unconfirmed compromise in all 18
  answers; three lexical grader misses were visibly synonymous semantic passes.
- The legacy arm was shortest but had two hard failures in Claude-family
  answers and materially lower clarity in Codex-family answers. Brevity alone
  was therefore not accepted as quality.

Conclusion: keep the rewritten skill for its explicit safety and cross-agent
contract, and remove the legacy plugin. Do not advertise a savings percentage or
enable it solely for economics. Adaptive default remains a human attention
preference; generic concise output is the cheaper control on at least one
current primary route. Re-run this evaluation after major model or host changes.

## Skill, plugin, hook and tool boundary

- A skill teaches occasional judgement or a reusable workflow.
- A script or hook enforces deterministic policy; it must not silently turn
  provider metadata into authority.
- MCP or an app adds external capability and therefore has network,
  authentication, data and approval implications.
- A plugin distributes a coherent, independently versioned bundle. It is not a
  reason to package the whole global portfolio together.
- An always-on instruction holds genuinely global policy and should remain
  short; most depth belongs behind progressive disclosure.

Third-party intake must record source, audited revision, licence, copied versus
original material, scripts/hooks, network/authentication/data access, tool
preapproval semantics, installation writes and uninstall behaviour. Provider
sidecars are compatibility outputs, not the portable source of authority.

## Implemented quality gates

- The local metadata profile enforces matching names, compact descriptions,
  bounded entry bodies, sidecar shape and a rendered catalogue ceiling.
- Every skill has schema-v2 positive, negative and boundary fixtures. Static
  fixtures validate relation and routing intent rather than pretending lexical
  overlap proves model selection.
- Held-out selection is run in clean contexts across both primary model
  families with repeated trials. Failures, omissions and model lineage remain
  in the run artifacts.
- Quality-bearing changes compare current, baseline/control and, where useful,
  previous versions. Deterministic assertions run before blinded judgement.
- Frontend review uses evidence coverage rather than a composite conformance
  score. Browser operation has external-effect, credential and trace-retention
  gates.
- Code review records inspected, excluded and unavailable surfaces; dependency,
  generated-code and weakened-test checks are explicit.
- Plugin and skill intake is treated as a supply-chain review, not a popularity
  contest.

The sealed 40-case catalogue suite produced 235 correct routes from 240 attempts
(97.9%) across three trials on each primary family. All five misses were one
repeatable boundary: condensing a product requirements document went to
`natural-writing` instead of `engineering-writing`. The held-out result was
retained unchanged. Discovery metadata was then generalised to name
requirements/specifications, and six fresh engineering-versus-general prose
cases passed all 36 attempts. This is a valid regression repair, not a claim of
100% portfolio routing accuracy.

A separate developmental probe added 16 selected Codex system/plugin skills; it
was not a complete host snapshot and is not a release gate. Two of six provider
invocations hit a Codex usage limit. Across the four completed invocations,
primary-skill selection was 48/48 and exact primary-plus-companion selection was
43/48. Four misses added the legitimate `diagnose` companion to a Playwright
failure-reproduction prompt; one added `pdf:pdf` to a D2 vector-PDF export.
Infrastructure failures therefore stay separate from semantic accuracy, and
the unadjusted 43/72 denominator is retained only as a failed-run warning.

The delivery-gating series then exposed and retained four non-passes before a
machine pass. v2 stopped before generation because its preflight interpreter
lacked `pytest`; v3 stopped because two repetitions were below the
agent-product profile minimum. v4 and v5 each selected the correct primary on
72/72 rows but failed one critical row because the frozen fixture treated a
legitimate companion (`work-map`, then `engineering-writing`) as a routing
failure. v6 froze primary accuracy and companion fidelity as separate metrics
on a fresh 12-case holdout before execution. Three trials on each primary
family passed 72/72 primary and 72/72 bounded companion dispositions. The v2-v5
receipts remain bound as incomplete/failed evidence; v6 is a machine gate, not
human acceptance or a claim of universal routing accuracy.

The tracked [evaluation appendix](../evals/skill-portfolio-2026/README.md)
records datasets, frozen protocols, hashes, lineage, failures and limitations;
raw model events remain run-owned evidence rather than repository documentation.

## Deliberate non-additions

No generic `cleanup`, `deep-refactor`, `security-review`, `caveman-review`,
`caveman-stats` or imported pack was added. `refactor` covers behaviour-preserving
structural change without becoming ambient cleanup. Security remains a
risk-activated `code-review` and project overlay until real use and held-out
routing prove a separate global owner. New standalone skills require a distinct
trigger, authority boundary, output, verification gate and demonstrated value
over composition.

## Maintenance rule

Refresh this review after a material model/host change, provider skill-discovery
change, security standard revision, or recurring routing/quality failure. Use
run-owned or volunteered evidence only. A failed case becomes a regression
fixture; a popular public pattern becomes local doctrine only after its licence,
authority, token cost and outcome value are proved.
