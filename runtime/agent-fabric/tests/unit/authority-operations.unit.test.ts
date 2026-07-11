import { describe, expect, it } from "vitest";

import {
  FABRIC_OPERATIONS,
  LEGACY_OPERATION_BUNDLES,
  expandAuthorityActions,
} from "../../src/domain/operations.js";

describe("versioned fabric authority operations", () => {
  it("expands legacy bundles into sorted exact operations", () => {
    expect(expandAuthorityActions(["read", "message", "read"])).toEqual({
      ok: true,
      operations: [...new Set([...LEGACY_OPERATION_BUNDLES.read, ...LEGACY_OPERATION_BUNDLES.message])].sort(),
    });
  });

  it("keeps exact versioned operations narrow", () => {
    expect(expandAuthorityActions([FABRIC_OPERATIONS.sendMessage])).toEqual({
      ok: true,
      operations: [FABRIC_OPERATIONS.sendMessage],
    });
  });

  it("rejects unknown unversioned actions", () => {
    expect(expandAuthorityActions(["read", "deploy"])).toEqual({ ok: false, unknownActions: ["deploy"] });
  });
});
