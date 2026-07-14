
The baseline has an explicit run-directory basis. Operator-launched relative
roots resolve only beneath joined `projects.canonical_root`; absolute run roots
are not admitted. Outside, ambiguous or symlinked roots fail before state. One
shared `resolveRunArtifactRoot` replaces direct/cwd-relative use in publish,
results, receipts, checkpoints, provider evidence, retention and content reads.
