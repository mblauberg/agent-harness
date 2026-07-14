
#### 32.19.3 Owned four-slot profile

The protocol package owns
schemas/spec05-four-slot-v1.schema.json and the checked-in profile document
config/review-profiles/spec05-four-slot-v1.json. Both are closed and
digest-bound. The profile has exactly these rules:

~~~yaml
resolvedReviewProfileSlotV1:
  schemaVersion: 1
  slot: native-or-other-primary-or-cursor-grok-or-agy-gemini
  adapterClass: primary-native-or-equal-primary-or-cursor-or-agy
  adapterId: exact-activated-adapter
  adapterContractDigest: sha256-prefixed-digest
  providerFamily: canonical-family
  model: exact-model
  requiredActualEndpointProvider: exact-provider-id
  requiredActualProviderFamily: exact-provider-family
  requiredActualModel: exact-provider-model
  requestedEffort: null-or-exact-effort
  resolvedEffort: resolvedEffortV1
  sourceMode: direct-portal-or-portal-helper
  runtimeIdentityDigest: sha256-prefixed-digest
  platformIdentityDigest: sha256-prefixed-digest
  providerTurnCeiling: positive-integer
  internalStepCeiling: nonnegative-integer
  mandatoryReadOps: nonnegative-integer
  mandatoryReadBytes: nonnegative-integer
  explorationReadOps: nonnegative-integer
  explorationReadBytes: nonnegative-integer
  routeAliases: ordered-nonempty-unique-ids
  riskReadMapDigest: sha256-prefixed-digest
  reviewerFamilyRelation: same-family-exempt-or-distinct-family-proved

resolvedReviewProfileV1:
  schemaVersion: 1
  profileId: spec05-four-slot-v1
  profileSchemaDigest: sha256-prefixed-digest
  targetChairFamily: openai-or-anthropic
  slots: exactly-four-resolvedReviewProfileSlotV1-in-profile-order
  resolvedProfileDigest: sha256-prefixed-canonical-profile-digest
~~~

`resolvedProfileDigest` hashes RFC 8785 JCS of the complete profile with only
that digest omitted. Unknown/extra slots or fields, crossed availability
identity, an inapplicable effort with nonnull request, or a relation other than
the two admitted snapshot values rejects. The same slot object is stored,
projected in Console and equality-checked at dispatch.
`requiredActualProviderFamily` and `requiredActualModel` must equal the slot's
admitted `providerFamily` and `model`; `requiredActualEndpointProvider` equals
the resolved admitted endpoint behind the allowed route alias. None may be
derived after terminal output.

The three `requiredActual*` fields are certification requirements, not aliases
for admission. Endpoint provider, family and model must each be proved by the
terminal `deployedRouteObservationV1` `observed` arm, sourced from the
authenticated provider result or a contract-defined adapter attestation, and
must equal both this profile and the admitted route. Their exact observation
digest and admission digest bind the closed `actualReviewRouteIdentityV1` and
its `actualRouteIdentityDigest`. Missing/unavailable proof emits
`actual-route-unproved`; any proved inequality emits `actual-route-mismatch`.
Any other route field that is observed rather than unavailable must also equal
admission or emits the same mismatch.
Either makes the result noncertifying and accepts no reported resolutions, but
every safely parsed adverse P0-P2 finding is retained and added to the paged
open set. This rule applies only to certifying review. Generic provider work
continues under its matched permission profile and route authority.

Every resolved certifying slot also requires its capability snapshot
`safety.enforcedReadOnly: true` and an equality-matched enforced read-only
permission profile at availability, preparation, admission and dispatch. False
or unknown produces the existing typed certifying-slot unavailable result before
provider I/O; it cannot fall back to a generic call. This does not make generic
answer-bearing work read-only: any generic action may explicitly request
`review-readonly`; `workspace-write-offline` is its only additional option.
Spec 03 activation cannot define another write profile, widen either profile or
make writes available before the exact containment gate.

| Slot | Adapter class and ID | Family/model rule | Reviewer-family relation to target chair |
| --- | --- | --- | --- |
| native | primary-native; codex-app-server for OpenAI chair, claude-agent-sdk for Anthropic chair | exact activated native review route; family equals target chair | same-family-exempt |
| other-primary | equal-primary; claude-agent-sdk for OpenAI chair, codex-app-server for Anthropic chair | exact activated equal primary distinct from target chair | distinct-family-proved |
| cursor-grok | cursor; cursor-agent | family xai; exact activated model cursor-grok-4.5-high | distinct-family-proved |
| agy-gemini | agy; agy | family google; exact activated model Gemini 3.1 Pro (High) | distinct-family-proved |

