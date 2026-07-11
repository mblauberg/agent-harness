import { describe, expect, it } from "vitest";

import * as protocol from "@local/agent-fabric-protocol";
import {
  FABRIC_OPERATIONS,
  OPERATION_REGISTRY,
  expandAuthorityActions,
} from "../../src/domain/operations.ts";

describe("shared fabric operation registry", () => {
  it("uses the standalone protocol constants and registry by identity", () => {
    expect(FABRIC_OPERATIONS).toBe(protocol.FABRIC_OPERATIONS);
    expect(OPERATION_REGISTRY).toBe(protocol.OPERATION_REGISTRY);
  });

  it("recognises but never grants the retired legacy human-gate operation", () => {
    expect(expandAuthorityActions([FABRIC_OPERATIONS.resolveHumanGate])).toStrictEqual({
      ok: false,
      unknownActions: [FABRIC_OPERATIONS.resolveHumanGate],
    });
  });
});
