# Agent fabric invariant catalogue

Status: enforced
Owner: `runtime/agent-fabric`

This catalogue maps durable claims to their enforcement and regression
evidence. SQLite migration `0003` is additive: it preflights legacy rows before
installing triggers and indexes, then fails the migration transaction as a
unit on any violation.

| Invariant | Enforcement | Primary evidence |
| --- | --- | --- |
| Agent, task, delivery, lease, provider-action, team, budget, objective-check, human-gate and barrier states use closed enumerations | `0003-integrity-and-query-plans.sql` triggers | `persistence-invariants.integration.test.ts` |
| Boolean fields are SQLite `0` or `1`; generations/counts and budget quantities stay in range | migration triggers plus `preflightAdditiveInvariants` | `migration-runner.integration.test.ts`, `persistence-invariants.integration.test.ts` |
| Authorities, agents, tasks, messages, deliveries, leases, events and provider targets do not cross run boundaries | migration insert/update triggers; spawn/attach exceptions preserve the established creation order | `persistence-invariants.integration.test.ts` and existing acceptance suites |
| One process owns mutations for a database and socket | OS-backed SQLite owner locks and safe path checks | `daemon-process-exclusivity.integration.test.ts`, daemon CLI acceptance tests |
| Mailbox, task, lease, event and unresolved-provider reads use bounded indexed paths | migration partial/composite indexes and query-plan assertions | `persistence-invariants.integration.test.ts` |
| Unclean startup is detected and checked before service | private unclean marker, `quick_check(1)` and first `foreign_key_check` result | `sqlite-connection-hardening.integration.test.ts` |
| Long-lived SQLite state receives bounded maintenance | `PRAGMA optimize = 0x10002` at open | `sqlite-connection-hardening.integration.test.ts` |
| Wire frames, connections and in-flight work cannot exceed global maxima | shared bounded NDJSON parser, protocol handshake and daemon/client/adapter admission limits | `bounded-ndjson.unit.test.ts`, `daemon-transport.integration.test.ts`, adapter process tests |
| A client cannot issue fabric methods before agreeing protocol v1 | mandatory `initialize` negotiation | `daemon-transport.integration.test.ts` |
| Workspace admission is exact, canonical, private and profile-bound | machine-local trust registry plus portable-config narrowing | `workspace-trust.unit.test.ts`, configuration tests |
| Retention never implies deletion authority | report/preview output fixes prune eligibility to false; archive is receipt-copy only | `retention-cli.unit.test.ts` |
| Re-exporting unchanged committed state is byte-identical | receipt v2 canonical snapshot; export time stored separately | `receipt-export.acceptance.test.ts` |
| Status and doctor never print bearer capabilities | metadata projection omits credential paths and values | `status-cli.unit.test.ts` |
| Typed Git grants preserve exact human-input provenance and are rechecked after asynchronous observation | operator-action input-record digest propagation plus final authority/grant/gate/profile/remote/writer claim transaction | `operator-projection-actions.test.ts`, `typed-git-service.test.ts` |
| A fixed local Git mutation starts only with a verified native first-mutation fence | no-follow pinned path/index bytes, native `index.lock`, atomic index install, `update-ref` old-object CAS, or an exact 0700 worktree-destination reservation followed by `--no-checkout`; every other fixed-port variant reports `CAPABILITY_UNAVAILABLE` before custody | `fixed-git-mutation-port.test.ts` |
| Git profiles, secret-free remote targets and run allow-lists come only from trusted daemon composition | production child composition forwards only typed trusted Git configuration; `TrustedGitRegistry` digest-checks profiles/remotes, defers configured run allow-lists until their exact authority tuple exists, and persists every registry/allow-list revision behind immutable triggers | `production-bootstrap-wire.test.ts`, `trusted-git-registry.test.ts`, `typed-git-migration.test.ts` |

The bundled fixed local mutation port currently admits `stage`, `unstage`,
`commit`, `branch-create` and the three `worktree-create-*` variants. Worktree
creation pins the exact source object/ref, owns one canonical direct-child
destination and never materialises checkout content. Remote effects, pull,
merge/rebase and successors, branch rename/delete, worktree move/remove and
upstream configuration remain in the closed protocol vocabulary but return
typed unavailability unless trusted daemon composition supplies a port with the
required native/remote CAS and deterministic-result contract. The Console must
display that unavailable state; it must not fall back to porcelain or arbitrary
Git execution.

The live database can also be checked without provider execution:

```sh
scripts/agent-fabric doctor --json
scripts/agent-fabric retention preview
```

No trigger or test grants destructive retention, remote listening, a second
transaction owner or provider-session mutation authority.
