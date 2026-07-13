# AuthorityEnvelopeV2 direct-cutover handoff

Status: active

Blocked-by: Lane A and Lane B must be accepted and integrated on `main`; do not
start from sibling-worktree state

Effort: capability-compiled execution authority

Leg: Lane C, Step 1 `AuthorityEnvelopeV2` direct cutover

Date: 13 July 2026

Last verified: 13 July 2026 against `main@cf31a05`

Consumed-at: pending

Supersedes: none

Integrated characterisation: `6748ceb`; effort checkpoint: `4d31b71`

## Goal and authority boundary

Deliver the protocol-owned closed `AuthorityEnvelopeV2`, the mechanical
delivery-to-Fabric mapper and one atomic migration of every caller, fixture and
stored test authority to V2. Preserve the current `review-readonly` provider
projection exactly.

This handoff does not grant production-source writes. The completed Lane C
authority covered tests, fixtures and the effort checkbox only. A fresh session
must obtain an explicit human-approved runtime/protocol/delivery write envelope
and worktree authority before implementation. No push, merge, release,
deployment, write profile, network egress or external effect is authorised by
this document.

Risk tier: crucial. Use a fresh `/implement` + `/tdd` session. Step 1 is fully
deterministic; it does not need `/evaluate`.

## Resume gate

All checks below are against accepted commits on `main`, never a worktree's
dirty state:

1. **Lane A:** the write-profile amendment is human-approved and frozen, its
   anchored audit is resolved, and the accepted Spec 01/04/05 text is
   integrated.
2. **Lane B:** the root workspace/lockfile, compact protocol schema generation
   and build/CI repairs are accepted and integrated.
3. **Lane D:** no runtime-reconciliation writer overlaps this leg. The safest
   default is to integrate Lane D first because both lanes can touch
   `fabric.ts` and runtime tests, and Step 1 cannot close while the broad
   baseline is red. If a chair partitions them instead, record disjoint paths
   and exact pre-existing failure ownership before either writer starts.
4. Record the exact post-A/B base commit. Confirm a clean index and inspect all
   active worktrees before creating a fresh authorised worktree. Do not reuse
   `.worktrees/lane-c-goldens`; it is a clean, detached evidence worktree based
   before A/B.

If any gate is false, update the effort map and stop. A worktree commit or a
green narrow test is not proof of accepted integration.

## Resume order

Read only the current owners first:

1. `AGENTS.md`, `HARNESS.md` and `docs/worktrees.md`;
2. `docs/efforts/EFFORT-capability-profiles.md` and this handoff;
3. `docs/adr/0002-capability-compiled-execution-authority.md`;
4. `docs/agent-harness-comprehensive-review/challenges/codex-pair-round2.md`
   §2, especially the reconciled direct-cutover file plan and gates;
5. the frozen Lane A spec amendment and accepted Lane A/B integration commits.

Then re-run the seam check from the completed Lane C checkpoint:

```sh
git diff --name-status 4d31b71..HEAD -- \
  runtime/agent-fabric/src/core/fabric.ts \
  runtime/agent-fabric/src/adapters/providers/claude-agent-sdk.ts \
  runtime/agent-fabric/src/adapters/providers/codex-app-server.ts \
  runtime/agent-fabric/src/domain/types.ts \
  runtime/agent-fabric-protocol/src/baseline-contracts.ts
```

Inspect every reported change before using the approved file plan. Also inspect
Lane B's overlap in protocol generation, package scripts, launch/operation
codecs and workstream custody. Record the final base tree in the delivery
receipt; historical `54ca037` is not an implementation base.

## Immutable characterisation oracles

Commit `6748ceb` owns the current read-only projection:

- `runtime/agent-fabric/tests/acceptance/stage3/provider-permission-goldens.acceptance.test.ts`;
- `runtime/agent-fabric/tests/fixtures/provider-permissions/review-readonly.*.json`;
- the Claude/Codex golden and functional path checks in
  `runtime/agent-fabric/tests/unit/primary-provider-adapters.unit.test.ts`.

Before and after V2 work, run:

```sh
npm ci
npm run build
npm exec --workspace=@local/agent-fabric -- vitest run \
  tests/acceptance/stage3/provider-permission-goldens.acceptance.test.ts \
  tests/unit/primary-provider-adapters.unit.test.ts
```

