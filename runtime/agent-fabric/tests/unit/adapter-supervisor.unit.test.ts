import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { AdapterSupervisor } from "../../src/adapters/supervisor.ts";

const fixturePath = fileURLToPath(new URL("../support/supervisor-fixture.ts", import.meta.url));
const ATTESTATION_CHALLENGE = "cd".repeat(32);

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
      attestationChallenge: ATTESTATION_CHALLENGE,
    };
    try {
      const launchChair: unknown = Reflect.get(supervisor, "launchChair");
      expect(launchChair).toBeTypeOf("function");
      const launched = await Reflect.apply(launchChair as (...arguments_: unknown[]) => unknown, supervisor, [
          "fake",
          request,
          privateHandoff,
        ]);
      expect(launched).toMatchObject({
        resumeReference: "fixture-chair-session",
        providerSessionGeneration: 1,
        fabricContinuity: {
          schemaVersion: 1,
          kind: "provider-session-fabric-attestation",
          method: "provider-session-random-challenge-v1",
          bridgeContract: "agent-fabric-session-bridge-v1",
          providerAdapterId: "fake",
          providerActionId: request.actionId,
          providerContractDigest: request.providerContractDigest,
          providerSessionRef: "fixture-chair-session",
          providerSessionGeneration: 1,
          providerTurnRef: "fixture-provider-turn",
          providerInvocationRef: "fixture-provider-tool-call",
          challengeResponse: ATTESTATION_CHALLENGE,
          challengeDigest: expect.stringMatching(/^sha256:/u),
          attestationDigest: expect.stringMatching(/^sha256:/u),
        },
      });
      expect(JSON.parse(await readFile(observationPath, "utf8"))).toEqual({
        privateCapabilityPresent: true,
        privateSocketPresent: true,
        privateChallengePresent: true,
        requestContainsPrivate: false,
      });
      await expect(supervisor.launchChair("fake", request, { ...privateHandoff })).rejects.toMatchObject({
        code: "PRIVATE_HANDOFF_UNAVAILABLE",
      });
      await expect(supervisor.request("fake", "dispatch", {
        actionId: "later-turn-1",
        operation: "send_turn",
        payload: { resumeReference: "fixture-chair-session", prompt: "continue" },
      })).resolves.toMatchObject({ method: "dispatch" });
      await expect(supervisor.request("fake", "dispatch", {
        actionId: "recoverable-provider-error",
        operation: "send_turn",
        payload: { resumeReference: "fixture-chair-session", prompt: "provider rejects this turn" },
      })).rejects.toMatchObject({ name: "PROVIDER_TURN_FAILED" });
      await expect(supervisor.request("fake", "dispatch", {
        actionId: "later-turn-after-error",
        operation: "send_turn",
        payload: { resumeReference: "fixture-chair-session", prompt: "bridge remains" },
      })).resolves.toMatchObject({ method: "dispatch" });
      await expect(supervisor.request("fake", "dispatch", {
        actionId: "release-chair-1",
        operation: "release",
        payload: { resumeReference: "fixture-chair-session" },
      })).resolves.toMatchObject({ method: "dispatch" });
      await expect(supervisor.request("fake", "dispatch", {
        actionId: "later-turn-after-release",
        operation: "send_turn",
        payload: { resumeReference: "fixture-chair-session", prompt: "must not reconstruct" },
      })).rejects.toMatchObject({ code: "CHAIR_BRIDGE_LOST" });
      expect(await readFile(countPath, "utf8")).toBe("1");
    } finally {
      await supervisor.close();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("refuses terminal success when the dedicated chair adapter tears down immediately", async () => {
    const directory = await mkdtemp(join(tmpdir(), "agent-fabric-supervisor-chair-teardown-"));
    const countPath = join(directory, "starts.txt");
    const supervisor = new AdapterSupervisor({
      fake: {
        command: [process.execPath, "--import", "tsx", fixturePath],
        environment: { SUPERVISOR_COUNT_PATH: countPath, SUPERVISOR_EXIT_AFTER_LAUNCH: "1" },
      },
    });
    try {
      await expect(supervisor.launchChair("fake", {
        schemaVersion: 1,
        actionId: "chair-launch-immediate-teardown",
        providerContractDigest: `sha256:${"e".repeat(64)}`,
        payload: { cwd: "/workspace/project", modelFamily: "fixture", model: "provider-test" },
      }, {
        capability: "teardown-capability-canary",
        socketPath: "/private/teardown.sock",
        attestationChallenge: ATTESTATION_CHALLENGE,
      })).rejects.toMatchObject({ code: "CHAIR_LAUNCH_FAILED" });
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
        attestationChallenge: ATTESTATION_CHALLENGE,
      })).rejects.toMatchObject({ code: "PRIVATE_HANDOFF_UNAVAILABLE" });
      await expect(supervisor.launchChair("fake", {
        schemaVersion: 1,
        actionId: "chair-launch-invalid-challenge",
        providerContractDigest: `sha256:${"d".repeat(64)}`,
        payload: { cwd: "/workspace/project", modelFamily: "fixture", model: "provider-test" },
      }, {
        capability: "invalid-challenge-capability-canary",
        socketPath: "/private/fabric.sock",
        attestationChallenge: "not-a-32-byte-challenge",
      })).rejects.toMatchObject({ code: "PRIVATE_HANDOFF_UNAVAILABLE" });
      await expect(readFile(countPath, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await supervisor.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
});