The target chair and eligible publisher must be OpenAI or Anthropic and have the
same family. The resolved snapshot names, for every slot, exact adapter class,
adapter ID, adapter contract digest, model family, model, requested effort plus
the tagged resolved-effort policy, source mode, provider-turn/internal-step ceiling, maximum read
operations/bytes, mandatory/exploration subledger bounds, risk-map digests,
route aliases and the one reviewer-family relation requirement. Missing or
ambiguous resolution rejects target preparation. The native exemption is
profile data, not reducer prose. For a Codex/OpenAI target, other-primary
therefore resolves to Claude/Anthropic. A proved same-agent lifecycle rotation
that satisfies the binding contract above preserves this matrix. Any other
    chair/family/adapter/contract/model/profile change makes the target stale;
    successful successor preparation then supersedes it and resolves the whole
    matrix again.

Publisher eligibility and reviewer-family relation are separate predicates. The
eligible root's proved publisher family must equal the target chair family.
External slots then prove only that reviewer family differs from the target
chair family. Native is `same-family-exempt`. `same-family-forbidden` and
`family-unproved` block under `reviewer-family-distinctness`. This relation
makes no claim about authors, contributors or write-lease holder families,
which this profile does not track. No publisher-independence flag, disposition
or blocker exists.

Every resolved adapter must advertise activated
certifying-review-packet-only.v1 under the exact adapter contract digest. That
capability proves:

- model-visible source is limited to the action-bound Fabric portal. A provider
  without native portal MCP uses the trusted
  `agent-fabric-review-portal-supervisor` Rust executable in fixed
  `portal-stdio-v1` mode. Its absolute install path, device/inode, SHA-256 and
  code identity are pinned by the activated adapter contract. Cursor/Agy MCP
  configuration names that same binary and exact mode; no shell launcher,
  bearer argument or inherited provider descriptor is permitted. The provider
  MCP manager may launch it only from the exact outer-supervisor-admitted
  provider-runtime closure. Neither launch is model command authority;
- the adapter receives a daemon-built minimal auth/config capsule when its CLI
  requires one: a per-action 0700 synthetic HOME containing only exact 0600
  adapter auth/config bytes. Its path/value is outside the model-visible
  filesystem/tool namespace. The helper environment contains exactly the
  non-secret locators `AGENT_FABRIC_REVIEW_SOCKET`,
  `AGENT_FABRIC_REVIEW_ACTION` and `AGENT_FABRIC_REVIEW_CONTRACT`; the last two
  are the canonical provider action pair and activated contract digest. They
  are correlation data, not authority. No real HOME, user/project state,
  capability, bundle path or credential is inherited;
- outer OS confinement and canary transcripts deny every user/project/auth file
  read outside portal-returned bundle objects plus all workspace-index, shell, edit/write,
  browser, arbitrary-network and provider-source effects; and
- process custody is crash-safe, not only deadline-safe. Before mkdir, portal
  filesystem socket, capsule or fork, the daemon commits one immutable filesystem intent plus state
  `open`. `open` with no process row is the reserved arm. It binds the already-
  opened recovery-root path/device/inode, all relative
  basenames, contract and expected capsule digest. It then creates exclusively
  beneath that no-follow root and fsyncs every artifact/directory/parent. Reserved
  crash recovery can remove only a revalidated daemon-created partial object;
  no provider has run and any substitution becomes integrity failure. After full
  identities are captured, the daemon launches the pinned Rust binary in
  `supervise-v1` mode with one private control FD 3, retains the per-action AF_UNIX
  listener and one endpoint of a one-use registration socketpair. The supervisor forks only the pinned Rust
  launch stub, which receives the other endpoint as FD 4, establishes its group/
  session, completes the exact three-frame launch handshake below, and waits
  pre-exec while watching daemon and parent liveness. The daemon validates the
  registration and atomically inserts the complete exact-FK process-custody row
  while state remains `open`; row existence is the process-bound arm. It records
  nonce/action/registration/committed-row/ACK digests, then sends the matching
  ACK only after commit. Only then may the stub close FD 4, recheck its
  parent and exec the provider in place. EOF/mismatch/parent death before ACK
  exits without provider exec; no provider code precedes durable custody.
  Spec 04 section 9.21.3 normatively pins the 136-byte `AFCHAL1\0` challenge,
  216-byte `AFREGV1\0` registration and 208-byte `AFACKV1\0` ACK, their exact
  field order, half-close framing, 32-byte one-use CSPRNG nonce, domain-separated
  digest preimages and committed launch-row revision. Both implementations
  reject partial/trailing/duplicate/crossed/replayed frames before exec; Rust and
  TypeScript share checked-in byte/digest golden vectors and negative fixtures.
  The action-specific `providerClosureDigest` is the domain-separated digest of
  exact JCS binding the immutable effective configuration and activated
  contract plus its exact launch-envelope digest to the opened executable path/device/inode/content/code/transitive
  identity, ordered argv/environment bytes, cwd, capsule, stdio and complete FD
  manifest. The Rust stub independently derives every locally observable
  component, equality-checks the challenge-bound local-stdio digest plus exact
  daemon topology attestation, and recomputes the complete JCS/digest before
  registration and after ACK. The daemon alone derives and revalidates its
  retained-peer topology attestation immediately pre-ACK. Any substitution is
  no-exec. The launch envelope is rendered only from the effective configuration
  and contract-pinned argv/environment policy; actual bytes must equal it, parent
  environment is never inherited, and unsafe loader/config/workspace/path
  overrides are no-exec.
  Private custody stores the canonical action
  directory and a distinct 0700 claim directory outside provider mutation
  authority, both paths/device/inode, and only relative socket/capsule basenames
  with their expected file device/inode/type and kind-specific digest. The
  socket is `S_IFSOCK` and its digest is the pinned domain-separated device/
  inode identity digest; the regular-file capsule digest hashes its exact
  bounded bytes. Both require `st_nlink=1` at capture, claim revalidation and
  unlink so a surviving hard-link alias cannot be reported removed. This crash-
  recovery metadata never enters a public projection, provider/model input or
  receipt. Only the three minimum non-secret helper bootstrap values above may
  enter the isolated helper environment; they expose no device/inode, capsule
  locator or authority. Supervisor-only control FD 3 never passes to the stub;
  the stub closes FD 4, marks fixed executable/cwd/parent FDs 5–7 `CLOEXEC`, and
  proves provider entry inherits exactly stdio FDs 0–2. None of 3–7 is present
  in the provider/helper environment.
  Control EOF/HUP, deadline,
  cancellation or provider exit makes the supervisor TERM the complete group,
  wait 250 ms, KILL and reap. It closes its descriptors but never removes
  persisted socket/capsule paths because it cannot advance daemon-owned cleanup
  phases. The daemon watches supervisor death and solely owns phase-aware path
  cleanup; after daemon death, restart resumes it from the unchanged row.

