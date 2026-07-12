import { describe, expect, it } from "vitest";

import {
  FABRIC_OPERATIONS,
  GIT_OPERATION_VARIANTS,
  PREAUTHORISED_GIT_OPERATION_VARIANTS,
  gitOperationVariant,
  parseOperationInput,
  parseOperationResult,
  parseTimestamp,
  requiredOperatorActionForIntent,
} from "../src/index.js";

const sha = (value: string): string => `sha256:${value.repeat(64).slice(0, 64)}`;
const command = {
  credential: { capabilityId: "cap_git_01", token: "operator-secret-credential" },
  commandId: "preview_git_stage_01",
  expectedRevision: 7,
  actor: "operator_01",
  provenance: { kind: "console-direct-input", clientId: "console_01", inputEventId: "input_01" },
  evidenceRefs: [],
} as const;

const repository = {
  repositoryRoot: "/workspace/project",
  worktreePath: "/workspace/project/.worktrees/writer",
  gitCommonDir: "/workspace/project/.git",
  commonDirectoryIdentityDigest: sha("1"),
  repositoryStateDigest: sha("2"),
  headDigest: sha("3"),
  indexDigest: sha("4"),
  worktreeDigest: sha("5"),
  remoteStateDigest: sha("6"),
  configDigest: sha("7"),
  worktreeRegistryDigest: sha("8"),
} as const;

const profile = {
  profileId: "sealed-git-v1",
  revision: 1,
  digest: sha("9"),
  gitBinaryDigest: sha("a"),
  objectFormat: "sha1",
} as const;

const recipe = {
  schemaVersion: 1,
  executionProfileDigest: profile.digest,
  resultRecipeDigest: sha("b"),
  beforeRepositoryStateDigest: repository.repositoryStateDigest,
  expectedSuccessRepositoryStateDigest: sha("c"),
  expectedConflict: null,
  refUpdates: [],
  configUpdates: [],
  commitMappings: [],
  affectedPaths: [{ path: "src/index.ts", beforeDigest: sha("d"), afterDigest: sha("e") }],
  bounds: { maximumRefOrConfigUpdates: 64, maximumCommitMappings: 128, maximumConflictPaths: 4096 },
} as const;

const authorisation = {
  projectId: "project_01",
  projectSessionId: "session_01",
  expectedSessionRevision: 7,
  expectedSessionGeneration: 2,
  coordinationRunId: "run_01",
  expectedRunRevision: 11,
  expectedDependencyRevision: 5,
  authorityRef: sha("f"),
  expectedAuthorityRevision: 3,
  expectedGitAllowlistEpoch: 2,
  gitAllowlistDigest: sha("0"),
  repositoryRoot: repository.repositoryRoot,
  worktreePath: repository.worktreePath,
  repositoryStateDigest: repository.repositoryStateDigest,
  executionProfileId: profile.profileId,
  executionProfileRevision: profile.revision,
  executionProfileDigest: profile.digest,
  operationVariant: "stage",
  remoteBinding: null,
  resultRecipeDigest: recipe.resultRecipeDigest,
  operationId: "git_operation_stage_01",
  effectBindingDigest: sha("a"),
  decision: {
    kind: "preauthorised",
    grantId: "grant_01",
    expectedGrantRevision: 1,
    grantDigest: sha("b"),
  },
} as const;

const intent = {
  kind: "git",
  authorisation,
  repository,
  executionProfile: profile,
  operation: { variant: "stage", paths: ["src/index.ts"] },
  resultRecipe: recipe,
} as const;

