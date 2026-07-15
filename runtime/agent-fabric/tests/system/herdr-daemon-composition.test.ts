import { createHash } from "node:crypto";
import { rm } from "node:fs/promises";

import Database from "better-sqlite3";
import type {
  AgentId,
  CoordinationRunId,
  ProjectId,
  ProjectSessionId,
  ProviderActionId,
} from "@local/agent-fabric-protocol";
import { FABRIC_OPERATIONS } from "@local/agent-fabric-protocol";
import { describe, expect, it } from "vitest";

import { openFabric } from "../../src/index.ts";
import { createStage1Fixture } from "../support/stage1-fixture.ts";

describe("daemon-owned Herdr production composition", () => {
  it("prepares one stable closed action before the integration effect and replays without a second effect", async () => {
    const fixture = await createStage1Fixture();
    await fixture.fabric.close();
    const identity = projectIdentity(fixture.databasePath);
    const effects: string[] = [];
    const fabric = await openFabric({
      databasePath: fixture.databasePath,
      workspaceRoots: [fixture.directory],
      clock: fixture.clock.now,
      herdr: {
        mode: "enabled",
        createIntegration: async ({ fabricJournal }: {
          fabricJournal: {
            readAction(actionId: ProviderActionId): Promise<{
              revision: number;
              status: "prepared" | "dispatched" | "ambiguous" | "terminal";
            } | null>;
            markDispatched(actionId: ProviderActionId, revision: number): Promise<{ revision: number }>;
            completeAction(
              actionId: ProviderActionId,
              revision: number,
              receipt: { status: "applied"; operation: "console.ensure-pane"; paneRef: string },
            ): Promise<unknown>;
          };
        }) => {
          expect(await fabricJournal.readAction("herdr-console-action-01" as ProviderActionId)).toMatchObject({
            status: "prepared",
            revision: 1,
          });
          return ({
          execute: async (actionId: ProviderActionId) => {
            const prepared = await fabricJournal.readAction(actionId);
            expect(prepared).toMatchObject({ status: "prepared", revision: 1 });
            effects.push(actionId);
            const dispatched = await fabricJournal.markDispatched(actionId, prepared?.revision ?? 0);
            return await fabricJournal.completeAction(actionId, dispatched.revision, {
              status: "applied",
              operation: "console.ensure-pane",
              paneRef: "w1:p1",
            });
          },
          lookupAction: async () => ({ status: "unknown" as const }),
          reconcilePresence: async () => ({
            readiness: "visibility-degraded" as const,
            ready: false as const,
            paneRef: null,
            reason: "not requested",
            providerState: "unknown" as const,
          }),
          });
        },
      },
    } as never);
    try {
      const request = {
        actionId: "herdr-console-action-01" as ProviderActionId,
        projectId: identity.projectId,
        projectSessionId: identity.projectSessionId,
        coordinationRunId: "run-stage1" as CoordinationRunId,
        targetAgentId: null as AgentId | null,
        intent: {
          kind: "console.ensure-pane" as const,
          projectId: identity.projectId,
          projectSessionId: identity.projectSessionId,
          profileId: "agent-fabric-console" as const,
        },
      };
      const execute = (fabric as unknown as {
        executeHerdrAction(input: typeof request): Promise<unknown>;
      }).executeHerdrAction.bind(fabric);

      await expect(execute(request)).resolves.toMatchObject({ status: "terminal" });
      await expect(execute(request)).resolves.toMatchObject({ status: "terminal" });
      expect(effects).toEqual([request.actionId]);
    } finally {
      await fabric.close();
      await rm(fixture.directory, { recursive: true, force: true });
    }
  });

  it("persists a bounded available presence observation separately from action custody", async () => {
    const fixture = await createStage1Fixture();
    await fixture.fabric.close();
    const identity = projectIdentity(fixture.databasePath);
    seedProviderIdentity(fixture.databasePath);
    const fabric = await openFabric({
      databasePath: fixture.databasePath,
      workspaceRoots: [fixture.directory],
      clock: fixture.clock.now,
      herdr: {
        mode: "enabled",
        createIntegration: async ({ fabricJournal }: {
          fabricJournal: {
            readAction(actionId: ProviderActionId): Promise<{ revision: number; status: string } | null>;
            markDispatched(actionId: ProviderActionId, revision: number): Promise<{ revision: number }>;
            completeAction(actionId: ProviderActionId, revision: number, receipt: unknown): Promise<unknown>;
          };
        }) => ({
          execute: async (actionId: ProviderActionId, intent: { kind: string }) => {
            const prepared = await fabricJournal.readAction(actionId);
            const dispatched = await fabricJournal.markDispatched(actionId, prepared?.revision ?? 0);
            return await fabricJournal.completeAction(actionId, dispatched.revision, {
              status: "applied",
              operation: intent.kind,
              paneRef: "w2:p2",
            });
          },
          lookupAction: async () => ({ status: "unknown" as const }),
          reconcilePresence: async (registration: unknown) => {
            expect(registration).toMatchObject({
              kind: "agent.ensure-pane",
              identity: { agentId: "bob", providerSessionRef: "thread-bob" },
            });
            return {
              readiness: "ready" as const,
              ready: true as const,
              paneRef: "w2:p2",
            };
          },
        }),
      },
    } as never);
    try {
      const agentIdentity = {
        projectId: identity.projectId,
        projectSessionId: identity.projectSessionId,
        coordinationRunId: "run-stage1" as CoordinationRunId,
        agentId: "bob" as AgentId,
        provider: "codex-app-server",
        modelFamily: "openai",
        providerSessionRef: "thread-bob",
        providerSessionGeneration: 2,
      };
      await (fabric as unknown as {
        executeHerdrAction(input: unknown): Promise<unknown>;
      }).executeHerdrAction({
        actionId: "herdr-agent-pane-action-01" as ProviderActionId,
        projectId: identity.projectId,
        projectSessionId: identity.projectSessionId,
        coordinationRunId: "run-stage1" as CoordinationRunId,
        targetAgentId: "bob" as AgentId,
        intent: {
          kind: "agent.ensure-pane",
          identity: agentIdentity,
          paneClass: "paired-primary",
          surface: "provider-tui",
          placement: "beside-chair",
        },
      });

      const result = await (fabric as unknown as {
        runHerdrPresencePass(): Promise<unknown>;
      }).runHerdrPresencePass();
      expect(result).toEqual({ status: "completed", observed: 1, degraded: 0 });
      const database = new Database(fixture.databasePath, { readonly: true });
      try {
        const row = database.prepare(`
          SELECT state, discovered_contract_json FROM integration_availability
           WHERE integration_id='herdr-control-v1'
        `).get() as { state: string; discovered_contract_json: string };
        expect(row.state).toBe("available");
        expect(JSON.parse(row.discovered_contract_json)).toMatchObject({
          schemaVersion: 1,
          generation: 1,
          operationFamily: "herdr-control-v1",
          presence: [{
            coordinationRunId: "run-stage1",
            agentId: "bob",
            state: "available",
            paneRef: "w2:p2",
            readiness: "ready",
          }],
        });
      } finally {
        database.close();
      }
    } finally {
      await fabric.close();
      await rm(fixture.directory, { recursive: true, force: true });
    }
  });

  it("records visibility degradation and recovery without inferring task or provider state from a pane", async () => {
    const fixture = await createStage1Fixture();
    const ready = await fixture.chair.createTask({
      taskId: "herdr-presence-task",
      authorityId: fixture.authorities.bob,
      eligibleAgentIds: ["bob"],
      objective: "remain active across visibility loss",
      baseRevision: "base-presence",
      commandId: "herdr:presence:task:create",
    });
    await fixture.bob.claimTask({
      taskId: ready.taskId,
      expectedRevision: ready.revision,
      commandId: "herdr:presence:task:claim",
    });
    await fixture.fabric.close();
    const identity = projectIdentity(fixture.databasePath);
    seedProviderIdentity(fixture.databasePath);
    setSessionActive(fixture.databasePath);
    let presenceAvailable = true;
    const fabric = await openFabric({
      databasePath: fixture.databasePath,
      workspaceRoots: [fixture.directory],
      clock: fixture.clock.now,
      herdr: {
        mode: "enabled",
        createIntegration: async ({ fabricJournal }: any) => ({
          execute: async (actionId: ProviderActionId, intent: { kind: string }) => {
            const prepared = await fabricJournal.readAction(actionId);
            const dispatched = await fabricJournal.markDispatched(actionId, prepared.revision);
            return await fabricJournal.completeAction(actionId, dispatched.revision, {
              status: "applied",
              operation: intent.kind,
              paneRef: "w4:p5",
            });
          },
          lookupAction: async () => ({ status: "unknown" as const }),
          reconcilePresence: async () => presenceAvailable
            ? { readiness: "ready" as const, ready: true as const, paneRef: "w4:p5" }
            : {
                readiness: "visibility-degraded" as const,
                ready: false as const,
                paneRef: null,
                reason: "structured Herdr presence unavailable",
                providerState: "unknown" as const,
              },
        }),
      },
    } as never);
    try {
      await ensureBobPane(fabric, identity, "herdr-agent-pane-loss-01");
      await (fabric as any).runHerdrPresencePass();
      presenceAvailable = false;
      await expect((fabric as any).runHerdrPresencePass()).resolves.toEqual({
        status: "completed",
        observed: 1,
        degraded: 1,
      });
      expect(readCoordinationState(fixture.databasePath)).toEqual({
        session_state: "visibility_degraded",
        run_state: "visibility_degraded",
        task_state: "active",
        agent_lifecycle: "ready",
        provider_session_ref: "thread-bob",
      });

      presenceAvailable = true;
      await (fabric as any).runHerdrPresencePass();
      expect(readCoordinationState(fixture.databasePath)).toMatchObject({
        session_state: "active",
        run_state: "active",
        task_state: "active",
        agent_lifecycle: "ready",
        provider_session_ref: "thread-bob",
      });
    } finally {
      await fabric.close();
      await rm(fixture.directory, { recursive: true, force: true });
    }
  });

  it("leaves prepared actions undispatched and recovers dispatched actions by lookup only after restart", async () => {
    const fixture = await createStage1Fixture();
    await fixture.fabric.close();
    const identity = projectIdentity(fixture.databasePath);
    const beforeRestart = await openFabric({
      databasePath: fixture.databasePath,
      workspaceRoots: [fixture.directory],
      clock: fixture.clock.now,
      herdr: {
        mode: "enabled",
        createIntegration: async ({ fabricJournal }: any) => ({
          execute: async (actionId: ProviderActionId) => {
            const prepared = await fabricJournal.readAction(actionId);
            if (actionId === "herdr-restart-prepared") return prepared;
            return await fabricJournal.markDispatched(actionId, prepared.revision);
          },
          lookupAction: async () => ({ status: "unknown" as const }),
          reconcilePresence: async () => ({
            readiness: "visibility-degraded" as const,
            ready: false as const,
            paneRef: null,
            reason: "unused",
            providerState: "unknown" as const,
          }),
        }),
      },
    } as never);
    const actionRequest = (actionId: string) => ({
      actionId: actionId as ProviderActionId,
      projectId: identity.projectId,
      projectSessionId: identity.projectSessionId,
      coordinationRunId: "run-stage1" as CoordinationRunId,
      targetAgentId: null,
      intent: {
        kind: "console.ensure-pane" as const,
        projectId: identity.projectId,
        projectSessionId: identity.projectSessionId,
        profileId: "agent-fabric-console" as const,
      },
    });
    await (beforeRestart as any).executeHerdrAction(actionRequest("herdr-restart-prepared"));
    await (beforeRestart as any).executeHerdrAction(actionRequest("herdr-restart-dispatched"));
    await beforeRestart.close();

    const lookups: string[] = [];
    const afterRestart = await openFabric({
      databasePath: fixture.databasePath,
      workspaceRoots: [fixture.directory],
      clock: fixture.clock.now,
      herdr: {
        mode: "enabled",
        createIntegration: async () => ({
          execute: async () => { throw new Error("restart must never redispatch"); },
          lookupAction: async (actionId: ProviderActionId) => {
            lookups.push(actionId);
            return {
              status: "observed" as const,
              receipt: {
                status: "applied" as const,
                operation: "console.ensure-pane" as const,
                paneRef: "w6:p7",
              },
            };
          },
          reconcilePresence: async () => ({
            readiness: "visibility-degraded" as const,
            ready: false as const,
            paneRef: null,
            reason: "unused",
            providerState: "unknown" as const,
          }),
        }),
      },
    } as never);
    try {
      await afterRestart.recoverStartupState();
      expect(lookups).toEqual(["herdr-restart-dispatched"]);
      const database = new Database(fixture.databasePath, { readonly: true });
      try {
        expect(database.prepare(`
          SELECT action_id, status FROM provider_actions
           WHERE adapter_id='herdr-control-v1'
           ORDER BY action_id
        `).all()).toEqual([
          { action_id: "herdr-restart-dispatched", status: "terminal" },
          { action_id: "herdr-restart-prepared", status: "prepared" },
        ]);
      } finally {
        database.close();
      }
    } finally {
      await afterRestart.close();
      await rm(fixture.directory, { recursive: true, force: true });
    }
  });

  it("owns recovery_required only while a post-dispatch Herdr outcome lacks terminal evidence", async () => {
    const fixture = await createStage1Fixture();
    await fixture.fabric.close();
    const identity = projectIdentity(fixture.databasePath);
    setSessionActive(fixture.databasePath);
    const request = {
      actionId: "herdr-recovery-state-action" as ProviderActionId,
      projectId: identity.projectId,
      projectSessionId: identity.projectSessionId,
      coordinationRunId: "run-stage1" as CoordinationRunId,
      targetAgentId: null,
      intent: {
        kind: "console.ensure-pane" as const,
        projectId: identity.projectId,
        projectSessionId: identity.projectSessionId,
        profileId: "agent-fabric-console" as const,
      },
    };
    const beforeRestart = await openFabric({
      databasePath: fixture.databasePath,
      workspaceRoots: [fixture.directory],
      clock: fixture.clock.now,
      herdr: {
        mode: "enabled",
        createIntegration: async ({ fabricJournal }: any) => ({
          execute: async (actionId: ProviderActionId) => {
            const prepared = await fabricJournal.readAction(actionId);
            return await fabricJournal.markDispatched(actionId, prepared.revision);
          },
          lookupAction: async () => ({ status: "unknown" as const }),
          reconcilePresence: async () => ({ readiness: "visibility-degraded", ready: false, paneRef: null }),
        }),
      },
    } as never);
    await (beforeRestart as any).executeHerdrAction(request);
    await beforeRestart.close();

    const unresolved = await openFabric({
      databasePath: fixture.databasePath,
      workspaceRoots: [fixture.directory],
      clock: fixture.clock.now,
      herdr: {
        mode: "enabled",
        createIntegration: async () => ({
          execute: async () => { throw new Error("recovery must not dispatch"); },
          lookupAction: async () => ({ status: "unknown" as const }),
          reconcilePresence: async () => ({ readiness: "visibility-degraded", ready: false, paneRef: null }),
        }),
      },
    } as never);
    await unresolved.recoverStartupState();
    expect(readRecoveryState(fixture.databasePath)).toMatchObject({
      session_state: "recovery_required",
      run_state: "recovery_required",
      action_state: "ambiguous",
    });
    await unresolved.close();

    const resolved = await openFabric({
      databasePath: fixture.databasePath,
      workspaceRoots: [fixture.directory],
      clock: fixture.clock.now,
      herdr: {
        mode: "enabled",
        createIntegration: async () => ({
          execute: async () => { throw new Error("recovery must not dispatch"); },
          lookupAction: async () => ({
            status: "observed" as const,
            receipt: {
              status: "applied" as const,
              operation: "console.ensure-pane" as const,
              paneRef: "w6:p8",
            },
          }),
          reconcilePresence: async () => ({ readiness: "visibility-degraded", ready: false, paneRef: null }),
        }),
      },
    } as never);
    try {
      await resolved.recoverStartupState();
      expect(readRecoveryState(fixture.databasePath)).toMatchObject({
        session_state: "active",
        run_state: "active",
        action_state: "terminal",
      });
    } finally {
      await resolved.close();
      await rm(fixture.directory, { recursive: true, force: true });
    }
  });

  it("rehydrates terminal pane bindings before a new post-restart control effect", async () => {
    const fixture = await createStage1Fixture();
    await fixture.fabric.close();
    const identity = projectIdentity(fixture.databasePath);
    seedAttention(fixture.databasePath, identity.projectSessionId, "attention-restart-01");
    const consoleIntent = {
      kind: "console.ensure-pane" as const,
      projectId: identity.projectId,
      projectSessionId: identity.projectSessionId,
      profileId: "agent-fabric-console" as const,
    };
    const beforeRestart = await openFabric({
      databasePath: fixture.databasePath,
      workspaceRoots: [fixture.directory],
      clock: fixture.clock.now,
      herdr: {
        mode: "enabled",
        createIntegration: async ({ fabricJournal }: any) => ({
          execute: async (actionId: ProviderActionId, intent: { kind: string }) => {
            const prepared = await fabricJournal.readAction(actionId);
            const dispatched = await fabricJournal.markDispatched(actionId, prepared.revision);
            return await fabricJournal.completeAction(actionId, dispatched.revision, {
              status: "applied",
              operation: intent.kind,
              paneRef: "w7:p7",
            });
          },
          lookupAction: async () => ({ status: "unknown" as const }),
          reconcilePresence: async () => ({ readiness: "visibility-degraded", ready: false, paneRef: null }),
        }),
      },
    } as never);
    await (beforeRestart as any).executeHerdrAction({
      actionId: "herdr-console-before-restart",
      projectId: identity.projectId,
      projectSessionId: identity.projectSessionId,
      coordinationRunId: "run-stage1",
      targetAgentId: null,
      intent: consoleIntent,
    });
    await beforeRestart.close();

    const restored: string[] = [];
    const afterRestart = await openFabric({
      databasePath: fixture.databasePath,
      workspaceRoots: [fixture.directory],
      clock: fixture.clock.now,
      herdr: {
        mode: "enabled",
        createIntegration: async ({ fabricJournal }: any) => ({
          restoreControlBinding: async (intent: { kind: string }) => { restored.push(intent.kind); },
          execute: async (actionId: ProviderActionId, intent: { kind: string }) => {
            expect(restored).toContain("console.ensure-pane");
            const prepared = await fabricJournal.readAction(actionId);
            const dispatched = await fabricJournal.markDispatched(actionId, prepared.revision);
            return await fabricJournal.completeAction(actionId, dispatched.revision, {
              status: "applied",
              operation: intent.kind,
            });
          },
          lookupAction: async () => ({ status: "unknown" as const }),
          reconcilePresence: async () => ({ readiness: "visibility-degraded", ready: false, paneRef: null }),
        }),
      },
    } as never);
    try {
      await expect((afterRestart as any).executeHerdrAction({
        actionId: "herdr-attention-after-restart",
        projectId: identity.projectId,
        projectSessionId: identity.projectSessionId,
        coordinationRunId: "run-stage1",
        targetAgentId: null,
        intent: {
          kind: "attention.project",
          projectId: identity.projectId,
          projectSessionId: identity.projectSessionId,
          itemId: "attention-restart-01",
          revision: 1,
          label: "FYI",
          title: "Restored binding",
        },
      })).resolves.toMatchObject({ status: "terminal" });
    } finally {
      await afterRestart.close();
      await rm(fixture.directory, { recursive: true, force: true });
    }
  });

  it("preserves last known pane presence as stale when a configured integration is unavailable after restart", async () => {
    const fixture = await createStage1Fixture();
    await fixture.fabric.close();
    const identity = projectIdentity(fixture.databasePath);
    seedProviderIdentity(fixture.databasePath);
    const beforeRestart = await openFabric({
      databasePath: fixture.databasePath,
      workspaceRoots: [fixture.directory],
      clock: fixture.clock.now,
      herdr: {
        mode: "enabled",
        createIntegration: async ({ fabricJournal }: any) => ({
          execute: async (actionId: ProviderActionId, intent: { kind: string }) => {
            const prepared = await fabricJournal.readAction(actionId);
            const dispatched = await fabricJournal.markDispatched(actionId, prepared.revision);
            return await fabricJournal.completeAction(actionId, dispatched.revision, {
              status: "applied",
              operation: intent.kind,
              paneRef: "w8:p8",
            });
          },
          lookupAction: async () => ({ status: "unknown" as const }),
          reconcilePresence: async () => ({
            readiness: "ready" as const,
            ready: true as const,
            paneRef: "w8:p8",
          }),
        }),
      },
    } as never);
    await ensureBobPane(beforeRestart, identity, "herdr-stale-pane-action-01");
    await (beforeRestart as any).runHerdrPresencePass();
    await beforeRestart.close();

    const afterRestart = await openFabric({
      databasePath: fixture.databasePath,
      workspaceRoots: [fixture.directory],
      clock: fixture.clock.now,
      herdr: {
        mode: "enabled",
        createIntegration: async () => { throw new Error("Herdr socket unavailable"); },
      },
    } as never);
    try {
      await (afterRestart as any).runHerdrPresencePass();
      const database = new Database(fixture.databasePath, { readonly: true });
      try {
        const availability = database.prepare(`
          SELECT state, discovered_contract_json FROM integration_availability
           WHERE integration_id='herdr-control-v1'
        `).get() as { state: string; discovered_contract_json: string };
        expect(availability.state).toBe("stale");
        expect(JSON.parse(availability.discovered_contract_json)).toMatchObject({
          generation: 2,
          presence: [{
            coordinationRunId: "run-stage1",
            agentId: "bob",
            state: "available",
            paneRef: "w8:p8",
          }],
        });
      } finally {
        database.close();
      }
    } finally {
      await afterRestart.close();
      await rm(fixture.directory, { recursive: true, force: true });
    }
  });

  it("reports an enabled but unobserved integration as unavailable instead of fabricating availability", async () => {
    const fixture = await createStage1Fixture();
    await fixture.fabric.close();
    const fabric = await openFabric({
      databasePath: fixture.databasePath,
      workspaceRoots: [fixture.directory],
      clock: fixture.clock.now,
      herdr: {
        mode: "enabled",
        createIntegration: async () => { throw new Error("must not probe without a bound presence or action"); },
      },
    } as never);
    try {
      await expect((fabric as any).runHerdrPresencePass()).resolves.toEqual({
        status: "completed",
        observed: 0,
        degraded: 0,
      });
      const database = new Database(fixture.databasePath, { readonly: true });
      try {
        expect(database.prepare(`
          SELECT state FROM integration_availability
           WHERE integration_id='herdr-control-v1'
        `).get()).toEqual({ state: "unavailable" });
      } finally {
        database.close();
      }
    } finally {
      await fabric.close();
      await rm(fixture.directory, { recursive: true, force: true });
    }
  });

  it("degrades malformed presence evidence without crashing a non-Herdr path", async () => {
    const fixture = await createStage1Fixture();
    await fixture.fabric.close();
    const identity = projectIdentity(fixture.databasePath);
    seedProviderIdentity(fixture.databasePath);
    setSessionActive(fixture.databasePath);
    const fabric = await openFabric({
      databasePath: fixture.databasePath,
      workspaceRoots: [fixture.directory],
      clock: fixture.clock.now,
      herdr: {
        mode: "enabled",
        createIntegration: async ({ fabricJournal }: any) => ({
          execute: async (actionId: ProviderActionId, intent: { kind: string }) => {
            const prepared = await fabricJournal.readAction(actionId);
            const dispatched = await fabricJournal.markDispatched(actionId, prepared.revision);
            return await fabricJournal.completeAction(actionId, dispatched.revision, {
              status: "applied",
              operation: intent.kind,
              paneRef: "w8:p9",
            });
          },
          lookupAction: async () => ({ status: "unknown" as const }),
          reconcilePresence: async () => ({ readiness: "ready", paneRef: "w8:p9" }),
        }),
      },
    } as never);
    try {
      await ensureBobPane(fabric, identity, "herdr-malformed-presence-action-01");
      await expect((fabric as any).runHerdrPresencePass()).resolves.toEqual({
        status: "completed",
        observed: 1,
        degraded: 1,
      });
      expect(readVisibilityState(fixture.databasePath)).toMatchObject({
        session_state: "visibility_degraded",
        run_state: "visibility_degraded",
        agent_lifecycle: "ready",
      });
    } finally {
      await fabric.close();
      await rm(fixture.directory, { recursive: true, force: true });
    }
  });

  it("skips an overlapping presence poll instead of starting a second Herdr observation", async () => {
    const fixture = await createStage1Fixture();
    await fixture.fabric.close();
    const identity = projectIdentity(fixture.databasePath);
    seedProviderIdentity(fixture.databasePath);
    let releasePresence: (() => void) | undefined;
    const presenceGate = new Promise<void>((resolve) => { releasePresence = resolve; });
    let presenceCalls = 0;
    const fabric = await openFabric({
      databasePath: fixture.databasePath,
      workspaceRoots: [fixture.directory],
      clock: fixture.clock.now,
      herdr: {
        mode: "enabled",
        createIntegration: async ({ fabricJournal }: any) => ({
          execute: async (actionId: ProviderActionId, intent: { kind: string }) => {
            const prepared = await fabricJournal.readAction(actionId);
            const dispatched = await fabricJournal.markDispatched(actionId, prepared.revision);
            return await fabricJournal.completeAction(actionId, dispatched.revision, {
              status: "applied",
              operation: intent.kind,
              paneRef: "w9:p9",
            });
          },
          lookupAction: async () => ({ status: "unknown" as const }),
          reconcilePresence: async () => {
            presenceCalls += 1;
            await presenceGate;
            return { readiness: "ready" as const, ready: true as const, paneRef: "w9:p9" };
          },
        }),
      },
    } as never);
    try {
      await ensureBobPane(fabric, identity, "herdr-overlap-pane-action-01");
      const first = (fabric as any).runHerdrPresencePass();
      await new Promise<void>((resolve) => setImmediate(resolve));
      const second = (fabric as any).runHerdrPresencePass();
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(presenceCalls).toBe(1);
      await expect(second).resolves.toEqual({ status: "skipped-overlap", observed: 0, degraded: 0 });
      releasePresence?.();
      await expect(first).resolves.toEqual({ status: "completed", observed: 1, degraded: 0 });
    } finally {
      releasePresence?.();
      await fabric.close();
      await rm(fixture.directory, { recursive: true, force: true });
    }
  });

  it("rejects an open or malformed Herdr intent before creating durable custody", async () => {
    const fixture = await createStage1Fixture();
    await fixture.fabric.close();
    const identity = projectIdentity(fixture.databasePath);
    seedProviderIdentity(fixture.databasePath);
    const fabric = await openFabric({
      databasePath: fixture.databasePath,
      workspaceRoots: [fixture.directory],
      clock: fixture.clock.now,
      herdr: {
        mode: "enabled",
        createIntegration: async () => ({
          execute: async () => { throw new Error("malformed intent reached effect boundary"); },
          lookupAction: async () => ({ status: "unknown" as const }),
          reconcilePresence: async () => ({
            readiness: "visibility-degraded" as const,
            ready: false as const,
            paneRef: null,
            reason: "unused",
            providerState: "unknown" as const,
          }),
        }),
      },
    } as never);
    try {
      await expect((fabric as any).executeHerdrAction({
        actionId: "herdr-open-intent-action-01",
        projectId: identity.projectId,
        projectSessionId: identity.projectSessionId,
        coordinationRunId: "run-stage1",
        targetAgentId: null,
        intent: {
          kind: "console.ensure-pane",
          projectId: identity.projectId,
          projectSessionId: identity.projectSessionId,
          profileId: "agent-fabric-console",
          arbitraryCommand: "pane delete --all",
        },
      })).rejects.toThrow("closed");
      await expect((fabric as any).executeHerdrAction({
        actionId: "herdr-wrong-provider-identity-01",
        projectId: identity.projectId,
        projectSessionId: identity.projectSessionId,
        coordinationRunId: "run-stage1",
        targetAgentId: "bob",
        intent: {
          kind: "agent.ensure-pane",
          identity: {
            projectId: identity.projectId,
            projectSessionId: identity.projectSessionId,
            coordinationRunId: "run-stage1",
            agentId: "bob",
            provider: "codex-app-server",
            modelFamily: "openai",
            providerSessionRef: "thread-other",
            providerSessionGeneration: 2,
          },
          paneClass: "paired-primary",
          surface: "provider-tui",
          placement: "beside-chair",
        },
      })).rejects.toThrow("provider session");
      const database = new Database(fixture.databasePath, { readonly: true });
      try {
        expect(database.prepare(`
          SELECT COUNT(*) AS count FROM provider_actions
           WHERE adapter_id='herdr-control-v1'
        `).get()).toEqual({ count: 0 });
      } finally {
        database.close();
      }
    } finally {
      await fabric.close();
      await rm(fixture.directory, { recursive: true, force: true });
    }
  });

  it("keeps disabled mode typed but still rejects an open action family without custody", async () => {
    const fixture = await createStage1Fixture();
    await fixture.fabric.close();
    const identity = projectIdentity(fixture.databasePath);
    const fabric = await openFabric({
      databasePath: fixture.databasePath,
      workspaceRoots: [fixture.directory],
      clock: fixture.clock.now,
      herdr: { mode: "disabled" },
    } as never);
    const request = {
      actionId: "herdr-disabled-action-01",
      projectId: identity.projectId,
      projectSessionId: identity.projectSessionId,
      coordinationRunId: "run-stage1",
      targetAgentId: null,
      intent: {
        kind: "console.ensure-pane",
        projectId: identity.projectId,
        projectSessionId: identity.projectSessionId,
        profileId: "agent-fabric-console",
      },
    };
    try {
      await expect((fabric as any).executeHerdrAction(request)).resolves.toEqual({
        status: "unavailable",
        integration: "herdr-control-v1",
        reason: "disabled",
      });
      await expect((fabric as any).executeHerdrAction({
        ...request,
        actionId: "herdr-disabled-open-action-01",
        intent: { ...request.intent, arbitraryCommand: "pane delete --all" },
      })).rejects.toThrow("closed");
      const database = new Database(fixture.databasePath, { readonly: true });
      try {
        expect(database.prepare(`
          SELECT COUNT(*) AS count FROM provider_actions
           WHERE adapter_id='herdr-control-v1'
        `).get()).toEqual({ count: 0 });
      } finally {
        database.close();
      }
    } finally {
      await fabric.close();
      await rm(fixture.directory, { recursive: true, force: true });
    }
  });

  it("dispatches validated direct steering through the public agent operation with exact replay", async () => {
    const fixture = await createStage1Fixture();
    const ready = await fixture.chair.createTask({
      taskId: "herdr-direct-steer-task",
      authorityId: fixture.authorities.bob,
      eligibleAgentIds: ["bob"],
      objective: "accept bounded one-way steering",
      baseRevision: "base-steer",
      commandId: "herdr:direct:task:create",
    });
    const active = await fixture.bob.claimTask({
      taskId: ready.taskId,
      expectedRevision: ready.revision,
      commandId: "herdr:direct:task:claim",
    });
    await fixture.fabric.close();
    const identity = projectIdentity(fixture.databasePath);
    seedProviderIdentity(fixture.databasePath);
    const effects: string[] = [];
    const fabric = await openFabric({
      databasePath: fixture.databasePath,
      workspaceRoots: [fixture.directory],
      clock: fixture.clock.now,
      herdr: {
        mode: "enabled",
        createIntegration: async ({ fabricJournal }: any) => {
          expect(await fabricJournal.readAction("herdr-direct-steer-action-01" as ProviderActionId)).toMatchObject({
            status: "prepared",
            revision: 1,
          });
          return ({
          execute: async (actionId: ProviderActionId, intent: { kind: string }) => {
            effects.push(actionId);
            const prepared = await fabricJournal.readAction(actionId);
            const dispatched = await fabricJournal.markDispatched(actionId, prepared.revision);
            return await fabricJournal.completeAction(actionId, dispatched.revision, {
              status: "dispatched-unconfirmed",
              operation: intent.kind,
              referenceValidation: "verified",
              deliveryEvidence: "none",
              canSatisfyExpectedResult: false,
              canCloseBarrier: false,
            });
          },
          lookupAction: async () => ({ status: "unknown" as const }),
          reconcilePresence: async () => ({
            readiness: "ready" as const,
            ready: true as const,
            paneRef: "w10:p10",
          }),
          });
        },
      },
    } as never);
    try {
      const request = {
        actionId: "herdr-direct-steer-action-01",
        fireAndForget: true,
        targetAgentId: "bob",
        paneRef: "w10:p10",
        reference: {
          kind: "task",
          taskId: active.taskId,
          expectedRevision: active.revision,
        },
        prompt: "Pause after the current bounded check.",
      };
      const context = {
        principal: {
          kind: "agent" as const,
          agentId: "chair" as AgentId,
          projectSessionId: identity.projectSessionId,
          runId: "run-stage1",
          principalGeneration: 1,
        },
        allowedOperations: new Set([FABRIC_OPERATIONS.herdrSteerDispatch]),
        features: ["herdr-control.v1" as const],
        connectionNonce: "herdr_public_dispatch_nonce",
        credentialHash: createHash("sha256").update(fixture.run.chairCapability).digest("hex"),
        daemonInstanceGeneration: 1,
      };
      const dispatch = (input: typeof request) => (fabric as any).dispatchPublicProtocol(
        context,
        FABRIC_OPERATIONS.herdrSteerDispatch,
        input,
      );
      await expect(dispatch(request)).resolves.toMatchObject({
        status: "terminal",
        receipt: {
          referenceValidation: "verified",
          deliveryEvidence: "none",
          canSatisfyExpectedResult: false,
          canCloseBarrier: false,
        },
      });
      await expect(dispatch(request)).resolves.toMatchObject({ status: "terminal" });
      await expect(dispatch({
        ...request,
        prompt: "Changed payload under the same action identity.",
      })).rejects.toThrow("reused with changed run, principal or input");
      await expect(dispatch({
        ...request,
        actionId: "herdr-direct-steer-unknown-01",
        reference: { ...request.reference, taskId: "unknown-task" },
      })).resolves.toEqual({ status: "rejected", reason: "unknown-reference" });
      expect(effects).toEqual([request.actionId]);
    } finally {
      await fabric.close();
      await rm(fixture.directory, { recursive: true, force: true });
    }
  });

  it("admits every closed herdr-control-v1 applied operation through the same custody owner", async () => {
    const fixture = await createStage1Fixture();
    await fixture.fabric.close();
    const identity = projectIdentity(fixture.databasePath);
    seedProviderIdentity(fixture.databasePath);
    seedAttention(fixture.databasePath, identity.projectSessionId);
    const effects: string[] = [];
    const fabric = await openFabric({
      databasePath: fixture.databasePath,
      workspaceRoots: [fixture.directory],
      clock: fixture.clock.now,
      herdr: {
        mode: "enabled",
        createIntegration: async ({ fabricJournal }: any) => ({
          execute: async (actionId: ProviderActionId, intent: { kind: string }) => {
            effects.push(intent.kind);
            const prepared = await fabricJournal.readAction(actionId);
            const dispatched = await fabricJournal.markDispatched(actionId, prepared.revision);
            return await fabricJournal.completeAction(actionId, dispatched.revision, {
              status: "applied",
              operation: intent.kind,
              paneRef: "w11:p11",
            });
          },
          lookupAction: async () => ({ status: "unknown" as const }),
          reconcilePresence: async () => ({ readiness: "ready" as const, ready: true as const, paneRef: "w11:p11" }),
        }),
      },
    } as never);
    const agentIdentity = {
      projectId: identity.projectId,
      projectSessionId: identity.projectSessionId,
      coordinationRunId: "run-stage1",
      agentId: "bob",
      provider: "codex-app-server",
      modelFamily: "openai",
      providerSessionRef: "thread-bob",
      providerSessionGeneration: 2,
    };
    const operations = [
      { targetAgentId: null, intent: { kind: "console.ensure-pane", projectId: identity.projectId, projectSessionId: identity.projectSessionId, profileId: "agent-fabric-console" } },
      { targetAgentId: "bob", intent: { kind: "agent.ensure-pane", identity: agentIdentity, paneClass: "paired-primary", surface: "provider-tui", placement: "beside-chair" } },
      { targetAgentId: null, intent: { kind: "panes.arrange", paneRefs: ["w11:p11"], layout: "workspace-default" } },
      { targetAgentId: "bob", intent: { kind: "agent.project-metadata", agentId: "bob", paneRef: "w11:p11", metadata: { role: "worker", provider: "codex-app-server", modelFamily: "openai", taskLabel: "bounded task", lifecycle: "ready", contextPressure: "low" } } },
      { targetAgentId: null, intent: { kind: "attention.project", projectId: identity.projectId, projectSessionId: identity.projectSessionId, itemId: "attention-herdr-01", revision: 1, label: "FYI", title: "Bounded attention" } },
      { targetAgentId: "bob", intent: { kind: "target.focus", target: { kind: "agent-pane", agentId: "bob", paneRef: "w11:p11" } } },
      { targetAgentId: "bob", intent: { kind: "agent.wake", agentId: "bob", paneRef: "w11:p11" } },
      { targetAgentId: null, intent: { kind: "notification.show", attentionItemId: "attention-herdr-01", attentionRevision: 1, title: "Bounded notification", body: "Open the Console.", focusTarget: null } },
    ] as const;
    try {
      for (const [index, operation] of operations.entries()) {
        await expect((fabric as any).executeHerdrAction({
          actionId: `herdr-closed-${String(index + 1).padStart(2, "0")}`,
          projectId: identity.projectId,
          projectSessionId: identity.projectSessionId,
          coordinationRunId: "run-stage1",
          targetAgentId: operation.targetAgentId,
          intent: operation.intent,
        })).resolves.toMatchObject({ status: "terminal" });
      }
      expect(effects).toEqual(operations.map((operation) => operation.intent.kind));
    } finally {
      await fabric.close();
      await rm(fixture.directory, { recursive: true, force: true });
    }
  });
});

