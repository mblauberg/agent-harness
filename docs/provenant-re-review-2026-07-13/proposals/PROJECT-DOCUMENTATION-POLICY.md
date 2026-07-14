# Proposed project documentation policy

Status: proposal for scoping approval

## Rule

Every current project claim has one canonical owner. Agents update that owner,
link to it elsewhere and remove superseded working copies after references and
required evidence are preserved.

## Default owners

- architecture map: `docs/architecture.md`
- decisions: `docs/adr/`
- durable contracts: `docs/specs/`
- implementation slices: configured issue store
- operator procedures: `docs/runbooks/`
- dated evidence: `docs/research/`
- live execution: Fabric/Console
- session handoff: run-owned state
- temporary ideas: expiring notes

## Specifications

- unnumbered filenames;
- stable frontmatter ID;
- current behaviour only;
- <=1,000 lines and <=100 KiB;
- split by subject owner/change cadence;
- no amendment diary;
- one owner for each requirement/canonical key.

## Work store

This project uses GitHub Issues as canonical work truth. `docs/issues` is not a
mutable mirror.

Agents may create/update issues under the approved collaboration authority. An
issue does not grant implementation authority.

## Pruning

Git history is the default archive. Delete superseded working documents after:

1. durable decisions/requirements are promoted;
2. current links are repaired;
3. evidence retention is satisfied;
4. no live run/issue points to the file.

Unknown or user-owned files are never deleted automatically.

## Enforcement

`scripts/check-docs` validates:

- document frontmatter and kind;
- unique IDs/canonical keys;
- spec names/size;
- current/superseded links;
- ADR/spec/issue ownership;
- generated indexes;
- changed-file style;
- active handoff/issue bindings;
- archive retention reasons.
