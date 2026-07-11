import { describe, expect, it } from "vitest";

import { createBootstrapUnavailableDataset } from "../src/protocol-adapter.js";
import { createFabricUiState } from "../src/presenter.js";
import { renderConsoleSnapshot } from "../src/snapshot.js";
import type { ConsoleControllerState } from "../src/controller.js";
import { FABRIC_VIEWS } from "../src/model.js";

function controller(): ConsoleControllerState {
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

describe("portable Console snapshot export", () => {
  it.each(["json", "markdown"] as const)(
    "renders deterministic %s from the same projection/presentation model",
    (format) => {
      const dataset = createBootstrapUnavailableDataset("start-failed", 1_000);
      const ui = createFabricUiState({
        notice: "token afop_super-secret \u001b[31m",
        draft: "afb_bootstrap-secret afc_agent-secret",
      });
      const input = {
        dataset,
        controller: controller(),
        ui,
        viewport: { columns: 80, rows: 24 },
      };

      const first = renderConsoleSnapshot(input, format);
      const second = renderConsoleSnapshot(input, format);

      expect(first).toBe(second);
      expect(first).not.toMatch(/[\u001b\u009b]/u);
      expect(first).not.toContain("afop_super-secret");
      expect(first).not.toContain("afb_bootstrap-secret");
      expect(first).not.toContain("afc_agent-secret");
      expect(first).toContain("[REDACTED capability]");
      if (format === "json") {
        expect(JSON.parse(first)).toMatchObject({
          schemaVersion: 1,
          kind: "agent-fabric-console-snapshot",
          activeView: "system",
        });
      } else {
        expect(first).toContain("# Agent Fabric Console snapshot");
        expect(first).toContain("## System");
      }
    },
  );
});
