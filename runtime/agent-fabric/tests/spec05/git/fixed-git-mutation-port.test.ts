import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { parseTimestamp, type OperatorGitIntent, type Sha256Digest } from "@local/agent-fabric-protocol";

import { FixedGitMutationPort } from "../../../src/operator/fixed-git-mutation-port.ts";
import { readGitObjectDigest } from "../../../src/operator/git-repository-read.ts";

const directories: string[] = [];
const digest = (value: string): Sha256Digest => `sha256:${value.repeat(64).slice(0, 64)}` as Sha256Digest;
const gitBinaryDigest = `sha256:${createHash("sha256").update(readFileSync("/usr/bin/git")).digest("hex")}` as Sha256Digest;

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function run(cwd: string, args: string[], environment: Readonly<Record<string, string>> = {}): string {
  return execFileSync("/usr/bin/git", args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", ...environment },
  }).trim();
}

function repository(name: string): string {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), `${name}-`)));
  directories.push(root);
  run(root, ["init", "-q", "-b", "main"]);
  writeFileSync(join(root, "tracked.txt"), "before\n");
  run(root, ["add", "tracked.txt"]);
  run(
    root,
    ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "initial"],
    { GIT_AUTHOR_DATE: "2026-01-01T00:00:00Z", GIT_COMMITTER_DATE: "2026-01-01T00:00:00Z" },
  );
  writeFileSync(join(root, "tracked.txt"), "after\n");
  return root;
}

function executionProfile() {
  return {
    profileId: "sealed-git-v1",
    revision: 1,
    digest: digest("1"),
    gitBinaryDigest,
    objectFormat: "sha1",
  } as const;
}

function intentFor(
  repositoryRoot: string,
  before: Awaited<ReturnType<FixedGitMutationPort["observe"]>>,
  expected: Awaited<ReturnType<FixedGitMutationPort["observe"]>>,
  operation: OperatorGitIntent["operation"],
): OperatorGitIntent {
  const profile = executionProfile();
  return {
    kind: "git",
    authorisation: {
      projectId: "project_01",
      projectSessionId: "session_01",
      expectedSessionRevision: 1,
      expectedSessionGeneration: 1,
      coordinationRunId: "run_01",
      expectedRunRevision: 1,
      expectedDependencyRevision: 1,
      authorityRef: digest("4"),
      expectedAuthorityRevision: 1,
      expectedGitAllowlistEpoch: 1,
      gitAllowlistDigest: digest("5"),
      repositoryRoot,
      worktreePath: repositoryRoot,
      repositoryStateDigest: before.repositoryStateDigest,
      executionProfileId: profile.profileId,
      executionProfileRevision: profile.revision,
      executionProfileDigest: profile.digest,
      operationVariant: operation.variant,
      remoteBinding: null,
      resultRecipeDigest: digest("3"),
      operationId: `operation_${operation.variant}_01`,
      effectBindingDigest: digest("6"),
      decision: { kind: "preauthorised", grantId: "grant_01", expectedGrantRevision: 1, grantDigest: digest("7") },
    },
    repository: before,
    executionProfile: profile,
    operation,
    resultRecipe: {
      schemaVersion: 1,
      executionProfileDigest: profile.digest,
      resultRecipeDigest: digest("3"),
      beforeRepositoryStateDigest: before.repositoryStateDigest,
      expectedSuccessRepositoryStateDigest: expected.repositoryStateDigest,
      expectedConflict: null,
      refUpdates: [],
      configUpdates: [],
      commitMappings: [],
      affectedPaths: [],
      bounds: { maximumRefOrConfigUpdates: 64, maximumCommitMappings: 128, maximumConflictPaths: 4096 },
    },
  } as unknown as OperatorGitIntent;
}

