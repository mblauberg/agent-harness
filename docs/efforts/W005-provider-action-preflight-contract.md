# Lane D provider-action preflight TDD contract

Decision: use one `ProviderActionAdmissionCoordinator` as the only production
writer of `provider_action_pair_preflights` and `provider_actions`. A parent-row
helper beside each existing action insert is not an implementation of the
contract.

Risk is **crucial**: this is a shared, stateful admission and authentication
surface. The implementation authority is limited to the paths listed under
Ownership. It permits no provider, network, release or deployment effect.

## Evidence and invariant

The frozen authority is Spec 04 v1.32 at commit `0305376`:

- the pair preflight is globally keyed by `(adapter_id, action_id)`, has a
  closed `provider-smoke|run-action` scope and immutable owner/principal/input
  identity (`docs/specs/04-agent-fabric-operational-hardening.md:2846-2862`);
- it is the parent of the compilation receipt, configuration, reservations,
  action, route and failure history; only one CAS may end `resolving` as
  `admitted|released` (`:5403-5416`);
- replay classification and the pair-keyed in-process flight happen before
  router work (`:5436-5448`); and
- the binding order is preflight, pure resolver, one `BEGIN IMMEDIATE`
  transaction, configuration, admitted compilation receipt, reservations,
  action, route, final preflight CAS and commit (`:11476-11514`). Exact admitted
  or rejected replay never reruns resolver/compiler; changed input conflicts
  before recompilation (`:11516-11533`).

The diagnosed runtime violates that invariant: nine production action inserts
in five files have no parent, and 28 fixture inserts repeat the same defect
(`lane-d-diagnosis-2026-07-14.md:17-27`). The current migration makes the parent
mandatory (`runtime/agent-fabric/migrations/0001-current-baseline.sql:2166-2219`,
parent at `:5548-5563`) but is itself behind v1.32: it omits `scope_kind`, makes
`run_id` unconditionally non-null and does not carry the compiled-authority
receipt binding. Slice C must not report v1.32 conformance from an FK-only fix.

## One seam

```ts
type ProviderActionRef = Readonly<{ adapterId: string; actionId: string }>;

type ProviderActionScope =
  | Readonly<{ kind: "run-action"; runId: string }>
  | Readonly<{ kind: "provider-smoke"; runId: null }>;

type AuthenticatedProviderPrincipal =
  | AuthenticatedAgentContext
  | AuthenticatedOperatorContext
  | AuthenticatedIntegrationContext
  | Readonly<{ kind: "daemon-owner"; ownerId: string; generation: number }>;

type ProviderActionPreflightRequest = Readonly<{
  actionRef: ProviderActionRef;
  scope: ProviderActionScope;
  principal: AuthenticatedProviderPrincipal;
  canonicalInput: JsonValue; // complete closed semantic input; no command ID
}>;

type ProviderActionTicket = Readonly<{
  actionRef: ProviderActionRef;
  scope: ProviderActionScope;
  actorPrincipalDigest: Sha256Digest;
  inputDigest: Sha256Digest;
  ownerDigest: Sha256Digest;
}>; // constructible only by the coordinator

type AdmissionPlan =
  | RoutedTaskActionPlan       // config + admitted receipt + reservations + action + route
  | UnroutedProviderActionPlan // admitted receipt + action; no route-list membership
  | RejectedCompilationPlan;   // rejected receipt only

interface ProviderActionAdmissionCoordinator {
  preflight(request: ProviderActionPreflightRequest): Promise<PreflightDecision>;
  admit<T>(ticket: ProviderActionTicket, plan: AdmissionPlan,
    appendDependants: (transaction: ProviderActionTransaction) => T): AdmissionResult<T>;
  release(ticket: ProviderActionTicket, failure: PersistedPreflightFailure): ReleasedResult;
}
```

The coordinator, not callers, computes RFC 8785 JCS digests:

