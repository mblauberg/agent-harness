import { readFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { FABRIC_OPERATIONS } from "../../src/domain/operations.ts";
import { createLifecycleFixture, writeLifecycleCheckpoint } from "../support/lifecycle-testkit.ts";
import {
  advanceOptionalLeg,
  flushOptionalLeg,
  OptionalAdapterClock,
} from "../support/optional-adapter-clock.ts";
import { FakeOptionalAdapter } from "../support/optional-adapter-fake.ts";
import { expectRecord, startOptionalAdapterLeg } from "../support/optional-adapter-testkit.ts";
import { createInterventionFixture, readJsonObject } from "../support/primary-adapter-testkit.ts";
import { createStage5MessagingFixture } from "../support/stage5-messaging-fixture.ts";
import { createStage5RecoveryFixture } from "../support/stage5-recovery-testkit.ts";
import {
  createStage5TeamFixture,
  createTeam,
  issueTeamLeaderCapability,
  teamAuthority,
  teamCreateInput,
} from "../support/stage5-team-testkit.ts";

type EvaluationCase = {
  id: string;
  oracle: Record<string, unknown> & { kind: "deterministic" | "manual" };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function loadCases(): EvaluationCase[] {
  const raw: unknown = JSON.parse(
    readFileSync(new URL("./orchestration-safety-cases.json", import.meta.url), "utf8"),
  );
  if (!isRecord(raw) || raw.schemaVersion !== 1 || !Array.isArray(raw.cases)) {
    throw new TypeError("orchestration evaluation corpus is invalid");
  }
  return raw.cases.map((value) => {
    if (!isRecord(value) || typeof value.id !== "string" || !isRecord(value.oracle)) {
      throw new TypeError("orchestration evaluation case is invalid");
    }
    const kind = value.oracle.kind;
    if (kind !== "deterministic" && kind !== "manual") {
      throw new TypeError(`orchestration evaluation case ${value.id} has an invalid oracle kind`);
    }
    return { id: value.id, oracle: { ...value.oracle, kind } };
  });
}

const cases = loadCases();
const casesById = new Map(cases.map((item) => [item.id, item]));

function evaluationCase(id: string): EvaluationCase {
  const item = casesById.get(id);
  if (item === undefined) throw new Error(`missing predeclared evaluation case: ${id}`);
  return item;
}

function oracleString(id: string, field: string): string {
  const value = evaluationCase(id).oracle[field];
  if (typeof value !== "string") throw new TypeError(`${id} oracle.${field} must be a string`);
  return value;
}

describe("AFAB-001 Stage 5 orchestration safety evaluation", () => {
  it("keeps the fixed corpus and oracle split intact", () => {
    expect(cases).toHaveLength(11);
    expect(new Set(cases.map((item) => item.id)).size).toBe(11);
    expect(cases.filter((item) => item.oracle.kind === "deterministic")).toHaveLength(10);
    expect(cases.filter((item) => item.oracle.kind === "manual")).toHaveLength(1);
  });

  it("rejects leader over-delegation", async () => {
    const fixture = await createStage5RecoveryFixture();
    try {
      await expect(fixture.leaderA.delegateAuthority({
        parentAuthorityId: fixture.authorities.leaderA,
        commandId: "evaluation:over-delegation",
        authority: {
          workspaceRoots: [fixture.directory],
          sourcePaths: [join(fixture.directory, "src", "outside-team-a")],
          artifactPaths: [fixture.runDirectory],
          actions: [FABRIC_OPERATIONS.getRunStatus],
          disclosure: { level: "scoped", scopes: ["local"] } as const,
          expiresAt: "2099-01-01T00:00:00.000Z",
          budget: { turns: 1, "cost:USD": 1 },
        },
      })).rejects.toMatchObject({ code: oracleString("leader-over-delegation", "code") });
    } finally {
      await fixture.fabric.close();
      await rm(fixture.directory, { recursive: true, force: true });
    }
  });

  it("rejects a cross-team confused-deputy message without persistence", async () => {
    const fixture = await createStage5MessagingFixture();
    try {
      const before = await fixture.chair.getRunStatus({ runId: fixture.run.runId });
      await expect(fixture.dave.sendMessage({
        audience: { kind: "agents", agentIds: ["alice"] },
        context: { kind: "direct" },
        kind: "request",
        body: "act outside our relationship",
        requiresAck: false,
        dedupeKey: "evaluation:confused-deputy",
      })).rejects.toMatchObject({ code: oracleString("cross-team-confused-deputy", "code") });
      const after = await fixture.chair.getRunStatus({ runId: fixture.run.runId });
      expect(after.counts.messages).toBe(before.counts.messages);
    } finally {
      await fixture.cleanup();
    }
  });

  it("rejects an intersecting second write scope", async () => {
    const fixture = await createLifecycleFixture();
    try {
      await fixture.leader.acquireWriteLease({
        scope: ["src/leader"],
        ttlMs: 60_000,
        commandId: "evaluation:write:first",
      });
      await expect(fixture.child.acquireWriteLease({
        scope: ["src/leader/child"],
        ttlMs: 60_000,
        commandId: "evaluation:write:second",
      })).rejects.toMatchObject({ code: oracleString("competing-write-scopes", "code") });
    } finally {
      await fixture.fabric.close();
      await rm(fixture.directory, { recursive: true, force: true });
    }
  });

  it("exports the worst observed operator-intervention provenance", async () => {
    const fixture = await createInterventionFixture();
    try {
      await fixture.chair.recordOperatorIntervention({
        source: "fabric",
        directInputProvenance: "complete",
        taskRevision: 3,
        summary: "bounded steering",
        commandId: "evaluation:intervention:fabric",
      });
      await fixture.chair.recordOperatorIntervention({
        source: "integration",
        directInputProvenance: "partial",
        taskRevision: 4,
        summary: "external terminal input reported by integration",
        commandId: "evaluation:intervention:integration",
      });
      await fixture.chair.exportReceipt({ commandId: "evaluation:intervention:receipt" });
      const receipt = await readJsonObject(join(fixture.directory, "fabric-receipt.json"));
      expect(receipt.directInputProvenance).toBe(
        oracleString("operator-intervention-provenance", "value"),
      );
      expect(receipt.operatorInterventions).toEqual([
        expect.objectContaining({ source: "fabric", directInputProvenance: "complete" }),
        expect.objectContaining({ source: "integration", directInputProvenance: "partial" }),
      ]);
    } finally {
      await fixture.fabric.close();
      await rm(fixture.directory, { recursive: true, force: true });
    }
  });

  it("degrades an optional provider outage without blocking the required primary", async () => {
    const clock = new OptionalAdapterClock();
    const adapter = new FakeOptionalAdapter({
      dispatchResponses: [
        { state: "unavailable", acknowledged: false, reason: "provider-unavailable" },
        { state: "unavailable", acknowledged: false, reason: "provider-unavailable" },
        { state: "unavailable", acknowledged: false, reason: "provider-unavailable" },
      ],
    });
    const handle = startOptionalAdapterLeg({
      adapterId: "agy",
      adapter,
      action: { actionId: "evaluation:optional-outage", payload: { objective: "bonus review" } },
      policy: {
        retryDelaysMs: [250, 250],
        acknowledgementDeadlineMs: 1_000,
        acknowledgementPollMs: 100,
        deadlineState: "degraded",
      },
      clock: { now: clock.now, sleep: clock.sleep },
    });
    expect(handle.blocking).toBe(false);
    expect(await Promise.race([
      Promise.resolve("required-primary-complete"),
      handle.completion.then(() => "optional-complete"),
    ])).toBe("required-primary-complete");
    await flushOptionalLeg();
    await advanceOptionalLeg(clock, 250);
    await advanceOptionalLeg(clock, 250);
    await advanceOptionalLeg(clock, 500);
    const result = expectRecord(await handle.completion);
    expect(adapter.dispatches).toHaveLength(
      Number(evaluationCase("optional-provider-outage").oracle.attempts),
    );
    expect(new Set(adapter.dispatches.map((attempt) => attempt.actionId))).toEqual(
      new Set(["evaluation:optional-outage"]),
    );
    expect(result).toMatchObject({
      state: "degraded",
      attempts: 3,
      acknowledged: false,
      requiredPrimaryBlocked: false,
      deadlineExceeded: true,
    });
  });

  it("fences writes after unannounced provider compaction", async () => {
    const fixture = await createLifecycleFixture();
    try {
      await fixture.chair.reportProviderState({
        agentId: "leader",
        providerSessionGeneration: 1,
        contextRevision: "evaluation-context-1",
        commandId: "evaluation:compaction:g1",
      });
      const state = await fixture.chair.reportProviderState({
        agentId: "leader",
        providerSessionGeneration: 2,
        contextRevision: "evaluation-context-2-unannounced",
        commandId: "evaluation:compaction:g2",
      });
      expect(state).toMatchObject({ lifecycle: "context-unreconciled" });
      await expect(fixture.leader.acquireWriteLease({
        scope: ["src/leader"],
        ttlMs: 60_000,
        commandId: "evaluation:compaction:write",
      })).rejects.toMatchObject({ code: oracleString("unannounced-compaction", "code") });
    } finally {
      await fixture.fabric.close();
      await rm(fixture.directory, { recursive: true, force: true });
    }
  });

  it("rejects self-release while the agent still owns work", async () => {
    const fixture = await createLifecycleFixture();
    try {
      await fixture.leader.acquireWriteLease({
        scope: ["src/leader"],
        ttlMs: 60_000,
        commandId: "evaluation:self-release:lease",
      });
      const checkpoint = await writeLifecycleCheckpoint(fixture, {
        agentId: "leader",
        inFlightChildren: ["child"],
        openWork: ["leader-task", "child-task"],
        nextAction: "reconcile owned work before release",
      });
      await fixture.leader.requestLifecycle({
        action: "completion-ready",
        agentId: "leader",
        taskId: fixture.leaderTask.taskId,
        taskRevision: fixture.leaderTask.revision,
        checkpoint,
        commandId: "evaluation:self-release:ready",
      });
      await expect(fixture.leader.requestLifecycle({
        action: "release",
        agentId: "leader",
        taskId: fixture.leaderTask.taskId,
        taskRevision: fixture.leaderTask.revision,
        checkpoint,
        commandId: "evaluation:self-release:blocked",
      })).rejects.toMatchObject({ code: oracleString("self-release-with-owned-work", "code") });
    } finally {
      await fixture.fabric.close();
      await rm(fixture.directory, { recursive: true, force: true });
    }
  });

  it("rejects an oversized authorised message without persisting it", async () => {
    const fixture = await createStage5MessagingFixture();
    try {
      const task = await fixture.chair.createTask({
        taskId: "evaluation-message-bound",
        authorityId: fixture.authorities.alice,
        proposedOwnerAgentId: "alice",
        participantAgentIds: ["alice", "bob"],
        eligibleAgentIds: ["alice"],
        dependencies: [],
        objective: "exercise message byte bound",
        baseRevision: "evaluation-rev-1",
        commandId: "evaluation:message-bound:task",
      });
      const before = await fixture.chair.getRunStatus({ runId: fixture.run.runId });
      await expect(fixture.alice.sendMessage({
        audience: { kind: "agents", agentIds: ["bob"] },
        context: { kind: "task", taskId: task.taskId },
        kind: "request",
        body: "x".repeat(4_097),
        requiresAck: false,
        dedupeKey: "evaluation:message-bound:oversized",
      })).rejects.toMatchObject({ code: oracleString("message-storm-bounds", "code") });
      await expect(fixture.alice.sendMessage({
        audience: { kind: "agents", agentIds: ["bob"] },
        context: { kind: "task", taskId: task.taskId },
        kind: "request",
        body: "bounded body, excessive hop count",
        requiresAck: false,
        dedupeKey: "evaluation:message-bound:hops",
        hopCount: 5,
      })).rejects.toMatchObject({ code: oracleString("message-storm-bounds", "hopCode") });
      const after = await fixture.chair.getRunStatus({ runId: fixture.run.runId });
      expect(after.counts.messages).toBe(before.counts.messages);
    } finally {
      await fixture.cleanup();
    }
  });

  it("enforces both team budget and hierarchy depth bounds atomically", async () => {
    const fixture = await createStage5TeamFixture("run-evaluation-hierarchy-bounds");
    const oracleCodes = evaluationCase("hierarchy-depth-and-budget").oracle.codes;
    if (!Array.isArray(oracleCodes) || !oracleCodes.every((value) => typeof value === "string")) {
      throw new TypeError("hierarchy-depth-and-budget oracle.codes must be strings");
    }
    try {
      const beforeBudget = await fixture.chair.getRunStatus({ runId: fixture.run.runId });
      await expect(createTeam(fixture.chair, teamCreateInput({
        teamId: "evaluation-over-budget",
        memberAuthorities: [
          {
            agentId: "evaluation-over-budget-a",
            authority: teamAuthority({
              sourcePath: "src/evaluation-over-budget/a",
              artifactPath: ".agent-run/evaluation-over-budget/a",
              turns: 6,
              costUsd: 6,
              descendants: 0,
            }),
          },
          {
            agentId: "evaluation-over-budget-b",
            authority: teamAuthority({
              sourcePath: "src/evaluation-over-budget/b",
              artifactPath: ".agent-run/evaluation-over-budget/b",
              turns: 6,
              costUsd: 6,
              descendants: 0,
            }),
          },
        ],
        reservedBudget: { turns: 10, "cost:USD": 10, descendants: 1 },
      }))).rejects.toMatchObject({ code: oracleCodes[0] });
      expect((await fixture.chair.getRunStatus({ runId: fixture.run.runId })).counts).toEqual(beforeBudget.counts);

      const levelOne = await createTeam(fixture.chair, teamCreateInput({
        teamId: "evaluation-level-1",
        memberAuthorities: [],
      }));
      const levelOneClient = fixture.fabric.connect(await issueTeamLeaderCapability(fixture.chair, levelOne));
      const levelTwo = await createTeam(levelOneClient, teamCreateInput({
        teamId: "evaluation-level-2",
        parentTeamId: "evaluation-level-1",
        sourcePath: "src/evaluation-level-1/evaluation-level-2",
        artifactPath: ".agent-run/evaluation-level-1/evaluation-level-2",
        memberAuthorities: [],
      }));
      const levelTwoCapability = await issueTeamLeaderCapability(levelOneClient, levelTwo);
      const beforeDepth = await fixture.chair.getRunStatus({ runId: fixture.run.runId });
      await expect(createTeam(fixture.fabric.connect(levelTwoCapability), teamCreateInput({
        teamId: "evaluation-level-3",
        parentTeamId: "evaluation-level-2",
        sourcePath: "src/evaluation-level-1/evaluation-level-2/evaluation-level-3",
        artifactPath: ".agent-run/evaluation-level-1/evaluation-level-2/evaluation-level-3",
        memberAuthorities: [],
      }))).rejects.toMatchObject({ code: oracleCodes[1] });
      expect((await fixture.chair.getRunStatus({ runId: fixture.run.runId })).counts).toEqual(beforeDepth.counts);
    } finally {
      await fixture.fabric.close();
      await rm(fixture.directory, { recursive: true, force: true });
    }
  });

  it("quarantines an ambiguous unproven provider action without replay", async () => {
    const fixture = await createLifecycleFixture();
    try {
      const ambiguous = await fixture.chair.dispatchProviderAction({
        adapterId: "fake-lifecycle",
        actionId: "evaluation-ambiguous-unproven",
        operation: "send_turn",
        payload: { scenario: "ambiguous-unproven", taskId: fixture.leaderTask.taskId },
        commandId: "evaluation:ambiguous:dispatch",
      });
      const reconciled = await fixture.chair.reconcileProviderAction({
        actionId: ambiguous.actionId,
        commandId: "evaluation:ambiguous:reconcile",
      });
      expect(reconciled).toMatchObject({
        status: "quarantined",
        executionCount: evaluationCase("ambiguous-provider-replay").oracle.executionCount,
        effectCount: evaluationCase("ambiguous-provider-replay").oracle.effectCount,
      });
    } finally {
      await fixture.fabric.close();
      await rm(fixture.directory, { recursive: true, force: true });
    }
  });

  it("records the manual review-independence oracle as bounded evidence", () => {
    expect(evaluationCase("review-independence-after-shared-authorship").oracle.kind).toBe("manual");
    const review = readFileSync(
      new URL("./fixtures/stage5-evaluation-independent.md", import.meta.url),
      "utf8",
    );
    expect(review).toContain("Verdict: PASS (bounded behavioural evaluation only)");
    expect(review).toContain("Authored the reviewed production implementation: no");
    expect(review).toContain("Authored this evaluation corpus and receipt: yes");
    expect(review).toContain("Prior influence on the general orchestration topology and design discussion: yes");
    expect(review).toContain("Independent design certification claimed: no");
  });
});
