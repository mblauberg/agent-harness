# W005 exact-pair classifier GREEN scope

Status: verified read-only dependency map for the transient D-029 classifier
cut. Source baseline: `cab6d8d801487038bc513bbac472a583df61f236`.

This cut exists only to restore right-reason preflight TDD. It is not the
system-wide pair-custody completion.

## Minimum production cut

In `runtime/agent-fabric/src/core/fabric.ts`:

- public dispatch reads the exact outer command receipt before chair/special
  custody classification, then looks up an existing action by
  `(run_id, adapter_id, action_id)`;
- public reconcile and its post-singleflight retry also read the exact command
  receipt before authority/special-custody classification;
- `#assertGenericProviderAction` accepts `(runId, adapterId, actionId)` and
  constrains every special owner by that pair:
  - launch custody: `coordination_run_id`, `provider_adapter_id`,
    `provider_action_id`;
  - agent custody: `run_id`, `adapter_id`, `action_id`;
  - lifecycle custody: `run_id`, `provider_action_adapter_id`,
    `provider_action_id`;
  - Herdr: the requested `adapter_id` and `action_id`, never any Herdr row with
    the same action ID;
  - chair recovery: the joined provider row constrained by
    `run_id`, `adapter_id`, `action_id`;
- dispatch uses its existing `input.adapterId`; reconcile must receive
  `adapterId` explicitly and must never infer or select a unique-looking row
  with `WHERE run_id=? AND action_id=?`.

The public protocol already carries the pair in
`runtime/agent-fabric-protocol/src/baseline-contracts.ts` and
`src/operation-codecs.ts`; no wire compatibility arm is needed. The stale
surface is `runtime/agent-fabric/src/core/client.ts`, whose reconcile request
currently discards `adapterId`. Mechanical in-process reconcile callers are in:

- `tests/acceptance/stage3/ambiguous-provider-action.acceptance.test.ts`;
- `tests/acceptance/stage3/crash-after-provider-acceptance.acceptance.test.ts`;
- `tests/acceptance/stage3/lifecycle-checkpoint.acceptance.test.ts`;
- `tests/acceptance/stage3/provider-session-boundary.acceptance.test.ts`;
- `tests/evaluation/orchestration-safety.evaluation.test.ts`;
- `tests/spec05/core/launch-custody.test.ts`;
- `tests/spec05/herdr-fabric-ports.test.ts`.

## Mandatory collision oracle

No second adapter process is required. In the existing ambiguous-action
acceptance fixture:

1. insert one valid current-schema `provider_action_pair_preflights` parent and
   one terminal `provider_actions` row for adapter `herdr-control-v1`;
2. dispatch the same action ID through the live delayed-capability
   `fake-lifecycle` adapter;
3. terminalise the task during that delay;
4. require `LIFECYCLE_PRECONDITION_FAILED`, never `SQLITE_ERROR`,
   `CAPABILITY_FORBIDDEN` or `DEDUPE_CONFLICT`.

The mutation ladder is deliberate:

- current source dies on the stale lifecycle column;
- a column-only repair falsely classifies the other adapter's Herdr row;
- a classifier-only repair still aliases the action-only existing-row lookup;
- only exact classifier plus exact existing-action lookup reaches the delayed
  task-state rejection.

Use a small test-local seed helper or the later canonical provider-action
fixture helper. Do not add compatibility DDL, mocks or unique-row fallback.

## Explicitly deferred pair-custody surface

The coordinator/full pair cut still owns:

- `ProviderSessionCoordinator.assertActionIdentity`;
- generic result/read paths that accept only `actionId`;
- reconciliation ownership maps and action updates;
- settle, persist and budget helpers;
- lifecycle/direct-operation pair queries;
- operator cancellation in `production-action-ports.ts`, which currently
  selects and updates actions, turn leases and memberships by action ID and can
  cross-update two adapters.

Adapter-local journal cancellation is pair-safe only because adapter identity
is implicit in the selected adapter journal.

## Gates

```sh
npm exec --workspace=@local/agent-fabric -- vitest run \
  tests/acceptance/stage3/ambiguous-provider-action.acceptance.test.ts \
  -t 'rechecks task state atomically after adapter capabilities before provider dispatch'

npm exec --workspace=@local/agent-fabric -- vitest run \
  tests/acceptance/stage3/ambiguous-provider-action.acceptance.test.ts \
  -t 'does not classify the same action ID on another adapter as special custody'

npm run --workspace=@local/agent-fabric typecheck
```

After GREEN, rerun the D-031 exact-boundary preflight tracer. Its only failure
must be the missing `resolving` preflight, with zero unhandled errors.

Changing direct in-process reconcile payloads adds `adapterId` to their command
digests. This is the intended pre-release direct cut. A unique-row fallback is
an unauthorised compatibility path and weakens the frozen no-inference pair
contract.