function projectIdentity(databasePath: string): {
  projectId: ProjectId;
  projectSessionId: ProjectSessionId;
} {
  const database = new Database(databasePath, { readonly: true });
  try {
    const value = database.prepare(`
      SELECT project.project_id, session.project_session_id
        FROM projects project
        JOIN project_sessions session ON session.project_id=project.project_id
        JOIN runs run ON run.project_session_id=session.project_session_id
       WHERE run.run_id='run-stage1'
    `).get() as { project_id: string; project_session_id: string };
    return {
      projectId: value.project_id as ProjectId,
      projectSessionId: value.project_session_id as ProjectSessionId,
    };
  } finally {
    database.close();
  }
}

function seedProviderIdentity(databasePath: string): void {
  const database = new Database(databasePath);
  try {
    database.pragma("foreign_keys = ON");
    database.prepare(`
      UPDATE agents SET provider_session_ref='thread-bob'
       WHERE run_id='run-stage1' AND agent_id='bob'
    `).run();
    database.prepare(`
      INSERT INTO provider_state(
        run_id, agent_id, provider_session_generation, context_revision,
        reconciled_checkpoint_sha256
      ) VALUES ('run-stage1', 'bob', 2, NULL, NULL)
    `).run();
    database.prepare(`
      INSERT INTO agent_adapter_bindings(run_id, agent_id, adapter_id, bound_at)
      VALUES ('run-stage1', 'bob', 'codex-app-server', 1)
    `).run();
  } finally {
    database.close();
  }
}

function setSessionActive(databasePath: string): void {
  const database = new Database(databasePath);
  try {
    database.pragma("foreign_keys = ON");
    database.prepare(`
      UPDATE project_sessions
         SET state='active', revision=revision+1, updated_at=updated_at+1
       WHERE project_session_id=(
        SELECT project_session_id FROM runs WHERE run_id='run-stage1'
      )
    `).run();
    database.prepare(`
      UPDATE runs SET lifecycle_state='active', revision=revision+1
       WHERE run_id='run-stage1'
    `).run();
  } finally {
    database.close();
  }
}

function seedAttention(
  databasePath: string,
  projectSessionId: ProjectSessionId,
  itemId = "attention-herdr-01",
): void {
  const database = new Database(databasePath);
  try {
    database.pragma("foreign_keys = ON");
    database.prepare(`
      INSERT INTO attention_items(
        item_id, project_session_id, coordination_run_id, kind, severity,
        revision, state, dedupe_key, payload_json, created_at, updated_at
      ) VALUES (?, ?, 'run-stage1', 'test', 'info', 1, 'open', ?, '{}', 1, 1)
    `).run(itemId, projectSessionId, itemId);
  } finally {
    database.close();
  }
}

async function ensureBobPane(
  fabric: unknown,
  identity: { projectId: ProjectId; projectSessionId: ProjectSessionId },
  actionId: string,
): Promise<void> {
  await (fabric as any).executeHerdrAction({
    actionId: actionId as ProviderActionId,
    projectId: identity.projectId,
    projectSessionId: identity.projectSessionId,
    coordinationRunId: "run-stage1" as CoordinationRunId,
    targetAgentId: "bob" as AgentId,
    intent: {
      kind: "agent.ensure-pane",
      identity: {
        projectId: identity.projectId,
        projectSessionId: identity.projectSessionId,
        coordinationRunId: "run-stage1",
        agentId: "bob",
        provider: "codex-app-server",
        modelFamily: "openai",
        providerSessionRef: "thread-bob",
        providerSessionGeneration: 2,
      },
      paneClass: "paired-primary",
      surface: "provider-tui",
      placement: "beside-chair",
    },
  });
}

function readCoordinationState(databasePath: string): {
  session_state: string;
  run_state: string;
  task_state: string;
  agent_lifecycle: string;
  provider_session_ref: string;
} {
  const database = new Database(databasePath, { readonly: true });
  try {
    return database.prepare(`
      SELECT session.state AS session_state, run.lifecycle_state AS run_state,
             task.state AS task_state, agent.lifecycle AS agent_lifecycle,
             agent.provider_session_ref
        FROM runs run
        JOIN project_sessions session ON session.project_session_id=run.project_session_id
        JOIN tasks task ON task.run_id=run.run_id AND task.task_id='herdr-presence-task'
        JOIN agents agent ON agent.run_id=run.run_id AND agent.agent_id='bob'
       WHERE run.run_id='run-stage1'
    `).get() as ReturnType<typeof readCoordinationState>;
  } finally {
    database.close();
  }
}

function readVisibilityState(databasePath: string): {
  session_state: string;
  run_state: string;
  agent_lifecycle: string;
} {
  const database = new Database(databasePath, { readonly: true });
  try {
    return database.prepare(`
      SELECT session.state AS session_state, run.lifecycle_state AS run_state,
             agent.lifecycle AS agent_lifecycle
        FROM runs run
        JOIN project_sessions session ON session.project_session_id=run.project_session_id
        JOIN agents agent ON agent.run_id=run.run_id AND agent.agent_id='bob'
       WHERE run.run_id='run-stage1'
    `).get() as ReturnType<typeof readVisibilityState>;
  } finally {
    database.close();
  }
}

function readRecoveryState(databasePath: string): {
  session_state: string;
  run_state: string;
  action_state: string;
} {
  const database = new Database(databasePath, { readonly: true });
  try {
    return database.prepare(`
      SELECT session.state AS session_state, run.lifecycle_state AS run_state,
             action.status AS action_state
        FROM runs run
        JOIN project_sessions session ON session.project_session_id=run.project_session_id
        JOIN provider_actions action ON action.run_id=run.run_id
       WHERE run.run_id='run-stage1' AND action.action_id='herdr-recovery-state-action'
    `).get() as ReturnType<typeof readRecoveryState>;
  } finally {
    database.close();
  }
}
