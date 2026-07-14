# Governance reconciliation

## 1. Problem statement

Provenant currently has two valid but unreconciled governance models.

### Global model

The constitution, architecture, scope/implement skills, Spec 02 and delivery
receipt require human approval for material scope/design, one-way doors, final
acceptance and promotion.

### Programme model

The comprehensive-review chair charter delegates prior human gates to a chair or
LLM council and leaves only PR review as the human gate.

The programme model matches the user's desired low-handholding workflow more
closely. The global model has stronger machine enforcement. The correction is
to generalise delegation without weakening hard authority boundaries.

## 2. Precedence

Recommended precedence:

1. platform/system safety policy;
2. current direct human instruction;
3. human-approved project decision-delegation charter;
4. accepted ADR and current normative spec;
5. approved issue/run authority and acceptance;
6. chair plan and council decisions;
7. worker instructions.

A lower layer may narrow authority. It may broaden only where the higher layer
explicitly delegates that dimension.

## 3. Decision authority model

Replace the implicit binary “human or system” model with typed resolvers.

```ts
type DecisionResolver =
  | { kind: "human-operator"; operatorId: string; attestation: string }
  | { kind: "delegated-chair"; agentId: string; charterDigest: string }
  | {
      kind: "delegated-council";
      chairAgentId: string;
      charterDigest: string;
      deliberationArtifact: ArtifactRef;
      participantFamilies: string[];
    }
  | { kind: "system-supersession"; cause: ... };
```

A gate or decision request names:

- decision class;
- allowed resolvers;
- required evidence;
- risk ceiling;
- expiry;
- default/override behaviour;
- affected operations/tasks.

A delegated resolution is never written as `HumanGateResolution`.

## 4. Project charter

The current chair charter should become a reusable project policy, not a review
pack attachment.

Recommended path:

```text
docs/governance/agent-autonomy.md
```

with validated frontmatter.

It owns:

- human touch-points;
- delegated decision classes;
- council thresholds;
- issue/PR permissions;
- merge policy;
- scope-delta policy;
- risk/budget ceilings;
- external-effect exclusions;
- override/cut-point rules;
- expiry and revocation.

The charter should not own:

- current lane status;
- task lists;
- exact current model IDs;
- active worktree names;
- specification details.

Those belong in issues/Fabric/provider route receipts.

## 5. Hard boundaries

The project charter may delegate broad implementation decisions while retaining
hard human boundaries.

Recommended non-delegable defaults:

- new external repository or data disclosure;
- secrets/credential scope;
- network-egress expansion;
- release, deploy, publish or external communication;
- destructive/irreversible migration;
- production mutation;
- risk above the charter ceiling;
- overriding platform/system policy.

Projects may explicitly delegate a named operation, but not through vague
“implement everything” wording.

## 6. Council semantics

Replace “vote” with “deliberation and adjudication”.

Required record:

```yaml
question:
decision_class:
criteria:
participants:
  - family:
    lens:
    recommendation:
    evidence_refs: []
agreements: []
disagreements: []
objective_checks: []
chair_adjudication:
residual_uncertainty:
charter_digest:
```

A 2–1 split is not proof. The chair decides because the charter delegates that
class and the evidence supports the decision.

## 7. Global defaults and project specialisation

Global Provenant default:

- human approves material scope and final merge;
- implementation detail is delegated;
- Class B reversible deltas require human only when no project charter exists.

Low-handholding project profile:

- human participates in initiated crucial scope/grill;
- chair handles implementation details;
- council handles delegated reversible material decisions;
- soft decisions are visible and non-blocking;
- human remains required for Class C;
- final PR merge follows project policy.

A project can opt into this profile during scoping with one approval.

## 8. Required repository changes

### Constitution and architecture

- `HARNESS.md`: define project delegation and delta classes.
- `docs/ARCHITECTURE.md`: explain hard/soft decisions and canonical work/docs.
- `AGENTS.md`: direct agents to project charter and issue before broad docs.

### Lifecycle and schemas

- delivery-run schema/validator: add delegation charter reference and delegated
  decision evidence;
- risk policy: distinguish risk ceiling from every individual decision;
- Fabric protocol: add `DecisionRequest` and delegated resolution;
- scoped gates: retain only genuinely blocking decisions.

### Skills

- `scope`: create/update charter, spec, ADR and issues; use decision packets.
- `engineering-docs`: implement canonical routing and pruning.
- `implement`: apply Class A/B/C delta policy.
- `orchestrate`: derive PR topology and conflict keys.
- `session`: use run-owned handoffs and delete consumed temporary state.
- `work-map`: become fallback/derived initiative view, not work truth.
- `release`: retain external-effect boundaries.

### Console

Attention tabs:

- Notices;
- Soft decisions;
- Hard gates;
- Failures/degradation.

Actions:

- steer/override soft decision;
- approve/reject hard gate;
- open issue/spec/PR/evidence;
- acknowledge notice;
- defer within policy.

### GitHub

- issue forms/schema for vertical slices;
- PR template for scope deltas, soft decisions and conflict strategy;
- bounded registered issue mutation;
- branch/ruleset aligned with project merge policy.

## 9. Migration of current programme

1. Create ADR 0009 (or current naming equivalent) for delegated autonomy and
   document/work ownership.
2. Create the project autonomy charter in its permanent owner.
3. Update HARNESS, Spec 02, delivery validator and gate protocol coherently.
4. Convert Lane A, Lane D, Rust reconciliation, V2 and later steps into GitHub
   issues.
5. Move mutable status out of the chair charter and handoffs.
6. Mark the chair charter superseded.
7. Freeze the original review pack as evidence; remove it from fresh-chair
   reading order.
8. Replace the effort map with a GitHub milestone/project or derived issue view.
9. Add soft decision projection.
10. Prune consumed working documents after link migration.

## 10. Safety property

This model reduces handholding without reducing authority integrity:

```text
human approves envelope once
    -> chair/council decide within envelope
    -> every delta is typed and visible
    -> hard boundaries still block
    -> PR/effect gates retain their own authority
```

The crucial requirement is authenticated delegation. Prose saying “the LLM may
decide” is not enough when validators and protocols still expect human evidence.
