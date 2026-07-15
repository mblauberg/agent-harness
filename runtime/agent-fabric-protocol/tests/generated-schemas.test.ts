import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

import { Ajv2020 } from "ajv/dist/2020.js";
import type { FormatsPlugin } from "ajv-formats";
import { describe, expect, it } from "vitest";

import {
  AGENT_LIFECYCLE_RECOVERY_INTENT_V1_CODEC,
  ADAPTER_CAPABILITY_SNAPSHOT_V1_CODEC,
  DEPLOYED_ROUTE_ADMISSION_V1_CODEC,
  LIFECYCLE_ACCEPTED_SUSPENDED_V1_CODEC,
  LIFECYCLE_CURRENT_STATE_V1_CODEC,
  LIFECYCLE_GENERATION_LOSS_ROW_V1_CODEC,
  LIFECYCLE_RECOVERY_CHECKPOINT_VALIDATE_REQUEST_V1_CODEC,
  PROVIDER_CONTEXT_PRESSURE_READ_V1_CODEC,
  PROVIDER_CONTEXT_PRESSURE_V1_CODEC,
  PROVIDER_ROUTE_V1_CODEC,
  REVIEW_CERTIFICATION_BASIS_V1_CODEC,
  REVIEW_EVIDENCE_RECORD_V1_CODEC,
  ROUTE_EVALUATION_EVIDENCE_V1_CODEC,
  TOPOLOGY_WAVE_APPEND_RECEIPT_V1_CODEC,
  TOPOLOGY_WAVE_CURRENT_READ_V1_CODEC,
  addProtocolSchemaKeywords,
} from "../src/index.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const addFormats = createRequire(import.meta.url)("ajv-formats") as FormatsPlugin;

