## Summary

<!-- Two or three plain sentences: what changed and why, for a reader who
     has not seen the diff. No jargon. Link the issue, approved spec or
     decision record. Do not restate issue or Project status here; GitHub
     issues and Project Status own work state. -->

## Decision requested

<!-- The exact decision the reviewing user is asked to make, e.g.
     "Approve merge of <head SHA> to main." Name any user or external
     gate that stays open after merge. -->

<!-- Change map: add a Mermaid diagram here ONLY when several actors,
     dependencies or state transitions changed and prose alone would be
     hard to review. Routine or single-file PRs get no diagram. -->

## Risk and rollback

<!-- One or two lines: risk tier and blast radius, then the exact
     rollback or forward-repair step if this change is wrong after
     merge. -->

## Evidence

Base: `main` at `<sha>`. Head under review: `<branch>` at `<sha>`.
A later commit invalidates every row below and the independent review;
rerun both against the new head.

<!-- Every row must be externally verifiable: an exact command with its
     result, or a linked artifact, bound to the exact head SHA. Never
     leave a cell empty — record a result or an N/A reason. Add rows for
     change-specific gates (migration preflight, live smoke, evaluation,
     load); do not delete rows. -->

| gate | command or artifact | result | head SHA | N/A reason |
| --- | --- | --- | --- | --- |
| Style / lint | | | | |
| Typecheck, tests, build | | | | |
| Production dependency audit | | | | |
| Contract and cutover | | | | |
| Security and operations | | | | |
| Operator documentation | | | | |

## Independent review

- Reviewer role:
- Model family:
- Independence from authorship/implementation context:
- Exact head reviewed:
- Unresolved P0-P2 findings:

<details>
<summary>Implementation detail</summary>

<!-- Approach and notable choices, authorised write scope, prohibited or
     external actions, and anything a future maintainer needs to
     understand the diff. -->

</details>
