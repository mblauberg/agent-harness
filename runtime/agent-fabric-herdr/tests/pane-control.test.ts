import { describe, expect, it } from "vitest";

import type {
  AgentId,
  ProjectId,
  ProjectSessionId,
  ProviderActionId,
} from "@local/agent-fabric-protocol";

import { HerdrAdapter, digestHerdrIntent } from "../src/herdr-adapter.js";
import type {
  FabricActionJournalPort,
  HerdrActionRecord,
  HerdrControlPort,
  HerdrIntent,
  HerdrPaneObservation,
  HerdrPaneRef,
  HerdrPresencePort,
} from "../src/contracts.js";

const actionId = "herdr-action-01" as ProviderActionId;
const paneRef = "window-1:pane-2" as HerdrPaneRef;

class FakeJournal implements FabricActionJournalPort {
  readonly transitions: string[] = [];
  record: HerdrActionRecord;

  constructor(intent: HerdrIntent) {
    this.record = {
      actionId,
      revision: 1,
      intentDigest: digestHerdrIntent(intent),
      status: "prepared",
    };
  }

  async readAction(requestedActionId: ProviderActionId): Promise<HerdrActionRecord | null> {
    expect(requestedActionId).toBe(actionId);
    return this.record;
  }

  async markDispatched(requestedActionId: ProviderActionId, expectedRevision: number): Promise<HerdrActionRecord> {
    expect([requestedActionId, expectedRevision]).toEqual([actionId, this.record.revision]);
    this.transitions.push("dispatched");
    this.record = { ...this.record, revision: this.record.revision + 1, status: "dispatched" };
    return this.record;
  }

  async completeAction(
    requestedActionId: ProviderActionId,
    expectedRevision: number,
    receipt: HerdrActionRecord["receipt"] & {},
  ): Promise<HerdrActionRecord> {
    expect([requestedActionId, expectedRevision]).toEqual([actionId, this.record.revision]);
    this.transitions.push("terminal");
    this.record = {
      ...this.record,
      revision: this.record.revision + 1,
      status: "terminal",
      receipt,
    };
    return this.record;
  }

  async markAmbiguous(
    requestedActionId: ProviderActionId,
    expectedRevision: number,
    reason: string,
  ): Promise<HerdrActionRecord> {
    expect([requestedActionId, expectedRevision]).toEqual([actionId, this.record.revision]);
    this.transitions.push("ambiguous");
    this.record = {
      ...this.record,
      revision: this.record.revision + 1,
      status: "ambiguous",
      ambiguityReason: reason,
    };
    return this.record;
  }
}

function fakePresence(): HerdrPresencePort {
  return {
    observeAgent: async (): Promise<HerdrPaneObservation> => ({
      state: "unavailable",
      observedAt: "2026-07-11T01:00:00Z" as never,
      reason: "not used",
    }),
  };
}

describe("typed Herdr control", () => {
  it("commits dispatch before executing a typed Console-pane action", async () => {
    const intent: HerdrIntent = {
      kind: "console.ensure-pane",
      projectId: "project-01" as ProjectId,
      projectSessionId: "session-01" as ProjectSessionId,
      profileId: "agent-fabric-console",
    };
    const journal = new FakeJournal(intent);
    const calls: string[] = [];
    const control: HerdrControlPort = {
      lookupAction: async () => ({ status: "unknown" }),
      ensureConsolePane: async (receivedActionId, receivedIntent) => {
        calls.push(`console:${journal.record.status}`);
        expect(receivedActionId).toBe(actionId);
        expect(receivedIntent).toEqual(intent);
        return { status: "applied", operation: intent.kind, paneRef };
      },
      ensureAgentPane: async () => unexpected(),
      arrangePanes: async () => unexpected(),
      projectAgentMetadata: async () => unexpected(),
      projectAttention: async () => unexpected(),
      focusTarget: async () => unexpected(),
      wakeAgent: async () => unexpected(),
      showNotification: async () => unexpected(),
      injectDirectSteer: async () => unexpected(),
    };
    const adapter = new HerdrAdapter({ journal, control, presence: fakePresence() });

    const result = await adapter.execute(actionId, intent);

    expect(calls).toEqual(["console:dispatched"]);
    expect(journal.transitions).toEqual(["dispatched", "terminal"]);
    expect(result).toMatchObject({
      status: "terminal",
      receipt: { status: "applied", operation: "console.ensure-pane", paneRef },
    });
  });

  it("refuses an action that Fabric has not committed", async () => {
    const intent: HerdrIntent = {
      kind: "agent.wake",
      agentId: "agent-01" as AgentId,
      paneRef,
    };
    let effects = 0;
    const control = countingControl(() => {
      effects += 1;
    });
    const adapter = new HerdrAdapter({
      journal: {
        readAction: async () => null,
        markDispatched: async () => unexpected(),
        completeAction: async () => unexpected(),
        markAmbiguous: async () => unexpected(),
      },
      control,
      presence: fakePresence(),
    });

    await expect(adapter.execute(actionId, intent)).rejects.toThrow("not committed in Fabric");
    expect(effects).toBe(0);
  });

  it("refuses a changed intent under the same stable action ID", async () => {
    const committedIntent: HerdrIntent = {
      kind: "agent.wake",
      agentId: "agent-01" as AgentId,
      paneRef,
    };
    const journal = new FakeJournal(committedIntent);
    let effects = 0;
    const adapter = new HerdrAdapter({
      journal,
      control: countingControl(() => {
        effects += 1;
      }),
      presence: fakePresence(),
    });

    await expect(
      adapter.execute(actionId, { ...committedIntent, agentId: "agent-02" as AgentId }),
    ).rejects.toThrow("does not match its committed digest");
    expect(journal.transitions).toEqual([]);
    expect(effects).toBe(0);
  });

  it("uses a key-order-independent digest for stable intent identity", () => {
    const first = {
      kind: "agent.wake",
      agentId: "agent-01" as AgentId,
      paneRef,
    } satisfies HerdrIntent;
    const second = {
      paneRef,
      agentId: "agent-01" as AgentId,
      kind: "agent.wake",
    } satisfies HerdrIntent;

    expect(digestHerdrIntent(first)).toBe(digestHerdrIntent(second));
  });

  it("rejects unbounded projected metadata before the external effect", async () => {
    const intent: HerdrIntent = {
      kind: "agent.project-metadata",
      agentId: "agent-01" as AgentId,
      paneRef,
      metadata: {
        role: "worker",
        provider: "codex",
        modelFamily: "gpt-5",
        taskLabel: "x".repeat(513),
        lifecycle: "working",
        contextPressure: "low",
      },
    };
    const journal = new FakeJournal(intent);
    let effects = 0;
    const adapter = new HerdrAdapter({
      journal,
      control: countingControl(() => {
        effects += 1;
      }),
      presence: fakePresence(),
    });

    await expect(adapter.execute(actionId, intent)).rejects.toThrow("taskLabel");
    expect(journal.transitions).toEqual([]);
    expect(effects).toBe(0);
  });

  it("quarantines a receipt that names a different typed operation", async () => {
    const intent: HerdrIntent = {
      kind: "console.ensure-pane",
      projectId: "project-01" as ProjectId,
      projectSessionId: "session-01" as ProjectSessionId,
      profileId: "agent-fabric-console",
    };
    const journal = new FakeJournal(intent);
    const adapter = new HerdrAdapter({
      journal,
      control: countingControl(() => undefined),
      presence: fakePresence(),
    });

    const result = await adapter.execute(actionId, intent);

    expect(result).toMatchObject({
      status: "ambiguous",
      ambiguityReason: "Herdr effect outcome is unknown; automatic replay is forbidden",
    });
    expect(journal.transitions).toEqual(["dispatched", "ambiguous"]);
  });
});

function unexpected(): never {
  throw new Error("unexpected Herdr effect");
}

function countingControl(onEffect: () => void): HerdrControlPort {
  const effect = async () => {
    onEffect();
    return { status: "applied", operation: "agent.wake" } as const;
  };
  return {
    lookupAction: async () => ({ status: "unknown" }),
    ensureConsolePane: effect,
    ensureAgentPane: effect,
    arrangePanes: effect,
    projectAgentMetadata: effect,
    projectAttention: effect,
    focusTarget: effect,
    wakeAgent: effect,
    showNotification: effect,
    injectDirectSteer: async () => {
      onEffect();
    },
  };
}
