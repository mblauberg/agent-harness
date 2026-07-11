import { afterEach, describe, expect, it } from "vitest";

import { createVisibilityCoordinator } from "../../../src/index.ts";
import { createVisibilityFixture } from "../../support/visibility-fixture.ts";

const cleanup: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((close) => close()));
});

describe("AC-002 observed paired programming", () => {
  it("restarts only the peer renderer at its display cursor without spawning or acknowledging", async () => {
    const fixture = await createVisibilityFixture("run-observed-pair");
    cleanup.push(fixture.cleanup);
    const coordinator = await createVisibilityCoordinator({
      runId: fixture.run.runId,
      profileName: "paired-observed",
      chairInHerdr: true,
      clients: { chair: fixture.chair, peer: fixture.peer },
      herdr: fixture.herdr,
      provider: fixture.provider,
      clock: fixture.clock.now,
      evidenceSink: fixture.chair,
    });
    await coordinator.startPair({
      chair: { agentId: "chair", provider: "claude", sessionRef: "claude-session-1", paneId: "w-test:p-chair" },
      peer: { agentId: "peer", provider: "codex", sessionRef: "codex-session-1" },
    });
    expect(fixture.herdr.callsFor("placeSideBySide")).toHaveLength(1);
    expect(fixture.herdr.callsFor("startObserver")).toHaveLength(1);
    expect(fixture.provider.managedSpawnCount).toBe(1);

    await fixture.chair.sendMessage({
      audience: { kind: "agents", agentIds: ["peer"] },
      kind: "request",
      body: "mailbox content is not observer content",
      requiresAck: true,
      dedupeKey: "observed:mailbox",
    });
    const firstCursor = await coordinator.publishActivity({
      agentId: "peer",
      event: { kind: "tool", summary: "read artifact", sensitive: "must-redact" },
    });
    await coordinator.flushObserver({ agentId: "peer" });
    expect(firstCursor).toBe(1);
    expect(fixture.herdr.callsFor("renderActivity").at(-1)?.input).toMatchObject({
      envelopeVersion: 1,
      cursor: 1,
      event: { kind: "tool", summary: "read artifact" },
    });
    expect(JSON.stringify(fixture.herdr.callsFor("renderActivity").at(-1))).not.toContain("must-redact");

    await coordinator.closeObserver({ agentId: "peer" });
    await coordinator.publishActivity({ agentId: "peer", event: { kind: "status", summary: "still running" } });
    await coordinator.restartObserver({ agentId: "peer" });
    expect(fixture.herdr.callsFor("startObserver").at(-1)?.input).toMatchObject({ afterCursor: 1 });
    expect(fixture.provider.managedSpawnCount).toBe(1);
    expect(fixture.provider.status("peer")).toMatchObject({ state: "idle", sessionRef: "codex-session-1" });
    expect(await fixture.peer.getMailboxState()).toEqual({
      contiguousWatermark: 0,
      acknowledgedAboveWatermark: [],
    });
  });
});
