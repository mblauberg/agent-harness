# Shared worktree policy

The project constitution (`HARNESS.md`) is a standing user-approved envelope:
creating linked worktrees for implementation work needs no per-instance
approval. That authority still does not imply authority to delete a branch,
force-remove state, integrate changes or let agents write overlapping scopes —
each of those remains separately gated.

## Canonical location

Every authorised linked worktree is a direct child of the owning repository's
primary checkout:

```text
<primary-repository-root>/.worktrees/<task-agent>
```

All agent platforms use that same directory. Never place linked worktrees in a
platform cache, `/tmp`, a home-level pool, the current linked worktree, or an
artifact `scaffolds/` directory. A nested repository or submodule owns its own
`.worktrees`. Multi-repository work uses one authorised worktree per repository.

Project instructions may strengthen this invariant. Only a direct user
instruction may make a one-run location exception.

## Helper

Use the checked helper after authorisation. `--human-authorised` attests that
the current operation is covered by a direct instruction or an active approved
envelope; the run receipt records which source supplied that authority:

```sh
scripts/worktree create NAME --human-authorised --detach REV
scripts/worktree create NAME --human-authorised --new-branch BRANCH \
  --branch-authorised --start-point REV
scripts/worktree create NAME --human-authorised --existing-branch BRANCH
scripts/worktree list
scripts/worktree check
scripts/worktree remove NAME --human-authorised
```

The helper resolves the primary checkout through Git's common directory, checks
the name and protected root, and refuses unsafe creation/removal. Receipts for a
run record the selected `repo_root`, `primary_root`, `common_git_dir`, worktree
path and branch/detached state.

## Ownership and cleanup

- One stage owner writes a worktree at a time. Sibling agents use separate
  worktrees or artifact-only scopes.
- Worktrees share Git objects, configuration and hooks; they are not security
  sandboxes. Secrets, LFS and submodules need their own deliberate setup.
- Worktrees do not share ignored dependencies or build output. Before treating
  a suite failure as a product defect, run the owning repository's declared
  lockfile bootstrap and build commands in that worktree, then record the exact
  commands and results. Do not guess the package manager or install mode.
- Before removal, confirm a clean status, no live agent/pane and no unconsumed
  handoff. Use `git worktree remove`, never filesystem deletion.
- Force removal, pruning and branch deletion require separate user authority.
- `.worktrees/` is protected infrastructure: context cleaners, broad backups
  and scratch pruning must skip it.
