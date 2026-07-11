import { describe, expect, it } from "vitest";

import {
  FABRIC_OPERATIONS,
  OPERATION_CONTRACT_FIXTURES,
  OPERATION_REGISTRY,
  operationsForPrincipal,
  parseOperationInput,
} from "../src/index.js";

const retiredLifecycleOperations = [
  FABRIC_OPERATIONS.projectSessionDrain,
  FABRIC_OPERATIONS.projectSessionStop,
  FABRIC_OPERATIONS.daemonDrain,
  FABRIC_OPERATIONS.daemonStop,
] as const;

describe("typed operator-action lifecycle ownership", () => {
  it("recognises direct lifecycle wire names but never grants them", () => {
    const operatorOperations = operationsForPrincipal("operator");

    for (const operation of retiredLifecycleOperations) {
      expect(OPERATION_REGISTRY[operation]).toMatchObject({
        kind: "retired",
        principals: [],
        replacementOperation: FABRIC_OPERATIONS.operatorActionPreview,
      });
      expect(operatorOperations.has(operation as never)).toBe(false);
    }
  });

  it("fails retained direct decoders with the typed replacement", () => {
    for (const operation of retiredLifecycleOperations) {
      expect(() => parseOperationInput(
        operation,
        OPERATION_CONTRACT_FIXTURES[operation].input,
      )).toThrowError(/retired.*fabric\.v1\.operator-action\.preview/iu);
    }
  });
});
