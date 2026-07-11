import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  createInterventionFixture,
  readJsonObject,
} from "../../support/primary-adapter-testkit.ts";

describe("NFR-008 operator intervention auditability", () => {
  it("journals mediated and integration-reported interventions with honest provenance", async () => {
    const fixture = await createInterventionFixture();
    try {
      const record = Reflect.get(fixture.chair, "recordOperatorIntervention");
      expect(typeof record).toBe("function");
      if (typeof record !== "function") {
        throw new Error("FabricClient.recordOperatorIntervention is not implemented");
      }
      await Reflect.apply(record, fixture.chair, [{
        source: "fabric",
        directInputProvenance: "complete",
        taskRevision: 3,
        summary: "chair requested bounded steering",
        commandId: "intervention-fabric-1",
      }]);
      await Reflect.apply(record, fixture.chair, [{
        source: "integration",
        directInputProvenance: "partial",
        taskRevision: 4,
        summary: "Herdr reported external terminal input",
        commandId: "intervention-integration-1",
      }]);

      await fixture.chair.exportReceipt({ commandId: "receipt-with-interventions" });
      const receiptPath = join(fixture.directory, "fabric-receipt.json");
      const receipt = await readJsonObject(receiptPath);

      expect(receipt.directInputProvenance).toBe("partial");
      expect(receipt.operatorInterventions).toEqual([
        expect.objectContaining({
          source: "fabric",
          directInputProvenance: "complete",
          taskRevision: 3,
          summary: "chair requested bounded steering",
        }),
        expect.objectContaining({
          source: "integration",
          directInputProvenance: "partial",
          taskRevision: 4,
          summary: "Herdr reported external terminal input",
        }),
      ]);
      expect(await readFile(receiptPath, "utf8")).toContain("operatorInterventions");
    } finally {
      await fixture.fabric.close();
    }
  });
});
