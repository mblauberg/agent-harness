import { describe, expect, it } from "vitest";

import {
  FABRIC_OPERATIONS,
  FEATURE_OPERATIONS,
  parseOperationInput,
  parseOperationInputForPrincipal,
  parseOperationResult,
  parseOperationResultForInput,
} from "../src/index.js";

const digest = (character: string) => `sha256:${character.repeat(64)}`;
const declaration = {
  runId: "run_01",
  planArtifactRef: { path: ".agent-run/delivery_01/plan.md", digest: digest("b") },
  expectedAcceptedScopeRevision: 3,
  declaredTaskDenominator: 6,
};

describe("run-plan-declaration.v1 closed protocol", () => {
  it("registers the agent-only declaration operation with its closed request", () => {
    expect(FABRIC_OPERATIONS.runPlanDeclare).toBe("fabric.v1.run.plan.declare");
    expect(FEATURE_OPERATIONS["run-plan-declaration.v1"]).toEqual([
      FABRIC_OPERATIONS.runPlanDeclare,
    ]);
    expect(parseOperationInputForPrincipal(
      FABRIC_OPERATIONS.runPlanDeclare,
      "agent",
      declaration,
    )).toEqual(declaration);
    expect(() => parseOperationInputForPrincipal(
      FABRIC_OPERATIONS.runPlanDeclare,
      "operator",
      declaration,
    )).toThrow(/cannot invoke/u);
    expect(() => parseOperationInput(FABRIC_OPERATIONS.runPlanDeclare, {
      ...declaration,
      declaredTaskDenominator: 0,
    })).toThrow();
    expect(() => parseOperationInput(FABRIC_OPERATIONS.runPlanDeclare, {
      ...declaration,
      callerSelectedPlanRevision: 4,
    })).toThrow(/unknown field/u);
  });

  it("accepts a declaration without a finite denominator and closes the result", () => {
    const withoutDenominator = { ...declaration };
    delete (withoutDenominator as Partial<typeof declaration>).declaredTaskDenominator;
    expect(parseOperationInput(FABRIC_OPERATIONS.runPlanDeclare, withoutDenominator))
      .toEqual(withoutDenominator);
    const result = {
      runId: "run_01",
      planArtifactRef: declaration.planArtifactRef,
      acceptedScopeRef: { path: "scope.md", digest: digest("a") },
      acceptedScopeRevision: 3,
      planRevision: 1,
      declaredTaskDenominator: null,
      declaredByAgentId: "chair_01",
      declaredAt: "2026-07-22T00:00:00.000Z",
    };
    expect(parseOperationResult(FABRIC_OPERATIONS.runPlanDeclare, result)).toEqual(result);
    expect(() => parseOperationResult(FABRIC_OPERATIONS.runPlanDeclare, {
      ...result,
      inferredTaskDenominator: 1,
    })).toThrow(/unknown field/u);
  });

  it("correlates every declaration result binding with its request and authenticated chair", () => {
    const request = parseOperationInput(FABRIC_OPERATIONS.runPlanDeclare, declaration);
    const result = {
      runId: request.runId,
      planArtifactRef: request.planArtifactRef,
      acceptedScopeRef: { path: "scope.md", digest: digest("a") },
      acceptedScopeRevision: request.expectedAcceptedScopeRevision,
      planRevision: 1,
      declaredTaskDenominator: request.declaredTaskDenominator,
      declaredByAgentId: "chair_01",
      declaredAt: "2026-07-22T00:00:00.000Z",
    };
    const principal = { kind: "agent", agentId: "chair_01", runId: "run_01" } as const;
    expect(parseOperationResultForInput(
      FABRIC_OPERATIONS.runPlanDeclare,
      request,
      result,
      principal,
    )).toEqual(result);
    for (const mismatch of [
      { runId: "run_02" },
      { planArtifactRef: { path: "plan-other.md", digest: digest("b") } },
      { acceptedScopeRevision: 4 },
      { declaredTaskDenominator: 7 },
      { declaredByAgentId: "chair_other" },
    ]) {
      expect(() => parseOperationResultForInput(
        FABRIC_OPERATIONS.runPlanDeclare,
        request,
        { ...result, ...mismatch },
        principal,
      )).toThrowError();
    }
    expect(() => parseOperationResultForInput(
      FABRIC_OPERATIONS.runPlanDeclare,
      request,
      result,
      { ...principal, runId: "run_other" },
    )).toThrowError();
  });
});
