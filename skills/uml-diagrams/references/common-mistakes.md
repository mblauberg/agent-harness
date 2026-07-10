# Common Mistakes

Use this checklist before returning any diagram. Treat these as hard blockers, not stylistic preferences.

## Package overview mistakes

1. **Using `pkg` instead of `uc` for the project package overview**
   - Fix: use `frame "uc System Name" { ... }` for use-case package diagrams.

2. **Putting individual use cases inside the package overview**
   - Fix: Section 2.1 shows packages only. Put individual use cases in Section 3 diagrams.

3. **Using solid actor-to-package lines in the package overview**
   - Fix: use dashed directed dependencies (`A_Actor ..> P_Package`) to match the course examples.

4. **Packages are not cohesive**
   - Fix: regroup by related user goals and business capability, not by UI page, database table, or team ownership.

5. **Actors are internal system components**
   - Fix: actors must be external roles or external systems that interact directly with the system.

## Use case diagram mistakes

6. **Use case is not a system function**
   - Symptom: names such as `Eat Food`, `Wait in Queue`, or `Read Screen`.
   - Fix: use a system-provided function such as `Place Order`, `Update Record`, or `Display Results`.

7. **Actor is a person's name or job title too specific to one individual**
   - Fix: name the role: `Registered User`, `Travel Partner`, `Support Agent`, `Payment Service`.

8. **Missing system boundary**
   - Fix: use `frame "uc Package Name"` and a `rectangle "Package Name" { ... }` boundary.

9. **Incorrect include direction**
   - Wrong: `Included .> Base : <<include>>`.
   - Right: `Base .> Included : <<include>>`.

10. **Incorrect extend direction or missing condition**
    - Wrong: `Base .> Extension : <<extend>>`.
    - Right: `Extension .> Base : <<extend>>` plus `note on link` containing the condition.

11. **Using include/extend to show order**
    - Fix: use an activity diagram to show workflow order.

12. **Plain solid line between two use cases (no stereotype)**
    - Wrong: `UC_A -- UC_B` or `UC_A --> UC_B`.
    - Right: relationships between use cases must be `<<include>>`, `<<extend>>`, or generalisation. Plain associations are only valid actor-to-use-case.

13. **Cross-package reference oval is not annotated**
    - Fix: when a base use case references an included or extended use case that lives in a different package, label the destination oval `Use Case Name\n(defined in P<n>)` so a reviewer can trace it.

14. **Includes field claims transitive includes as direct includes**
    - Symptom: UC-A.Includes = "B; C; D" when A directly includes B, and B itself includes C and D.
    - Fix: list only direct includes. Add a Notes line stating which includes are reached transitively.

15. **Typical-scenario step says "System invokes X" but X is not in Includes/Extension Points**
    - Fix: either promote X to Includes/Extension Points, or reword the step to credit the parent use case ("Make Reservation continues by invoking Confirm Reservation (transitive include)").

16. **Alternative-scenario step reference does not exist in the typical scenario**
    - Fix: cross-check every `Step` column entry against the typical-scenario rows. Update to the correct step (or step range).

17. **Use case actor list mismatches across Section 5, Section 6, and the diagram**
    - Fix: every change to a UC's actor list must propagate to (1) Section 5 Table 5, (2) Section 6 detailed description Secondary Actors row, and (3) the diagram's actor associations.

18. **Section 4 actor never appears in any Section 5 row**
    - Fix: either add the actor to a real use case or remove it from Section 4.

19. **Include/extend label sits midway between two unrelated use cases**
    - Fix: place the stereotype label near the source or destination port, not in the visual middle of an L-shaped route, otherwise a reviewer reads it as a third relationship.

19a. **`<<include>>` or `<<extend>>` label has a padded white background that covers the relation line**
    - Symptom: the dashed line appears broken because the opaque label box masks it.
    - Fix: draw the label as transparent text only. In manual generators, remove the `rect()` call inside `label_box` and keep only `text()`.

