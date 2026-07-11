import { performance } from "node:perf_hooks";
import { arch, cpus, platform, release } from "node:os";
import { writeFile } from "node:fs/promises";

import Database from "better-sqlite3";

import { connectFabricDaemon } from "../../src/index.ts";
import { describe, expect, it } from "vitest";

import { DAEMON_ROOT_AUTHORITY, createDaemonFixture } from "../support/daemon-testkit.ts";

describe("Stage 1 local coordination performance", () => {
  it("keeps 1000 mailbox operations below 100 ms p95 with 32 registered agents", async () => {
    const fixture = await createDaemonFixture("run-performance");
    const clients: Array<{ close(): Promise<void> }> = [];
    const recipientIds = ["peer"];
    try {
      for (let index = 0; index < 30; index += 1) {
        const agentId = `worker-${index}`;
        const authority = await fixture.chair.delegateAuthority({
          parentAuthorityId: fixture.run.chairAuthorityId,
          commandId: `performance:authority:${index}`,
          authority: {
            ...DAEMON_ROOT_AUTHORITY,
            sourcePaths: [`src/${agentId}`],
            artifactPaths: [`.agent-run/${agentId}`],
            actions: ["read", "message"],
            budget: { turns: 1, "cost:USD": 1 },
          },
        });
        const registration = await fixture.chair.registerAgent({ agentId, authorityId: authority.authorityId });
        clients.push(await connectFabricDaemon({ socketPath: fixture.socketPath, capability: registration.capability }));
        recipientIds.push(agentId);
      }
      clients.push(fixture.peer);
      expect(clients.length + 1).toBe(32); // 31 non-chair clients plus the chair.
      await fixture.chair.createDiscussionGroup({
        groupId: "performance-broadcast-set",
        memberAgentIds: ["chair", ...recipientIds],
        commandId: "performance:group:create",
      });

      for (let index = 0; index < 100; index += 1) {
        const recipientId = recipientIds[index % recipientIds.length];
        if (recipientId === undefined) throw new Error("expected a warm-up recipient");
        await fixture.chair.sendMessage({ audience: { kind: "agents", agentIds: [recipientId] }, kind: "event", body: `warmup-${index}`, requiresAck: false, dedupeKey: `performance:warmup:${index}` });
      }
      const durations: number[] = [];
      for (let index = 0; index < 1_000; index += 1) {
        const recipientId = recipientIds[index % recipientIds.length];
        if (recipientId === undefined) {
          throw new Error("expected a registered performance recipient");
        }
        const started = performance.now();
        await fixture.chair.sendMessage({
          audience: { kind: "agents", agentIds: [recipientId] },
          kind: "event",
          body: `operation-${index}`,
          requiresAck: false,
          dedupeKey: `performance:${index}`,
        });
        durations.push(performance.now() - started);
      }
      durations.sort((left, right) => left - right);
      const p95 = durations[Math.ceil(durations.length * 0.95) - 1];
      if (p95 === undefined) {
        throw new Error("expected 1000 duration samples");
      }
      const inspection = new Database(fixture.databasePath, { readonly: true, fileMustExist: true });
      const journalMode = inspection.pragma("journal_mode", { simple: true });
      inspection.close();
      const evidence = {
        schemaVersion: 1,
        observedAt: new Date().toISOString(),
        host: { platform: platform(), release: release(), arch: arch(), cpuCount: cpus().length },
        runtime: { node: process.version, databaseMode: journalMode },
        agentCount: 32,
        operationMix: { warmupMessages: 100, measuredMessages: 1_000, requiresAck: false, recipients: 31 },
        sampleCount: durations.length,
        p95Milliseconds: p95,
      };
      if (process.env.AGENT_FABRIC_PERFORMANCE_RECEIPT !== undefined) {
        await writeFile(process.env.AGENT_FABRIC_PERFORMANCE_RECEIPT, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
      }
      expect(evidence).toMatchObject({ runtime: { databaseMode: "wal" }, agentCount: 32, sampleCount: 1_000 });
      expect(p95).toBeLessThan(100);
    } finally {
      await Promise.allSettled(clients.filter((client) => client !== fixture.peer).map((client) => client.close()));
      await fixture.cleanup();
    }
  }, 120_000);
});
