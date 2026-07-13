import { Buffer } from "node:buffer";

import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";

import {
  ACTUAL_REVIEW_ROUTE_IDENTITY_V1_CODEC,
  FABRIC_OPERATIONS,
  PROVIDER_ROUTE_INTEGRITY_RECOVERY_PROJECTION_V1_CODEC,
  RESOLVED_REVIEW_PROFILE_SLOT_V1_CODEC,
  RESOLVED_REVIEW_PROFILE_V1_CODEC,
  REVIEW_BUNDLE_READ_ARGS_V1_CODEC,
  REVIEW_BUNDLE_READ_RESULT_V1_CODEC,
  REVIEW_BUNDLE_SEARCH_RESULT_V1_CODEC,
  REVIEW_RESULT_V1_CODEC,
  REVIEW_TARGET_PREPARATION_READ_V1_CODEC,
  addProtocolSchemaKeywords,
  parseOperationResult,
  type OperatorAvailableAction,
} from "../src/index.js";

const digestA = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const digestB = "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

function observed<T>(value: T) {
  return { state: "observed", value, source: "provider-result", confidence: "exact" } as const;
}

function validOpenAiProfile() {
  const slot = (overrides: Record<string, unknown>) => ({
    ...RESOLVED_REVIEW_PROFILE_SLOT_V1_CODEC.example,
    requestedEffort: null,
    resolvedEffort: { kind: "applied", value: "high" },
    requiredActualEndpointProvider: overrides.providerFamily,
    requiredActualProviderFamily: overrides.providerFamily,
    requiredActualModel: overrides.model,
    ...overrides,
  });
  return {
    ...RESOLVED_REVIEW_PROFILE_V1_CODEC.example,
    targetChairFamily: "openai",
    slots: [
      slot({ slot: "native", adapterClass: "primary-native", adapterId: "codex-app-server", providerFamily: "openai", model: "codex-model", sourceMode: "direct-portal", reviewerFamilyRelation: "same-family-exempt" }),
      slot({ slot: "other-primary", adapterClass: "equal-primary", adapterId: "claude-agent-sdk", providerFamily: "anthropic", model: "claude-model", sourceMode: "direct-portal", reviewerFamilyRelation: "distinct-family-proved" }),
      slot({ slot: "cursor-grok", adapterClass: "cursor", adapterId: "cursor-agent", providerFamily: "xai", model: "grok-4.5-xhigh", sourceMode: "portal-helper", reviewerFamilyRelation: "distinct-family-proved" }),
      slot({ slot: "agy-gemini", adapterClass: "agy", adapterId: "agy", providerFamily: "google", model: "Gemini 3.1 Pro (High)", sourceMode: "portal-helper", reviewerFamilyRelation: "distinct-family-proved" }),
    ],
  };
}

