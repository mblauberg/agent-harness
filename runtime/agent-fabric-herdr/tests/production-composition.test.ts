import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer, type Server } from "node:net";

import { describe, expect, it } from "vitest";

import type {
  FabricActionJournalPort,
  FabricDirectSteerPort,
} from "../src/contracts.js";
import { createProductionHerdrIntegration } from "../src/production.js";

describe("production Herdr composition", () => {
  it("pins the real process and fixed commands before composing Fabric validation with native ports", async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), "fabric-herdr-production-")));
    let server: Server | null = null;
    try {
      const stateDirectory = join(root, "state");
      const projectRoot = join(root, "project");
      await mkdir(stateDirectory, { mode: 0o700 });
      await mkdir(projectRoot, { mode: 0o700 });
      const executable = join(root, "herdr-fixture");
      const consoleExecutable = join(root, "console-fixture");
      const observerExecutable = join(root, "observer-fixture");
      const observerSocketPath = join(root, "fabric.sock");
      const observerCapabilityFile = join(root, "observer.cap");
      const observerCursorDirectory = join(root, "observer-cursors");
      const body = "#!/bin/sh\n" +
        "if [ \"$1\" = \"--version\" ]; then printf '%s\\n' 'herdr 0.7.3'; exit 0; fi\n" +
        "if [ \"$1 $2\" = \"api snapshot\" ]; then printf '%s' '{\"id\":\"fixture\",\"result\":{\"type\":\"session_snapshot\",\"snapshot\":{\"version\":\"0.7.3\",\"protocol\":16,\"agents\":[],\"panes\":[]}}}'; exit 0; fi\n" +
        "exit 9\n";
      const consoleBody = "#!/bin/sh\nexit 0\n";
      await writeFile(executable, body, { encoding: "utf8", mode: 0o700 });
      await writeFile(consoleExecutable, consoleBody, { encoding: "utf8", mode: 0o700 });
      await writeFile(observerExecutable, consoleBody, { encoding: "utf8", mode: 0o700 });
      await writeFile(observerCapabilityFile, "afc_fixture_only", { encoding: "utf8", mode: 0o600 });
      await mkdir(observerCursorDirectory, { mode: 0o700 });
      await chmod(executable, 0o700);
      await chmod(consoleExecutable, 0o700);
      await chmod(observerExecutable, 0o700);
      await chmod(observerCapabilityFile, 0o600);
      server = createServer();
      await new Promise<void>((resolveListen, rejectListen) => {
        server?.once("error", rejectListen);
        server?.listen(observerSocketPath, resolveListen);
      });

      await expect(createProductionHerdrIntegration({
        executable,
        executableDigest: `sha256:${"0".repeat(64)}`,
        expectedVersion: "0.7.3",
        expectedProtocol: 16,
        stateDirectory,
        projectId: "project-01",
        projectSessionId: "session-01",
        canonicalProjectRoot: projectRoot,
        consoleExecutable,
        consoleExecutableDigest: digest(consoleBody),
        observerExecutable,
        observerExecutableDigest: digest(consoleBody),
        observerSocketPath,
        observerCapabilityFile,
        observerCursorDirectory,
        fabricJournal: unusedFabricJournal(),
        fabricDirectSteer: unusedDirectSteer(),
      })).rejects.toThrow("digest changed");

      const integration = await createProductionHerdrIntegration({
        executable,
        executableDigest: digest(body),
        expectedVersion: "0.7.3",
        expectedProtocol: 16,
        stateDirectory,
        projectId: "project-01",
        projectSessionId: "session-01",
        canonicalProjectRoot: projectRoot,
        consoleExecutable,
        consoleExecutableDigest: digest(consoleBody),
        observerExecutable,
        observerExecutableDigest: digest(consoleBody),
        observerSocketPath,
        observerCapabilityFile,
        observerCursorDirectory,
        fabricJournal: unusedFabricJournal(),
        fabricDirectSteer: unusedDirectSteer(),
      });

      expect(integration).toMatchObject({
        boundary: expect.any(Object),
        adapter: expect.any(Object),
        directSteer: expect.any(Object),
      });
      await expect(integration.boundary.observeAgent("unknown-agent" as never)).resolves.toMatchObject({
        state: "unavailable",
        reason: "agent has no Fabric-bound Herdr presence registration",
      });
    } finally {
      if (server !== null) await new Promise<void>((resolveClose) => server?.close(() => resolveClose()));
      await rm(root, { recursive: true, force: true });
    }
  });
});

function digest(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function unusedFabricJournal(): FabricActionJournalPort {
  return {
    readAction: async () => null,
    markDispatched: async () => { throw new Error("unused"); },
    completeAction: async () => { throw new Error("unused"); },
    markAmbiguous: async () => { throw new Error("unused"); },
  };
}

function unusedDirectSteer(): FabricDirectSteerPort {
  return {
    validateSteerReference: async () => ({ status: "rejected", code: "unknown-reference", reason: "unused" }),
    prepareDirectSteerAction: async () => { throw new Error("unused"); },
  };
}
