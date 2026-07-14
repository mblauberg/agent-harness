# Progressive governance

## 1. Objective

Apply the minimum governance that safely fits the work.

The current system should not make a routine local change carry the same process as an authority, migration or release change.

## 2. Governance levels

### Advisory

Typical work:

- explanation;
- brainstorming;
- read-only repository question;
- low-risk research;
- informal comparison.

Controls:

- normal provider session;
- no source write;
- no external effect;
- no persisted delivery receipt unless required by project policy.

### Routine

Typical work:

- local reversible code change;
- documentation correction;
- small test change;
- well-characterised refactor;
- strong deterministic oracle.

Controls:

- one chair;
- one workspace and source owner;
- minimal run envelope;
- deterministic checks;
- concise evidence summary;
- review optional unless a sensitive surface is touched.

### Substantial

Typical work:

- behavioural feature;
- cross-module change;
- meaningful dependency or schema change;
- moderate blast radius;
- mixed oracle.

Controls:

- persisted run;
- explicit authority and budget;
- fresh implementation context where useful;
- independent review derived from policy;
- bounded repairs;
- human acceptance;
- separate PR effect.

### Crucial

Typical work:

- authentication or authorisation;
- provider authority;
- privacy or confidential data;
- stateful migration;
- build or release gate;
- weak oracle;
- high operational blast radius.

Controls:

- explicit design and alternatives;
- strong containment;
- other-primary or specialist review;
- adversarial tests;
- exact evidence;
- explicit human acceptance;
- typed external effects only.

### Terminal

Typical work:

- irreversible production mutation;
- regulated or life-safety consequence;
- destructive migration;
- unbounded external exposure.

Controls:

- exceptional human authority;
- maximum containment;
- independent qualified review;
- rehearsed rollback or explicit irreversibility;
- human-operated or separately controlled effect;
- observation and incident readiness.

## 3. Risk floor versus operating shape

Risk policy determines the minimum controls. The chair may increase controls where uncertainty or novelty justifies it.

The chair may not lower a risk floor or remove a mandatory gate.

## 4. Promotion triggers

Promote a run to a higher governance shape when:

- scope becomes materially ambiguous;
- source ownership expands;
- a sensitive surface appears;
- the deterministic oracle weakens;
- a migration or external effect emerges;
- the work crosses repositories;
- the task becomes long-running;
- parallel writers become necessary;
- recovery requires durable task state;
- the cost or duration exceeds the routine ceiling.

## 5. Demotion and simplification

After implementation, the system may avoid unnecessary review or artefacts where:

- the risk assessment remains unchanged;
- deterministic evidence is strong;
- no sensitive surface is touched;
- the change remains local and reversible;
- project policy permits the lower shape.

Any formal risk-tier downgrade remains explicitly authorised.

## 6. Human attention points

Humans should decide:

- unresolved business, legal, financial or product-owner questions;
- one-way-door architecture;
- risk downgrades;
- broader network, secret or write authority;
- destructive or irreversible action;
- external communication;
- merge, release and deployment where policy requires;
- final acceptance for substantial and higher work.

Humans should not be asked to approve every internal worker, repository read or test command within an already approved envelope.

Note: the active autonomous chair charter (D-021; `24_AUTONOMOUS_CHARTER.md`)
currently converts several of these decision points to LLM resolution with PR
review as the single human gate, while preserving hard boundaries on external
effects, network egress and containment evidence. Reconcile this section with
that charter — the conflict and its open carry-over question are recorded in
`15_DECISION_REGISTER.md`.

## 7. Product requirement

The CLI or Console should display:

- current governance level;
- why it was selected;
- effective authority;
- required remaining gates;
- the next human decision, if any.

The user should not have to infer process weight from the number of agents running.
