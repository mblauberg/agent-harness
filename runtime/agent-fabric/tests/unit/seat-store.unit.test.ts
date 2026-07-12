import { mkdir, mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { installSeatGeneration, projectKey, resolveSeatPaths } from "../../src/cli/seat-store.ts";

const CAPABILITY_A = `afc_${"a".repeat(43)}`;
const CAPABILITY_B = `afc_${"b".repeat(43)}`;

describe("MCP seat generation store", () => {
  it("keeps the prior complete generation active when renewal fails before cutover", async () => {
    const root = await mkdtemp(join(tmpdir(), "fabric-seat-generation-"));
    try {
      const stateDirectory = join(root, "state");
      const requestedProjectPath = join(root, "project");
      await mkdir(stateDirectory, { mode: 0o700 });
      await mkdir(requestedProjectPath);
      const projectPath = await realpath(requestedProjectPath);
      const key = projectKey(projectPath);
      const metadata = {
        schemaVersion: 1 as const,
        projectKey: key,
        projectPath,
        projectSessionId: "session-one",
        sessionRevision: 1,
        sessionGeneration: 1,
        runRevision: 1,
        chairAgentId: "codex",
        chairGeneration: 1,
        chairLeaseId: "chair:run-one:1",
        seat: "codex" as const,
        agentId: "codex",
        principalGeneration: 1,
        role: "chair" as const,
        expiresAt: "2099-01-01T00:00:00.000Z",
      };
      await installSeatGeneration({
        stateDirectory,
        projectPath,
        generation: "generation-one",
        seats: [{ metadata: { ...metadata, runId: "run-one" }, credential: CAPABILITY_A }],
      });
      const before = await resolveSeatPaths({ stateDirectory, project: projectPath, seat: "codex" });

      await expect(installSeatGeneration({
        stateDirectory,
        projectPath,
        generation: "generation-two",
        seats: [{ metadata: { ...metadata, runId: "run-two" }, credential: CAPABILITY_B }],
        beforeActivate: () => {
          throw new Error("injected cutover failure");
        },
      })).rejects.toThrow(/injected cutover failure/u);

      const after = await resolveSeatPaths({ stateDirectory, project: projectPath, seat: "codex" });
      expect(after).toEqual(before);
      await expect(readFile(after.credentialPath, "utf8")).resolves.toBe(CAPABILITY_A);
      await expect(readFile(after.metadataPath, "utf8").then(JSON.parse)).resolves.toMatchObject({ runId: "run-one" });

      await expect(installSeatGeneration({
        stateDirectory,
        projectPath,
        generation: "generation-one",
        seats: [{ metadata: { ...metadata, runId: "run-one" }, credential: CAPABILITY_B }],
      })).rejects.toThrow(/differs from requested immutable generation/u);
      await expect(readFile(after.credentialPath, "utf8")).resolves.toBe(CAPABILITY_A);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
