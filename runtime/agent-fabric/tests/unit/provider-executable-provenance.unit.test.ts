import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { verifyProviderExecutableDigest } from "../../src/adapters/compatibility.ts";
import { InstalledClaudeAgentSdkBoundary } from "../../src/adapters/providers/claude-agent-sdk.ts";
import { openVerifiedCodexJsonRpcConnection } from "../../src/adapters/providers/codex-json-rpc.ts";

const temporaryDirectories: string[] = [];

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(async (directory) => {
    await rm(directory, { recursive: true, force: true });
  }));
});

describe("primary provider executable provenance", () => {
  it("accepts exact bytes and fails closed when the verified executable changes or disappears", async () => {
    const directory = await mkdtemp(join(tmpdir(), "provider-executable-provenance-"));
    temporaryDirectories.push(directory);
    const executable = join(directory, "provider");
    const original = "verified provider bytes\n";
    await writeFile(executable, original, { mode: 0o700 });

    await expect(verifyProviderExecutableDigest(executable, sha256(original))).resolves.toBeUndefined();
    await writeFile(executable, "changed provider bytes\n", { mode: 0o700 });
    await expect(verifyProviderExecutableDigest(executable, sha256(original))).rejects.toMatchObject({
      code: "ADAPTER_HASH_MISMATCH",
    });
    await rm(executable);
    await expect(verifyProviderExecutableDigest(executable, sha256(original))).rejects.toMatchObject({
      code: "ADAPTER_ARTIFACT_MISSING",
    });
  });

  it.each(["changed", "missing"] as const)(
    "does not call the Claude SDK query when executable bytes are %s after composition",
    async (state) => {
    const directory = await mkdtemp(join(tmpdir(), "claude-executable-provenance-"));
    temporaryDirectories.push(directory);
    const executable = join(directory, "claude");
    const original = "verified claude bytes\n";
    await writeFile(executable, original, { mode: 0o700 });
    const query = vi.fn();
    const boundary = new InstalledClaudeAgentSdkBoundary({
      executable,
      executableSha256: sha256(original),
      query: query as never,
    });

    if (state === "changed") await writeFile(executable, "changed claude bytes\n", { mode: 0o700 });
    else await rm(executable);
    await expect(boundary.spawn({ prompt: "must not run" })).rejects.toMatchObject({
      code: state === "changed" ? "ADAPTER_HASH_MISMATCH" : "ADAPTER_ARTIFACT_MISSING",
    });
    expect(query).not.toHaveBeenCalled();
    },
  );

  it.each(["changed", "missing"] as const)(
    "does not spawn Codex when executable bytes are %s after composition",
    async (state) => {
    const directory = await mkdtemp(join(tmpdir(), "codex-executable-provenance-"));
    temporaryDirectories.push(directory);
    const marker = join(directory, "spawned");
    const executable = join(directory, "codex");
    const original = `#!/bin/sh\nprintf spawned > ${JSON.stringify(marker)}\n`;
    await writeFile(executable, original, { mode: 0o700 });
    if (state === "changed") await writeFile(executable, `${original}# changed\n`, { mode: 0o700 });
    else await rm(executable);

    await expect(openVerifiedCodexJsonRpcConnection(
      [executable, "app-server"],
      sha256(original),
    )).rejects.toMatchObject({
      code: state === "changed" ? "ADAPTER_HASH_MISMATCH" : "ADAPTER_ARTIFACT_MISSING",
    });
    await expect(stat(marker)).rejects.toMatchObject({ code: "ENOENT" });
    if (state === "changed") expect(await readFile(executable, "utf8")).toContain("# changed");
    },
  );
});
