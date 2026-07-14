
The binding's `prepared_session_revision`, `prepared_run_revision` and
`prepared_dependency_revision` are the final action's compare-and-set snapshot,
not grant-lifetime fields. They may differ from the grant's issuing provenance;
the grant remains valid if its live fences still match.
