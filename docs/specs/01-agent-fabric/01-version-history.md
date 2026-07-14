
Version 0.37 defines the accepted capability-compiled authority contract while
keeping workspace writes inert. It cuts every authority boundary directly to
`AuthorityEnvelopeV2`, closes the initial profile set to `review-readonly` and
`workspace-write-offline`, requires monotone compilation plus an immutable
native-settings receipt, and preserves certifying review as read-only. The
write profile remains unavailable until an exact provider tuple passes the
Step-3 adversarial containment gate; this version enables no write, tool
egress, external effect, deployment or irreversible action.

Version 0.36 is a draft amendment pending a fresh anchored audit, repair and
independent review
of its externally authenticated lifecycle-receipt design. It completes the
Console read surface without adding authority. It
adds an exact current-preparation locator, pair-keyed provider-route read and
watermark-stable route list, and makes task, agent and evidence operator rows
plus Activity/message references unambiguously session/run-qualified. It also
closes the previously approved portal custody cleanup around durable claim and
directory phases, pins the provider argv/environment/source-contract envelope,
and makes lifecycle terminal/adoption evidence externally authenticated rather
than snapshot-resealable. The new reads reuse the existing
preparation and `providerRouteV1` codecs; no compatibility decoder, second
route shape or caller-guessed identity remains. Version 0.35 replaces the obsolete unroutable Cursor model label with the
runtime-discovered current `cursor-grok-4.5-high` identifier. The exact
four-slot profile, adapter allowlist and final route evidence use that one
current name; no `grok-4.5-xhigh` compatibility alias remains. Version 0.34 closes the deployed-route, discovery-surface, review-identity,
context-pressure and topology-wave wire contracts required by Spec 05. It makes
capability refresh stable by content, gives certification an observed-identity
oracle, and adds no automatic routing, topology or lifecycle authority. Version 0.33 folds the mature July 2026 continuity and route-evidence findings
into the existing owners. It adds one versioned adapter-capability snapshot,
exact requested/admitted/observed deployed-route identity and privacy-minimised
operational spans without adding an automatic pressure controller, learned
router or provider-native deep-mode registry. Version 0.32 closes the remaining receipt, bundle, recovery, lifecycle and
terminal-resize contradictions in v0.31. It makes provider failure and route
history representable without inventing evidence, freezes every certification
digest/cut, pages finding custody without truncation, exposes live recovery
authority and separates target-wide from slot blockers. Lifecycle adoption no
longer waits on review state; it either appends an exact same-subject binding or
leaves the target stale. Version 0.31 closes the final pre-implementation design-review gaps in v0.30
without widening scope. Review-target preparation is now a durable asynchronous
job; same-agent lifecycle rotation advances an append-only chair binding rather
than invalidating already-current review evidence. Provider action identity is
the daemon-global `(adapterId, actionId)` pair at every boundary. The external
review portal uses an authenticated per-action Unix socket and crash-owned Rust
supervisor instead of an inherited provider descriptor, and both direct and
helper transports share one closed wire ledger. The receipt is standalone,
review capability failure is truthfully projected, context telemetry is
monotonic, and `review-diff.v1` freezes the exact bundle-diff codec. Version
0.30 closes the implementation-review gaps in v0.29 without widening
scope. The daemon builds a complete content-addressed review bundle from a
sealed delivery basis and clean base/head state, snapshots proved
publication-time session lineage plus the exact chair/profile, and admits one
linear action/evidence head per slot. Router admission is structural, bounded,
side-effect-free and stable-key single-flight. Raw answers and errors remain
private; public surfaces carry safe result/failure, bundle/coverage, route and
lineage digests. One recovery owner safely settles every certifying action,
including route-integrity custody, and rotate/compact uses asynchronous
suspended lifecycle custody with ABA-safe identity/bridge generations. Version 0.29 closes the provider-review lineage gap already covered by
FR-015, FR-016A, AC-071 and Spec 05 v1.4. A task-bound answer-bearing spawn
now carries one strict route request. At new-action admission the daemon invokes
the trusted existing model router, verifies the resolved adapter, model,
family and tagged resolved effort against the admitted provider payload, and commits
the canonical route request, receipt and their digests with the immutable
provider action before provider I/O. Exact replay uses that stored route;
changed route input conflicts. A chair-only typed review-evidence operation
then derives reviewer identity, terminal answer/result digest and reviewer-
family relation from durable action, route and reviewed-artifact publisher
lineage. Caller-authored post-hoc route receipts, provider-family assertions
and reviewer-family assertions no longer certify review. This clarification
does not approve automatic continuity-routing modes or any other unapproved
capability. Version 0.28 keeps task-bound provider execution within the public protocol's
30-second request ceiling. Dispatch atomically reserves and journals the action
plus command receipt, queues one daemon-owned completion, and returns its
durable `prepared` or `dispatched` receipt before provider completion. The chair reads the same action until
terminal answer evidence and digest are available; disconnect, timeout or an
exact replay never starts another effect. Version 0.27 binds task-bound provider
work and every applicable hard provider
dimension to one delegated authority-budget custody, and closes the Console
decision projections. An ephemeral spawn atomically reserves its enforceable
turn/call/concurrency ceiling plus each configured cost, token or wall-clock
dimension in the same transaction that creates the immutable provider action.
Exact terminal usage consumes and releases the reservation once; ambiguity
retains it; unprovable usage freezes only the affected dimensions until an
authenticated reconciliation proves them. Terminal tasks admit no new
ephemeral work. Attention may carry only a
daemon-derived, revisioned, same-session/run open-gate binding, while a bound
intake may carry only the durable prior chair-request correlation and current
chair target needed to prepare a successor request. These strict projections
give Pause/Resume, Attention decisions and Discuss/Request-changes real typed
paths without making the Console an authority store. Version 0.26 binds every locally provisioned MCP roster to one daemon-owned
active generation. Replacement is an exact predecessor/replacement CAS that
atomically revokes the prior roster; private filesystem publication uses the
same generation CAS, so a delayed writer cannot restore an older roster.
Point-of-use authentication revalidates the active seat, current session/run,
chair lease and principal generation. Version 0.25 closes the answer-bearing
review contract: a successful task-bound ephemeral provider action validates
one nonempty bounded UTF-8 answer plus its canonical result digest. Version
0.30 keeps raw text public only for non-review work and projects certifying
review as digest plus safe parsed result. It never projects the
raw adapter result object, resume reference, usage record, transport detail or
credential. An adapter must explicitly advertise answer-bearing spawn support;
otherwise Fabric rejects the review before provider I/O. Version 0.24 adds one
current task-bound ephemeral provider path for fresh
reviewers and bonus-family workers. `fabric_provider_action_dispatch` accepts
`operation: spawn` only with an exact active task, narrowed authority,
explicit model/family and read-only admitted payload. It records the provider
action and bounded result without creating a retained agent identity or a
second control plane. Version 0.23 remains the normative pre-release
consolidation. Fabric supports one current database baseline and public
protocol, preserves incompatible local
state without mutation, and rejects it explicitly rather than importing or
emulating it. It also owns exact project/session/run topology, coordinated
workstreams, generation-bound live chair handoff and typed operator effects.
Any later reference to an incremental migration number, vintage daemon/client,
implicit run import, retired decoder, coarse authority bundle or compatibility
retry is superseded. Current optional-feature negotiation, provider capability
discovery and pinned adapter artifacts remain required hardening, not
backward-compatibility promises. No amendment authorises provider login, push,
release or unattended daemon operation.
