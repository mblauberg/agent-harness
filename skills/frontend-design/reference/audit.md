<!-- Modified from Impeccable for this harness; see ../NOTICE.md. -->
# Technical frontend audit

Run a source-read-only, evidence-bearing audit. Do not fix code, migrate context
files or persist a report unless the user or enclosing run assigned a path.
Load `web-stack-conventions` for current WCAG/Lighthouse facts,
`react-performance` for measured React claims, and `playwright` only when
terminal browser operation is required and authorised.

## Evidence states

Record every selected check as `tested`, `failed`, `not tested`, or
`not applicable`, with the command, viewport/state and artifact or source
anchor. Unknown is not passing. Keep heuristic design judgement separate from
deterministic or measured evidence; never total them into a health score.

Select relevant evidence from:

| Surface | Evidence |
|---|---|
| Semantics | landmarks, headings, names/roles/states, labels, errors, alt text |
| Keyboard | complete journey, logical order, visible and unobscured focus, no trap |
| Reflow | 200% text, 400% zoom, narrow viewport, long/localised and RTL content |
| Input | keyboard, pointer and touch alternatives; target spacing and gestures |
| User states | loading, empty, partial, validation, permission, server/network failure, offline/retry, destructive confirmation |
| Preferences | reduced motion, forced colours, contrast/theme preferences |
| Runtime | production build, console/network errors, hydration and failed assets |
| Performance | field Core Web Vitals where available; reproducible lab, bundle and trace evidence otherwise |
| Responsive craft | representative desktop/tablet/mobile captures, overflow, hierarchy and media fallback |

Automated accessibility checks, screenshots, source inspection and accessibility
trees cover different subsets. None alone certifies WCAG conformance. Lighthouse
lab evidence is not field INP evidence. For WCAG 2.2 target size, AA uses
24 by 24 CSS pixels subject to defined exceptions; 44 by 44 is an enhanced
ergonomic target, not a universal AA failure threshold.

Do not report missing `will-change`, memoisation or a package as a performance
defect without measurement. `will-change` can increase resource cost; current
React compilation and installed framework behaviour affect memoisation choices.

## Workflow

1. Confirm scope, supported browsers/devices, artifact authority and unavailable
   evidence. Read the complete affected components and their live callers.
2. Inventory routes, states, design tokens, interactive controls, media,
   localisation and error boundaries. Trace generated and third-party surfaces.
3. Run the cheapest relevant deterministic checks first. Reuse an existing
   production artifact, prove the build is no-write, or configure all build and cache outputs under an assigned isolated path.
   Otherwise mark runtime build evidence `not tested`. Use an isolated browser
   session when available.
4. Exercise representative journeys and selected state/viewport/input cases.
   Retain sensitive screenshots/traces only under the assigned policy.
5. Verify each candidate finding against the live surface. Record skipped lanes
   and tool limitations explicitly.

## Finding contract

Order findings by user impact. Each finding contains:

```text
[P1] Surface/component — short title
Evidence state: failed
Location: file:line, route/state/viewport, command or artifact
Mechanism: what the user experiences and why
Standard: exact criterion only when verified; otherwise omit
Fix route: smallest validation-backed remedy and owning skill
```

Use P0 for an unusable or immediately dangerous flow, P1 for a release-blocking
accessibility/correctness failure, P2 for material but bounded harm, and P3 only
for evidenced polish. Do not label aesthetic preference as standards failure.
Return `clean within tested coverage` when no finding survives, followed by the
coverage matrix and material `not tested` lanes.

Recommended fixes route to `frontend-design` under `implement`; re-audit remains
read-only. Do not imply that a rerun score improved because this audit has no
composite score.
