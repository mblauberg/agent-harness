import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ProviderActionId } from "@local/agent-fabric-protocol";
import { describe, expect, it } from "vitest";

import { HerdrEffectEvidenceJournal } from "../src/effect-journal.js";
import type { HerdrEffectReceipt } from "../src/contracts.js";

describe("Herdr adapter-local effect evidence", () => {
  it("persists one bounded receipt for lookup after process restart", async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), "fabric-herdr-evidence-")));
    const actionId = "herdr-effect-01" as ProviderActionId;
    const receipt: HerdrEffectReceipt = {
      status: "applied",
      operation: "agent.wake",
      detail: { accepted: true },
    };
    try {
      const first = new HerdrEffectEvidenceJournal({ stateDirectory: root });
      await first.record(actionId, receipt);

      const reopened = new HerdrEffectEvidenceJournal({ stateDirectory: root });
      await expect(reopened.lookupAction(actionId)).resolves.toEqual({ status: "observed", receipt });
      await expect(reopened.record(actionId, receipt)).resolves.toBeUndefined();
      await expect(reopened.record(actionId, {
        status: "applied",
        operation: "agent.wake",
        detail: { accepted: false },
      })).rejects.toThrow("conflicts");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
