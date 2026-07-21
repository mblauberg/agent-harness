import { describe, expect, it } from "vitest";

import {
  createBootstrapUnavailableDataset,
  type ConsoleConnectionStageId,
} from "../src/protocol-adapter.js";
import { createFabricUiState } from "../src/presenter.js";
import type { ConsoleControllerState } from "../src/controller.js";
import { FABRIC_VIEWS } from "../src/model.js";
import { renderConsoleSnapshot } from "../src/snapshot.js";

function readOnlyController(): ConsoleControllerState {
  return {
    activeView: "system",
    selectionByView: Object.fromEntries(FABRIC_VIEWS.map((view) => [view, null])) as never,
    scrollAnchorByView: Object.fromEntries(FABRIC_VIEWS.map((view) => [view, null])) as never,
    review: null,
    pendingCommandIds: [],
    lastActionStatus: null,
    lastReceipt: null,
    lastFailure: null,
  };
}

describe("staged Console bootstrap diagnosis", () => {
  it("preserves the failed transport stage and blocks only unexecuted downstream stages", () => {
    const dataset = createBootstrapUnavailableDataset("socket-unavailable", 1_000);
    const diagnosis = dataset.connectionDiagnosis;
    if (diagnosis === undefined) throw new Error("bootstrap diagnosis is missing");

    expect(diagnosis.causalStage).toBe<ConsoleConnectionStageId>("transport");
    expect(diagnosis.firstFailureCode).toBe("CONSOLE_SOCKET_UNAVAILABLE");
    expect(diagnosis.stages.map((stage) => [stage.id, stage.state])).toStrictEqual([
      ["configuration", "passed"],
      ["compatibility", "passed"],
      ["daemon-readiness", "passed"],
      ["transport", "failed"],
      ["handshake-authentication", "blocked"],
      ["feature-negotiation", "blocked"],
      ["project-discovery", "blocked"],
      ["session-attachment", "blocked"],
    ]);
    expect(diagnosis.stages[3]).toMatchObject({
      code: "CONSOLE_SOCKET_UNAVAILABLE",
      provenance: "observed",
      remediation: "Reconcile the trusted daemon socket, then retry bootstrap.",
      observedAt: new Date(1_000).toISOString(),
      freshness: { state: "unavailable", reason: "socket-unavailable" },
    });
    expect(diagnosis.stages[4]).toMatchObject({
      state: "blocked",
      provenance: "inferred",
      code: null,
      summary: "inferred as not executed because transport failed; not independently observed",
      freshness: {
        state: "unavailable",
        reason: "inferred-from-causal-stage:socket-unavailable",
      },
    });
    // Only the causal failed stage may claim observed provenance; every
    // earlier "passed" stage is a console-authored inference from stage
    // order, not a Fabric-observed fact.
    for (const stage of diagnosis.stages) {
      if (stage.id === "transport") continue;
      expect(stage.provenance).toBe("inferred");
      expect(stage.freshness.state).toBe("unavailable");
      if (stage.freshness.state === "unavailable") {
        expect(stage.freshness.reason).toBe(
          "inferred-from-causal-stage:socket-unavailable",
        );
      }
    }
  });

  it("does not fabricate a causal stage for an opaque bootstrap failure", () => {
    const dataset = createBootstrapUnavailableDataset("start-failed", 1_000);
    const diagnosis = dataset.connectionDiagnosis;
    if (diagnosis === undefined) throw new Error("bootstrap diagnosis is missing");

    expect(diagnosis.causalStage).toBeNull();
    expect(diagnosis.stages.every((stage) => stage.state === "unavailable")).toBe(true);
    expect(diagnosis.stages.every((stage) => stage.code === null)).toBe(true);
    expect(diagnosis.stages.every((stage) => stage.provenance === "inferred")).toBe(true);
  });

  it.each(["json", "markdown"] as const)(
    "includes the staged diagnosis in %s startup export",
    (format) => {
      const dataset = createBootstrapUnavailableDataset("daemon-spawn-failed", 1_000);
      const output = renderConsoleSnapshot({
        dataset,
        controller: readOnlyController(),
        ui: createFabricUiState(),
        viewport: { columns: 80, rows: 24 },
      }, format);

      expect(output).toContain("daemon-readiness");
      expect(output).toContain("CONSOLE_DAEMON_SPAWN_FAILED");
      expect(output).toContain("Inspect fabric doctor for the failed bootstrap stage, then retry.");
      expect(output).toContain("session-attachment");
      expect(output).toContain("blocked");
    },
  );
});
