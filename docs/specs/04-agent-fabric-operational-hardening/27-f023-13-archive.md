
Migration preflight shall reject malformed/non-canonical paths, unknown effect,
variant, recipe or state values, invalid digests, missing run authority history,
missing execution-profile or target-bound remote records, non-contiguous grant
revisions, two active grant revisions, missing normalised constraint children,
widened/gate-only constraints, malformed or impossible issuance provenance,
cross-project/session/run references and an existing generic Git custody row
without a complete typed binding. A valid historical issuing revision lower
than the current orchestration revision is not stale. Preflight also rejects an
impossible draft/admission/gate state, a non-exact gate-operation association,
any mismatch in the four-owner Git state table, duplicate active common-
directory reservations, a partial/duplicate human resolution and unowned/
native Git locks that prevent a safe initial observation. It shall not infer a
grant, draft, target, profile, admission, resolution or human gate for
historical data.
