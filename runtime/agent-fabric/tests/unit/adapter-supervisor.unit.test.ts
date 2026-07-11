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

  it("launches a chair through a typed private environment without serialising the handoff", async () => {
    const directory = await mkdtemp(join(tmpdir(), "agent-fabric-supervisor-chair-launch-"));
    const countPath = join(directory, "starts.txt");
    const observationPath = join(directory, "launch-observation.json");
    const supervisor = new AdapterSupervisor({
      fake: {
        command: [process.execPath, "--import", "tsx", fixturePath],
        environment: {
          SUPERVISOR_COUNT_PATH: countPath,
          SUPERVISOR_OBSERVATION_PATH: observationPath,
        },
      },
    });
    const request = {
      schemaVersion: 1 as const,
      actionId: "chair-launch-1",
      providerContractDigest: `sha256:${"b".repeat(64)}`,
      payload: { cwd: "/workspace/project", modelFamily: "fixture", model: "provider-test" },
    };
    const privateHandoff = {
      capability: "chair-capability-secret-canary",
      socketPath: "/private/agent-fabric.sock",
    };
    try {
      const launchChair: unknown = Reflect.get(supervisor, "launchChair");
      expect(launchChair).toBeTypeOf("function");
      await expect(
        Reflect.apply(launchChair as (...arguments_: unknown[]) => unknown, supervisor, [
          "fake",
          request,
          privateHandoff,
        ]),
      ).resolves.toEqual({
        resumeReference: "fixture-chair-session",
        providerSessionGeneration: 1,
        fabricContinuity: {
          schemaVersion: 1,
          kind: "authenticated-fabric-continuity",
          providerContractDigest: request.providerContractDigest,
          providerSessionRef: "fixture-chair-session",
          providerSessionGeneration: 1,
          authenticated: true,
        },
      });
      expect(JSON.parse(await readFile(observationPath, "utf8"))).toEqual({
        privateCapabilityPresent: true,
        privateSocketPresent: true,
        requestContainsPrivate: false,
      });
      await expect(supervisor.launchChair("fake", request, { ...privateHandoff })).rejects.toMatchObject({
        code: "PRIVATE_HANDOFF_UNAVAILABLE",
      });
      expect(await readFile(countPath, "utf8")).toBe("1");
    } finally {
      await supervisor.close();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("refuses an invalid private socket before starting a dedicated adapter", async () => {
    const directory = await mkdtemp(join(tmpdir(), "agent-fabric-supervisor-chair-invalid-"));
    const countPath = join(directory, "starts.txt");
    const supervisor = new AdapterSupervisor({
      fake: {
        command: [process.execPath, "--import", "tsx", fixturePath],
        environment: { SUPERVISOR_COUNT_PATH: countPath },
      },
    });
    try {
      await expect(supervisor.launchChair("fake", {
        schemaVersion: 1,
        actionId: "chair-launch-invalid",
        providerContractDigest: `sha256:${"d".repeat(64)}`,
        payload: { cwd: "/workspace/project", modelFamily: "fixture", model: "provider-test" },
      }, {
        capability: "invalid-socket-capability-canary",
        socketPath: "relative/fabric.sock",
      })).rejects.toMatchObject({ code: "PRIVATE_HANDOFF_UNAVAILABLE" });
      await expect(readFile(countPath, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await supervisor.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
});
