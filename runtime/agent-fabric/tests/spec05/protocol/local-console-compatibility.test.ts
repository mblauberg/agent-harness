import { createHash } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { readFile } from "node:fs/promises";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer, type Server } from "node:net";

import {
  FABRIC_OPERATIONS,
  NATIVE_NOTIFICATION_PROJECTION_FEATURE,
  PROTOCOL_FEATURES,
  parseIdentifier,
  type OperatorCapabilityCredential,
} from "@local/agent-fabric-protocol";
import { afterEach, describe, expect, it } from "vitest";

import {
  STRICT_V1_OPTIONAL_FEATURES,
  connectLocalOperatorConsoleClient,
} from "../../../src/operator/local-console-session.ts";
import { servePublicProtocolConnection } from "../../../src/daemon/public-protocol.ts";

type FixtureEvent = Readonly<Record<string, unknown>> & { type: string };
type RunningFixture = {
  child: ChildProcess;
  events: FixtureEvent[];
  socketPath: string;
  root: string;
};

const running: RunningFixture[] = [];
const socketServers: Server[] = [];

afterEach(async () => {
  await Promise.all(socketServers.splice(0).map(async (server) => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }));
  await Promise.all(running.splice(0).map(async (fixture) => {
    fixture.child.kill("SIGTERM");
    await new Promise<void>((resolve) => fixture.child.once("exit", () => resolve()));
    await rm(fixture.root, { recursive: true, force: true });
  }));
});

async function startVintageFixture(commit: "af548f8" | "466e5c7"): Promise<RunningFixture> {
  const root = await mkdtemp(join(tmpdir(), `fabric-vintage-${commit}-`));
  const socketPath = join(root, "fixture.sock");
  const executable = new URL(`../fixtures/vintage-daemons/${commit}.mjs`, import.meta.url);
  const child = spawn(process.execPath, [executable.pathname, socketPath], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  const fixture: RunningFixture = { child, events: [], socketPath, root };
  running.push(fixture);
  let buffered = "";
  const ready = new Promise<void>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => reject(new Error(`vintage fixture exited before ready: ${String(code)}`)));
    child.stdout?.on("data", (chunk: Buffer) => {
      buffered += chunk.toString("utf8");
      for (;;) {
        const newline = buffered.indexOf("\n");
        if (newline < 0) break;
        const line = buffered.slice(0, newline);
        buffered = buffered.slice(newline + 1);
        const event = JSON.parse(line) as FixtureEvent;
        fixture.events.push(event);
        if (event.type === "ready") resolve();
      }
    });
  });
  await ready;
  return fixture;
}

const credential: OperatorCapabilityCredential = {
  capabilityId: parseIdentifier<"CapabilityId">("cap_fixture_01", "fixture.credential"),
  token: "fixture-secret-01",
};