describe("Agent Fabric generated schema inventory", () => {
  it("publishes every binding route-lineage schema as standalone valid JSON Schema", () => {
    const required = [
      "adapter-capability-snapshot.v1.schema.json",
      "capability-snapshot-ref.v1.schema.json",
      "capability-snapshot-summary.v1.schema.json",
      "discovery-surface-manifest.v1.schema.json",
      "discovery-surface-ref.v1.schema.json",
      "deployed-route-admission.v1.schema.json",
      "deployed-route-dispatch.v1.schema.json",
      "deployed-route-observation.v1.schema.json",
      "actual-review-route-identity.v1.schema.json",
      "adapter-effective-configuration.v1.schema.json",
      "adapter-effective-configuration-ref.v1.schema.json",
      "provider-context-pressure.v1.schema.json",
      "provider-context-pressure-read-request.v1.schema.json",
      "provider-context-pressure-read.v1.schema.json",
      "provider-route.v1.schema.json",
      "topology-wave-plan-ref.v1.schema.json",
      "topology-wave-plan.v1.schema.json",
      "topology-wave-plan-current.v1.schema.json",
      "topology-wave-plan-input.v1.schema.json",
      "topology-wave-append-request.v1.schema.json",
      "topology-wave-append-receipt.v1.schema.json",
      "topology-wave-current-read-request.v1.schema.json",
      "topology-wave-current-read.v1.schema.json",
      "topology-wave-list-request.v1.schema.json",
      "topology-wave-list.v1.schema.json",
      "fabric-operational-span.v1.schema.json",
      "review-certification-basis.v1.schema.json",
      "coverage-summary.v1.schema.json",
      "review-evidence-record.v1.schema.json",
      "review-bundle-portal-request.v1.schema.json",
      "review-bundle-portal-response.v1.schema.json",
      "lifecycle-custody-row.v1.schema.json",
      "lifecycle-generation-loss-row.v1.schema.json",
      "lifecycle-recovery-source.v1.schema.json",
      "lifecycle-recovery-checkpoint-validate-request.v1.schema.json",
      "lifecycle-recovery-checkpoint-validation.v1.schema.json",
      "lifecycle-accepted-suspended.v1.schema.json",
      "lifecycle-current-state.v1.schema.json",
      "agent-lifecycle-recovery-intent.v1.schema.json",
    ];
    const present = new Set(readdirSync(join(root, "schemas")));
    expect(required.every((name) => present.has(name))).toBe(true);

    const ajv = new Ajv2020({ strict: false, allErrors: true });
    addFormats(ajv);
    addProtocolSchemaKeywords(ajv);
    for (const name of required) {
      expect(() => ajv.compile(JSON.parse(readFileSync(join(root, "schemas", name), "utf8")))).not.toThrow();
    }
  });

  it("retains correlation keywords in generated artifacts and rejects crossed values", () => {
    const digest = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const append = TOPOLOGY_WAVE_APPEND_RECEIPT_V1_CODEC.example as Readonly<Record<string, unknown>>;
    const appendPointer = append.pointer as Readonly<Record<string, unknown>>;
    const current = TOPOLOGY_WAVE_CURRENT_READ_V1_CODEC.example as Readonly<Record<string, unknown>>;
    const currentPlan = current.plan as Readonly<Record<string, unknown>>;
    const pressureRead = PROVIDER_CONTEXT_PRESSURE_READ_V1_CODEC.example as Readonly<Record<string, unknown>>;
    const coverageGroup = {
      groupId: "security-auth",
      totalCount: 1,
      readCount: 1,
      unreadCount: 0,
      unreadObjectSetDigest: digest,
    };
    const capability = structuredClone(ADAPTER_CAPABILITY_SNAPSHOT_V1_CODEC.example) as Record<string, unknown>;
    const capabilityBody = capability.capabilities as Record<string, unknown>;
    const model = (capabilityBody.modelCatalog as Record<string, unknown>[])[0];
    if (model === undefined) throw new Error("missing generated capability model example");
    const noncanonicalCapability = {
      ...capability,
      capabilities: {
        ...capabilityBody,
        modelCatalog: [
          { ...model, family: "z-family", model: "z-model" },
          { ...model, family: "a-family", model: "a-model" },
        ],
      },
    };
    const evaluation = ROUTE_EVALUATION_EVIDENCE_V1_CODEC.example as Readonly<Record<string, unknown>>;
    const evaluationTrials = evaluation.trialRoutes as readonly Readonly<Record<string, unknown>>[];
    const unprovedObjectiveDenominator = {
      ...evaluation,
      trialRoutes: evaluationTrials.map((trial) => ({ ...trial, deployedRouteObservationDigest: null })),
      objectivePassCount: 0,
      objectiveTrialCount: 1,
    };
    const fixtures = [
      ["adapter-capability-snapshot.v1.schema.json", { ...ADAPTER_CAPABILITY_SNAPSHOT_V1_CODEC.example, source: "unavailable" }],
      ["adapter-capability-snapshot.v1.schema.json", noncanonicalCapability],
      ["deployed-route-admission.v1.schema.json", { ...DEPLOYED_ROUTE_ADMISSION_V1_CODEC.example, actionRef: { adapterId: "crossed", actionId: "action_01" } }],
      ["provider-route.v1.schema.json", { ...PROVIDER_ROUTE_V1_CODEC.example, actionRef: { adapterId: "crossed", actionId: "action_01" } }],
      ["provider-context-pressure.v1.schema.json", {
        ...PROVIDER_CONTEXT_PRESSURE_V1_CODEC.example,
        source: "native-exact",
        confidence: "exact",
        pressure: "medium",
        windowTokens: 100,
        usedTokens: 30,
        remainingTokens: 69,
      }],
      ["provider-context-pressure-read.v1.schema.json", { ...pressureRead, ageSeconds: 1 }],
      ["route-evaluation-evidence.v1.schema.json", { ...ROUTE_EVALUATION_EVIDENCE_V1_CODEC.example, trialCount: 2 }],
      ["route-evaluation-evidence.v1.schema.json", unprovedObjectiveDenominator],
      ["topology-wave-append-receipt.v1.schema.json", { ...append, pointer: { ...appendPointer, planDigest: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" } }],
      ["topology-wave-current-read.v1.schema.json", { ...current, plan: { ...currentPlan, waveId: "crossed" } }],
      ["review-certification-basis.v1.schema.json", {
        ...(REVIEW_CERTIFICATION_BASIS_V1_CODEC.example as Readonly<Record<string, unknown>>),
        activeBindingGeneration: 2,
      }],
      ["coverage-summary.v1.schema.json", {
        mode: "manifest-complete-risk-directed",
        mandatoryComplete: true,
        groups: [coverageGroup, { ...coverageGroup, totalCount: 2, readCount: 2 }],
        byteComplete: true,
      }],
      ["review-evidence-record.v1.schema.json", {
        ...REVIEW_EVIDENCE_RECORD_V1_CODEC.example,
        routeObservationDigest: null,
        actualRouteIdentityDigest: digest,
      }],
      ["lifecycle-generation-loss-row.v1.schema.json", {
        ...LIFECYCLE_GENERATION_LOSS_ROW_V1_CODEC.example,
        lossKind: "context-advance",
        oldProviderGeneration: 2,
        newProviderGeneration: 2,
        oldContextRevision: 3,
        newContextRevision: 3,
      }],
      ["lifecycle-accepted-suspended.v1.schema.json", {
        ...LIFECYCLE_ACCEPTED_SUSPENDED_V1_CODEC.example,
        coordinationRunId: "crossed_run",
      }],
      ["lifecycle-current-state.v1.schema.json", {
        ...LIFECYCLE_CURRENT_STATE_V1_CODEC.example,
        contextState: "context-unreconciled",
      }],
      ["lifecycle-recovery-checkpoint-validate-request.v1.schema.json", {
        ...LIFECYCLE_RECOVERY_CHECKPOINT_VALIDATE_REQUEST_V1_CODEC.example,
        coordinationRunId: "crossed_run",
      }],
      ["agent-lifecycle-recovery-intent.v1.schema.json", {
        ...AGENT_LIFECYCLE_RECOVERY_INTENT_V1_CODEC.example,
        expectedSourceRevision: 2,
      }],
    ] as const;
    const ajv = new Ajv2020({ strict: false, allErrors: true });
    addFormats(ajv);
    addProtocolSchemaKeywords(ajv);
    for (const [name, invalid] of fixtures) {
      const schema = JSON.parse(readFileSync(join(root, "schemas", name), "utf8")) as object;
      expect(JSON.stringify(schema)).toContain("x-");
      expect(ajv.compile(schema)(invalid), name).toBe(false);
    }
  });
});
