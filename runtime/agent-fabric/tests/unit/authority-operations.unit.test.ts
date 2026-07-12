import { describe, expect, it } from "vitest";

import {
  FABRIC_OPERATIONS,
  expandAuthorityActions,
} from "../../src/domain/operations.js";

describe("versioned fabric authority operations", () => {
  it.each(["read", "write", "delegate", "message", "team"])(
    "rejects the retired %s authority bundle",
    (action) => {
      expect(expandAuthorityActions([action])).toEqual({ ok: false, unknownActions: [action] });
    },
  );

  it("does not let a retired bundle hide beside an exact operation", () => {
    expect(expandAuthorityActions([FABRIC_OPERATIONS.sendMessage, "read"])).toEqual({
      ok: false,
      unknownActions: ["read"],
    });
  });

  it("keeps exact versioned operations narrow", () => {
    expect(expandAuthorityActions([FABRIC_OPERATIONS.sendMessage])).toEqual({
      ok: true,
      operations: [FABRIC_OPERATIONS.sendMessage],
    });
  });

  it("rejects unknown unversioned actions", () => {
    expect(expandAuthorityActions(["deploy"])).toEqual({ ok: false, unknownActions: ["deploy"] });
  });
});