describe("typed Git authority contract", () => {
  it("owns an exhaustive concrete variant vocabulary and a strict preauthorised subset", () => {
    expect(GIT_OPERATION_VARIANTS).toHaveLength(28);
    expect(new Set(GIT_OPERATION_VARIANTS).size).toBe(GIT_OPERATION_VARIANTS.length);
    expect(PREAUTHORISED_GIT_OPERATION_VARIANTS).toContain("stage");
    expect(PREAUTHORISED_GIT_OPERATION_VARIANTS).not.toContain("merge-continue");
    expect(PREAUTHORISED_GIT_OPERATION_VARIANTS).not.toContain("push-force-with-lease");
    expect(PREAUTHORISED_GIT_OPERATION_VARIANTS).not.toContain("worktree-remove-force");
  });

  it("round-trips one closed preauthorised mutation through the public preview codec", () => {
    const input = { command, projectId: "project_01", intent };
    expect(parseOperationInput(FABRIC_OPERATIONS.operatorActionPreview, input)).toStrictEqual(input);
    expect(gitOperationVariant(intent.operation)).toBe("stage");
  });

  it("rejects sibling authority, unbound recipes and generic execution escapes", () => {
    const base = { command, projectId: "project_01", intent };
    expect(() => parseOperationInput(FABRIC_OPERATIONS.operatorActionPreview, {
      ...base,
      intent: { ...intent, operation: { variant: "unstage", paths: ["src/index.ts"] } },
    })).toThrowError(/operationVariant|variant|match/iu);
    expect(() => parseOperationInput(FABRIC_OPERATIONS.operatorActionPreview, {
      ...base,
      intent: { ...intent, resultRecipe: { ...recipe, resultRecipeDigest: sha("c") } },
    })).toThrowError(/resultRecipeDigest|match/iu);
    for (const escape of [
      { command: "git add" },
      { args: ["add", "."] },
      { environment: { GIT_CONFIG: "/tmp/hostile" } },
      { executable: "/tmp/git" },
    ]) {
      expect(() => parseOperationInput(FABRIC_OPERATIONS.operatorActionPreview, {
        ...base,
        intent: { ...intent, ...escape },
      })).toThrowError(/unknown|allowed|property/iu);
    }
  });

  it("allocates gate-only identity through a no-authority draft", () => {
    const { operationId: _operationId, decision: _decision, ...draftAuthorisation } = authorisation;
    const draft = {
      kind: "git-operation-draft",
      action: "create",
      draftRequestId: "draft_request_merge_01",
      expiresAt: parseTimestamp("2026-07-12T12:00:00.000Z", "test.expiresAt"),
      binding: {
        kind: "mutation",
        authorisation: {
          ...draftAuthorisation,
          operationVariant: "merge-commit-start",
        },
        repository,
        executionProfile: profile,
        operation: {
          variant: "merge-commit-start",
          sourceRef: "refs/heads/feature",
          sourceObjectDigest: sha("1"),
          destinationRef: "refs/heads/main",
          destinationObjectDigest: sha("2"),
        },
        resultRecipe: recipe,
      },
    } as const;
    const input = { command, projectId: "project_01", intent: draft };
    expect(parseOperationInput(FABRIC_OPERATIONS.operatorActionPreview, input)).toStrictEqual(input);
    expect(Reflect.apply(requiredOperatorActionForIntent, undefined, [draft])).toBe("git");
  });

  it("round-trips exact owned-conflict observe CAS and custody status", () => {
    const reconcile = {
      command: { ...command, commandId: "reconcile_git_conflict_01" },
      projectId: "project_01",
      targetCommandId: "commit_git_merge_01",
      expectedStatus: "conflict",
      expectedAttemptGeneration: 2,
      mode: "observe-only",
      gitConflict: {
        kind: "owned-conflict",
        custodyId: "custody_git_01",
        expectedBindingState: "conflict",
        expectedBindingStateRevision: 2,
        expectedOwnedConflictGeneration: 1,
        expectedPredecessorCustodyId: null,
        expectedPredecessorConflictGeneration: null,
        expectedReservationGeneration: 1,
        expectedCommonDirectoryIdentityDigest: sha("1"),
        expectedLookupGeneration: 0,
        expectedLookupEvidenceDigest: null,
        expectedResolutionEligibility: "none",
      },
    } as const;
    expect(parseOperationInput(FABRIC_OPERATIONS.operatorActionReconcile, reconcile)).toStrictEqual(reconcile);
    const status = {
      status: "conflict",
      commandId: reconcile.targetCommandId,
      intentDigest: sha("2"),
      attemptGeneration: 3,
      gitCustody: {
        custodyId: "custody_git_01",
        bindingStateRevision: 3,
        reservationGeneration: 1,
        commonDirectoryIdentityDigest: sha("1"),
        predecessorCustodyId: null,
        predecessorConflictGeneration: null,
        ownedConflictGeneration: 1,
        lookupGeneration: 1,
        lookupEvidenceDigest: sha("3"),
        lookupOutcome: "exact-conflict",
        lookupFailureSignatureDigest: null,
        lookupObservedAt: "2026-07-12T10:00:00.000Z",
        resolutionEligibility: { kind: "none" },
      },
    } as const;
    expect(parseOperationResult(FABRIC_OPERATIONS.operatorActionReconcile, status)).toStrictEqual(status);
    expect(() => parseOperationInput(FABRIC_OPERATIONS.operatorActionReconcile, {
      ...reconcile,
      gitConflict: { ...reconcile.gitConflict, expectedOwnedConflictGeneration: null },
    })).toThrowError(/owned|generation|variant/iu);
  });

  it("rejects impossible custody lineage, lookup and eligibility status combinations", () => {
    const base = {
      status: "ambiguous",
      commandId: "commit_git_ambiguous_01",
      intentDigest: sha("1"),
      attemptGeneration: 2,
      gitCustody: {
        custodyId: "custody_git_01",
        bindingStateRevision: 2,
        reservationGeneration: 1,
        commonDirectoryIdentityDigest: sha("2"),
        predecessorCustodyId: null,
        predecessorConflictGeneration: null,
        ownedConflictGeneration: null,
        lookupGeneration: 1,
        lookupEvidenceDigest: sha("3"),
        lookupOutcome: "unavailable",
        lookupFailureSignatureDigest: sha("4"),
        lookupObservedAt: "2026-07-12T10:00:00.000Z",
        resolutionEligibility: { kind: "none" },
      },
    } as const;
    expect(parseOperationResult(FABRIC_OPERATIONS.operatorActionStatus, base)).toStrictEqual(base);
    for (const gitCustody of [
      { ...base.gitCustody, predecessorCustodyId: "custody_parent_01" },
      { ...base.gitCustody, lookupGeneration: 0 },
      { ...base.gitCustody, lookupFailureSignatureDigest: null },
      { ...base.gitCustody, lookupOutcome: "exact-no-effect" },
      {
        ...base.gitCustody,
        resolutionEligibility: {
          kind: "eligible",
          lookupGeneration: 2,
          evidenceDigest: sha("3"),
          reason: "inspector-unavailable",
        },
      },
    ]) {
      expect(() => parseOperationResult(FABRIC_OPERATIONS.operatorActionStatus, {
        ...base,
        gitCustody,
      })).toThrowError(/custody|lookup|lineage|eligib|signature/iu);
    }
    expect(() => parseOperationResult(FABRIC_OPERATIONS.operatorActionStatus, {
      ...base,
      status: "conflict",
    })).toThrowError(/custody|conflict|owned/iu);
    expect(() => parseOperationResult(FABRIC_OPERATIONS.operatorActionStatus, {
      ...base,
      status: "pending",
      phase: "prepared",
    })).toThrowError(/custody|pending|predecessor/iu);
  });
});
