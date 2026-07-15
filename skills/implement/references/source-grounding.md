# Version-sensitive source grounding

Use this only when correctness depends on a changing external contract: an
API, SDK, framework, tool, schema, protocol, standard or platform behaviour.
It is not a demand to cite every ordinary code line.

## Grounding loop

1. Detect the installed or locked version from the actual environment,
   manifest and lockfile. Record conflicts instead of silently choosing one.
2. Inspect repository conventions, local wrappers, tests and generated types.
   A primary source does not automatically override an intentional repository
   convention; surface the mismatch and preserve the approved local contract.
3. Consult the narrowest authoritative source that matches that version:
   installed source/types/tests first when they define runtime reality, then
   official versioned documentation, specifications, changelogs or upstream
   source. Search summaries and third-party examples are discovery aids only.
4. Record the interface, version or commit, source, retrieval date and exact
   assumption that the implementation relies on. If the source or version
   cannot be established, label the claim `unverified` and add a focused test,
   spike or user decision; do not convert uncertainty into confidence.
5. Turn volatile facts into executable contract tests where proportionate.
   Keep citations in the delivery evidence or owned engineering docs rather
   than scattering research commentary through production code.

Re-check only when the dependency/version, relevant interface or local
convention changes. Security-sensitive, legal or public-standard claims still
follow their specialist authority hierarchy.

## Research provenance

Independently written synthesis, informed by the source-grounding pattern in
[Addy Osmani's agent-skills at commit 4e8bd9f](https://github.com/addyosmani/agent-skills/tree/4e8bd9fde4a38cd009053e649f4cdc7cd36b568b)
and adapted to this harness's local-first, evidence-bound delivery lifecycle
(reviewed 2026-07-11). No upstream skill text or executable code is imported.
