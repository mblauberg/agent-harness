
The migration transactionally widens the canonical
`operator_effect_custody.state` check with `conflict` and `quarantined`, and
widens `operation_admissions.state` with `conflict`, `ambiguous` and
`quarantined`. These are refinements of the existing owners, not parallel
journals. Generic-owner triggers reject those new states unless the exact Git
binding/admission/reservation join exists. Git lifecycle triggers permit only
the following row combinations
and update every named row in one transaction:
