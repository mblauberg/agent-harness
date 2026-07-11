import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import { createDaemonFixture } from "../support/daemon-testkit.ts";

const execFileAsync = promisify(execFile);
const cleanup: Array<() => Promise<void>> = [];

function isCommandFailure(value: unknown): value is { stdout?: string; stderr?: string } {
  return typeof value === "object" && value !== null;
}

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((close) => close()));
});

describe("Stage 1 daemon local transport", () => {
  it("uses only a private Unix socket and opens no TCP listener", async () => {
    const fixture = await createDaemonFixture("run-socket");
    cleanup.push(fixture.cleanup);

    const [state, runtime, socket] = await Promise.all([
      stat(fixture.stateDirectory),
      stat(fixture.runtimeDirectory),
      stat(fixture.socketPath),
    ]);
    expect(state.mode & 0o777).toBe(0o700);
    expect(runtime.mode & 0o777).toBe(0o700);
    expect(socket.isSocket()).toBe(true);
    expect(socket.mode & 0o777).toBe(0o600);
    expect(fixture.daemon.address).toEqual({ transport: "unix", path: fixture.socketPath });

    const lsof = await execFileAsync("/usr/sbin/lsof", [
      "-nP",
      "-a",
      "-p",
      String(fixture.daemon.pid),
      "-iTCP",
      "-sTCP:LISTEN",
    ]).catch((error: unknown) => {
      if (!isCommandFailure(error)) {
        return { stdout: "", stderr: "" };
      }
      return { stdout: error.stdout ?? "", stderr: error.stderr ?? "" };
    });
    expect(lsof.stdout.trim()).toBe("");
  });
});
