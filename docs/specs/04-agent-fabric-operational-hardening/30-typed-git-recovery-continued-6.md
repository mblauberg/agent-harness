- grant issue/revise/revoke requiring `git-authorise`, a Preview-bound
  direct-human decision and positive subset of every `git_allowlist_v1`
  dimension; missing/stale parents, wildcard/negative-only rows, widened
  variants/refs/paths/remotes/profile, gate-only variants, reused human
  provenance and an ordinary `git` caller all fail before insert/update;
- absent, expired, revoked/non-active, tampered/nonexistent issuance provenance,
  wrong project/session/generation, authority/allow-list/profile/remote fence,
  repository/worktree or constraint-mismatched grants causing zero Git process
  I/O, including a sibling operation variant or same remote name with another
  target;
- ordinary session/run/dependency and repository HEAD/ref/index/content
  revision advancement after issuance leaving the grant valid, while a stale
  action Preview fails its own CAS and a fresh Preview reuses that grant.
  Authority/allow-list rotation, session-generation, canonical repository/
  worktree identity, profile or remote-target change at Preview, prepare, lock,
  final recheck or first mutation invalidates it without rewriting issuance
  provenance;
- exact draft replay returning one prepared admission/operation ID and no
  custody/reservation/liveness; changed payload, duplicate ID, early effect row,
  expiry/cancel/stale reopen and gate association by operation kind all fail;
- final gate Preview making no write, while confirmed Commit alone atomically
  consumes the exact draft, authorises its admission and creates custody/
  reservation. Direct-SQL negatives vary draft/gate operation ID, revision,
  digest, resolver, run, dependency revision, enforcement point and blocked
  effect; the removed operation-kind trigger accepts no same-kind substitute;
- one real temporary-repository operation for every Spec 01 operation variant,
  including upstream set/unset and typed merge/rebase continue/abort, with
  fixed profile/backend, bounded I/O and a receipt matching a fresh typed read;
- hostile local/system/global config, includes, hooks, attributes, filters,
  merge/diff drivers, aliases, credential/remote helpers, SSH/editor/pager/
  signing/askpass variables, prompts and submodule recursion canaries proving
  rejection or the sealed trusted path before any project-selected executable;
- byte-identical merge, pull-merge, rebase and pull-rebase recipe output for one
  pinned profile across wall-clock, locale and caller-config changes, plus exact
  parent/tree/identity/timestamp/message, source-to-new mapping, conflict
  manifest and hard-bound checks; a Git binary/version/digest change invalidates
  the old Preview, and an unpinned backend is unavailable;
- exact start-conflict proof followed by separately drafted/gated typed
  continue and abort, with predecessor custody/generation, atomic terminal/
  successor transfer and one-reservation checks. Crash before successor
  dispatch makes the successor the conflict owner without Git I/O; old-owner,
  concurrent-successor, automatic recovery and start gate/admission reuse fail;
- an out-of-band abort, manual resolution or conflict-state edit makes the
  persisted predecessor conflict, or the inherited conflict after successor
  Commit but before successor dispatch, fail a complete sealed-reader comparison.
  Explicit reconciliation atomically quarantines every owner, retains the
  reservation and records `conflict-state-unverifiable`; incomplete evidence
  and the first two identical transient unavailable/inconsistent signatures
  advance only the bounded lookup audit and retain the blocker. A missing/
  revoked pinned inspector, proved canonical-evidence integrity failure or the
  third identical failure signature under the bounded time/command rule
  quarantines every owner with matching `inspector-unavailable` or
  `evidence-integrity-failure` eligibility. A different signature resets the
  streak. Closed
  codec negatives reject missing/extra/cross-variant fields, nullable-evidence
  mismatch, stale binding/conflict/reservation/lookup generations and `git`
  without `git-custody-resolve`. Target and reconciliation command status
  queries distinguish target `pending/prepared`, `ambiguous`, `conflict` and
  `quarantined`, plus reconciliation-command `pending/observing`, for both owned
  and inherited-successor lineage;
  exact replay returns the immutable snapshot with zero inspection, changed
  replay conflicts, and a crash before final CAS may repeat only the read-only
  inspection. A race that transfers custody or completes another lookup between
  inspection and final CAS stores one terminal closed rejection command
  with zero owner update; exact replay performs no second inspection and a new
  command must bind the latest tuple. A separately drafted/gated custody adjudication
  then releases or retires exactly that reservation with zero Git/remote/
  process/filesystem mutation, while an unchanged conflict still permits only
  typed continue/abort;
- fault injection before binding/reservation insert, after generic custody,
  after prepare commit, after private lock, after each native lock, before the
  SQLite CAS and immediately before the first mutation/CAS for index, ref,
  merge/rebase worktree, worktree registry, config/upstream and remote families;
  every injected competing change fails with zero authority-visible mutation;
- restart of `prepared` making no Git/remote call and cleaning only its owned
  private artifact (or retaining an inherited conflict), restart of
  `dispatching`/`ambiguous` making exactly one bounded lookup and no mutation,
  quarantine making no automatic lookup, retained conflict making no automatic
  action, and exact machine/human terminal replay making no call;
- commit/branch/worktree/upstream local proof, target-bound fetch/pull/push
  remote proof, same-name target retarget invalidation, merge/rebase conflict,
  partial pull and unavailable remote observation remaining honest;
- unresolved Git custody blocking project-session closure and surviving daemon
  and Console restart without a duplicate effect, followed by
  `git-custody-resolve` negatives for ineligible or intact-conflict custody,
  stale lookup/evidence, wrong gate/capability/human provenance and changed
  replay. Faults
  before/after every resolution statement leave all rows unchanged or one
  immutable human-labelled result, make zero Git/remote/process call, preserve
  machine evidence, release/retire one reservation and remove only its closure
  blocker; and
- capability, remote-credential, command, output and receipt canaries proving
  that no secret, arbitrary argument or unbounded process output reaches
  persistence, projection, logs or Console rendering.