describe("local Console protocol compatibility", () => {
  it("retries the genuine af548f8 daemon once on a fresh connection with the pinned strict-v1 profile", async () => {
    expect(STRICT_V1_OPTIONAL_FEATURES).toStrictEqual([
      "project-sessions.v1",
      "operator-projection.v2",
      "scoped-gate-read.v1",
      "scoped-gates.v1",
      "intakes.v1",
      "operator-actions.v1",
      "message-body-read.v1",
      "operator-repository-read.v1",
      "lifecycle-control.v1",
      "launch-custody.v1",
    ]);
    const fixture = await startVintageFixture("af548f8");
    const connected = await connectLocalOperatorConsoleClient({
      socketPath: fixture.socketPath,
      credential,
      surface: "standalone",
    });
    try {
      expect(connected.compatibility).toMatchObject({
        mode: "legacy-compatibility",
        primary: { code: "PROTOCOL_INVALID" },
        retry: { status: "succeeded", profile: "strict-v1" },
      });
      expect(connected.client.features).not.toContain(NATIVE_NOTIFICATION_PROJECTION_FEATURE);
      const snapshot = await connected.client.operations[FABRIC_OPERATIONS.projectionSnapshot]?.({
        credential,
        projectId: "project_fixture_01" as never,
      });
      expect(snapshot).toMatchObject({ attention: { value: [{ itemId: "attention_fixture_01" }] } });
      expect(snapshot).not.toHaveProperty("attention.value.0.nativeNotification");

      const initialize = fixture.events.filter((event) => event.type === "initialize");
      expect(initialize).toHaveLength(2);
      expect(initialize[0]?.requiredFeatures).toEqual(initialize[1]?.requiredFeatures);
      expect(initialize[1]?.optionalFeatures).toEqual(STRICT_V1_OPTIONAL_FEATURES);
      expect(initialize[0]?.clientNonce).not.toBe(initialize[1]?.clientNonce);
      expect(fixture.events.findIndex((event) => event.type === "dispatch"))
        .toBeGreaterThan(fixture.events.findLastIndex((event) => event.type === "initialize"));
    } finally {
      await connected.client.close();
    }
  });

  it("fails closed against the genuine 466e5c7 unnegotiated-extra result", async () => {
    const fixture = await startVintageFixture("466e5c7");
    const connected = await connectLocalOperatorConsoleClient({
      socketPath: fixture.socketPath,
      credential,
      surface: "herdr",
    });
    try {
      expect(connected.compatibility.mode).toBe("legacy-compatibility");
      await expect(connected.client.operations[FABRIC_OPERATIONS.projectionSnapshot]?.({
        credential,
        projectId: "project_fixture_01" as never,
      })).rejects.toMatchObject({ code: "PROTOCOL_INCOMPATIBLE" });
    } finally {
      await connected.client.close();
    }
  });

  it("keeps the original structured incompatibility primary when the one retry fails", async () => {
    const fixture = await startVintageFixture("af548f8");
    await expect(connectLocalOperatorConsoleClient({
      socketPath: fixture.socketPath,
      credential: { capabilityId: credential.capabilityId, token: "wrong-fixture-secret" },
      surface: "standalone",
    })).rejects.toMatchObject({
      code: "CONSOLE_PROTOCOL_INCOMPATIBLE",
      primary: { code: "PROTOCOL_INVALID" },
      retry: { status: "failed", profile: "strict-v1", failure: { code: "AUTHENTICATION_FAILED" } },
    });
    expect(fixture.events.filter((event) => event.type === "initialize")).toHaveLength(2);
    expect(fixture.events.some((event) => event.type === "dispatch")).toBe(false);
  });

  it("does not retry a structured authentication failure from an amended daemon", async () => {
    const root = await mkdtemp(join(tmpdir(), "fabric-current-auth-failure-"));
    const socketPath = join(root, "fixture.sock");
    let connections = 0;
    const server = createServer((socket) => {
      connections += 1;
      servePublicProtocolConnection(socket, {
        daemonVersion: "current-test",
        daemonInstanceGeneration: 1,
        offeredFeatures: PROTOCOL_FEATURES,
        verifyCredential: () => {
          throw Object.assign(new Error("credential rejected"), { code: "AUTHENTICATION_FAILED" });
        },
        dispatch: async () => { throw new Error("must not dispatch"); },
      });
    });
    socketServers.push(server);
    await new Promise<void>((resolve, reject) => server.listen(socketPath, resolve).once("error", reject));
    try {
      await expect(connectLocalOperatorConsoleClient({
        socketPath,
        credential: { ...credential, token: "wrong-current-secret" },
        surface: "standalone",
      })).rejects.toMatchObject({ code: "AUTHENTICATION_FAILED" });
      expect(connections).toBe(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("verifies the checked-in fixture binaries against their immutable manifest", async () => {
    const directory = new URL("../fixtures/vintage-daemons/", import.meta.url);
    const manifest = JSON.parse(await readFile(new URL("manifest.json", directory), "utf8")) as {
      fixtures: readonly { commit: string; file: string; sha256: string }[];
    };
    for (const entry of manifest.fixtures) {
      const bytes = await readFile(new URL(entry.file, directory));
      expect(createHash("sha256").update(bytes).digest("hex"), entry.commit).toBe(entry.sha256);
    }
  });
});
