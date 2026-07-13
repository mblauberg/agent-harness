import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";

import {
  ACTUAL_REVIEW_ROUTE_IDENTITY_V1_CODEC,
  ADAPTER_CAPABILITY_SNAPSHOT_V1_CODEC,
  COVERAGE_SUMMARY_V1_CODEC,
  DEPLOYED_ROUTE_ADMISSION_V1_CODEC,
  PROVIDER_CONTEXT_PRESSURE_V1_CODEC,
  PROVIDER_ROUTE_V1_CODEC,
  REVIEW_CERTIFICATION_BASIS_V1_CODEC,
  REVIEW_EVIDENCE_RECORD_V1_CODEC,
  ROUTE_EVALUATION_EVIDENCE_V1_CODEC,
  addProtocolSchemaKeywords,
} from "../src/index.js";

const digestA = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function ajv() {
  const validator = new Ajv2020({ strict: false, allErrors: true });
  addProtocolSchemaKeywords(validator);
  return validator;
}

describe("Opus protocol parity repairs", () => {
  it.each([
    {
      name: "active binding generation",
      value: {
        kind: "active-binding",
        actionBindingGeneration: 1,
        activeBindingGeneration: 2,
        terminalSequence: 3,
        bindingChainDigest: digestA,
      },
    },
    {
      name: "predecessor terminal sequence",
      value: {
        kind: "predecessor-cut",
        actionBindingGeneration: 1,
        firstSuccessorBindingGeneration: 2,
        activeBindingGeneration: 2,
        terminalSequence: 4,
        certificationCutSequence: 3,
        certificationCutCustodyRef: { schemaVersion: 1, runId: "run_01", agentId: "agent_01", custodyId: "custody_01", custodyRevision: 1 },
        certificationCutDigest: digestA,
        bindingChainDigest: digestA,
      },
    },
    {
      name: "post-cut terminal sequence",
      value: {
        kind: "post-cut",
        actionBindingGeneration: 1,
        firstSuccessorBindingGeneration: 2,
        activeBindingGeneration: 2,
        terminalSequence: 3,
        certificationCutSequence: 3,
        certificationCutCustodyRef: { schemaVersion: 1, runId: "run_01", agentId: "agent_01", custodyId: "custody_01", custodyRevision: 1 },
        certificationCutDigest: digestA,
        bindingChainDigest: digestA,
      },
    },
  ])("rejects relabelled certification basis: $name", ({ value }) => {
    expect(() => REVIEW_CERTIFICATION_BASIS_V1_CODEC.parse(value, "basis")).toThrow(/binding|terminalSequence|cut/i);
    expect(ajv().compile(REVIEW_CERTIFICATION_BASIS_V1_CODEC.schema)(value)).toBe(false);
  });

  it("requires coverage groups to be strictly ascending and unique by groupId", () => {
    const group = {
      groupId: "security-auth",
      totalCount: 1,
      readCount: 1,
      unreadCount: 0,
      unreadObjectSetDigest: digestA,
    } as const;
    const duplicate = {
      mode: "manifest-complete-risk-directed",
      mandatoryComplete: true,
      groups: [group, { ...group, totalCount: 2, readCount: 2 }],
      byteComplete: true,
    } as const;
    const reversed = {
      ...duplicate,
      groups: [
        { ...group, groupId: "tests-evaluations" },
        { ...group, groupId: "protocol-schema" },
      ],
    } as const;
    for (const candidate of [duplicate, reversed]) {
      expect(() => COVERAGE_SUMMARY_V1_CODEC.parse(candidate, "coverage")).toThrow(/groupId|ascending|unique/);
      expect(ajv().compile(COVERAGE_SUMMARY_V1_CODEC.schema)(candidate)).toBe(false);
    }
  });

  it.each([
    {
      name: "adapter snapshot source/capability",
      codec: ADAPTER_CAPABILITY_SNAPSHOT_V1_CODEC,
      value: { ...ADAPTER_CAPABILITY_SNAPSHOT_V1_CODEC.example, source: "unavailable" },
    },
    {
      name: "route admission action/adapter",
      codec: DEPLOYED_ROUTE_ADMISSION_V1_CODEC,
      value: { ...DEPLOYED_ROUTE_ADMISSION_V1_CODEC.example, actionRef: { adapterId: "crossed", actionId: "action_01" } },
    },
    {
      name: "joined provider route action/admission",
      codec: PROVIDER_ROUTE_V1_CODEC,
      value: { ...PROVIDER_ROUTE_V1_CODEC.example, actionRef: { adapterId: "crossed", actionId: "action_01" } },
    },
    {
      name: "context pressure token arithmetic",
      codec: PROVIDER_CONTEXT_PRESSURE_V1_CODEC,
      value: {
        ...PROVIDER_CONTEXT_PRESSURE_V1_CODEC.example,
        source: "native-exact",
        confidence: "exact",
        pressure: "medium",
        windowTokens: 100,
        usedTokens: 30,
        remainingTokens: 69,
      },
    },
    {
      name: "route evaluation trial count",
      codec: ROUTE_EVALUATION_EVIDENCE_V1_CODEC,
      value: { ...ROUTE_EVALUATION_EVIDENCE_V1_CODEC.example, trialCount: 2 },
    },
  ])("keeps runtime and standalone AJV parity for $name", ({ codec, value }) => {
    expect(() => codec.parse(value, "candidate")).toThrow();
    expect(ajv().compile(codec.schema)(value)).toBe(false);
  });

  it("requires observation proof whenever evidence stores an actual route identity", () => {
    const evidence = {
      ...REVIEW_EVIDENCE_RECORD_V1_CODEC.example,
      routeObservationDigest: null,
      actualRouteIdentityDigest: digestA,
    };
    expect(() => REVIEW_EVIDENCE_RECORD_V1_CODEC.parse(evidence, "evidence")).toThrow(/actualRouteIdentityDigest|routeObservationDigest|route/);
    expect(ajv().compile(REVIEW_EVIDENCE_RECORD_V1_CODEC.schema)(evidence)).toBe(false);

    const routeIdentity = ACTUAL_REVIEW_ROUTE_IDENTITY_V1_CODEC.example as Readonly<Record<string, unknown>>;
    const unproved = {
      ...routeIdentity,
      endpointProvider: { state: "unavailable", value: null, source: "unavailable", confidence: "unknown" },
    };
    expect(() => ACTUAL_REVIEW_ROUTE_IDENTITY_V1_CODEC.parse(unproved, "routeIdentity")).toThrow(/endpointProvider|allowed variant/);
    expect(ajv().compile(ACTUAL_REVIEW_ROUTE_IDENTITY_V1_CODEC.schema)(unproved)).toBe(false);
  });

  it("canonicalizes capability catalogues and raw effort mapping keys", () => {
    const snapshot = structuredClone(ADAPTER_CAPABILITY_SNAPSHOT_V1_CODEC.example) as Record<string, unknown>;
    snapshot.expiresAt = "2026-07-11T11:00:00Z";
    const capabilities = snapshot.capabilities as Record<string, unknown>;
    const catalogue = capabilities.modelCatalog as Record<string, unknown>[];
    const first = catalogue[0];
    if (first === undefined) throw new Error("missing capability model example");
    const reversed = {
      ...snapshot,
      capabilities: {
        ...capabilities,
        modelCatalog: [
          { ...first, family: "z-family", model: "z-model" },
          { ...first, family: "a-family", model: "a-model" },
        ],
      },
    };
    const effort = first.effort as Record<string, unknown>;
    const normalizations = effort.normalizations as Record<string, unknown>[];
    const normalization = normalizations[0];
    if (normalization === undefined) throw new Error("missing effort normalization example");
    const duplicateEffort = {
      ...snapshot,
      capabilities: {
        ...capabilities,
        modelCatalog: [{
          ...first,
          effort: {
            ...effort,
            normalizations: [
              normalization,
              { ...normalization, normalizedReasoningEffort: "low" },
            ],
          },
        }],
      },
    };
    const validate = ajv().compile(ADAPTER_CAPABILITY_SNAPSHOT_V1_CODEC.schema);
    for (const invalid of [reversed, duplicateEffort]) {
      expect(() => ADAPTER_CAPABILITY_SNAPSHOT_V1_CODEC.parse(invalid, "snapshot"))
        .toThrow(/modelCatalog|normalizations|sorted|unique|rawProviderEffort/);
      expect(validate(invalid)).toBe(false);
    }
  });

  it("requires distinct evaluation action pairs and an observed objective denominator", () => {
    const evidence = ROUTE_EVALUATION_EVIDENCE_V1_CODEC.example as Readonly<Record<string, unknown>>;
    const trials = evidence.trialRoutes as readonly Readonly<Record<string, unknown>>[];
    const first = trials[0];
    if (first === undefined) throw new Error("missing evaluation trial example");
    const duplicateAction = {
      ...evidence,
      plannedTrialCount: 2,
      trialCount: 2,
      trialRoutes: [
        first,
        {
          ...first,
          ordinal: 2,
          deployedRouteAdmissionDigest: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        },
      ],
    };
    const noObservedDenominator = {
      ...evidence,
      trialRoutes: trials.map((trial) => ({ ...trial, deployedRouteObservationDigest: null })),
      objectivePassCount: 0,
      objectiveTrialCount: 1,
    };
    const validate = ajv().compile(ROUTE_EVALUATION_EVIDENCE_V1_CODEC.schema);
    for (const invalid of [duplicateAction, noObservedDenominator]) {
      expect(() => ROUTE_EVALUATION_EVIDENCE_V1_CODEC.parse(invalid, "evaluation"))
        .toThrow(/action|distinct|observation|objectiveTrialCount|denominator/);
      expect(validate(invalid)).toBe(false);
    }
  });
});
