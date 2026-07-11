# Rendering quality checklist

Inspect the rendered SVG or PNG. Record each applicable item as passed, failed,
not tested or not applicable; do not infer conformance from source inspection.

## Use case and package diagrams

- [ ] The subject and boundary are unambiguous.
- [ ] Actors are external to the subject; use cases are inside its boundary.
- [ ] Actor associations and include/extend/generalisation directions match the
      source requirements.
- [ ] Every extension condition is visible or traceable to a linked requirement.
- [ ] Cross-boundary items use canonical project identifiers.
- [ ] No label, oval, actor or connection overlaps or clips.
- [ ] The abstraction level is coherent; split overview and detail when needed.

## Activity diagrams

- [ ] Initial and final nodes match the intended activity semantics.
- [ ] Decisions and outgoing guards are identifiable.
- [ ] Merges reunite alternatives and joins synchronise concurrent work.
- [ ] Every lane is populated and actions belong to the responsible participant.
- [ ] Call activities resolve to defined project requirements or activities.
- [ ] Connections reach their intended nodes and avoid unrelated shapes.

## Cross-cutting and traceability

- [ ] Text remains readable at the delivery size and does not clip.
- [ ] Flow direction and relationship labels are easy to follow.
- [ ] Meaning survives grayscale; colour is not the sole distinction.
- [ ] Fonts, palette, naming and caption style follow the project profile.
- [ ] Diagram IDs, actors, relationships and outcomes match the canonical
      requirements source.
- [ ] The render is current for the exact source revision being delivered.
- [ ] Generated outputs and any document/index updates are inside the authorised
      write scope.
