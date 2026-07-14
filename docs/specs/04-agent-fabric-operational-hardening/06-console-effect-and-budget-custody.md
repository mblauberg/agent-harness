
### 9.14 Artifact-content read boundary

Spec 01 section 32.14 owns the public operation and result semantics. This
section owns its daemon implementation, filesystem containment, bounded codec,
negotiation and restart behaviour. It adds no artifact authority and no second
artifact store.

The operation registry and generated protocol manifests shall advertise
`artifact-registry.v1` / `fabric.v1.evidence.publish` and
`artifact-content-read.v1` /
`fabric.v1.operator-artifact-content.read` only when their complete closed
codecs and daemon handlers are available. A client without the latter exact
feature/operation has no `artifacts.readContent` surface. Feature absence is an
honest unavailable state, not a fallback to direct filesystem access.

The handler uses two short SQLite transactions with bounded filesystem work
between them. It never holds a database transaction or the synchronous daemon
owner across file I/O:

1. phase A authenticates the `afop_` credential at point of use for the exact
   project, optional session, current principal generation and `read` action;
2. phase A selects one active `artifacts` registration, compares its revision
   and complete ref, captures the exact project/session/run/source/publisher
   tuple and derives its trusted source root;
3. outside SQLite, the daemon canonicalises that root, rejects traversal and
   opens the exact regular file read-only with a no-follow primitive;
4. it rejects a symbolic link, link count other than one, non-regular file or
   any pre-open/post-open path, device or inode mismatch;
5. it reads at most 1 MiB plus an overflow sentinel, rechecks device, inode,
   size and modification time and verifies raw source SHA-256 before strict
   UTF-8/media validation;
6. it applies whole-artifact terminal/credential safety transformation, bounds
   the inert rendering, validates the cursor and returns one monotonic UTF-8-
   bounded page with complete-rendering/page digests and an exact whole/start/
   middle/end line-fragment label; and
7. phase B opens a fresh transaction, reauthenticates every credential/
   principal/project/session generation and compares the captured evidence,
   source-owner/root and ref tuple immediately before response. Any change is
   `stale`. Unrelated global Fabric activity is not an artifact-content fence.

A second database connection must be able to commit while a deliberately slow
filesystem read is between phase A and phase B. The final transaction must see
that connection's relevant changes; SQLite snapshot reuse or event-loop
serialization is not proof of stability.

Source routing is closed and registration-owned. `project-file` joins the
canonical project root and is admitted only when an authenticated agent's
artifact-path authority covered the path at registration. `run-file` joins the
project root to the run's normalised project-relative artifact directory;
content projection requires that directory to be a dedicated strict descendant
of the project root. `git-private-diff` joins the configured canonical daemon-
private root and exact reserved
`private/git-diffs/<source-digest-without-prefix>.patch`; only the fixed Git
service may register it. Caller values never select a route or root.

The daemon shall not resolve through process current directory or a symlinked
ancestor. It rejects absent/non-canonical roots, sensitive path classes such as
credential stores, VCS internals and environment/secret files, and any
`project-file` registration outside its sealed publication authority. A
platform that cannot prove the no-follow and identity invariants reports the
operation unavailable. Reading never shells out, executes a renderer, follows
an include, invokes a pager or parses project-controlled configuration. JSON
validation is an in-process bounded syntax parse only. Markdown, diff and plain
text are projected as inert text; they are not rendered into terminal control
sequences.

The source inspection ceiling is independent of the caller's response limits.
`maximumBytes` (`4..131072`) and `maximumLines` (`1..2000`) may narrow the response but never widen the
131,072-byte, 2,000-line page maxima, 1 MiB source ceiling or 2 MiB inert-
rendering ceiling. Safety transformation precedes pagination. Each cursor is a
bounded integrity-protected, stateless encoding of the exact evidence revision,
source/rendered digests, algorithm version, page index and next rendered byte/
boundary. The pager prefers the last LF within the requested byte limit; when
one logical line exceeds that limit it advances at a UTF-8 code-point boundary
and labels the fragment without changing the complete rendered line count. It
expires when any binding changes and cannot be used to skip,
repeat or reorder a page as a complete review. The handler retains no source
bytes after the response and writes no cache, event, acknowledgement or audit
row merely for reading. Ordinary bounded request telemetry may record only the
operation name and closed error code, never content, path-derived filesystem
authority or credential text.

The shared message/artifact redactor derives current bearer families from the
credential registries and includes `afb_`, `afc_` and `afop_` as mandatory
canaries. Its versioned daemon-owned credential classifier also covers exact
runtime-known secret values, private-key blocks, authorisation headers, URL
userinfo, recognised cloud/provider token forms and assignment values whose
closed key vocabulary denotes password, token, secret, credential or private
key. It replaces a complete classified value before pagination and cannot leave
a prefix, suffix or length-correlated fragment. If a sensitive construct cannot
be boundedly classified/redacted, the result is `unsafe-content`, not a partial
rendering. This deterministic vocabulary is a safety boundary; project content
cannot add or remove patterns.

Terminal neutralisation covers CSI, OSC, DCS, APC, PM, SOS, C0/C1 controls,
carriage-return rewrites, bidi overrides and other sequences able to alter or
disguise the operator display. Newline and ordinary tab semantics may be
preserved only within page bounds. The source, complete rendered and page
digests are calculated over their explicitly named byte domains after the
closed transformation order.