```text
actorPrincipalDigest = SHA256(JCS(authenticated principal binding))
inputDigest          = SHA256(JCS(complete closed semantic input))
ownerDigest          = SHA256(JCS({schemaVersion:1, scope, actionRef,
                                   actorPrincipalDigest, inputDigest}))
```

`canonicalInput` includes run/scope, pair, operation, task and authority,
target/session generation, full provider payload, route request and certifying
binding when applicable. The outer command journal owns `commandId`; omitting it
from this digest permits an exact retry under a fresh command ID without
omitting any semantic field. Callers cannot pass a digest or a loosely typed
object as identity.

`AdmissionPlan` is a closed data object, not arbitrary SQL callbacks. The
coordinator owns all common-row inserts. `appendDependants` may add only the
named domain rows after the action/route exists and before the final preflight
CAS; it receives no method capable of inserting another provider action.

## Transaction and replay order

1. Run outer command replay first. Then `preflight()` starts and commits its own
   `BEGIN IMMEDIATE`. It reads/inserts by the global pair before adapter
   capability, route, configuration, compiler or provider work. No
   `INSERT OR IGNORE` is allowed.
2. An absent pair inserts `resolving` and returns a ticket. An exact existing
   `resolving` pair joins the one in-process pair flight. A different owner or
   input waits for the owner, then returns the frozen `ACTION_INPUT_CONFLICT`
   result without invoking resolver/compiler. The same action ID under a
   different adapter remains legal.
3. The bounded resolver runs outside SQLite and has no persistence or provider
   effect. A crash before a persisted event/receipt leaves `resolving`; only the
   exact owner may rerun that pure work.
4. `admit()` owns one `BEGIN IMMEDIATE`. It reattaches the exact ticket and
   revalidates all current authority, task, budget, capability, host, policy,
   configuration and route inputs, then runs the pure compiler. For an
   admitted routed action it inserts, in order: effective configuration,
   admitted compilation receipt,
   reservation parents, action, route last, domain dependants/command receipt,
   then CASes `resolving -> admitted` and commits. Provider I/O starts only
   after commit. Any exception rolls the whole admission back to the durable
   `resolving` preflight.
5. A closed compilation rejection inserts only its immutable rejected receipt,
   CASes `resolving -> released`, and commits. Resolver/substitution failure
   first appends its immutable ordered failure event, then releases. Neither
   path may leave configuration, capacity, action, route or external markers.
6. Exact `admitted` replay returns the persisted action/route/receipt. Exact
   `released` replay returns the persisted rejection/failure. Neither reruns
   capability inspection, resolver, compiler or provider I/O. Changed input
   never upgrades, releases or overwrites the original pair.

For operations already inside a larger custody transaction, the coordinator
may expose an internal `admitInTransaction` only when `database.inTransaction`
is true and that outer transaction began `IMMEDIATE`. Routed actions still
require the separately committed preflight before any resolver/config read.
Nested deferred transactions are forbidden because they cannot prove the
specified lock or atomic companion writes.

## Five caller families

Every direct `INSERT INTO provider_actions` is removed.

| Owner | Required call pattern |
|---|---|
| `src/core/fabric.ts` | Owns the public command replay. Task-bound answer-bearing spawn/send-turn uses `preflight -> resolver/compiler -> admit(RoutedTaskActionPlan)`. Generic non-answer work uses the closed unrouted plan only when it has no route-list membership. |
| `src/application/provider-session-coordinator.ts` | Supplies target/session/turn-lease identity as plan data and appends the turn lease inside the coordinator-owned admission transaction; it no longer writes the action. |
| `src/operator/production-action-ports.ts` | Preflights each canonical operator-control pair before adapter capability inspection; appends operator custody rows in the same admission transaction. Exact replay is pair plus full operator principal/intent, not action ID alone. |
| `src/project-session/launch-custody.ts` | Uses `admitInTransaction` for launch, child, recovery and retained-chair custody so action and custody cannot split. The preflight input binds the authenticated operator/agent and full custody intent. |
| `src/integrations/herdr-fabric-ports.ts` | Uses the same pair classifier and transactional action writer; the daemon integration principal and complete validated Herdr intent form identity. Existing action-ID-only lookups become pair-keyed. |