The trusted adapter transport may contact its fixed provider endpoint outside
the model tool sandbox; it cannot expose a general network tool. When provider
API transport and model-visible web tooling share one process, capability
requires provider-native proof that policy separates them or a contract-pinned,
destination-constrained proxy for the provider API bytes. Otherwise it is
false. The threat model covers accidental or model-induced misuse of an
authentic pinned runtime. A deliberately compromised provider binary is outside
it and must instead fail binary provenance/code-identity admission. Claude SDK
and Codex app-server may bypass the stdio/Unix-socket helper only through their
native dynamic-tool transports when those transports expose the same two
generated schemas, action capability, read/search ledger, source isolation,
terminal framing and journal evidence. Their activation canaries have full
parity: exact discovery/two positive calls; project/user/auth absolute and
relative read denial; shell, write/edit, browser/web/network, unrelated MCP/
resource/prompt denial; bundle crossing; deadline/cancel cleanup; and absence
of credential/capability text. Codex native confinement is mandatory, not
inferred from Claude or the app-server sandbox. A direct route that cannot
prove every canary uses `portal-stdio-v1` when its provider integration can
confine that helper equivalently, otherwise advertises capability false.
Cursor/Agy always use the pinned stdio helper and create no source workspace.
Their model-visible
allowlist contains exactly
`mcp(agent-fabric-review-bundle/review_bundle_read)` and
`mcp(agent-fabric-review-bundle/review_bundle_search)`. Adapter bootstrap may
not be represented as a model tool: the outer adapter supervisor may execute
the exact provider-runtime closure, and the provider MCP manager may internally
launch the exact helper/path/digest/fixed argv. Neither grants the model an
executable tool. Every other `mcp(*)`, `command(*)`, read/write/shell, browser/web,
network, resource or prompt path is denied before effect. Discovery must return
exactly the one server and two tools defined in section 32.19.2. Any extra
surface, successful denied effect or outside-portal source read invalidates the
action.

Confinement has two distinct executable allowlists. Trusted adapter bootstrap
may launch only the activated provider-runtime closure plus portal helper/broker;
model-triggerable descendants may reach only the two portal calls and no
executable tool. For Cursor, activation resolves/bypasses the shell launcher to
one pinned real target where the build supports it. Otherwise the contract must
pin and confine the exact launcher, shell, Node, index and private cache/data
closure with fixed argv. Agy must likewise prove direct execution; if its hook
transits `/bin/sh`, the only alternative is one exact path/inode/digest-pinned,
fixed-argv trampoline whose complete child closure is canary-proved. If either
closure cannot be proved on the current build, capability remains false. Agy's
signed native executable is pinned by path, code identity and digest under the
same rule. Seatbelt/`sandbox-exec` is an exact-OS-version canary capability, not
a portable assumption: deprecation, absence, syntax/semantic drift or a failed
positive/negative canary advertises false.