describe("Spec 05 review wire repair", () => {
  it("correlates portal root parent/ordinal and exact decoded read length, including empty payloads", () => {
    expect(() => REVIEW_BUNDLE_READ_ARGS_V1_CODEC.parse({
      ...REVIEW_BUNDLE_READ_ARGS_V1_CODEC.example,
      kind: "manifest-root",
      parentDigest: digestA,
      ordinal: 0,
    }, "read")).toThrow(/parentDigest|manifest-root/);
    expect(() => REVIEW_BUNDLE_READ_ARGS_V1_CODEC.parse({
      ...REVIEW_BUNDLE_READ_ARGS_V1_CODEC.example,
      kind: "chunk",
      parentDigest: null,
    }, "read")).toThrow(/parentDigest|chunk/);

    const empty = {
      ...REVIEW_BUNDLE_READ_RESULT_V1_CODEC.example,
      kind: "manifest-root",
      parentDigest: null,
      ordinal: 0,
      rawByteLength: 0,
      payload: "",
    };
    expect(REVIEW_BUNDLE_READ_RESULT_V1_CODEC.parse(empty, "result")).toStrictEqual(empty);
    expect(() => REVIEW_BUNDLE_READ_RESULT_V1_CODEC.parse({
      ...empty,
      rawByteLength: 1,
    }, "result")).toThrow(/rawByteLength|decoded/);
  });

  it("bounds and deterministically orders search snippets and the canonical result", () => {
    const entryA = { objectDigest: digestA, offset: 0, rawByteLength: 1, encoding: "base64", snippet: "YQ==" };
    const entryB = { objectDigest: digestB, offset: 0, rawByteLength: 1, encoding: "base64", snippet: "Yg==" };
    const result = { ...REVIEW_BUNDLE_SEARCH_RESULT_V1_CODEC.example, entries: [entryA, entryB] };
    expect(REVIEW_BUNDLE_SEARCH_RESULT_V1_CODEC.parse(result, "search")).toStrictEqual(result);
    expect(() => REVIEW_BUNDLE_SEARCH_RESULT_V1_CODEC.parse({ ...result, entries: [entryB, entryA] }, "search"))
      .toThrow(/order/);
    expect(() => REVIEW_BUNDLE_SEARCH_RESULT_V1_CODEC.parse({
      ...result,
      entries: [{ ...entryA, rawByteLength: 2 }],
    }, "search")).toThrow(/rawByteLength|decoded/);
    const oversized = Buffer.alloc(50_000, 1).toString("base64");
    expect(() => REVIEW_BUNDLE_SEARCH_RESULT_V1_CODEC.parse({
      ...result,
      entries: [{ ...entryA, rawByteLength: 50_000, snippet: oversized }],
    }, "search")).toThrow(/65,536|canonical/);
  });

  it("binds preparation state to phase/terminal and bounds finite progress", () => {
    const preparation = REVIEW_TARGET_PREPARATION_READ_V1_CODEC.example;
    expect(() => REVIEW_TARGET_PREPARATION_READ_V1_CODEC.parse({
      ...preparation,
      state: "prepared",
      phase: "Building",
    }, "preparation")).toThrow(/phase/);
    expect(() => REVIEW_TARGET_PREPARATION_READ_V1_CODEC.parse({
      ...preparation,
      progress: { kind: "finite", unit: "verified-build-items", completed: 2, total: 1, planDigest: digestA },
    }, "preparation")).toThrow(/completed|total/);
  });

  it("maps each terminal route-recovery state to only its exact disposition", () => {
    const recovery = {
      ...PROVIDER_ROUTE_INTEGRITY_RECOVERY_PROJECTION_V1_CODEC.example,
      state: "terminal-proved-no-effect",
      disposition: "exact-usage-settled",
      settlementDigest: digestA,
    };
    expect(() => PROVIDER_ROUTE_INTEGRITY_RECOVERY_PROJECTION_V1_CODEC.parse(recovery, "recovery"))
      .toThrow(/disposition/);
  });

  it("requires proved actual provider/family/model and preserves null-native semantics", () => {
    const actual = {
      ...ACTUAL_REVIEW_ROUTE_IDENTITY_V1_CODEC.example,
      endpointProvider: observed("openai"),
      family: observed("openai"),
      model: observed("model_01"),
      resolvedEffort: observed({ kind: "applied", value: "high" }),
      normalizedReasoningEffort: observed("high"),
      rawNativeMode: observed(null),
      orchestrationMode: observed("single"),
    };
    expect(ACTUAL_REVIEW_ROUTE_IDENTITY_V1_CODEC.parse(actual, "actual")).toStrictEqual(actual);
    expect(() => ACTUAL_REVIEW_ROUTE_IDENTITY_V1_CODEC.parse({
      ...actual,
      endpointProvider: { state: "unavailable", value: null, source: "unavailable", confidence: "unknown" },
    }, "actual")).toThrow(/endpointProvider|required|observed/);
    expect(() => ACTUAL_REVIEW_ROUTE_IDENTITY_V1_CODEC.parse({
      ...actual,
      orchestrationMode: observed("native-subagents"),
    }, "actual")).toThrow(/rawNativeMode|orchestrationMode/);
  });

  it("enforces the complete target-family four-slot matrix", () => {
    const profile = validOpenAiProfile();
    expect(RESOLVED_REVIEW_PROFILE_V1_CODEC.parse(profile, "profile")).toStrictEqual(profile);
    expect(() => RESOLVED_REVIEW_PROFILE_V1_CODEC.parse({
      ...profile,
      slots: profile.slots.map((slot, index) => index === 2 ? { ...slot, adapterId: "agy" } : slot),
    }, "profile")).toThrow(/cursor-grok|adapterId|matrix/);
  });

  it("enforces resolution-only capacity and repair-kind evidence references", () => {
    const review = REVIEW_RESULT_V1_CODEC.example;
    expect(() => REVIEW_RESULT_V1_CODEC.parse({
      ...review,
      findings: [{
        findingId: "finding_01",
        severity: "P1",
        summary: "summary",
        evidence: "evidence",
        repairKind: "repository-source",
        evidenceRefs: ["evidence_01"],
      }],
      verdict: "FINDINGS",
    }, "review")).toThrow(/repository-source|evidenceRefs/);
    expect(() => REVIEW_RESULT_V1_CODEC.parse({
      ...review,
      findingWindowMode: "resolution-only",
      resolvedFindingDigests: Array.from({ length: 33 }, (_, index) => `sha256:${index.toString(16).padStart(64, "0")}`),
    }, "review")).toThrow(/32|resolution-only/);
  });

  it("exposes provider-route-integrity-retire as an available preview action", () => {
    const available: OperatorAvailableAction = "provider-route-integrity-retire";
    const observedAt = "2026-07-11T10:00:00Z";
    const result = {
      status: "page",
      view: "system",
      rows: [{
        itemId: "item_01",
        itemRevision: 1,
        fact: {
          freshness: "live",
          source: "fabric",
          revision: 1,
          observedAt,
          value: {
            summary: { kind: "system", systemKind: "daemon", state: "healthy", detail: "ready" },
            detailRef: { kind: "system", componentId: "daemon_01", expectedRevision: 1 },
            actionAvailability: { state: "available", actions: [available], requiresPreview: true },
          },
        },
      }],
      nextCursor: 1,
      hasMore: false,
      snapshotRevision: 1,
      readTransactionId: "read_tx_01",
    };
    expect(parseOperationResult(FABRIC_OPERATIONS.projectionViewPage, result)).toMatchObject({ status: "page" });
  });

  it("keeps generated schemas in parity for portal and correlated review projections", () => {
    const ajv = new Ajv2020({ strict: false, allErrors: true });
    addProtocolSchemaKeywords(ajv);
    const invalidPreparation = { ...REVIEW_TARGET_PREPARATION_READ_V1_CODEC.example, state: "prepared", phase: "Building" };
    const invalidRecovery = {
      ...PROVIDER_ROUTE_INTEGRITY_RECOVERY_PROJECTION_V1_CODEC.example,
      state: "terminal-proved-no-effect",
      disposition: "exact-usage-settled",
      settlementDigest: digestA,
    };
    const invalidActual = {
      ...ACTUAL_REVIEW_ROUTE_IDENTITY_V1_CODEC.example,
      endpointProvider: observed("openai"),
      family: observed("openai"),
      model: observed("model_01"),
      rawNativeMode: observed(null),
      orchestrationMode: observed("native-subagents"),
    };
    const profile = validOpenAiProfile();
    const invalidProfile = {
      ...profile,
      slots: profile.slots.map((slot, index) => index === 2 ? { ...slot, adapterId: "agy" } : slot),
    };
    const invalidRead = { ...REVIEW_BUNDLE_READ_RESULT_V1_CODEC.example, rawByteLength: 2, payload: "YQ==" };
    const entryA = { objectDigest: digestA, offset: 0, rawByteLength: 1, encoding: "base64", snippet: "YQ==" };
    const entryB = { objectDigest: digestB, offset: 0, rawByteLength: 1, encoding: "base64", snippet: "Yg==" };
    const invalidSearch = { ...REVIEW_BUNDLE_SEARCH_RESULT_V1_CODEC.example, entries: [entryB, entryA] };

    for (const [codec, invalid] of [
      [REVIEW_TARGET_PREPARATION_READ_V1_CODEC, invalidPreparation],
      [PROVIDER_ROUTE_INTEGRITY_RECOVERY_PROJECTION_V1_CODEC, invalidRecovery],
      [ACTUAL_REVIEW_ROUTE_IDENTITY_V1_CODEC, invalidActual],
      [RESOLVED_REVIEW_PROFILE_V1_CODEC, invalidProfile],
      [REVIEW_BUNDLE_READ_RESULT_V1_CODEC, invalidRead],
      [REVIEW_BUNDLE_SEARCH_RESULT_V1_CODEC, invalidSearch],
    ] as const) {
      expect(ajv.compile(codec.schema)(invalid)).toBe(false);
    }
  });
});
