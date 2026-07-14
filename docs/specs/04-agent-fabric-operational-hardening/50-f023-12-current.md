
The canonical `operator_effect_custody.state` set includes `conflict` and
`quarantined`; `operation_admissions.state` includes `conflict`, `ambiguous`
and `quarantined`. They remain states of the canonical owners, not parallel
journals. Generic-owner triggers reject those states unless the exact Git
binding/admission/reservation join exists. Git lifecycle triggers permit only
the following row combinations and update every named row in one transaction:
