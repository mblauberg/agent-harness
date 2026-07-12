import { describe, expect, it } from "vitest";

import type { AgentId, ProviderActionId } from "@local/agent-fabric-protocol";

import { HerdrAdapter, digestHerdrIntent } from "../src/herdr-adapter.js";
import type {
  FabricActionJournalPort,
  HerdrActionRecord,
  HerdrControlPort,
  HerdrEffectReceipt,
  HerdrIntent,
  HerdrPaneRef,
} from "../src/contracts.js";

const actionId = "herdr-action-ambiguous" as ProviderActionId;
const intent: HerdrIntent = {
  kind: "agent.wake",
  agentId: "agent-01" as AgentId,
  paneRef: "window-1:pane-2" as HerdrPaneRef,
};

describe("ambiguous Herdr effects", () => {
  it("looks up an uncertain effect and never blindly executes it twice", async () => {
    const journal = mutableJournal();
    let effects = 0;
    let lookups = 0;
    const control: HerdrControlPort = {
      lookupAction: async () => {
        lookups += 1;
        return { status: "unknown" };
      },
      ensureConsolePane: async () => unexpected(),
      ensureAgentPane: async () => unexpected(),
      arrangePanes: async () => unexpected(),
      projectAgentMetadata: async () => unexpected(),
      projectAttention: async () => unexpected(),
      focusTarget: async () => unexpected(),
      wakeAgent: async () => {
        effects += 1;
        throw new Error("control socket closed after write");
      },
      showNotification: async () => unexpected(),
      injectDirectSteer: async () => unexpected(),
    };
    const adapter = new HerdrAdapter({
      journal,
      control,
      presence: { observeAgent: async () => unexpected() },
    });

    const first = await adapter.execute(actionId, intent);
    const second = await adapter.execute(actionId, intent);

    expect(first).toMatchObject({
      status: "ambiguous",
      ambiguityReason: "Herdr effect outcome is unknown; automatic replay is forbidden",
    });
    expect(second).toEqual(first);
    expect(effects).toBe(1);
    expect(lookups).toBe(2);
  });

  it("reconciles an already-dispatched action from lookup without another effect", async () => {
    const journal = mutableJournal("dispatched");
    let effects = 0;
    const receipt: HerdrEffectReceipt = { status: "applied", operation: "agent.wake" };
    const adapter = new HerdrAdapter({
      journal,
      control: {
        lookupAction: async () => ({ status: "observed", receipt }),
        ensureConsolePane: async () => countAndFail(),
        ensureAgentPane: async () => countAndFail(),
        arrangePanes: async () => countAndFail(),
        projectAgentMetadata: async () => countAndFail(),
        projectAttention: async () => countAndFail(),
        focusTarget: async () => countAndFail(),
        wakeAgent: async () => countAndFail(),
        showNotification: async () => countAndFail(),
        injectDirectSteer: async () => countAndFail(),
      },
      presence: { observeAgent: async () => unexpected() },
    });

    const result = await adapter.execute(actionId, intent);

    expect(result).toMatchObject({ status: "terminal", receipt });
    expect(effects).toBe(0);

    function countAndFail(): never {
      effects += 1;
      return unexpected();
    }
  });
});

function mutableJournal(initialStatus: HerdrActionRecord["status"] = "prepared"): FabricActionJournalPort {
  let record: HerdrActionRecord = {
    actionId,
    revision: 1,
    intentDigest: digestHerdrIntent(intent),
    status: initialStatus,
  };
  return {
    readAction: async () => record,
    markDispatched: async (_actionId, expectedRevision) => {
      expect(expectedRevision).toBe(record.revision);
      record = { ...record, revision: record.revision + 1, status: "dispatched" };
      return record;
    },
    completeAction: async (_actionId, expectedRevision, receipt) => {
      expect(expectedRevision).toBe(record.revision);
      record = { ...record, revision: record.revision + 1, status: "terminal", receipt };
      return record;
    },
    markAmbiguous: async (_actionId, expectedRevision, reason) => {
      expect(expectedRevision).toBe(record.revision);
      record = {
        ...record,
        revision: record.revision + 1,
        status: "ambiguous",
        ambiguityReason: reason,
      };
      return record;
    },
  };
}

function unexpected(): never {
  throw new Error("unexpected call");
}
