import { describe, expect, it } from "vitest";

import { GIT_OPERATION_VARIANTS, type GitOperationVariant, type OperatorGitIntent } from "@local/agent-fabric-protocol";

import { FixedGitMutationPort } from "../../src/operator/fixed-git-mutation-port.ts";

describe("Spec 05 typed Git fail-closed evaluation", () => {
  it("admits only variants with a verified native first-mutation fence", () => {
    const port = new FixedGitMutationPort({ privateStateRoot: "/tmp/agent-fabric-evaluation" });
    const supported = [
      "stage", "unstage", "commit", "branch-create",
      "worktree-create-detached", "worktree-create-new-branch", "worktree-create-existing-branch",
    ] satisfies GitOperationVariant[];
    const unavailable = [
      "fetch", "pull-fast-forward-only", "pull-merge-commit-start", "pull-rebase-start",
      "merge-fast-forward-only-start", "merge-commit-start", "merge-continue", "merge-abort",
      "rebase-current-branch-no-autostash-start", "rebase-continue", "rebase-abort",
      "push-fast-forward-only", "push-force-with-lease", "branch-rename", "branch-delete-merged-only",
      "branch-delete-force", "worktree-move", "worktree-remove-clean", "worktree-remove-force",
      "upstream-set", "upstream-unset",
    ] satisfies GitOperationVariant[];
    expect([...supported, ...unavailable].sort()).toEqual([...GIT_OPERATION_VARIANTS].sort());
    for (const variant of supported) {
      expect(() => port.assertAvailable({ operation: { variant } } as OperatorGitIntent)).not.toThrow();
    }
    for (const variant of unavailable) {
      expect(() => port.assertAvailable({ operation: { variant } } as OperatorGitIntent))
        .toThrowError(expect.objectContaining({ code: "CAPABILITY_UNAVAILABLE" }));
    }
  });
});
