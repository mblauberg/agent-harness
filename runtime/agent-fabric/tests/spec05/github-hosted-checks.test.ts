import { createHash } from "node:crypto";
import { chmod, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import type { Sha256Digest, Timestamp } from "@local/agent-fabric-protocol";

import {
  GitHubCliHostedChecksAdapter,
  createOptionalGitHubHostedChecksAdapter,
  type GitHubHostedChecksProcessRequest,
} from "../../src/operator/github-hosted-checks.ts";
import type { GitHostedChecksBinding } from "../../src/operator/git-repository-read.ts";

const headObjectDigest = `sha256:${"a".repeat(64)}` as Sha256Digest;
const binding: GitHostedChecksBinding = {
  canonicalRepositoryRoot: "/trusted/project",
  canonicalWorktreePath: "/trusted/project",
  repositoryStateDigest: `sha256:${"b".repeat(64)}` as Sha256Digest,
  headObjectDigest,
  nativeHeadObjectId: "1".repeat(40),
  snapshotRevision: 17,
  observedAt: "2027-01-01T00:00:00Z" as Timestamp,
};

describe("optional GitHub hosted checks", () => {
  it("reads one exact repository and native HEAD through the fixed bounded gh request", async () => {
    const requests: GitHubHostedChecksProcessRequest[] = [];
    const adapter = new GitHubCliHostedChecksAdapter({
      executable: "/opt/homebrew/bin/gh",
      executableDigest: `sha256:${"c".repeat(64)}`,
      hostname: "github.com",
      repository: "example/project",
      canonicalRepositoryRoot: binding.canonicalRepositoryRoot,
      clock: () => Date.parse("2027-01-01T00:00:01Z"),
      process: {
        run: async (request) => {
          requests.push(request);
          return Buffer.from(JSON.stringify({
            total_count: 3,
            check_runs: [
              { id: 51, head_sha: binding.nativeHeadObjectId, status: "completed", conclusion: "success" },
              { id: 52, head_sha: binding.nativeHeadObjectId, status: "completed", conclusion: "neutral" },
              { id: 53, head_sha: binding.nativeHeadObjectId, status: "waiting", conclusion: null },
            ],
          }));
        },
      },
    });

    await expect(adapter.read(binding)).resolves.toEqual({
      freshness: "live",
      source: "github",
      revision: 53,
      observedAt: "2027-01-01T00:00:01.000Z",
      value: {
        repository: "example/project",
        headObjectDigest,
        state: "pending",
        total: 3,
        passing: 2,
        failing: 0,
        pending: 1,
      },
    });
    expect(requests).toEqual([{
      executable: "/opt/homebrew/bin/gh",
      arguments: [
        "api",
        "--hostname", "github.com",
        "--method", "GET",
        "-H", "Accept: application/vnd.github+json",
        "-H", "X-GitHub-Api-Version: 2026-03-10",
        "repos/example/project/commits/1111111111111111111111111111111111111111/check-runs?per_page=100",
        "--jq", "{total_count: .total_count, check_runs: [.check_runs[] | {id, head_sha, status, conclusion}]}",
      ],
      timeoutMs: 10_000,
      maximumOutputBytes: 262_144,
    }]);
  });

  it("degrades an outage to exact-head stale cache or unavailable without blocking local Git", async () => {
    let available = true;
    const adapter = new GitHubCliHostedChecksAdapter({
      executable: "/opt/homebrew/bin/gh",
      executableDigest: `sha256:${"c".repeat(64)}`,
      hostname: "github.com",
      repository: "example/project",
      canonicalRepositoryRoot: binding.canonicalRepositoryRoot,
      clock: () => Date.parse("2027-01-01T00:00:01Z"),
      process: {
        run: async () => {
          if (!available) throw new Error("token=secret-provider-output");
          return Buffer.from(JSON.stringify({
            total_count: 1,
            check_runs: [{
              id: 61,
              head_sha: binding.nativeHeadObjectId,
              status: "completed",
              conclusion: "success",
            }],
          }));
        },
      },
    });
    const first = await adapter.read(binding);
    available = false;

    const stale = await adapter.read(binding);
    const unavailable = await adapter.read({
      ...binding,
      headObjectDigest: `sha256:${"d".repeat(64)}` as Sha256Digest,
      nativeHeadObjectId: "2".repeat(40),
    });

    expect(first.freshness).toBe("live");
    expect(stale).toMatchObject({ freshness: "stale", source: "github", revision: 61 });
    expect(unavailable).toMatchObject({
      freshness: "unavailable",
      source: "github",
      reason: "GitHub hosted checks are unavailable",
    });
    expect(JSON.stringify([stale, unavailable])).not.toContain("secret-provider-output");
  });

  it("rejects repository retargeting before gh process I/O", async () => {
    let calls = 0;
    const adapter = new GitHubCliHostedChecksAdapter({
      executable: "/opt/homebrew/bin/gh",
      executableDigest: `sha256:${"c".repeat(64)}`,
      hostname: "github.com",
      repository: "example/project",
      canonicalRepositoryRoot: binding.canonicalRepositoryRoot,
      process: {
        run: async () => {
          calls += 1;
          throw new Error("must not execute");
        },
      },
    });

    await expect(adapter.read({
      ...binding,
      canonicalRepositoryRoot: "/trusted/another-project",
      canonicalWorktreePath: "/trusted/another-project",
    })).resolves.toMatchObject({
      freshness: "unavailable",
      reason: "GitHub hosted checks target binding does not match the trusted repository",
    });
    await expect(adapter.read({
      ...binding,
      nativeHeadObjectId: "refs/heads/main",
    })).resolves.toMatchObject({
      freshness: "unavailable",
      reason: "GitHub hosted checks target binding is invalid",
    });
    expect(calls).toBe(0);
  });

  it("is disabled by default and can be enabled through a digest-pinned sealed process", async () => {
    await expect(createOptionalGitHubHostedChecksAdapter({ enabled: false })).resolves.toBeUndefined();
    const directory = await realpath(await mkdtemp(join(tmpdir(), "fabric-github-checks-")));
    try {
      const executable = join(directory, "gh-fixture");
      const body = `#!/bin/sh\nprintf '%s' '{"total_count":1,"check_runs":[{"id":71,"head_sha":"${binding.nativeHeadObjectId}","status":"completed","conclusion":"success"}]}'\n`;
      await writeFile(executable, body, { encoding: "utf8", mode: 0o700 });
      await chmod(executable, 0o700);
      const executableDigest = `sha256:${createHash("sha256").update(body).digest("hex")}`;
      const productionBinding = {
        ...binding,
        canonicalRepositoryRoot: directory,
        canonicalWorktreePath: directory,
      };

      const adapter = await createOptionalGitHubHostedChecksAdapter({
        enabled: true,
        executable,
        executableDigest,
        hostname: "github.com",
        repository: "example/project",
        canonicalRepositoryRoot: directory,
      });

      await expect(adapter?.read(productionBinding)).resolves.toMatchObject({
        freshness: "live",
        source: "github",
        revision: 71,
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it.each([
    ["malformed", Buffer.from('{"total_count":1,"check_runs":[{"id":1,"head_sha":"wrong","status":"completed","conclusion":"success"}]}')],
    ["oversize", Buffer.alloc(262_145, 0x78)],
  ] as const)("labels %s hosted output unavailable without leaking it", async (_case, output) => {
    const adapter = new GitHubCliHostedChecksAdapter({
      executable: "/opt/homebrew/bin/gh",
      executableDigest: `sha256:${"c".repeat(64)}`,
      hostname: "github.com",
      repository: "example/project",
      canonicalRepositoryRoot: binding.canonicalRepositoryRoot,
      process: { run: async () => output },
    });

    const result = await adapter.read(binding);

    expect(result).toMatchObject({
      freshness: "unavailable",
      source: "github",
      reason: "GitHub hosted checks are unavailable",
    });
    expect(JSON.stringify(result)).not.toContain("wrong");
  });

  it("labels authentication failure unavailable without persisting or projecting credentials", async () => {
    const canary = "ghp_secret_canary";
    const adapter = new GitHubCliHostedChecksAdapter({
      executable: "/opt/homebrew/bin/gh",
      executableDigest: `sha256:${"c".repeat(64)}`,
      hostname: "github.com",
      repository: "example/project",
      canonicalRepositoryRoot: binding.canonicalRepositoryRoot,
      process: { run: async () => { throw new Error(`authentication failed ${canary}`); } },
    });

    const result = await adapter.read(binding);

    expect(result.freshness).toBe("unavailable");
    expect(JSON.stringify(result)).not.toContain(canary);
  });

  it("contains real gh authentication stderr at the sealed process boundary", async () => {
    const directory = await realpath(await mkdtemp(join(tmpdir(), "fabric-github-auth-")));
    try {
      const executable = join(directory, "gh-fixture");
      const canary = "ghp_process_secret_canary";
      const body = `#!/bin/sh\nprintf '%s\\n' '${canary}' >&2\nexit 4\n`;
      await writeFile(executable, body, { encoding: "utf8", mode: 0o700 });
      await chmod(executable, 0o700);
      const adapter = await createOptionalGitHubHostedChecksAdapter({
        enabled: true,
        executable,
        executableDigest: `sha256:${createHash("sha256").update(body).digest("hex")}`,
        hostname: "github.com",
        repository: "example/project",
        canonicalRepositoryRoot: directory,
      });

      const result = await adapter?.read({
        ...binding,
        canonicalRepositoryRoot: directory,
        canonicalWorktreePath: directory,
      });

      expect(result).toMatchObject({
        freshness: "unavailable",
        reason: "GitHub hosted checks are unavailable",
      });
      expect(JSON.stringify(result)).not.toContain(canary);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
