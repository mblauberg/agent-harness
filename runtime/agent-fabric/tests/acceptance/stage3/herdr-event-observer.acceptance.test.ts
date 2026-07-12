import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { FabricError } from "../../../src/errors.ts";
import { DurableEventObserver } from "../../../src/visibility/event-observer.ts";
import { createStage1Fixture, ROOT_AUTHORITY } from "../../support/stage1-fixture.ts";

describe("read-only Herdr event observer", () => {
  it("reads bounded, monotonic message previews under explicit local observer authority", async () => {
    const fixture = await createStage1Fixture();
    const first = await fixture.chair.eventsAfter({ cursor: 0, limit: 2 });

    expect(first.events).toHaveLength(2);
    expect(first.events[0]!.cursor).toBeGreaterThan(0);
    expect(first.events[1]!.cursor).toBeGreaterThan(first.events[0]!.cursor);
    expect(first.nextCursor).toBe(first.events[1]!.cursor);

    const secret = "raw-message-body-must-not-leak";
    await fixture.alice.sendMessage({
      audience: { kind: "agents", agentIds: ["bob"] },
      kind: "request",
      body: secret,
      requiresAck: true,
      dedupeKey: "observer-secret",
    });
    const later = await fixture.chair.eventsAfter({ cursor: first.nextCursor, limit: 100 });
    expect(later.events.some((event) => event.type === "message-persisted")).toBe(true);
    expect(JSON.stringify(later)).toContain(secret);
    expect(JSON.stringify(later)).not.toContain("payload");
    expect(later.events.every((event) => event.summary.length > 0)).toBe(true);
    expect(later.events.find((event) => event.type === "message-persisted")?.summary).toBe(`request alice → bob: ${secret}`);
  });

  it("rejects missing observer authority without touching mailbox state", async () => {
    const fixture = await createStage1Fixture();
    const restricted = await fixture.chair.delegateAuthority({
      parentAuthorityId: fixture.run.chairAuthorityId,
      authority: {
        workspaceRoots: ["."], sourcePaths: [], artifactPaths: [], actions: [],
        disclosure: ["local"], expiresAt: "2099-01-01T00:00:00.000Z", budget: {},
      },
    });
    const registration = await fixture.chair.registerAgent({ agentId: "observer-denied", authorityId: restricted.authorityId });
    const denied = fixture.fabric.connect(registration.capability);
    const before = await fixture.bob.getMailboxState();

    await expect(denied.eventsAfter({ cursor: 0, limit: 10 })).rejects.toMatchObject({
      code: "CAPABILITY_FORBIDDEN",
    } satisfies Partial<FabricError>);
    expect(await fixture.bob.getMailboxState()).toEqual(before);
  });

  it("does not grant run-wide message observation through legacy read authority", async () => {
    const fixture = await createStage1Fixture();
    const delegated = await fixture.chair.delegateAuthority({
      parentAuthorityId: fixture.run.chairAuthorityId,
      authority: {
        ...ROOT_AUTHORITY,
        actions: ["read"],
        budget: {},
      },
    });
    const registration = await fixture.chair.registerAgent({ agentId: "legacy-reader", authorityId: delegated.authorityId });
    await expect(fixture.fabric.connect(registration.capability).eventsAfter({ cursor: 0, limit: 100 }))
      .rejects.toMatchObject({ code: "CAPABILITY_FORBIDDEN" });
  });

  it("does not rerender checkpointed events after an orderly restart", async () => {
    const fixture = await createStage1Fixture();
    const cursorPath = join(fixture.directory, "observer", "cursor.json");
    const lines: string[] = [];
    const observer = new DurableEventObserver({
      runId: fixture.run.runId,
      cursorPath,
      source: fixture.chair,
      render: async (line) => { lines.push(line); },
    });

    const first = await observer.poll(2);
    const second = await observer.poll(2);
    expect(first.rendered).toBe(2);
    expect(second.events[0]?.cursor ?? second.cursor).toBeGreaterThan(first.cursor);
    expect(new Set(lines).size).toBe(lines.length);

    const saved = JSON.parse(await readFile(cursorPath, "utf8")) as { runId: string; cursor: number };
    expect(saved).toEqual({ runId: fixture.run.runId, cursor: second.cursor, version: 1 });

    const resumed: string[] = [];
    const replacement = new DurableEventObserver({
      runId: fixture.run.runId,
      cursorPath,
      source: fixture.chair,
      render: async (line) => { resumed.push(line); },
    });
    const caughtUp = await replacement.poll(100);
    expect(caughtUp.events.every((event) => event.cursor > second.cursor)).toBe(true);
    expect(resumed).not.toEqual(expect.arrayContaining(lines));
    await rm(cursorPath, { force: true });
  });

  it("replays an event when rendering fails before its cursor is checkpointed", async () => {
    const fixture = await createStage1Fixture();
    const cursorPath = join(fixture.directory, "at-least-once", "cursor.json");
    const event = {
      cursor: 1,
      eventId: "event-replayed-after-render-failure",
      type: "agent-registered",
      actorAgentId: "chair",
      createdAt: 0,
      summary: "agent-registered by chair",
    };
    const rendered: string[] = [];
    const source = {
      eventsAfter: async () => ({ events: [event], nextCursor: event.cursor }),
    };
    const interrupted = new DurableEventObserver({
      runId: fixture.run.runId,
      cursorPath,
      source,
      render: async (line) => {
        rendered.push(line);
        throw new Error("pane failed after accepting the line");
      },
    });

    await expect(interrupted.poll()).rejects.toThrow(/pane failed/u);

    const restarted = new DurableEventObserver({
      runId: fixture.run.runId,
      cursorPath,
      source,
      render: async (line) => { rendered.push(line); },
    });
    await expect(restarted.poll()).resolves.toMatchObject({ rendered: 1, cursor: 1 });
    expect(rendered).toHaveLength(2);
    expect(rendered[1]).toBe(rendered[0]);
  });

  it("neutralises terminal control characters in the pane projection", async () => {
    const fixture = await createStage1Fixture();
    const lines: string[] = [];
    const observer = new DurableEventObserver({
      runId: "run-hostile-summary",
      cursorPath: join(fixture.directory, "hostile", "cursor.json"),
      source: {
        eventsAfter: async () => ({
          nextCursor: 1,
          events: [{
            cursor: 1,
            eventId: "event-hostile",
            type: "message-persisted",
            actorAgentId: "hostile",
            createdAt: 0,
            summary: "message-persisted by hostile\u001b]0;spoofed\u0007",
          }],
        }),
      },
      render: async (line) => { lines.push(line); },
    });

    await observer.poll();
    expect(lines).toHaveLength(1);
    expect(lines[0]?.startsWith("1970-01-01 10:00:00 AEST (UTC+10) #1 ")).toBe(true);
    expect(lines[0]).not.toMatch(/[\u0000-\u001f\u007f-\u009f]/u);
    expect(lines[0]).not.toContain("spoofed");
  });
});
