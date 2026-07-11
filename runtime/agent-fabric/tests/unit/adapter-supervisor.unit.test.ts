import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { AdapterSupervisor } from "../../src/adapters/supervisor.ts";

const fixturePath = fileURLToPath(new URL("../support/supervisor-fixture.ts", import.meta.url));

describe("persistent adapter supervision", () => {
  it("reuses one healthy adapter process across requests", async () => {
    const directory = await mkdtemp(join(tmpdir(), "agent-fabric-supervisor-"));
    const countPath = join(directory, "starts.txt");
    const supervisor = new AdapterSupervisor({ fake: { command: [process.execPath, "--import", "tsx", fixturePath], environment: { SUPERVISOR_COUNT_PATH: countPath } } });
    try {
      const first = await supervisor.request("fake", "one", {});
      const second = await supervisor.request("fake", "two", {});
      expect(second).toMatchObject({ method: "two", pid: (first as { pid: number }).pid });
      expect(await readFile(countPath, "utf8")).toBe("1");
    } finally {
      await supervisor.close();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("uses a provider-turn timeout distinct from the short control timeout", async () => {
    const directory = await mkdtemp(join(tmpdir(), "agent-fabric-supervisor-timeout-"));
    const countPath = join(directory, "starts.txt");
    const supervisor = new AdapterSupervisor(
      {
        fake: {
          command: [process.execPath, "--import", "tsx", fixturePath],
          environment: { SUPERVISOR_COUNT_PATH: countPath, SUPERVISOR_DELAY_MS: "20" },
        },
      },
      { controlTimeoutMs: 5, providerTurnTimeoutMs: 300 },
    );
    try {
      await expect(
        supervisor.request("fake", "dispatch", { operation: "send_turn" }),
      ).resolves.toMatchObject({ method: "dispatch" });
    } finally {
      await supervisor.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
});
