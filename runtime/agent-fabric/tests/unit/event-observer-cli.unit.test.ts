import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { runEventObserver } from "../../src/cli/event-observer.ts";

describe("event observer CLI", () => {
  it("renders a bounded read-only page once and closes the daemon transport", async () => {
    const directory = await mkdtemp(join(tmpdir(), "fabric-observer-cli-"));
    try {
      const capabilityPath = join(directory, "observer.cap");
      await writeFile(capabilityPath, `afc_${"a".repeat(43)}\n`);
      await chmod(capabilityPath, 0o600);
      const close = vi.fn(async () => undefined);
      const render = vi.fn(async () => undefined);
      await runEventObserver([
        "--socket", join(directory, "fabric.sock"),
        "--capability-file", capabilityPath,
        "--run-id", "run-observer",
        "--cursor", join(directory, "cursor.json"),
        "--once",
      ], {
        connect: vi.fn(async () => ({
          close,
          eventsAfter: vi.fn(async () => ({
            nextCursor: 1,
            events: [{ cursor: 1, eventId: "event-1", type: "message-sent", actorAgentId: "codex", createdAt: 1, summary: "codex sent a request to claude" }],
          })),
        })),
        render,
      });
      expect(render).toHaveBeenCalledWith(expect.stringContaining("codex sent a request to claude"));
      expect(close).toHaveBeenCalledOnce();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
