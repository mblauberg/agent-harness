# Adjudication of the external agent-harness review

Status: Historical adjudication at `f7a3240`; operational findings superseded by
the implementation at `9f8abce`
Reviewed source: [`gpt-sol-pro-review.md`](gpt-sol-pro-review.md)
Source baseline: `2e7770fc31fe3d9fa725392fe2b1e87de38d9e38`
Adjudicated baseline: `f7a3240`
Post-adjudication baseline: `9f8abce`

## Verdict

The review is thoughtful and directionally strong, but it is not a current
implementation assessment. It was a static GitHub review of `2e7770f`; it did
not execute tests, authenticate providers or inspect the activation work now in
`f7a3240`. Its architectural principles and several hardening recommendations
remain useful. Its operational maturity verdict, primary-adapter status,
Herdr status and much of its roadmap are now stale.

The filename is also misleading: the document is a repository review, not an
analysis of a GPT Sol or Pro model.

## Post-`9f8abce` disposition

The table and programme below preserve the decisions made at `f7a3240`; they
are not a current gap list. Spec 04 subsequently implemented the accepted CI,
bounded transport, exact workspace trust, database enforcement, retention and
archive preview, deterministic receipt, status/doctor, security and invariant
work. Its current status is “implementation complete; final human acceptance
pending”. Re-open individual findings only against live source and current gate
evidence, not this historical triage.

