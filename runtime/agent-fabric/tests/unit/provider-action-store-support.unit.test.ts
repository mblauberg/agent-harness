import { describe, expect, it } from "vitest";

import { canonicalJson } from "../../src/provider-action/store-support.ts";

describe("provider-action store support", () => {
  it("emits exact canonical bytes for nested sorted objects, arrays, and scalars", () => {
    expect(canonicalJson({
      z: [{ beta: false, alpha: null }, "text", 7],
      a: { z: true, a: [3, "x", null, false] },
      scalar: "value",
    })).toBe(
      '{"a":{"a":[3,"x",null,false],"z":true},"scalar":"value","z":[{"alpha":null,"beta":false},"text",7]}',
    );
  });

  it("rejects unsupported values with the exact TypeError", () => {
    expect(() => canonicalJson({ unsupported: undefined })).toThrow(
      new TypeError("value is not JSON-compatible"),
    );
  });
});
