import { describe, expect, it } from "vitest";

import {
  OPERATION_CONTRACT_FIXTURES,
  OPERATION_REGISTRY,
  parseOperationInput,
} from "../src/index.js";

const obsoleteOperations = [
  "fabric.v1.task.human-gate.resolve",
  "fabric.v1.project-session.drain",
  "fabric.v1.project-session.stop",
  "fabric.v1.daemon.drain",
  "fabric.v1.daemon.stop",
] as const;

describe("current operation baseline", () => {
  it("contains no retired decoder or contract fixture", () => {
    for (const operation of obsoleteOperations) {
      expect(Object.hasOwn(OPERATION_REGISTRY, operation)).toBe(false);
      expect(Object.hasOwn(OPERATION_CONTRACT_FIXTURES, operation)).toBe(false);
      expect(() => parseOperationInput(operation as never, {})).toThrowError(
        /unknown fabric operation/iu,
      );
    }
  });
});