External citations were checked against current primary sources. The cited
protocol and platform claims are generally sound: MCP puts orchestration and
security policy in the host and uses explicit capability negotiation
([MCP architecture](https://modelcontextprotocol.io/specification/2025-11-25/architecture));
Codex app-server provides version-specific schema generation and a required
initialisation handshake
([Codex app-server](https://learn.chatgpt.com/docs/app-server)); Claude exposes
compact/session hooks
([Claude hooks](https://code.claude.com/docs/en/hooks)); ACP negotiates
capabilities and separates new/load/prompt/cancel operations
([ACP overview](https://agentclientprotocol.com/protocol/v1/overview)); and the
SQLite statements about `STRICT`, WAL's single writer and `PRAGMA optimize` are
supported by the official SQLite documentation
([STRICT tables](https://www.sqlite.org/stricttables.html),
[WAL](https://www.sqlite.org/wal.html),
[ANALYZE/optimize](https://www.sqlite.org/lang_analyze.html)).

## Section-by-section disposition

The following table is the adjudication recorded at `f7a3240`, before Spec 04.
Present-tense wording in its final column describes that historical baseline;
the post-`9f8abce` disposition above is authoritative for the current tree.

| Review section | Disposition | Judgement at `f7a3240` (historical) |
| --- | --- | --- |
| 1. Fundamental architecture | Retain | Fabric below both primaries, MCP as façade, project artifacts outside SQLite and Herdr as non-authoritative visibility remain correct. |
| 2. Operational status | Closed/stale | `f7a3240` enables and pins Claude, Codex, Agy, Cursor and Kiro; five provider smokes and a live two-way MCP round trip passed. Pi alone remains deliberately disabled. Conformance vocabulary is still useful for future adapters. |
| 3. CI | Valid, Priority 0 | GitHub CI still runs only `scripts/check-harness`; it does not install Node or run the fabric package. This is the clearest remaining release-assurance gap. |
| 4. Fabric modularisation | Valid direction, over-prescribed | `Fabric` remains too broad, but application, persistence, daemon, adapter and visibility boundaries already exist. A wholesale directory rewrite is unjustified without behaviour-preserving seams and metrics. Extract incrementally. |
| 5. Canonical protocol | Partly valid | Handwritten protocol duplication remains. One-shot generation of every binding from a new schema would be a high-risk rewrite. Add protocol negotiation and schema drift gates first; generate surfaces only where equivalence can be proved. |
| 6. SQLite integrity | Valid with migration caveat | More state checks, same-run foreign keys, operational indexes and maintenance are warranted. `STRICT` requires an explicit compatibility/migration decision; it is not a free textual change. |
| 7. Retention | Valid with authority correction | Preview, archive and disposition metadata are needed. Automatic deletion is not authorised; apply remains a separate human-gated destructive operation. |
| 8. Transport hardening | Partly valid | Daemon request framing, connection and in-flight limits remain missing. Provider command/ACP/Pi output and timeout bounds now exist, so the adapter assessment is partly stale. |
| 9. Primary provider pair | Closed/stale | Generated Codex schemas, pinned executables/wrappers, explicit lifecycle boundaries, live provider smokes and daemon-restart recovery gates now exist. Optional adapters also passed their own gates; disabling them merely because the old review predates activation would reduce verified capability. |
| 10. Workspace trust | Valid, Priority 0 | The daemon is still bound to configured roots and lacks a machine-local, human-managed exact-workspace trust registry. Do not broaden to `$HOME`. |
| 11. Herdr projection | Closed/stale | Migration `0002` provides monotonic observer sequencing; the least-privilege observer persists a cursor and renders bounded human-readable events. Delivery is explicitly at-least-once across a crash window. |
| 12. Receipt semantics | Valid | `stageOwners` is task-owner data, `delivered` counts all delivery rows, and export-time `observedAt` makes identical state produce different bytes. Canonical snapshot and export metadata should be separated. RFC 8785 is a sound standard for hashable JSON ([RFC 8785](https://www.rfc-editor.org/rfc/rfc8785.html)). |
| 13. Routing | Partly valid | Hard constraints, explicit candidate rejection and expiring facts are useful. Weighted quality/cost scoring is not justified until evidence exists. Distinct lineage, no self-promotion and smallest-useful-topology policy already exist in `HARNESS.md`. |
| 14. Skills | Separate active effort | The concurrent skill-portfolio effort owns registry, trigger evaluation, packaging and Caveman cleanup. Spec 04 must not race or duplicate it. Claude's selective versus preloaded skill behaviour is accurately cited ([Claude skills](https://code.claude.com/docs/en/skills)). |
| 15. Security assurance | Valid | TypeScript, protocol, shell, dependency and supply-chain checks need CI enforcement. Local checks exist, but CI coverage is incomplete. |
| 16. Invariant/fault testing | Valid | Existing tests are broad but mostly example-based. Add a central invariant catalogue plus bounded model/state-sequence and transport fault tests. |
| 17. Governance | Partly valid | Smaller changes and current-state commands are warranted. Ten ADRs by default would create document overhead; ADRs should record only durable decisions that need independent evolution. |
| 18. Target architecture | Retain as direction | The layered diagram is compatible with the live system. Keep one daemon and one SQLite transaction boundary; do not turn logical modules into network microservices. |
| 19. Roadmap | Superseded | Reorder around the remaining gaps. Activation, primary-pair proof, Codex schema pinning and durable Herdr observation are complete. |

## Programme accepted at `f7a3240` (implemented at `9f8abce`)

The remaining high-confidence work becomes
[`Spec 04 — Agent fabric operational hardening`](../specs/04-agent-fabric-operational-hardening.md):

1. full fabric CI and immutable workflow dependencies;
2. bounded/versioned daemon transport;
3. exact machine-local workspace trust;
4. SQLite integrity, indexes and maintenance with migration evidence;
5. preview-first retention/archive controls;
6. deterministic receipt snapshots with corrected delivery semantics;
7. status/doctor output instead of workstation claims in repository docs;
8. invariant and deterministic fault testing;
9. incremental `Fabric` extraction only where the preceding changes create a
   stable seam.

Skill governance, model-quality scoring, remote A2A, external dashboards,
automatic deletion and broad service decomposition are excluded from this
programme. They either have a separate owner, lack evidence, require a new
human decision or solve no present operational failure.
