
### 33.4 Activation and certifying boundary

`workspace-write-offline` is defined but inert. It remains `profile-disabled`
for every provider tuple until the exact provider/adapter/contract/host/native-
mode tuple has a passing Step-3 adversarial containment receipt and its council
acceptance decision is recorded. The gate is per tuple, never a global switch;
before it, every write-profile request fails before provider I/O. Provider
settings are intent evidence, not containment proof, and a model refusal
without an observed tool attempt is inconclusive.

Every certifying Spec 05 slot/action/evidence record binds one admitted
compilation receipt whose requested and effective authority profiles are both
`review-readonly`, whose native-settings digest is exact and whose capability
snapshot has `safety.enforcedReadOnly:true` at availability, preparation,
admission and dispatch. A broader human envelope cannot make certifying work
inherit or request the write profile. Any mismatch fails before provider I/O,
cannot fall back to a generic action and cannot later certify.

### 33.5 Requirements and acceptance

- **FR-089:** Every public, launch, stored and delegated authority payload
  shall use the closed `AuthorityEnvelopeV2`; unversioned or partial authority
  shall fail before mutation or provider I/O.
- **FR-090:** Fabric shall compile each answer-bearing action's requested
  authority profile from the exact five monotone inputs before adapter I/O.
- **FR-091:** Fabric shall reject an unsatisfied requested authority profile
  and shall never substitute another profile implicitly.
- **FR-092:** Every compilation attempt shall persist the closed admitted or
  rejected authority-compilation receipt and expose only its closed scoped safe
  projection outside the daemon-private journal.
- **FR-093:** `workspace-write-offline` shall confine generic writes to one
  exact owned worktree, any separately receipted private temp root, and no tool
  egress, secret access or external effect, with lease/generation/root identity
  revalidated at dispatch, resume and every filesystem/tool operation.
- **FR-094:** `workspace-write-offline` shall remain disabled until the exact
  provider tuple has passing Step-3 containment evidence and a recorded
  acceptance decision.
- **FR-095:** Every certifying review shall request and execute only
  `review-readonly` and bind its exact compilation receipt.
- **NFR-040:** Every effective `AuthorityEnvelopeV2` dimension shall be no
  broader than the human envelope, task/worktree ownership, risk policy,
  provider capability or local attestation. The separately custodied private
  scratch root is not an envelope/artifact dimension and shall exist in
  `canonicalWriteRoots` only under the exact closed exception in section 33.3.
- **NFR-041:** Authority compilation shall be pure and deterministic for equal
  canonical inputs and shall perform no file, provider, network or external
  effect.
- **NFR-042:** Authority/native-settings receipts shall contain no secret value
  or bearer capability.

Acceptance additionally requires:

- **AC-066:** Cross-language codec/storage/launch/delegation fixtures accept
  complete V2 and reject every missing, extra, unversioned, widened and
  noncanonical field/set case; no V1 decoder remains.
- **AC-067:** Algebra fixtures cross every requested profile with each monotone
  input and prove exact admission or `AUTHORITY_PROFILE_UNAVAILABLE`, including
  no downgrade and no adapter I/O.
- **AC-068:** Golden fixtures prove exact compilation-receipt JCS bytes/digests,
  deterministic native settings, admitted/rejected safe projections, typed
  unavailable replay, secret absence and changed-input conflicts.
- **AC-069:** Before Step 3, every write-profile request rejects. After a
  passing exact-tuple fixture, the full worktree/symlink/Git/temp/network/
  settings/secret/lifecycle matrix admits only the positive owned-write arm;
  crash/restart and post-admission drift fixtures prove pre-I/O no-effect,
  post-acceptance quarantine and no same-pair recompilation.
- **AC-070:** Certifying fixtures reject requested/effective write profile,
  missing read-only capability and receipt/settings drift before provider I/O;
  all four clean heads bind exact read-only receipts.