There is a hard follow-on gate: frozen v1.32 requires every action that can
reach provider I/O to bind an admitted authority-compilation receipt, while
several current launch/operator actions are non-task lifecycle operations and
Herdr is a local integration journal. Slice C may retain a narrowly labelled
unrouted transitional arm to restore current behaviour, but it must not invent
a task, receipt or route or claim v1.32 completion. The later authority cutover
must either give each provider-I/O family an authorised receipt parent or move
non-provider journals out of `provider_actions`.

## First right-reason reds

The tracer test belongs in
`tests/acceptance/stage3/ambiguous-provider-action.acceptance.test.ts` beside the
existing delayed-capabilities admission race:

```text
persists the canonical pair preflight before adapter capability inspection
```

Start a new task-bound dispatch with delayed adapter capabilities. While that
boundary is blocked, open a second read connection and require exactly one
matching `resolving` preflight with the expected run/principal/input digests,
and no configuration, compilation receipt, reservation, action or route. Then
terminalise the task. Dispatch must reject before provider I/O; the preflight
must be `released` with its persisted rejection/failure and all admitted rows
must remain absent. Current code fails because the preflight is absent. A
shallow parent insert beside the action also fails because no durable row is
visible during the capability delay.

The next vertical test is:

```text
joins exact pair replay once and conflicts changed input before resolver work
```

Race two command IDs with the same pair and semantic input, plus one changed
payload. The exact requests produce one capability/resolver/compiler call and
one durable result; the changed request waits and returns
`ACTION_INPUT_CONFLICT`. Reopen the database and repeat both cases to prove the
answer comes from persisted state, not the process-local map. This test owns
adding the frozen error code to the runtime/protocol vocabulary; do not mask it
as a generic FK or `DEDUPE_CONFLICT` failure.

After that tracer is green, fault each admission statement. Restart must see
only the durable `resolving` preflight or the complete admitted/released cut,
never a partial configuration/receipt/reservation/action/route set. The two
diagnosis repros remain focused regression gates.

## Fixture migration

Add `tests/support/provider-action-fixture.ts` with two paths:

- positive fixtures call the public coordinator with canonical principal/input
  objects and a closed plan;
- direct-SQL invariant negatives call a narrowly named
  `insertProviderActionPreflightParent()` first, then retain their explicit
  malformed action statement so the intended trigger remains the failure.

Replace positional `INSERT INTO provider_actions VALUES` with column lists.
Never disable foreign keys or use a fake parent whose pair/run differs from the
action. Migrate exactly these nine files: ambiguous-provider-action acceptance;
both database/persistence invariant integrations; accepted-session-closure,
atomic-result-delivery, chair-membership, launch-custody,
production-operator-lifecycle and restart-recovery.

## Disjoint ownership

- Production owner: new `src/application/provider-action-admission.ts`; the
  five production writer files above; composition-only injection in
  `src/core/fabric.ts` and `src/integrations/herdr-daemon-integration.ts`; the
  preflight/action/receipt migration rows and the exact conflict-code surface.
- Fixture owner: `tests/support/provider-action-fixture.ts`, the nine fixture
  files above and the two first-red acceptance cases. It does not edit
  production or migration code.
- Other Lane D slices must integrate serially before editing
  `provider-session-coordinator.ts`, `core/fabric.ts` or
  `launch-custody.ts`. The static authority-schema projection can proceed only
  on paths disjoint from the conflict-code surface.

Acceptance requires zero production action inserts outside the coordinator,
pair-keyed reads, both first-red witnesses, crash-cut atomicity, all 28 fixture
migrations, both sharp repros and the full Fabric gate.
