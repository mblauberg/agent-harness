import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";

import {
  ROUTE_EVALUATION_EVIDENCE_V1_CODEC,
  TOPOLOGY_WAVE_APPEND_RECEIPT_V1_CODEC,
  TOPOLOGY_WAVE_APPEND_REQUEST_V1_CODEC,
  TOPOLOGY_WAVE_CURRENT_READ_V1_CODEC,
  TOPOLOGY_WAVE_PLAN_REF_V1_CODEC,
  addProtocolSchemaKeywords,
} from "../src/index.js";

describe("Agent Fabric topology and evaluation", () => {
  it("keeps predecessor derivation out of caller-authored topology plans", () => {
    const request = TOPOLOGY_WAVE_APPEND_REQUEST_V1_CODEC.example;
    expect(() => TOPOLOGY_WAVE_APPEND_REQUEST_V1_CODEC.parse({
      ...request,
      plan: { ...(request.plan as object), predecessor: null },
    }, "append")).toThrow(/unknown field/);
  });

  it("keeps current topology refs closed", () => {
    expect(() => TOPOLOGY_WAVE_PLAN_REF_V1_CODEC.parse({
      ...TOPOLOGY_WAVE_PLAN_REF_V1_CODEC.example,
      current: true,
    }, "ref")).toThrow(/unknown field/);
  });

  it("rejects route evaluation trial-count drift", () => {
    const evidence = ROUTE_EVALUATION_EVIDENCE_V1_CODEC.example;
    expect(() => ROUTE_EVALUATION_EVIDENCE_V1_CODEC.parse({
      ...evidence,
      trialCount: 2,
    }, "evaluation")).toThrow(/trialRoutes.*trialCount/);
  });

  it("equality-binds current plans and append receipts to their exact pointers", () => {
    const ajv = new Ajv2020({ strict: false, allErrors: true });
    addProtocolSchemaKeywords(ajv);
    const current = TOPOLOGY_WAVE_CURRENT_READ_V1_CODEC.example;
    expect(TOPOLOGY_WAVE_CURRENT_READ_V1_CODEC.parse(current, "current")).toStrictEqual(current);
    const crossedCurrent = {
      ...current,
      pointer: { ...(current.pointer as object), waveId: "wave_crossed" },
    };
    expect(() => TOPOLOGY_WAVE_CURRENT_READ_V1_CODEC.parse(crossedCurrent, "current"))
      .toThrow(/pointer|plan|waveId/);
    expect(ajv.compile(TOPOLOGY_WAVE_CURRENT_READ_V1_CODEC.schema)(crossedCurrent)).toBe(false);

    const receipt = TOPOLOGY_WAVE_APPEND_RECEIPT_V1_CODEC.example as {
      readonly planRef: Readonly<Record<string, unknown>>;
      readonly pointer: Readonly<Record<string, unknown>>;
    } & Readonly<Record<string, unknown>>;
    expect(TOPOLOGY_WAVE_APPEND_RECEIPT_V1_CODEC.parse(receipt, "receipt")).toStrictEqual(receipt);
    const crossedReceipt = {
      ...receipt,
      pointer: { ...receipt.pointer, planDigest: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" },
    };
    expect(() => TOPOLOGY_WAVE_APPEND_RECEIPT_V1_CODEC.parse(crossedReceipt, "receipt"))
      .toThrow(/pointer|planRef|planDigest/);
    expect(ajv.compile(TOPOLOGY_WAVE_APPEND_RECEIPT_V1_CODEC.schema)(crossedReceipt)).toBe(false);
    const skippedInitial = { ...receipt, planRef: { ...receipt.planRef, waveRevision: 2 } };
    expect(() => TOPOLOGY_WAVE_APPEND_RECEIPT_V1_CODEC.parse(skippedInitial, "receipt"))
      .toThrow(/priorPlanRef|waveRevision/);
  });
});
