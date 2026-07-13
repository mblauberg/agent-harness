import { describe, expect, it } from "vitest";

import { RESOLVED_REVIEW_PROFILE_V1_CODEC } from "../src/index.js";

describe("Spec 05 four-slot profile", () => {
  it("requires all four slots in canonical order", () => {
    const profile = RESOLVED_REVIEW_PROFILE_V1_CODEC.example;
    expect(() => RESOLVED_REVIEW_PROFILE_V1_CODEC.parse({
      ...profile,
      slots: (profile.slots as readonly unknown[]).slice(0, 3),
    }, "profile")).toThrow(/4-4|exactly four/);
  });
});
