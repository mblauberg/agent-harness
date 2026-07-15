# Retained routing non-pass 01

Status: fail
Base revision: `9d0ea81e48c5275a2bc0d42a8dd77f11c434dd67`
Route: generated MCP -> daemon -> task-bound ephemeral provider action

All three families returned terminal, strict-JSON answers for all 36 cases and
all nine portability workflows. The raw result failed the frozen semantic gate:
primary accuracy was 103/108 and exact companion fidelity was 92/108; critical
portability failures were zero.

Adjudication found two ambiguous adjacent fixtures and an underspecified
companion rule, not a provider or parser failure. In particular, all three
families correctly treated the checkpoint-focused session case as `session`
primary, while its fixture declared `implement`; the positive orchestration and
scope-plus-grilling fixtures did not state their primary outcome sharply enough.
Models also treated built-in lifecycle obligations such as preserving context
or beginning a fresh session as separate companions. The failed raw answers,
action identities, terminal digests and metrics are retained here. The next
attempt must use a newly frozen packet and fresh actions; these outputs cannot
be relabelled into a pass.