The TypeScript daemon exclusively creates, retains and accepts one per-action
AF_UNIX listener; neither listener nor accepted FD is passed with `SCM_RIGHTS`
or inherited by the Rust supervisor, provider or helper. The Rust
`portal-stdio-v1` helper owns only its connecting client FD. On Darwin, the
TypeScript broker obtains `LOCAL_PEERTOKEN` and `LOCAL_PEERPID` from that accepted
FD before reading bytes, then proves
same UID; exact PID and process start time; PGID and session; ancestry beneath
the persisted provider root; and exact helper executable path, device/inode,
digest and code identity. The action/contract locators must match the persisted
record. The first valid connection atomically consumes the broker slot; a
second connection or reconnect fails. A platform that cannot prove equivalent
peer credentials and process identity advertises the capability false. The
action capability remains broker-side and is never an argument, environment,
config value or model input.
Wrong-listener/accepted-FD, inherited-FD, relayed-peer and SCM_RIGHTS attempts
are activation negatives; TypeScript must observe the helper itself as peer,
never the supervisor or provider root.

The Rust `portal-stdio-v1` mode is a `std`-only opaque bounded
stdio-to-AF_UNIX byte relay. It enforces only fixed byte/framing and lifecycle
bounds; it does not parse, generate or transform JSON-RPC, MCP or hook JSON.
TypeScript is the sole semantic parser, schema validator, policy owner, ledger
and canonical journal. The Console/TUI, daemon and protocol remain TypeScript;
this narrow native boundary does not create a second protocol implementation.

On daemon restart, recovery first verifies both PID and start time before any
signal. Before provider continue/exec, the daemon has persisted the canonical
custody directory and a distinct 0700 claim directory under a daemon-private
recovery root outside provider/supervisor mutation authority, including both
paths/device/inode plus each socket/capsule device/inode/kind-specific digest and
independent persisted cleanup phase. The directories are distinct on one
filesystem; activation probes atomic cross-directory no-replace rename and
provider denial of the claim namespace before launch. Recovery opens both
directories no-follow, equality-checks both identities and rejects absolute/
traversing basenames. For each expected child, persisted canonical permits exact
canonical-to-claim rename or recovery of an exact claim, then the daemon durably
fsyncs both directories and CASes claimed before unlink. Only persisted claimed
may unlink/recover absence, fsync the claim directory and CAS removed; canonical
with both absent, both present or
any substituted identity is integrity failure. After both child phases are
removed and both directories fsynced, the daemon persists children-removed,
removes/fsyncs the canonical directory and persists canonical-removed, then
removes/fsyncs the claim directory and persists removed/cleaned. Each missing-
directory crash arm is admitted only from its immediately preceding durable
phase. Digest-only lookup, direct unlink from the raced canonical namespace and
unproved filesystem absence are insufficient. PID/start inspection is never
signal authority. The live direct-parent supervisor retains its provider group
leader unreaped through TERM, bounded wait, KILL and descendant-absence proof,
preventing PID/PGID reuse before final reap. A restarted daemon may signal only
through an OS identity-stable handle that cannot retarget after exit. The live
daemon likewise may not signal the provider after supervisor death unless it
acquired and retained that handle before provider continue. A Darwin daemon
without an activated equivalent never signals orphaned persisted PIDs/PGIDs on
either path. Exact live/ambiguous or mismatched records are quarantined with
capability false, and identity-safe path
cleanup proceeds only after exact process absence. FD-3 closure lets a surviving
supervisor kill/reap its owned group after daemon death while leaving paths to
daemon recovery. Startup evidence and canaries cover daemon-only crash,
supervisor-only crash, simultaneous restart and exit/PID reuse exactly between
observation and attempted restart/supervisor-death signal, which must emit no
signal. Capability remains false unless current-build negatives prove a
pinned child cannot escape cleanup through `setsid`, `setpgid`/job-control group
split, double-fork, daemonisation or reparenting and that no descendant, listener or auth capsule
survives.

The Agy policy and PreToolUse hooks encode the two exact MCP exceptions and the
adapter-owned helper bootstrap, then hard-deny read_url(*), execute_url(*),
read_file(*), write_file(*), every other mcp(*) and every other command(*).
An Agy auth file may exist in its synthetic HOME only when an absolute-path auth-
read canary proves the model cannot read it. Cursor receives per-action
synthetic HOME, workspace and data directories and no global CLI config. It
exposes only those two MCP tools and denies filesystem Read, Write, Shell,
WebSearch/WebFetch and every unrelated MCP/resource. Current-build canaries
must prove exact discovery, both portal calls, every negative and that auth
remains adapter-internal (for example Keychain), never a model-readable capsule
file. Hardened wrappers add outer confinement and fail-closed stream/hook
evidence; stock/tool-policy-only CLI cannot certify.
Unsupported adapters/platforms advertise the capability false. Missing
activation, contract-digest mismatch or unenforceable sandbox returns
CERTIFYING_REVIEW_CAPABILITY_UNAVAILABLE before router/provider I/O, action or
budget reservation. It never falls back to a noncertifying provider call.
The profile resolver appends a safe availability revision for the exact key
`(projectSessionId, profileId, profileSchemaDigest, targetChairFamily, slot,
adapterId, adapterContractDigest, providerFamily, model, sourceMode,
runtimeIdentityDigest, platformIdentityDigest)` and advances one current head
by CAS. No shorter profile/slot cache key is authoritative. It projects the
exact `certifyingSlotUnavailable` reason vocabulary in section 19.
`review-target.prepare` checks those rows in its bounded DB-only admission and
rejects before creating a preparation when any required slot is unavailable.
`review-completion.read` consults the same rows even when no target exists: it
returns top-level `certifying-review-capability-unavailable` plus nonempty typed
`unavailableSlots[]`, not a misleading sole `missing-target`. No target, action
or budget row is needed to make this blocker observable.

Direct-portal slots reserve at most 128 provider turns and at most 112 portal
operations, preserving at least 16 provider turns for planning and final answer.
Portal-helper slots reserve one Fabric provider turn and at most 128 trusted
internal portal calls. Both source modes reserve two nonfungible portal
subledgers before provider I/O:

- mandatory: exactly the target mandatory-read count and exact mandatory bytes,
  bounded by 80 operations/6 MiB; and
- exploration: exactly 32 operations/4 MiB for direct-portal and 48 operations/
  4 MiB for portal-helper.

Each mode therefore reserves at most 10 MiB combined canonical wire bytes.
The final target dynamically recomputes its exact codec/body/object/wire bytes
from the approved immutable run-start to its actual sealed HEAD. With the 2 MiB
maximum risk sample it must fit the 6 MiB mandatory and 10 MiB combined
ceilings before target commit. No prior delivery-HEAD count or design-time raw
byte observation is an acceptance oracle.

The combined ceiling is therefore 112 operations/10 MiB direct and 128
operations/10 MiB through the helper. The admission transaction
atomically reserves provider turns/calls/concurrency plus mandatory and
exploration `review_read_ops`/`review_read_bytes`. No slot may borrow between
the subledgers or narrow its source-mode exploration headroom.

After action-capability authentication, the first successful read of each exact
mandatory digest debits one mandatory operation and the exact canonical MCP
response byte length. Every search, optional read, duplicate mandatory read and
authenticated malformed/out-of-bundle attempt debits one exploration
operation. Successful exploration also debits its exact canonical response byte
length; an error debits zero bytes. The daemon reserves the operation before
work, commits the exact byte debit before returning bytes, and journals
subledger, ordinal, tool, request/result digest, status and byte count. Search
therefore consumes budget exactly like read and cannot spend mandatory
capacity. Unauthenticated calls identify no action and change no ledger.
Exhaustion returns the closed budget error without source bytes and is
noncertifying when it prevents the mandatory predicate.

Mandatory satisfaction counts unique root/page/chunk responses only. Duplicate
reads and searches debit exploration but never satisfy a mandatory entry. Read
call order is otherwise free; only the immutable manifest/page/chunk ordinal and
digest chains are ordered.

#### 32.19.4 Structural routing and admission

The shared model-route.v1 codec contains only closed structural routing data:

~~~yaml
routeRequest:
  schemaVersion: 1
  adapterAlias: configured-nonempty-alias
  modelAlias: configured-nonempty-alias
  explicitModel: null-or-structurally-valid-model
  role: configured-route-role
  leadFamily: canonical-nonempty-model-family
  requireDistinct: true-or-false
  providerEffort: null-or-structurally-valid-effort
~~~

It rejects unknown fields and malformed values but performs no database,
artifact, target, effort-applicability, adapter-activation, model-policy or
currency read. Null effort requests the configured route default. The Python
router and TypeScript daemon validate the same checked-in schema.

Every answer-bearing provider-action request also carries this separate closed
authority selector:

~~~yaml
providerActionAuthorityRequestV1:
  schemaVersion: 1
  requestedAuthorityProfile: review-readonly | workspace-write-offline
  expectedAuthorityProfilePolicyVersion: exact-version
  requestedAuthorityProfileDigest: sha256-prefixed-digest
~~~

Using section 33.1's authority digest function,
`requestedAuthorityProfileDigest=AD("provider-authority-profile-request-v1",
{schemaVersion,requestedAuthorityProfile,
expectedAuthorityProfilePolicyVersion})`. It rejects unknown fields and never
accepts native settings, roots, environment, sandbox, network or tool controls.
The receipt separately records the request's
`expectedAuthorityProfilePolicyVersion` and Fabric's authenticated current
`authorityProfilePolicyVersion`. Admission requires equality. Inequality
persists a rejected `policy-version-mismatch` receipt under the current compiler
policy; it never compiles effective authority under another version.
It is not part of `routeRequest`: structural model routing and execution
authority remain independently versioned, while action admission and its
receipts equality-bind both.

A certifying provider-action.dispatch additionally carries this separate closed
binding; non-review work carries null:

~~~yaml
certifyingReview:
  oneOf:
    - null
    - targetGeneration: exact-current-target
      slot: native-or-other-primary-or-cursor-grok-or-agy-gemini
      expectedSlotHeadGeneration: nonnegative-CAS-generation
      expectedChairBindingGeneration: positive-active-binding-generation
      expectedOpenFindingSetDigest: sha256-prefixed-digest
      findingWindowMode: normal-or-resolution-only
      findingCapacityReservationDigest: sha256-prefixed-digest
~~~

Every provider-action request names `adapterId` and `actionId`; their pair is
the daemon-global `ProviderActionRefV1`. The requested adapter must equal the
profile slot adapter and the resolver's adapter result. A route may select
family/model/effort within policy but cannot silently change the provider
action's adapter. Existing durable command/action replay and immutable input-
digest comparison run first. A certifying action must request
`review-readonly`; a generic action may request `review-readonly` or
`workspace-write-offline`. For a new certifying action, the authenticated
caller must hold the current chair lease/generation and equal the target's
active chair binding. Ordinary
answer-bearing work retains its existing task authority.

After immutable command/pair replay classification and before invoking the
router, review dispatch validates the exact open-finding set and commits either
a normal 32-finding capacity reservation or an admitted zero-new-finding
resolution-only reservation. Capacity failure returns the typed blocker with
no router, provider, action or budget effect.

The trusted resolver is side-effect-free, reads only pinned routing inputs,
writes nothing, performs no provider/network call and emits bounded output. One
5,000 ms deadline covers spawn, parse and validation; timeout/overflow kills
the process group with TERM then KILL after 250 ms. It leaves no action, route,
command result or budget reservation.

Pre-router durable preflight and in-process single-flight use only the global
`(adapterId, actionId)` pair. The owner digest hashes RFC 8785 JCS of the run,
authenticated actor/principal identity and complete closed dispatch input,
including route request, authority-profile request, task, complete
`AuthorityEnvelopeV2`, certifying binding and provider payload; command ID is
handled by the outer replay journal and is not omitted from any other semantic
field. An exact concurrent retry joins that flight. A
different owner digest waits for the owner and then returns
ACTION_INPUT_CONFLICT before any router call, even after a pre-commit owner
failure. Cross-run reuse of the same pair therefore invokes the router at most
once and conflicts pre-router; the same `actionId` on a different adapter is
legal. A later exact same-owner retry may safely rerun only the side-effect-free
router after a pre-commit crash. Durable action, route, recovery and adapter
journals use the same pair; no action-ID-only lookup exists.

After a successful router result, the authority compiler consumes the exact
profile request and five inputs in section 33.3. A rejected compilation
atomically persists its receipt against the pair preflight, returns the typed
unavailable result and creates no provider action, route, dispatch or provider
effect. An admitted compilation enters one admission transaction that rechecks
task and authority, complete budget, current target/chair/profile/head generations,
delivery/source/artifact currency, certifying-review-packet-only.v1 capability/contract, route
aliases, effort applicability, resolved adapter/family/model/tagged effort and
lead-family/distinctness. The resolved adapter must equal both the requested
adapter and resolved slot snapshot; the complete route must equal that snapshot.
These are database admission rules, not codec rules. It then commits the
admitted compilation receipt, per-action effective configuration, action,
canonical route request/receipt and digests, target/bundle/coverage/profile/head/chair
snapshots, final-prompt digest, complete budget reservation and command receipt
before provider I/O.

That transaction also CAS-increments the slot head's attempt generation and
reserves the exact target, slot and evidence-head generation for this action.
A partial unique constraint permits one nonterminal attempt for that tuple. Two
concurrent actions from one head cannot both commit or reach the provider; a
later attempt starts only from the returned current attempt/head state.

Dispatch and read expose the canonical action pair and one closed
providerRouteProjectionV1 containing those
exact immutable values. No later router/configuration, chair, target or
registry change rewrites it.

#### 32.19.5 Terminal review results and provider failures

The provider answer must be exact valid UTF-8 and no larger than 65,536 bytes.
Its strict review-result.v1 object is:

~~~yaml
reviewResultV1:
  schemaVersion: 1
  targetGeneration: exact-action-target
  coverageDigest: exact-action-coverage-digest
  findingWindowMode: normal-or-resolution-only
  verdict: CLEAN-or-FINDINGS
  resolvedFindingDigests: ordered-unique-subset-of-prior-open-findings
  findings:
    - findingId: unique-safe-id
      severity: P0-or-P1-or-P2
      summary: bounded-safe-text
      evidence: bounded-safe-text
      repairKind: repository-source-or-registered-evidence-or-mixed
      evidenceRefs: ordered-subset-of-bundle-required-evidence-refs
~~~

CLEAN requires no new findings and resolves every prior open finding.
FINDINGS requires one through 32 new findings and may resolve any subset of
prior open findings. `repository-source` requires empty evidence refs;
`registered-evidence` and `mixed` require a nonempty set that the daemon
resolves to exact origin registration/revision/content tuples. A resolution-
only action requires CLEAN, zero findings and at most its 32 admitted prior
digests; it is always noncertifying. Unknown/duplicate fields or IDs, inconsistent target or
coverage, malformed JSON, controls, credentials, capabilities or unsafe text
produce UNUSABLE. The reject-only safety classifier and immutable secret-set
identity remain as defined in section 32.14. Raw answer and raw adapter result
stay daemon-private.

A provider may terminate with a proved failure and no answer. Its code is
exactly one of `max-turns-exhausted`, `provider-rejected`,
`terminal-no-answer` or `adapter-terminal-failure`; no adapter-specific or
future value enters this arm. This is not effect ambiguity. Fabric commits terminal
state, the closed failure code and a digest of bounded normalised private
diagnostics; it exposes no raw error or fabricated answer. Every proved-effect
terminal kind -- safe answer, unusable answer or provider-terminal-failure --
settles authenticated complete usage exactly. If that usage is absent or
partial, the same terminal transaction conservatively consumes the full
remaining spendable reservation. In either case it releases terminal
concurrency capacity. Proved terminal-no-effect releases the reservation;
ambiguity retains it. The action is never redispatched. Ambiguous means only
that provider effect/outcome is not proved.

The closed terminalReview arm is exactly one of safe-answer, unusable-answer,
provider-terminal-failure, terminal-no-effect, integrity-terminal or
retired-unknown. terminal-no-effect proves no provider review effect;
integrity-terminal proves terminal effect/settlement but cannot verify the
route/bundle chain; retired-unknown is the direct-human retirement of a
permanently ambiguous effect after full-ceiling charge. None certifies except a
safe-answer whose verdict is CLEAN or FINDINGS. resultDigest is SHA-256 of
one exact arm below.

A safe-answer also carries daemon-derived readCoverageDigest and the closed
coverage summary: mode manifest-complete-risk-directed, mandatory predicate,
per-risk-group total/read/unread counts and unread object-set digests, and
byteComplete:false unless every object was fully read. Coverage gaps are
therefore explicit and cannot be provider/chair-edited. Certification never
claims byte-for-byte review.

Mandatory-read failure is classified before the public terminal arm is
committed. A syntactically valid CLEAN with insufficient coverage becomes
unusable-answer and reports/accepts no resolution. A safely parsed FINDINGS
remains a safe-answer with its safe findings and reported resolution set, but
is noncertifying, accepts no resolution and adds every new P0-P2 finding. Raw
unsafe or unparseable output is unusable-answer. Provider repetition of a
coverage digest is never read proof.

Actual-route proof is classified at the same terminal boundary. A missing or
unavailable required provider/family/model observation leaves a safe answer
noncertifying with `actual-route-unproved`; any observed route value unequal to
admission, or any required value unequal to the resolved profile, uses
`actual-route-mismatch`. The observation digest and, only when the required
identity is proved, the complete closed `actualRouteIdentityDigest` are stored
in the immutable evidence record. Neither blocker discards a safe FINDINGS
payload: resolutions remain unaccepted while all adverse findings retain normal
custody. Generic, non-review provider actions do not acquire this certification
predicate.

~~~yaml
terminalResultIdentityV1:
  commonRequired: [schemaVersion, actionRef, terminalSequence, terminalKind]
  schemaVersion: 1
  actionRef: ProviderActionRefV1
  terminalSequence: positive-run-sequence
  oneOf:
    - terminalKind: safe-answer
      required: [providerAnswerDigest, reviewResultDigest, answerSafety,
        readCoverageDigest, coverageSummaryDigest]
      answerSafety: safe
    - terminalKind: unusable-answer
      required: [providerAnswerDigest, reviewResultDigest, answerSafety,
        readCoverageDigest, coverageSummaryDigest]
      reviewResultDigest: null
      answerSafety: unusable
    - terminalKind: provider-terminal-failure
      required: [providerFailureCode, providerFailureDigest]
      providerFailureCodeEnum: [max-turns-exhausted, provider-rejected,
        terminal-no-answer, adapter-terminal-failure]
    - terminalKind: terminal-no-effect
      required: [noEffectEvidenceDigest]
    - terminalKind: integrity-terminal
      required: [integrityEvidenceDigest]
    - terminalKind: retired-unknown
      required: [retirementEvidenceDigest]
~~~

Every arm rejects every field owned by another arm. `terminalResultDigest` is
SHA-256 of RFC 8785 JCS of exactly that arm with no omitted field; the digest is
stored outside the object. Usage, cost, timestamps, history, lookup attempts and
settlement are excluded. A later usage reconciliation cannot change it.
Checked-in golden vectors cover all six arms, both action-ID forms and every
failure code; permutation, extra-field and crossed-arm negatives must fail.

The immutable route and terminal read shapes are closed and shared by agent,
operator and Console projections. `providerRouteProjectionV1` is byte-shape-
identical to receipt `$defs.localProviderRoute`; implementation defines it once
and reuses it:

~~~yaml
providerRouteProjectionV1:
  schemaVersion: 1
  routeRequestDigest: sha256-prefixed-digest
  routeReceiptDigest: sha256-prefixed-digest
  authorityCompilationReceiptRef: providerAuthorityCompilationReceiptRefV1
  adapterId: exact-adapter
  adapterContractDigest: sha256-prefixed-digest
  providerFamily: canonical-family
  resolvedModel: exact-model
  requestedEffort: null-or-exact-effort
  resolvedEffort:
    oneOf:
      - kind: applied
        value: exact-effort
      - kind: inapplicable
  targetGeneration: null-or-positive-generation
  slot: null-or-native-or-other-primary-or-cursor-grok-or-agy-gemini
  reviewedArtifactRef: null-or-exact-artifact-revision
  publicationLineageDigest: null-or-sha256-prefixed-digest
  bundleDigest: null-or-sha256-prefixed-digest
  manifestRootDigest: null-or-sha256-prefixed-digest
  coverageDigest: null-or-sha256-prefixed-digest
  bundleSearchIndexDigest: null-or-sha256-prefixed-digest
  riskReadMapDigest: null-or-sha256-prefixed-digest
  mandatoryReadSetDigest: null-or-sha256-prefixed-digest
  finalPromptDigest: null-or-sha256-prefixed-digest
  targetChair:
    oneOf:
      - null
      - agentId: exact-agent
        bindingGeneration: positive-generation
        principalGeneration: positive-generation
        chairLeaseGeneration: positive-generation
        providerSessionGeneration: positive-generation
        bridgeGeneration: positive-generation
        adapterId: exact-adapter
        adapterContractDigest: sha256-prefixed-digest
        modelFamily: canonical-family
        model: exact-model
        routeReceiptDigest: null-or-sha256-prefixed-digest
  profileDigest: null-or-sha256-prefixed-digest
  slotHeadGeneration: null-or-nonnegative-generation
  attemptGeneration: null-or-positive-generation

providerActionTerminalProjectionV1:
  schemaVersion: 1
  actionRef:
    adapterId: exact-adapter
    actionId: exact-action
  status: prepared-or-dispatched-or-accepted-or-ambiguous-or-terminal
  originalDispatchReceiptDigest: sha256-prefixed-immutable-digest
  routeState: present-or-missing-or-integrity-failed
  route: null-or-providerRouteProjectionV1
  routeRecoveryEvidenceDigest: null-or-sha256-prefixed-digest
  terminalReview:
    oneOf:
      - null
      - kind: safe-answer-or-unusable-answer-or-provider-terminal-failure-or-terminal-no-effect-or-integrity-terminal-or-retired-unknown
        terminalSequence: positive-run-sequence
        terminalResultDigest: sha256-prefixed-digest
        providerAnswerDigest: null-or-sha256-prefixed-digest
        reviewResultDigest: null-or-sha256-prefixed-digest
        verdict: null-or-CLEAN-or-FINDINGS-or-UNUSABLE
        failureCode: null-or-max-turns-exhausted-or-provider-rejected-or-terminal-no-answer-or-adapter-terminal-failure
        noEffectEvidenceDigest: null-or-sha256-prefixed-digest
        integrityEvidenceDigest: null-or-sha256-prefixed-digest
        retirementEvidenceDigest: null-or-sha256-prefixed-digest
        readCoverageDigest: null-or-sha256-prefixed-digest
        coverageSummaryDigest: null-or-sha256-prefixed-digest
        currentCertificationBasis: null-or-reviewCertificationBasis
        certifying: true-or-false
  evidenceMutationReceipt: null-or-reviewEvidenceMutationReceiptV1
~~~

`resolvedEffort.kind=inapplicable` requires `requestedEffort:null` and is the
only legal value when the adapter/model has no effort control. `applied` carries
the exact admitted value; a null request then means the configured default.
There is no sentinel, model-label inference or free-form effective-effort
string.

The original dispatch projection never morphs. Only provider-action.read joins
the immutable dispatch projection to the current terminal projection. Kind
and route invariants reject crossed shapes: route is non-null and recovery
digest null iff routeState is present; missing/integrity-failed has null route
and a non-null safe recovery digest. It never uses the all-null non-review route
arm to disguise a missing certifying binding. Kind
invariants reject irrelevant non-null fields: only safe/UNUSABLE answers may
carry answer/coverage/evidence; only provider-terminal-failure carries a
  failure code; no-effect/integrity/retired carry exactly their corresponding
  arm evidence-digest field. `terminalResultDigest` always remains the SHA-256
  of the complete six-arm identity preimage and never aliases that evidence
  digest. Only a current sufficient safe answer can set
certifying true.
The projection rejects an `actionRef.adapterId` that differs from the route
adapter, terminal journal pair, recovery pair or evidence pair.