describe("fixed typed Git mutation port", () => {
  it("stages only the reviewed path and proves the exact expected repository state", async () => {
    const actualRoot = repository("typed-git-actual");
    const stateRoot = realpathSync.native(mkdtempSync(join(tmpdir(), "typed-git-state-")));
    directories.push(stateRoot);
    mkdirSync(join(actualRoot, ".worktrees"));
    const port = new FixedGitMutationPort({ privateStateRoot: stateRoot });
    const before = await port.observe(actualRoot, actualRoot);
    run(actualRoot, ["add", "--", "tracked.txt"]);
    const expected = await port.observe(actualRoot, actualRoot);
    run(actualRoot, ["restore", "--staged", "--", "tracked.txt"]);
    expect((await port.observe(actualRoot, actualRoot)).repositoryStateDigest).toBe(before.repositoryStateDigest);
    const profile = executionProfile();
    const resultRecipeDigest = digest("3");
    const intent = {
      kind: "git",
      authorisation: {
        projectId: "project_01",
        projectSessionId: "session_01",
        expectedSessionRevision: 1,
        expectedSessionGeneration: 1,
        coordinationRunId: "run_01",
        expectedRunRevision: 1,
        expectedDependencyRevision: 1,
        authorityRef: digest("4"),
        expectedAuthorityRevision: 1,
        expectedGitAllowlistEpoch: 1,
        gitAllowlistDigest: digest("5"),
        repositoryRoot: actualRoot,
        worktreePath: actualRoot,
        repositoryStateDigest: before.repositoryStateDigest,
        executionProfileId: profile.profileId,
        executionProfileRevision: 1,
        executionProfileDigest: profile.digest,
        operationVariant: "stage",
        remoteBinding: null,
        resultRecipeDigest,
        operationId: "operation_stage_01",
        effectBindingDigest: digest("6"),
        decision: { kind: "preauthorised", grantId: "grant_01", expectedGrantRevision: 1, grantDigest: digest("7") },
      },
      repository: before,
      executionProfile: profile,
      operation: { variant: "stage", paths: ["tracked.txt"] },
      resultRecipe: {
        schemaVersion: 1,
        executionProfileDigest: profile.digest,
        resultRecipeDigest,
        beforeRepositoryStateDigest: before.repositoryStateDigest,
        expectedSuccessRepositoryStateDigest: expected.repositoryStateDigest,
        expectedConflict: null,
        refUpdates: [],
        configUpdates: [],
        commitMappings: [],
        affectedPaths: [{ path: "tracked.txt", beforeDigest: null, afterDigest: null }],
        bounds: { maximumRefOrConfigUpdates: 64, maximumCommitMappings: 128, maximumConflictPaths: 4096 },
      },
    } as unknown as OperatorGitIntent;

    const result = await port.dispatch(intent, { remoteTarget: null });

    expect(result.outcome).toBe("exact-applied");
    expect(result.repository.repositoryStateDigest).toBe(expected.repositoryStateDigest);
    expect(run(actualRoot, ["diff", "--cached", "--name-only"])).toBe("tracked.txt");
  });

  it("stages a tracked deletion from the exact reviewed missing-path state", async () => {
    const root = repository("typed-git-stage-deletion");
    const stateRoot = realpathSync.native(mkdtempSync(join(tmpdir(), "typed-git-stage-deletion-state-")));
    directories.push(stateRoot);
    rmSync(join(root, "tracked.txt"));
    const port = new FixedGitMutationPort({ privateStateRoot: stateRoot });
    const before = await port.observe(root, root);
    run(root, ["add", "--", "tracked.txt"]);
    const expected = await port.observe(root, root);
    run(root, ["restore", "--staged", "--", "tracked.txt"]);
    expect((await port.observe(root, root)).repositoryStateDigest).toBe(before.repositoryStateDigest);

    await expect(port.dispatch(
      intentFor(root, before, expected, { variant: "stage", paths: ["tracked.txt"] }),
      { remoteTarget: null },
    )).resolves.toMatchObject({ outcome: "exact-applied" });
    expect(run(root, ["diff", "--cached", "--name-status"])).toBe("D\ttracked.txt");
  });

  it("creates an exact empty native index when the reviewed repository has no index file", async () => {
    const root = repository("typed-git-stage-missing-index");
    const stateRoot = realpathSync.native(mkdtempSync(join(tmpdir(), "typed-git-stage-missing-index-state-")));
    directories.push(stateRoot);
    rmSync(join(root, ".git", "index"));
    writeFileSync(join(root, "first.txt"), "first\n");
    const port = new FixedGitMutationPort({ privateStateRoot: stateRoot });
    const before = await port.observe(root, root);
    run(root, ["add", "--", "first.txt"]);
    const expected = await port.observe(root, root);
    rmSync(join(root, ".git", "index"));
    expect((await port.observe(root, root)).repositoryStateDigest).toBe(before.repositoryStateDigest);

    await expect(port.dispatch(
      intentFor(root, before, expected, { variant: "stage", paths: ["first.txt"] }),
      { remoteTarget: null },
    )).resolves.toMatchObject({ outcome: "exact-applied" });
    expect(run(root, ["diff", "--cached", "--name-only"])).toBe("first.txt\ntracked.txt");
  });

  it("rejects project-selected executable configuration before mutation", async () => {
    const root = repository("typed-git-hostile");
    const stateRoot = realpathSync.native(mkdtempSync(join(tmpdir(), "typed-git-hostile-state-")));
    directories.push(stateRoot);
    run(root, ["config", "filter.hostile.clean", "/tmp/execute-me"]);
    const port = new FixedGitMutationPort({ privateStateRoot: stateRoot });
    const before = await port.observe(root, root);
    const intent = {
      kind: "git",
      repository: before,
      executionProfile: { profileId: "sealed", revision: 1, digest: digest("1"), gitBinaryDigest, objectFormat: "sha1" },
      authorisation: { effectBindingDigest: digest("3") },
      operation: { variant: "stage", paths: ["tracked.txt"] },
      resultRecipe: {
        beforeRepositoryStateDigest: before.repositoryStateDigest,
        expectedSuccessRepositoryStateDigest: digest("4"),
        expectedConflict: null,
      },
    } as unknown as OperatorGitIntent;

    await expect(port.dispatch(intent, { remoteTarget: null })).rejects.toThrow(/untrusted executable|configuration/iu);
    expect(run(root, ["diff", "--cached", "--name-only"])).toBe("");
  });

  it("rejects a commit whose reviewed source index or parent does not match the bound repository", async () => {
    const root = repository("typed-git-commit-cas");
    const stateRoot = realpathSync.native(mkdtempSync(join(tmpdir(), "typed-git-commit-cas-state-")));
    directories.push(stateRoot);
    const port = new FixedGitMutationPort({ privateStateRoot: stateRoot });
    run(root, ["add", "--", "tracked.txt"]);
    const before = await port.observe(root, root);
    const head = await readGitObjectDigest(root, "refs/heads/main");
    const operation = {
      variant: "commit",
      sourceIndexDigest: digest("9"),
      parentObjectDigest: head.digest,
      treeDigest: digest("8"),
      message: "reviewed message",
      author: { name: "Author", email: "author@example.invalid", timestamp: parseTimestamp("2026-01-02T00:00:00.000Z", "test.author") },
      committer: { name: "Committer", email: "committer@example.invalid", timestamp: parseTimestamp("2026-01-02T00:00:00.000Z", "test.committer") },
      resultingCommitDigest: digest("7"),
    } as const;
    const intent = intentFor(root, before, before, operation);

    await expect(port.dispatch(intent, { remoteTarget: null })).rejects.toMatchObject({ code: "STALE_REVISION" });
    expect((await readGitObjectDigest(root, "refs/heads/main")).digest).toBe(head.digest);
  });

  it("commits from the pinned index while the native index lock excludes a competing Git writer", async () => {
    const root = repository("typed-git-commit-native-fence");
    const stateRoot = realpathSync.native(mkdtempSync(join(tmpdir(), "typed-git-commit-native-fence-state-")));
    directories.push(stateRoot);
    run(root, ["add", "--", "tracked.txt"]);
    const before = await new FixedGitMutationPort({ privateStateRoot: stateRoot }).observe(root, root);
    const parent = await readGitObjectDigest(root, "refs/heads/main");
    const treeNative = run(root, ["write-tree"]);
    run(root, ["update-ref", "refs/fabric-test/tree", treeNative]);
    const tree = await readGitObjectDigest(root, "refs/fabric-test/tree");
    const identityEnvironment = {
      GIT_AUTHOR_NAME: "Author",
      GIT_AUTHOR_EMAIL: "author@example.invalid",
      GIT_AUTHOR_DATE: "2026-01-02T00:00:00.000Z",
      GIT_COMMITTER_NAME: "Committer",
      GIT_COMMITTER_EMAIL: "committer@example.invalid",
      GIT_COMMITTER_DATE: "2026-01-02T00:00:00.000Z",
    };
    const commitNative = execFileSync("/usr/bin/git", ["commit-tree", treeNative, "-p", parent.nativeObjectId], {
      cwd: root,
      encoding: "utf8",
      input: "reviewed commit\n",
      env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", ...identityEnvironment },
    }).trim();
    run(root, ["update-ref", "refs/fabric-test/commit", commitNative]);
    const commit = await readGitObjectDigest(root, "refs/fabric-test/commit");
    run(root, ["update-ref", "refs/heads/main", commitNative, parent.nativeObjectId]);
    const expected = await new FixedGitMutationPort({ privateStateRoot: stateRoot }).observe(root, root);
    run(root, ["update-ref", "refs/heads/main", parent.nativeObjectId, commitNative]);
    let competingWriterBlocked = false;
    const port = new FixedGitMutationPort({
      privateStateRoot: stateRoot,
      faultInjector: (point) => {
        if (point === "after-final-fence") {
          const result = spawnSync("/usr/bin/git", ["add", "--", "tracked.txt"], {
            cwd: root,
            encoding: "utf8",
            env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" },
          });
          competingWriterBlocked = result.status !== 0 && result.stderr.includes("index.lock");
        }
        return Promise.resolve();
      },
    });
    const intent = intentFor(root, before, expected, {
      variant: "commit",
      sourceIndexDigest: before.indexDigest,
      parentObjectDigest: parent.digest,
      treeDigest: tree.digest,
      message: "reviewed commit",
      author: { name: "Author", email: "author@example.invalid", timestamp: parseTimestamp("2026-01-02T00:00:00.000Z", "test.author") },
      committer: { name: "Committer", email: "committer@example.invalid", timestamp: parseTimestamp("2026-01-02T00:00:00.000Z", "test.committer") },
      resultingCommitDigest: commit.digest,
    });

    await expect(port.dispatch(intent, { remoteTarget: null })).resolves.toMatchObject({ outcome: "exact-applied" });
    expect(competingWriterBlocked).toBe(true);
    expect((await readGitObjectDigest(root, "refs/heads/main")).digest).toBe(commit.digest);
  });

  it("unstages through a private index and one native atomic install", async () => {
    const root = repository("typed-git-unstage-native-fence");
    const stateRoot = realpathSync.native(mkdtempSync(join(tmpdir(), "typed-git-unstage-native-fence-state-")));
    directories.push(stateRoot);
    const port = new FixedGitMutationPort({ privateStateRoot: stateRoot });
    run(root, ["add", "--", "tracked.txt"]);
    const before = await port.observe(root, root);
    run(root, ["restore", "--staged", "--", "tracked.txt"]);
    const expected = await port.observe(root, root);
    run(root, ["add", "--", "tracked.txt"]);
    const intent = intentFor(root, before, expected, { variant: "unstage", paths: ["tracked.txt"] });

    await expect(port.dispatch(intent, { remoteTarget: null })).resolves.toMatchObject({ outcome: "exact-applied" });
    expect(run(root, ["diff", "--cached", "--name-only"])).toBe("");
  });

  it("fails closed for merged deletion without a checked-out-worktree registry fence", async () => {
    const actualRoot = repository("typed-git-safe-delete-actual");
    const stateRoot = realpathSync.native(mkdtempSync(join(tmpdir(), "typed-git-safe-delete-state-")));
    directories.push(stateRoot);
    for (const root of [actualRoot]) {
      run(root, ["restore", "tracked.txt"]);
      run(root, ["switch", "-qc", "topic"]);
      writeFileSync(join(root, "topic.txt"), "topic\n");
      run(root, ["add", "topic.txt"]);
      run(
        root,
        ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "topic"],
        { GIT_AUTHOR_DATE: "2026-01-02T00:00:00Z", GIT_COMMITTER_DATE: "2026-01-02T00:00:00Z" },
      );
      run(root, ["branch", "base"]);
      run(root, ["switch", "main"]);
    }
    const port = new FixedGitMutationPort({ privateStateRoot: stateRoot });
    const before = await port.observe(actualRoot, actualRoot);
    const topic = await readGitObjectDigest(actualRoot, "refs/heads/topic");
    const base = await readGitObjectDigest(actualRoot, "refs/heads/base");
    run(actualRoot, ["update-ref", "-d", "refs/heads/topic", topic.nativeObjectId]);
    const expected = await port.observe(actualRoot, actualRoot);
    run(actualRoot, ["update-ref", "refs/heads/topic", topic.nativeObjectId, "0000000000000000000000000000000000000000"]);
    expect((await port.observe(actualRoot, actualRoot)).repositoryStateDigest).toBe(before.repositoryStateDigest);
    const intent = intentFor(actualRoot, before, expected, {
      variant: "branch-delete-merged-only",
      sourceRef: "refs/heads/topic",
      sourceObjectDigest: topic.digest,
      mergedIntoObjectDigest: base.digest,
    });

    await expect(port.dispatch(intent, { remoteTarget: null })).rejects.toMatchObject({ code: "CAPABILITY_UNAVAILABLE" });
    expect(run(actualRoot, ["show-ref", "--verify", "refs/heads/topic"])).toContain("refs/heads/topic");
  });

  it("fails closed for worktree move without a native registry fence", async () => {
    const root = repository("typed-git-worktree-cas");
    const stateRoot = realpathSync.native(mkdtempSync(join(tmpdir(), "typed-git-worktree-cas-state-")));
    directories.push(stateRoot);
    mkdirSync(join(root, ".worktrees"));
    const source = join(root, ".worktrees", "source");
    const destination = join(root, ".worktrees", "destination");
    run(root, ["worktree", "add", "--detach", source, "HEAD"]);
    const port = new FixedGitMutationPort({ privateStateRoot: stateRoot });
    const before = await port.observe(root, root);
    const intent = intentFor(root, before, before, {
      variant: "worktree-move",
      sourceWorktreePath: source,
      destinationWorktreePath: destination,
      expectedWorktreeStateDigest: digest("f"),
    });

    await expect(port.dispatch(intent, { remoteTarget: null })).rejects.toMatchObject({ code: "CAPABILITY_UNAVAILABLE" });
    expect(realpathSync(source)).toBe(source);
  });

  it("creates a detached no-checkout worktree from the exact reviewed object", async () => {
    const root = repository("typed-git-worktree-create-detached");
    const stateRoot = realpathSync.native(mkdtempSync(join(tmpdir(), "typed-git-worktree-create-detached-state-")));
    directories.push(stateRoot);
    mkdirSync(join(root, ".worktrees"));
    const destination = join(root, ".worktrees", "reviewer");
    const port = new FixedGitMutationPort({ privateStateRoot: stateRoot });
    const head = await readGitObjectDigest(root, "refs/heads/main");
    const before = await port.observe(root, root);
    run(root, ["worktree", "add", "--no-checkout", "--detach", destination, head.nativeObjectId]);
    chmodSync(destination, 0o700);
    const expected = await port.observe(root, root);
    run(root, ["worktree", "remove", "--force", destination]);
    expect((await port.observe(root, root)).repositoryStateDigest).toBe(before.repositoryStateDigest);

    await expect(port.dispatch(intentFor(root, before, expected, {
      variant: "worktree-create-detached",
      destinationWorktreePath: destination,
      sourceObjectDigest: head.digest,
    }), { remoteTarget: null })).resolves.toMatchObject({ outcome: "exact-applied" });
    expect(realpathSync(destination)).toBe(destination);
    expect(run(destination, ["status", "--porcelain"])).toContain("D  tracked.txt");
  });

  it("creates and checks out a reviewed new branch without materialising worktree files", async () => {
    const root = repository("typed-git-worktree-create-branch");
    const stateRoot = realpathSync.native(mkdtempSync(join(tmpdir(), "typed-git-worktree-create-branch-state-")));
    directories.push(stateRoot);
    mkdirSync(join(root, ".worktrees"));
    const destination = join(root, ".worktrees", "writer");
    const branchRef = "refs/heads/reviewed-writer";
    const port = new FixedGitMutationPort({ privateStateRoot: stateRoot });
    const head = await readGitObjectDigest(root, "refs/heads/main");
    const before = await port.observe(root, root);
    run(root, ["worktree", "add", "--no-checkout", "-b", "reviewed-writer", destination, head.nativeObjectId]);
    chmodSync(destination, 0o700);
    const expected = await port.observe(root, root);
    run(root, ["worktree", "remove", "--force", destination]);
    run(root, ["update-ref", "-d", branchRef, head.nativeObjectId]);
    expect((await port.observe(root, root)).repositoryStateDigest).toBe(before.repositoryStateDigest);

    await expect(port.dispatch(intentFor(root, before, expected, {
      variant: "worktree-create-new-branch",
      destinationWorktreePath: destination,
      sourceObjectDigest: head.digest,
      branchRef,
    }), { remoteTarget: null })).resolves.toMatchObject({ outcome: "exact-applied" });
    expect(run(destination, ["symbolic-ref", "HEAD"])).toBe(branchRef);
    expect(existsSync(join(destination, "tracked.txt"))).toBe(false);
  });

  it("binds an existing branch worktree only while its reviewed object still matches", async () => {
    const root = repository("typed-git-worktree-existing-branch");
    const stateRoot = realpathSync.native(mkdtempSync(join(tmpdir(), "typed-git-worktree-existing-branch-state-")));
    directories.push(stateRoot);
    mkdirSync(join(root, ".worktrees"));
    const destination = join(root, ".worktrees", "existing-writer");
    const branchRef = "refs/heads/existing-writer";
    run(root, ["branch", "existing-writer", "HEAD"]);
    const port = new FixedGitMutationPort({ privateStateRoot: stateRoot });
    const source = await readGitObjectDigest(root, branchRef);
    const before = await port.observe(root, root);
    run(root, ["worktree", "add", "--no-checkout", destination, "existing-writer"]);
    chmodSync(destination, 0o700);
    const expected = await port.observe(root, root);
    run(root, ["worktree", "remove", "--force", destination]);
    expect((await port.observe(root, root)).repositoryStateDigest).toBe(before.repositoryStateDigest);
    let competingRefWriterBlocked = false;
    const dispatchPort = new FixedGitMutationPort({
      privateStateRoot: stateRoot,
      faultInjector: (point) => {
        if (point === "after-final-fence") {
          const result = spawnSync("/usr/bin/git", ["update-ref", "-d", branchRef, source.nativeObjectId], {
            cwd: root,
            encoding: "utf8",
            env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" },
          });
          competingRefWriterBlocked = result.status !== 0 && result.stderr.includes("cannot lock ref");
        }
        return Promise.resolve();
      },
    });

    await expect(dispatchPort.dispatch(intentFor(root, before, expected, {
      variant: "worktree-create-existing-branch",
      destinationWorktreePath: destination,
      sourceObjectDigest: source.digest,
      branchRef,
    }), { remoteTarget: null })).resolves.toMatchObject({ outcome: "exact-applied" });
    expect(competingRefWriterBlocked).toBe(true);
    expect(run(destination, ["symbolic-ref", "HEAD"])).toBe(branchRef);
  });

  it("rejects a symlinked worktree parent before destination custody", async () => {
    const root = repository("typed-git-worktree-symlink");
    const outside = realpathSync.native(mkdtempSync(join(tmpdir(), "typed-git-worktree-outside-")));
    const stateRoot = realpathSync.native(mkdtempSync(join(tmpdir(), "typed-git-worktree-symlink-state-")));
    directories.push(outside, stateRoot);
    symlinkSync(outside, join(root, ".worktrees"));
    const destination = join(root, ".worktrees", "escape");
    const port = new FixedGitMutationPort({ privateStateRoot: stateRoot });
    const before = await port.observe(root, root);
    const head = await readGitObjectDigest(root, "refs/heads/main");
    const intent = intentFor(root, before, before, {
      variant: "worktree-create-detached",
      destinationWorktreePath: destination,
      sourceObjectDigest: head.digest,
    });

    await expect(port.dispatch(intent, { remoteTarget: null })).rejects.toMatchObject({ code: "CAPABILITY_FORBIDDEN" });
    expect(existsSync(join(outside, "escape"))).toBe(false);
  });

  it("rechecks the complete repository fence immediately before the first mutation", async () => {
    const root = repository("typed-git-final-fence");
    const stateRoot = realpathSync.native(mkdtempSync(join(tmpdir(), "typed-git-final-fence-state-")));
    directories.push(stateRoot);
    let injected = false;
    const port = new FixedGitMutationPort({
      privateStateRoot: stateRoot,
      faultInjector: (point) => {
        if (point === "before-first-mutation") {
          injected = true;
          writeFileSync(join(root, "tracked.txt"), "competing change\n");
        }
        return Promise.resolve();
      },
    });
    const before = await port.observe(root, root);
    const intent = intentFor(root, before, before, { variant: "stage", paths: ["tracked.txt"] });

    await expect(port.dispatch(intent, { remoteTarget: null })).rejects.toMatchObject({ code: "STALE_REVISION" });
    expect(injected).toBe(true);
    expect(run(root, ["diff", "--cached", "--name-only"])).toBe("");
  });

  it("stages pinned reviewed bytes even when the worktree changes after the final observation", async () => {
    const root = repository("typed-git-pinned-stage");
    const stateRoot = realpathSync.native(mkdtempSync(join(tmpdir(), "typed-git-pinned-stage-state-")));
    directories.push(stateRoot);
    let injected = false;
    const port = new FixedGitMutationPort({
      privateStateRoot: stateRoot,
      faultInjector: (point) => {
        if (point === "after-final-fence") {
          injected = true;
          writeFileSync(join(root, "tracked.txt"), "unreviewed replacement\n");
        }
        return Promise.resolve();
      },
    });
    const before = await port.observe(root, root);
    run(root, ["add", "--", "tracked.txt"]);
    const expected = await port.observe(root, root);
    run(root, ["restore", "--staged", "--", "tracked.txt"]);
    const intent = intentFor(root, before, expected, { variant: "stage", paths: ["tracked.txt"] });

    await expect(port.dispatch(intent, { remoteTarget: null })).resolves.toMatchObject({ outcome: "inconsistent" });
    expect(injected).toBe(true);
    expect(run(root, ["show", ":tracked.txt"])).toBe("after");
    expect(readFileSync(join(root, "tracked.txt"), "utf8")).toBe("unreviewed replacement\n");
  });

  it("fails closed for a variant without a native deterministic fence", async () => {
    const root = repository("typed-git-unavailable-merge");
    const stateRoot = realpathSync.native(mkdtempSync(join(tmpdir(), "typed-git-unavailable-merge-state-")));
    directories.push(stateRoot);
    const port = new FixedGitMutationPort({ privateStateRoot: stateRoot });
    const before = await port.observe(root, root);
    const head = await readGitObjectDigest(root, "refs/heads/main");
    const intent = intentFor(root, before, before, {
      variant: "merge-commit-start",
      sourceRef: "refs/heads/main",
      destinationRef: "refs/heads/main",
      sourceObjectDigest: head.digest,
      destinationObjectDigest: head.digest,
      backendId: "merge-ort-v1",
      orderedParentDigests: [head.digest, head.digest],
      outputTreeDigest: digest("a"),
      message: "merge",
      author: { name: "Author", email: "author@example.invalid", timestamp: parseTimestamp("2026-01-02T00:00:00.000Z", "test.author") },
      committer: { name: "Committer", email: "committer@example.invalid", timestamp: parseTimestamp("2026-01-02T00:00:00.000Z", "test.committer") },
      resultingCommitDigest: digest("b"),
    } as OperatorGitIntent["operation"]);

    await expect(port.dispatch(intent, { remoteTarget: null })).rejects.toMatchObject({ code: "CAPABILITY_UNAVAILABLE" });
    expect((await readGitObjectDigest(root, "refs/heads/main")).digest).toBe(head.digest);
  });
});