19b. **Condition notes for `<<extend>>` are scattered at random positions**
    - Symptom: a reviewer has to hunt which note belongs to which extension.
    - Fix: place every condition note in a consistent column immediately to the right of the extension use case, at the same y-band as the use case oval. Same `x` and `w` across all notes in the diagram.

19c. **Package overview cross-column dependency uses right-angled routing**
    - Symptom: a `..>` arrow turns 90° through the middle channel and visually overlaps intra-column vertical dependencies.
    - Fix: draw cross-column package dependencies as direct diagonals from source package edge to destination package edge. Reserve orthogonal routes for activity diagrams.

## Activity diagram mistakes

20. **Unlabelled decision node**
    - Wrong: branching without a decision question.
    - Right: `if (Payment Authorised?) then (yes) ... else (no) ... endif`.

21. **Missing guards**
    - Fix: every outgoing decision branch must have a guard label such as `(yes)`, `(no)`, `(approved)`, `(declined)`, or `(duplicate found)`.

22. **Fork/join not closed**
    - Fix: every `fork` needs `end fork` or `end merge`.

23. **Using fork for alternatives**
    - Fix: use `if/then/else` for mutually exclusive alternatives; use `fork` only for concurrent work.

24. **Two or more alternate flows enter a shared downstream action without a merge**
    - Fix: insert an explicit merge node where the alternative flows reconverge. A single edge from one node to another does NOT require a merge.

25. **Two finals stacked at the same coordinate on the same arrow**
    - Fix: each terminating flow gets one final, at its own position. Either consolidate to a single shared final or separate the finals horizontally.

26. **Empty swimlane**
    - Fix: every declared partition must contain at least one action node. If a role has no action, do not draw a lane for it.

27. **Action labelled with the wrong role's verb**
    - Symptom: "Request Supplier Evidence" sits in the supplier's lane.
    - Fix: the requester's lane holds the request action; the responder's lane holds a matching `Provide ... Evidence` action. Cross-lane arrows make the handoff explicit.

28. **Action names are too long or not Verb–Noun**
    - Fix: prefer short labels: `Validate Card`, `Display Error`, `Generate Receipt`, `Reserve Flight`.

29. **No swimlanes for multi-party workflows**
    - Fix: add lanes for the primary actor, system, and external systems.

30. **Activity diagram duplicates another author's textual use case description**
    - Fix: choose a different significant use case or coordinate with the work allocation.

31. **Arrow does not reach its target node port**
    - Symptom: arrowhead floats in empty canvas or stops short of the merge diamond.
    - Fix: place the final polyline point on the destination boundary (top/right/bottom/left port). For PlantUML this is automatic; manual SVG generators must compute boundary coordinates.

32. **Arrow visually passes through a different action box on its route**
    - Fix: route around obstructions through empty channels. Find a clear `x` column or `y` row that crosses no action bounding box, then bend the line through it.

## Cross-cutting mistakes

33. **Front-matter date conflicts with version history date**
    - Fix: bump both at the same time. The change history row date is the source of truth.

34. **Version history row omits applied edits**
    - Fix: every meaningful spec or diagram edit gets an entry in the current version row.

35. **Glossary missing a load-bearing acronym**
    - Symptom: NFR cites ISO 4217, PCI DSS, WCAG 2.2 AA, GDPR, etc. without a glossary entry.
    - Fix: add one-line glossary entries for every acronym used by an NFR or risk row.

36. **NFR acceptance row is qualitative**
    - Symptom: "ensure security", "good performance", "comprehensive logging".
    - Fix: every NFR acceptance row gets a numeric threshold, percentile, audit method, or named standard with a published version.

37. **Risk row missing probability, impact, owner, or mitigation**
    - Fix: every risk row needs all four. Mitigation must be a concrete action, not a restatement of the risk.
