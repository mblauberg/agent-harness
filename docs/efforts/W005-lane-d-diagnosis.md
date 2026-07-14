# Lane D diagnosis — 2026-07-14

Base: `9f168eed9ac7001744d372a840be9648bb11edcf` after `npm ci` and root `npm run build`.

Observed baseline: 179 Fabric test files; 149 passed and 30 failed. Of 1,216 tests, 1,054 passed and 162 failed, with 14 unhandled errors. The cascade reduces to five root causes.

## Repair order

1. Canonical provider-action pair preflight/admission transaction.
2. Lifecycle rotation direct cut to the frozen append-only custody/revision/head contract.
3. Canonical provider-action request shapes plus registry-derived authority schema.
4. Current route/review persistence and projections; remove predecessor evidence APIs.
5. Rebuild, then regenerate both primary adapter closure manifests.

The production writers overlap, so the first four slices integrate serially. Fixture-only preflight work and the static authority-schema projection can be disjoint only with explicit path ownership.

## C — provider-action preflight parents

`provider_actions` has a mandatory `(run_id, adapter_id, action_id)` parent in `provider_action_pair_preflights` (`runtime/agent-fabric/src/persistence/migrations/0001-current-baseline.sql:2166`, parent at `:5548`). Nine direct production inserts in five files write no parent:

- `src/operator/production-action-ports.ts:1176`
- `src/application/provider-session-coordinator.ts:487`
- `src/core/fabric.ts:5152,6708`
- `src/project-session/launch-custody.ts:935,1308,3299,3917`
- `src/integrations/herdr-fabric-ports.ts:556`

There are also 28 positional/direct fixture inserts across nine test files. The repair must implement the provider-custody ordering contract, not merely synthesize a parent row: canonical preflight precedes route/config inspection, while config, receipt, reservations, action and route commit atomically.

Sharp repros:

```sh
npm exec --workspace=@local/agent-fabric -- vitest run \
  tests/spec05/herdr-fabric-ports.test.ts \
  -t 'authoritatively validates a stable task reference and journals one action lifecycle'
npm exec --workspace=@local/agent-fabric -- vitest run \
  tests/integration/persistence-invariants.integration.test.ts \
  -t 'fires every additive insert and update invariant trigger'
```

## B — lifecycle runtime/schema divergence

Current DDL uses `custody_id`, provider-action pair identity and current custody states, but runtime still queries predecessor `action_id`/`unreconciled` shapes in `src/core/fabric.ts:1540`, `:4687`, `:6906`, `:6952`, `:6985`, `:7095`. The frozen [persistence and cutover contract](../specs/agent-fabric/persistence.md) supersedes both with plural `lifecycle_rotation_custodies`, append-only revisions and exact heads. Do not restore old columns or treat this as a rename.

Sharp gate:

```sh
npm exec --workspace=@local/agent-fabric -- vitest run \
  tests/acceptance/stage3/lifecycle-checkpoint.acceptance.test.ts \
  tests/acceptance/stage3/unannounced-compaction.acceptance.test.ts \
  tests/integration/database-baseline-invariants.integration.test.ts
```

## D — static authority schema and predecessor callers

The runtime vocabulary is already registry-derived and current. `runtime/agent-fabric/schemas/authority.schema.json` is the stale hand-maintained surface: 70 actions versus 84 runtime actions, exactly 14 missing. The canonical provider-action codec requires current pair identity and closed dispatch variants; runtime clients and tests still carry predecessor shapes in `src/core/fabric.ts:845`, `src/core/client.ts:329`, `src/daemon/client.ts:1299`, and `src/daemon/agent-protocol-dispatch.ts:125`.

Sharp gate:

```sh
npm exec --workspace=@local/agent-fabric -- vitest run \
  tests/unit/shared-operation-registry.test.ts \
  tests/unit/schema-validation.unit.test.ts \
  tests/spec05/mcp/registry-projection.integration.test.ts \
  tests/integration/daemon-adapter-composition.integration.test.ts
```

## A — predecessor route/review evidence APIs

The squashed DDL removed `model_routing_evidence` and `cross_family_review_evidence`, but stale writers/projectors remain in `src/application/provider-session-coordinator.ts:265`, `src/operator/projection-store.ts:1834`, and `src/exports/projector.ts:113`. Current DDL owns `provider_action_routes` and `provider_review_evidence`; production currently has no references to either. Remove predecessor public/receipt fields and project the current route/review owners. Do not recreate compatibility tables.

Sharp repro:

```sh
npm exec --workspace=@local/agent-fabric -- vitest run \
  tests/acceptance/stage1/receipt-export.acceptance.test.ts \
  -t 'writes the standard relative path and returns the SHA-256'
```

## E — stale primary adapter closure manifests

Both checked-in manifests omit seven current protocol outputs and retain stale hashes. Regenerate only after protocol/runtime files stabilize, then update the pins in `config/adapter-compatibility.yaml`.

Gate:

```sh
npm exec --workspace=@local/agent-fabric -- vitest run \
  tests/acceptance/stage3/adapter-compatibility.acceptance.test.ts \
  tests/unit/adapter-compatibility-closure.unit.test.ts \
  tests/unit/wrapper-manifest-generation.unit.test.ts
```

Final Lane D gate: full Fabric test suite, root build/check/evaluation/load, harness, and diff-check on one commit.