Expected result at the checkpoint: 2 files and 66 tests pass. Step 1 may change
authority inputs around these tests, but the three normalized output fixtures,
hostile pre-custody/pre-adapter failures and recorded sandbox/network absences
must remain exact. Adapter production files must not change.

## Approved implementation slices

Keep one serial source writer and leave the tree green after each slice:

1. **Protocol owner:** add the canonical V2 type, strict codec, generated
   schema and containment algebra. Unknown fields, missing dimensions,
   non-canonical paths and every individual widening fail closed.
2. **Delivery mapper:** extend delivery authority to nested schema version 2;
   add the pure Python mapping and byte-exact cross-language fixture pair. The
   approval evidence digest is real and independently bindable.
3. **Boundary preservation:** use the canonical codec through daemon RPC,
   launch packets, workstream copies, storage/reopen and MCP/team delegation.
   Assert exact stored objects, not subset matches.
4. **Direct cutover:** migrate all callers, fixtures and regenerated baseline
   state in the same change. Delete duplicate parsers and reject unversioned
   input. No V1 decoder, quarantine profile, dual stored contract or silent
   row rewrite remains.
5. **Behaviour proof:** rerun the immutable provider goldens and prove no
   adapter production diff. Step 1 does not extract `#admitProviderPayload`;
   that is Step 2.

The exact create/modify list and dimension-negative matrix live in
`codex-pair-round2.md` §2. Reconcile that list to post-A/B source before
editing; do not copy historical line numbers or revive the rejected legacy
bridge.

## Stop conditions

Stop and ask the human instead of widening scope when:

- live, non-test unversioned authority state must be preserved;
- `observer-provision` has no genuine approval evidence binding;
- the frozen spec contradicts ADR 0002 or the closed V2 shape;
- preserving the read-only goldens requires an adapter production change;
- a change would enable workspace writes, tools, network or external effects;
- Lane D or another actor owns an overlapping runtime path; or
- a new compatibility path, migration policy or one-way-door decision appears.

Route unrelated build/schema failures to Lane B and database/custody/FK/MCP/
wrapper failures to Lane D. Do not repair them inside Lane C.

## Acceptance gates

Prefer the accepted root-workspace commands introduced by Lane B. The stable
package-level minimum is:

```sh
npm ci
npm run build
npm run check --workspace=@local/agent-fabric-protocol
PYTHONPATH=. "$HOME/miniforge3/bin/python" -m pytest -q \
  tests/test_delivery_contract.py
npm run schema:check --workspace=@local/agent-fabric
npm run typecheck --workspace=@local/agent-fabric
npm run build --workspace=@local/agent-fabric
npm exec --workspace=@local/agent-fabric -- vitest run \
  tests/acceptance/stage3/provider-permission-goldens.acceptance.test.ts \
  tests/unit/primary-provider-adapters.unit.test.ts \
  tests/unit/schema-validation.unit.test.ts \
  tests/integration/public-authority-contract.integration.test.ts \
  tests/acceptance/stage1/authority-algebra.acceptance.test.ts \
  tests/acceptance/stage3/provider-session-boundary.acceptance.test.ts
npm test --workspace=@local/agent-fabric
scripts/check-harness
git diff --check
BASE=<recorded-post-A-B-base>
git diff --exit-code "$BASE"..HEAD -- \
  runtime/agent-fabric/src/adapters/providers/claude-agent-sdk.ts \
  runtime/agent-fabric/src/adapters/providers/codex-app-server.ts
```

Add the new protocol mapping/containment tests and generated-schema drift gate
to that focused command. Acceptance requires all dimension negatives, exact
boundary preservation, no unversioned decoder/storage, unchanged provider
goldens, a clean broad baseline and zero adapter production diff.

Crucial-tier review requires a fresh native reviewer, the other primary family
and one attempted distinct bonus family. Record unavailable/degraded legs; do
not certify from best-effort output.

## Exit and next leg

When every gate passes on one final commit, update the effort map with the
commit/date, mark this handoff consumed and archive it under the project's
move-never-delete policy. The next leg is Step 2: behaviour-preserving
extraction of admission into `AuthorityCompiler`, starting from the merged
`ProviderActionDispatchInputV1` contract rather than the historical loose
handler shape.
