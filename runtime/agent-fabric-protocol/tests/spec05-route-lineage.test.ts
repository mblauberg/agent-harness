import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";

import {
  DEPLOYED_ROUTE_ADMISSION_V1_CODEC,
  OBSERVED_NULL_NATIVE_MODE_V1_CODEC,
  PROVIDER_CONTEXT_PRESSURE_READ_V1_CODEC,
  PROVIDER_CONTEXT_PRESSURE_V1_CODEC,
  RESOLVED_EFFORT_V1_CODEC,
  addProtocolSchemaKeywords,
} from "../src/index.js";

describe("Spec 05 route lineage", () => {
  it("uses tagged effort and rejects untagged provider values", () => {
    expect(RESOLVED_EFFORT_V1_CODEC.parse({ kind: "applied", value: "xhigh" }, "effort"))
      .toStrictEqual({ kind: "applied", value: "xhigh" });
    expect(RESOLVED_EFFORT_V1_CODEC.parse({ kind: "inapplicable" }, "effort"))
      .toStrictEqual({ kind: "inapplicable" });
    expect(() => RESOLVED_EFFORT_V1_CODEC.parse("xhigh", "effort")).toThrow();
  });

  it("distinguishes proved-null native mode from unavailable", () => {
    expect(OBSERVED_NULL_NATIVE_MODE_V1_CODEC.parse({
      state: "observed",
      value: null,
      source: "provider-result",
      confidence: "exact",
    }, "nativeMode")).toMatchObject({ state: "observed", value: null });
    expect(() => OBSERVED_NULL_NATIVE_MODE_V1_CODEC.parse({
      state: "observed",
      value: null,
      source: "provider-result",
      confidence: "attested",
    }, "nativeMode")).toThrow();
  });

  it("rejects crossed route action identity", () => {
    const admission = DEPLOYED_ROUTE_ADMISSION_V1_CODEC.example;
    expect(() => DEPLOYED_ROUTE_ADMISSION_V1_CODEC.parse({
      ...admission,
      actionRef: { adapterId: "wrong-adapter", actionId: "action_01" },
    }, "admission")).toThrow(/actionRef\.adapterId/);
  });

  it("requires exact token arithmetic for native context pressure", () => {
    const pressure = {
      ...PROVIDER_CONTEXT_PRESSURE_V1_CODEC.example,
      source: "native-exact",
      confidence: "exact",
      pressure: "medium",
      windowTokens: 100,
      usedTokens: 60,
      remainingTokens: 40,
      expiresAt: "2026-07-11T11:00:00Z",
    };
    expect(PROVIDER_CONTEXT_PRESSURE_V1_CODEC.parse(pressure, "pressure")).toMatchObject({ usedTokens: 60 });
    expect(() => PROVIDER_CONTEXT_PRESSURE_V1_CODEC.parse({ ...pressure, remainingTokens: 39 }, "pressure"))
      .toThrow(/sum to windowTokens/);
  });

  it("derives context-pressure currency and whole-second age from read time", () => {
    const ajv = new Ajv2020({ strict: false, allErrors: true });
    addProtocolSchemaKeywords(ajv);
    const pressure = {
      ...PROVIDER_CONTEXT_PRESSURE_V1_CODEC.example,
      observedAt: "2026-07-11T10:00:00Z",
      expiresAt: "2026-07-11T11:00:00Z",
    };
    const current = {
      schemaVersion: 1,
      currency: "current",
      pressure,
      readAt: "2026-07-11T10:30:00Z",
      ageSeconds: 1_800,
    } as const;
    expect(PROVIDER_CONTEXT_PRESSURE_READ_V1_CODEC.parse(current, "read")).toStrictEqual(current);
    const wrongAge = { ...current, ageSeconds: 1_799 };
    expect(() => PROVIDER_CONTEXT_PRESSURE_READ_V1_CODEC.parse(wrongAge, "read"))
      .toThrow(/ageSeconds|readAt|observedAt/);
    expect(ajv.compile(PROVIDER_CONTEXT_PRESSURE_READ_V1_CODEC.schema)(wrongAge)).toBe(false);
    const expiredCurrent = { ...current, readAt: "2026-07-11T11:00:00Z", ageSeconds: 3_600 };
    expect(() => PROVIDER_CONTEXT_PRESSURE_READ_V1_CODEC.parse(expiredCurrent, "read"))
      .toThrow(/current|expiresAt/);

    const stale = { ...expiredCurrent, currency: "stale" } as const;
    expect(PROVIDER_CONTEXT_PRESSURE_READ_V1_CODEC.parse(stale, "read")).toStrictEqual(stale);
    const earlyStale = { ...stale, readAt: "2026-07-11T10:59:59Z", ageSeconds: 3_599 };
    expect(() => PROVIDER_CONTEXT_PRESSURE_READ_V1_CODEC.parse(earlyStale, "read"))
      .toThrow(/stale|expiresAt/);
    expect(ajv.compile(PROVIDER_CONTEXT_PRESSURE_READ_V1_CODEC.schema)(earlyStale)).toBe(false);
  });
});
