
The additive persistence change for operation enforcement shall bind each
gate-operation predicate to the gate's exact project session and coordination
run. The public check supplies the Spec 01 section 32.16 `operationTarget` and
current dependency revision. For `{kind: task}`, the transaction proves the
task belongs to that run and joins the operation kind to the gate's current
`scoped_gate_tasks` row at the same bound dependency revision. For
`{kind: run}`, task/subtree gates never match. Run/release gates remain bounded
to their exact run. Preparation triggers and service checks use the same
predicate, so a target-less call, same-kind sibling substitution, stale graph
or cross-run task cannot authorise or block an effect accidentally.
