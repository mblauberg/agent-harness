import {
  enumeration,
  identifier,
  integer,
  literal,
  nullable,
  objectCodec,
  parserBacked,
  sha256,
  timestamp,
  unionOf,
  type Codec,
} from "../codec.js";
import { LAUNCH_PROVIDER_ACTION_JOURNAL_REF_V1_CODEC, PROJECT_SESSION_LAUNCH_INTENT_CODEC } from "../launch.js";
import { AGENT_LIFECYCLE_RECOVERY_INTENT_V1_CODEC } from "../lifecycle.js";
import { FABRIC_OPERATIONS } from "../operations.js";
import {
  artifactRefCodec,
  artifactRefsCodec,
  credentialCodec,
  object,
  operatorMutationCodec,
  positiveInteger,
  releaseBindingCodec,
  stringList,
  text,
  type OperationCodecFragment,
  type OperationShapeFragment,
} from "./common.js";

export const OPERATOR_ACTIONS_INPUT_SHAPES = {
  [FABRIC_OPERATIONS.operatorActionPreview]: object(["command", "projectId", "intent"]),
  [FABRIC_OPERATIONS.operatorActionCommit]: object(["command", "projectId", "previewId", "expectedPreviewRevision", "previewDigest", "expectedIntentDigest", "confirmation"]),
  [FABRIC_OPERATIONS.operatorActionStatus]: object(["credential", "projectId", "commandId"]),
  [FABRIC_OPERATIONS.operatorActionReconcile]: object(["command", "projectId", "targetCommandId", "expectedStatus", "expectedAttemptGeneration", "mode"]),
} as const satisfies OperationShapeFragment;

export const OPERATOR_ACTIONS_RESULT_SHAPES = {
  [FABRIC_OPERATIONS.operatorActionPreview]: object(["previewId", "previewRevision", "previewDigest", "intent", "intentDigest", "beforeStateDigest", "consequenceClass", "evidenceRefs", "gateIds", "confirmationMode", "expiresAt"]),
  [FABRIC_OPERATIONS.operatorActionCommit]: object(["commandId", "previewId", "previewRevision", "intentDigest", "beforeStateDigest", "afterStateDigest", "evidenceRefs", "committedAt"], ["effectRef", "launchProviderActionJournalRef"]),
  [FABRIC_OPERATIONS.operatorActionStatus]: object(["status", "commandId"], ["intentDigest", "phase", "attemptGeneration", "effectRef", "launchProviderActionJournalRef", "receipt", "seatProvisioning", "code", "evidenceRefs"]),
  [FABRIC_OPERATIONS.operatorActionReconcile]: object(["status", "commandId"], ["intentDigest", "phase", "attemptGeneration", "effectRef", "launchProviderActionJournalRef", "receipt", "seatProvisioning", "code", "evidenceRefs"]),
} as const satisfies OperationShapeFragment;

const operatorRevisionTargetCodec = unionOf([
  objectCodec({
    kind: literal("task"),
    projectSessionId: identifier,
    coordinationRunId: identifier,
    taskId: identifier,
    expectedRevision: positiveInteger,
  }),
  objectCodec({
    kind: literal("subtree"),
    projectSessionId: identifier,
    coordinationRunId: identifier,
    rootTaskId: identifier,
    expectedRevision: positiveInteger,
  }),
  objectCodec({
    kind: literal("run"),
    projectSessionId: identifier,
    coordinationRunId: identifier,
    expectedRevision: positiveInteger,
  }),
  objectCodec({
    kind: literal("session"),
    projectSessionId: identifier,
    expectedRevision: positiveInteger,
    expectedGeneration: positiveInteger,
  }),
]);


export function createOperatorActionsCodecs(dependencies: Readonly<{
  gitIntentCodec: Codec<unknown>;
  gitAuthoriseIntentCodec: Codec<unknown>;
  gitOperationDraftIntentCodec: Codec<unknown>;
  gitCustodyResolveIntentCodec: Codec<unknown>;
  gitResolutionEligibilityReasonCodec: Codec<unknown>;
}>) {
  const {
    gitIntentCodec,
    gitAuthoriseIntentCodec,
    gitOperationDraftIntentCodec,
    gitCustodyResolveIntentCodec,
    gitResolutionEligibilityReasonCodec,
  } = dependencies;
  const operatorActionIntentCodec = unionOf([
    objectCodec({ kind: literal("control"), action: literal("pause"), target: operatorRevisionTargetCodec }),
    objectCodec({ kind: literal("control"), action: literal("resume"), target: operatorRevisionTargetCodec }),
    objectCodec({ kind: literal("control"), action: literal("cancel"), target: operatorRevisionTargetCodec, reason: text }),
    objectCodec({
      kind: literal("control"),
      action: literal("steer"),
      target: operatorRevisionTargetCodec,
      instruction: text,
      evidenceRefs: artifactRefsCodec,
    }),
    PROJECT_SESSION_LAUNCH_INTENT_CODEC,
    objectCodec({
      kind: literal("chair-bridge-recovery"),
      schemaVersion: literal(1),
      path: literal("rebind"),
      projectSessionId: identifier,
      coordinationRunId: identifier,
      lossId: identifier,
      recoveryManifestDigest: sha256,
      expectedSessionRevision: positiveInteger,
      expectedSessionGeneration: positiveInteger,
      expectedRunRevision: positiveInteger,
      expectedChairGeneration: positiveInteger,
      expectedPrincipalGeneration: positiveInteger,
      expectedBridgeRevision: positiveInteger,
      expectedLostBridgeGeneration: positiveInteger,
      expectedProviderSessionGeneration: positiveInteger,
      providerAdapterId: identifier,
      providerContractDigest: sha256,
      providerActionId: identifier,
    }),
    objectCodec({
      kind: literal("chair-bridge-recovery"),
      schemaVersion: literal(1),
      path: literal("takeover"),
      projectSessionId: identifier,
      coordinationRunId: identifier,
      lossId: identifier,
      recoveryManifestDigest: sha256,
      expectedSessionRevision: positiveInteger,
      expectedSessionGeneration: positiveInteger,
      expectedRunRevision: positiveInteger,
      expectedChairGeneration: positiveInteger,
      expectedPrincipalGeneration: positiveInteger,
      expectedBridgeRevision: positiveInteger,
      expectedLostBridgeGeneration: positiveInteger,
      expectedProviderSessionGeneration: positiveInteger,
      providerAdapterId: identifier,
      providerContractDigest: sha256,
      successorAgentId: identifier,
      expectedSuccessorPrincipalGeneration: positiveInteger,
      expectedSuccessorBridgeGeneration: positiveInteger,
      expectedSuccessorRevision: positiveInteger,
    }),
    objectCodec({
      kind: literal("chair-bridge-recovery"),
      schemaVersion: literal(1),
      path: literal("abandon"),
      projectSessionId: identifier,
      coordinationRunId: identifier,
      lossId: identifier,
      recoveryManifestDigest: sha256,
      expectedSessionRevision: positiveInteger,
      expectedSessionGeneration: positiveInteger,
      expectedRunRevision: positiveInteger,
      expectedChairGeneration: positiveInteger,
      expectedPrincipalGeneration: positiveInteger,
      expectedBridgeRevision: positiveInteger,
      expectedLostBridgeGeneration: positiveInteger,
      expectedProviderSessionGeneration: positiveInteger,
      providerAdapterId: identifier,
      providerContractDigest: sha256,
      reason: text,
    }),
    objectCodec({
      kind: literal("chair-live-handoff"),
      schemaVersion: literal(1),
      projectSessionId: identifier,
      coordinationRunId: identifier,
      handoffRef: artifactRefCodec,
      predecessorAgentId: identifier,
      successorAgentId: identifier,
      successorAuthorityId: identifier,
      successorAuthorityDigest: sha256,
      expectedSessionRevision: positiveInteger,
      expectedSessionGeneration: positiveInteger,
      expectedMembershipRevision: positiveInteger,
      expectedRunRevision: positiveInteger,
      expectedChairGeneration: positiveInteger,
      expectedChairLeaseId: identifier,
      expectedBridgeRevision: positiveInteger,
      expectedChairBridgeGeneration: positiveInteger,
      expectedPredecessorPrincipalGeneration: positiveInteger,
      expectedSuccessorPrincipalGeneration: positiveInteger,
      expectedSuccessorBridgeRevision: positiveInteger,
      expectedSuccessorBridgeGeneration: positiveInteger,
      providerAdapterId: identifier,
      providerContractDigest: sha256,
    }),
    objectCodec({
      kind: literal("project-session-drain"),
      projectSessionId: identifier,
      expectedSessionRevision: positiveInteger,
      expectedSessionGeneration: positiveInteger,
      expectedGlobalStateRevision: positiveInteger,
    }),
    objectCodec({
      kind: literal("project-session-stop"),
      projectSessionId: identifier,
      expectedSessionRevision: positiveInteger,
      expectedSessionGeneration: positiveInteger,
      expectedGlobalStateRevision: positiveInteger,
      drainReceiptRef: artifactRefCodec,
    }),
    objectCodec({
      kind: literal("daemon-drain"),
      expectedDaemonGeneration: positiveInteger,
      expectedGlobalStateRevision: positiveInteger,
    }),
    objectCodec({
      kind: literal("daemon-stop"),
      expectedDaemonGeneration: positiveInteger,
      expectedGlobalStateRevision: positiveInteger,
      drainReceiptRef: artifactRefCodec,
    }),
    gitIntentCodec,
    gitAuthoriseIntentCodec,
    gitOperationDraftIntentCodec,
    gitCustodyResolveIntentCodec,

    AGENT_LIFECYCLE_RECOVERY_INTENT_V1_CODEC,
    objectCodec({
      kind: literal("registered-external-effect"),
      integrationId: identifier,
      expectedIntegrationGeneration: positiveInteger,
      operationId: identifier,
      contractDigest: sha256,
      requestArtifactRef: artifactRefCodec,
      targetId: identifier,
      expectedTargetRevision: positiveInteger,
      idempotencyKey: text,
    }),
    objectCodec({
      kind: literal("provider-route-integrity-retire"),
      projectSessionId: identifier,
      coordinationRunId: identifier,
      actionRef: objectCodec({ adapterId: identifier, actionId: identifier }),
      recoveryGeneration: positiveInteger,
      expectedState: literal("awaiting-human-retire"),
      reservationDigest: sha256,
      gateId: identifier,
      expectedGateRevision: positiveInteger,
      directInputAttestationId: identifier,
    }),
    objectCodec({
      kind: literal("promotion"),
      projectSessionId: identifier,
      coordinationRunId: identifier,
      gateId: identifier,
      expectedGateRevision: positiveInteger,
      expectedGateStatus: literal("approved"),
      releaseBinding: releaseBindingCodec,
    }),
  ]);

  const operatorActionPreviewInputCodec = objectCodec({
    command: operatorMutationCodec,
    projectId: identifier,
    intent: operatorActionIntentCodec,
  });
  const operatorActionPreviewCodec = objectCodec({
    previewId: identifier,
    previewRevision: positiveInteger,
    previewDigest: sha256,
    intent: operatorActionIntentCodec,
    intentDigest: sha256,
    beforeStateDigest: sha256,
    consequenceClass: enumeration(["routine", "consequential", "destructive", "external", "promotion"]),
    evidenceRefs: artifactRefsCodec,
    gateIds: stringList,
    confirmationMode: enumeration(["explicit", "echo"]),
    expiresAt: timestamp,
  });
  const operatorActionConfirmationCodec = unionOf([
    objectCodec({ kind: literal("explicit"), confirmationId: identifier }),
    objectCodec({ kind: literal("echo"), echoedPreviewDigest: sha256 }),
  ]);
  const operatorActionCommitBaseCodec = objectCodec({
    command: operatorMutationCodec,
    projectId: identifier,
    previewId: identifier,
    expectedPreviewRevision: positiveInteger,
    previewDigest: sha256,
    expectedIntentDigest: sha256,
    confirmation: operatorActionConfirmationCodec,
  });
  const operatorActionCommitCodec = parserBacked(
    operatorActionCommitBaseCodec,
    (value) => {
      const confirmation = Reflect.get(value as object, "confirmation") as Record<string, unknown>;
      if (confirmation.kind === "echo" && confirmation.echoedPreviewDigest !== Reflect.get(value as object, "previewDigest")) {
        throw new TypeError("operatorActionCommit echoed preview digest does not match");
      }
      return value;
    },
    operatorActionCommitBaseCodec.example,
  );
  const operatorActionReceiptFields = {
    commandId: identifier,
    previewId: identifier,
    previewRevision: positiveInteger,
    intentDigest: sha256,
    beforeStateDigest: sha256,
    afterStateDigest: sha256,
    evidenceRefs: artifactRefsCodec,
    committedAt: timestamp,
  };
  const mcpSeatProvisioningDescriptorV1Codec = objectCodec({
    schemaVersion: literal(1),
    projectSessionId: identifier,
    sessionRevision: positiveInteger,
    sessionGeneration: positiveInteger,
    coordinationRunId: identifier,
    runRevision: positiveInteger,
    chairAgentId: identifier,
    chairGeneration: positiveInteger,
    chairLeaseId: identifier,
  });
  const operatorActionReceiptCodec = unionOf([
    objectCodec(operatorActionReceiptFields, { effectRef: artifactRefCodec }),
    objectCodec({ ...operatorActionReceiptFields, launchProviderActionJournalRef: LAUNCH_PROVIDER_ACTION_JOURNAL_REF_V1_CODEC }, {
      effectRef: artifactRefCodec,
    }),
  ]);
  const operatorActionStatusInputCodec = objectCodec({
    credential: credentialCodec,
    projectId: identifier,
    commandId: identifier,
  });
  const gitLookupOutcomeCodec = enumeration([
    "exact-conflict", "exact-applied", "exact-no-effect", "incomplete", "unavailable", "inconsistent",
    "inspector-unavailable", "remote-proof-permanently-unavailable", "mixed-local-remote-evidence",
    "evidence-integrity-failure", "conflict-state-unverifiable",
  ]);
  const gitResolutionEligibilityCodec = unionOf([
    objectCodec({ kind: literal("none") }),
    objectCodec({
      kind: literal("eligible"),
      lookupGeneration: positiveInteger,
      evidenceDigest: sha256,
      reason: gitResolutionEligibilityReasonCodec,
    }),
  ]);
  const gitCustodyStatusBaseCodec = objectCodec({
    custodyId: identifier,
    bindingStateRevision: positiveInteger,
    reservationGeneration: positiveInteger,
    commonDirectoryIdentityDigest: sha256,
    predecessorCustodyId: nullable(identifier),
    predecessorConflictGeneration: nullable(positiveInteger),
    ownedConflictGeneration: nullable(positiveInteger),
    lookupGeneration: integer({ minimum: 0 }),
    lookupEvidenceDigest: nullable(sha256),
    lookupOutcome: nullable(gitLookupOutcomeCodec),
    lookupFailureSignatureDigest: nullable(sha256),
    lookupObservedAt: nullable(timestamp),
    resolutionEligibility: gitResolutionEligibilityCodec,
  });
  const gitCustodyStatusCodec = parserBacked(
    gitCustodyStatusBaseCodec,
    (value) => {
      const custody = value as Record<string, unknown>;
      const predecessorCustodyId = custody.predecessorCustodyId;
      const predecessorConflictGeneration = custody.predecessorConflictGeneration;
      if ((predecessorCustodyId === null) !== (predecessorConflictGeneration === null)) {
        throw new TypeError("Git custody predecessor lineage must be wholly present or absent");
      }
      const lookupGeneration = custody.lookupGeneration as number;
      const lookupEvidenceDigest = custody.lookupEvidenceDigest;
      const lookupOutcome = custody.lookupOutcome;
      const lookupObservedAt = custody.lookupObservedAt;
      const lookupFailureSignatureDigest = custody.lookupFailureSignatureDigest;
      if (lookupGeneration === 0) {
        if (lookupEvidenceDigest !== null || lookupOutcome !== null || lookupObservedAt !== null || lookupFailureSignatureDigest !== null) {
          throw new TypeError("Git custody lookup generation zero cannot carry lookup evidence");
        }
      } else if (lookupEvidenceDigest === null || lookupOutcome === null || lookupObservedAt === null) {
        throw new TypeError("Git custody positive lookup generation requires complete lookup evidence");
      }
      const signatureOutcomes = new Set([
        "incomplete", "unavailable", "inconsistent", "inspector-unavailable",
        "remote-proof-permanently-unavailable", "mixed-local-remote-evidence", "evidence-integrity-failure",
        "conflict-state-unverifiable",
      ]);
      if (signatureOutcomes.has(String(lookupOutcome)) !== (lookupFailureSignatureDigest !== null)) {
        throw new TypeError("Git custody lookup failure signature does not match its outcome");
      }
      const eligibility = custody.resolutionEligibility as Record<string, unknown>;
      if (eligibility.kind === "eligible" && (
        eligibility.lookupGeneration !== lookupGeneration ||
        eligibility.evidenceDigest !== lookupEvidenceDigest ||
        eligibility.reason !== lookupOutcome
      )) throw new TypeError("Git custody resolution eligibility must bind the latest lookup evidence and outcome");
      return value;
    },
    gitCustodyStatusBaseCodec.example,
  );
  const ownedConflictReconcileCodec = objectCodec({
    kind: literal("owned-conflict"),
    custodyId: identifier,
    expectedBindingState: literal("conflict"),
    expectedBindingStateRevision: positiveInteger,
    expectedOwnedConflictGeneration: positiveInteger,
    expectedPredecessorCustodyId: nullable(identifier),
    expectedPredecessorConflictGeneration: nullable(positiveInteger),
    expectedReservationGeneration: positiveInteger,
    expectedCommonDirectoryIdentityDigest: sha256,
    expectedLookupGeneration: integer({ minimum: 0 }),
    expectedLookupEvidenceDigest: nullable(sha256),
    expectedResolutionEligibility: literal("none"),
  });
  const inheritedConflictReconcileCodec = objectCodec({
    kind: literal("inherited-successor"),
    custodyId: identifier,
    expectedBindingState: enumeration(["prepared", "ambiguous", "quarantined"]),
    expectedBindingStateRevision: positiveInteger,
    expectedOwnedConflictGeneration: literal(null),
    expectedPredecessorCustodyId: identifier,
    expectedPredecessorConflictGeneration: positiveInteger,
    expectedReservationGeneration: positiveInteger,
    expectedCommonDirectoryIdentityDigest: sha256,
    expectedLookupGeneration: integer({ minimum: 0 }),
    expectedLookupEvidenceDigest: nullable(sha256),
    expectedResolutionEligibility: literal("none"),
  });
  const operatorActionReconcileBaseCodec = unionOf([
    objectCodec({
      command: operatorMutationCodec,
      projectId: identifier,
      targetCommandId: identifier,
      expectedStatus: enumeration(["pending", "ambiguous"]),
      expectedAttemptGeneration: positiveInteger,
      mode: literal("observe-only"),
    }),
    objectCodec({
      command: operatorMutationCodec,
      projectId: identifier,
      targetCommandId: identifier,
      expectedStatus: literal("conflict"),
      expectedAttemptGeneration: positiveInteger,
      mode: literal("observe-only"),
      gitConflict: ownedConflictReconcileCodec,
    }),
    objectCodec({
      command: operatorMutationCodec,
      projectId: identifier,
      targetCommandId: identifier,
      expectedStatus: enumeration(["pending", "ambiguous", "quarantined"]),
      expectedAttemptGeneration: positiveInteger,
      mode: literal("observe-only"),
      gitConflict: inheritedConflictReconcileCodec,
    }),
  ]);
  const operatorActionReconcileCodec = parserBacked(
    operatorActionReconcileBaseCodec,
    (value) => {
      const command = Reflect.get(value as object, "command") as Record<string, unknown>;
      if (command.commandId === Reflect.get(value as object, "targetCommandId")) {
        throw new TypeError("operatorActionReconcile requires a new command ID");
      }
      return value;
    },
    {
      ...operatorActionReconcileBaseCodec.example,
      targetCommandId: "target_command_01",
    },
  );
  const operatorActionStatusBaseCodec = unionOf([
    objectCodec({ status: literal("not-found"), commandId: identifier }),
    objectCodec({
      status: literal("pending"),
      commandId: identifier,
      intentDigest: sha256,
      phase: enumeration(["prepared", "dispatched", "accepted", "observing"]),
      attemptGeneration: positiveInteger,
    }),
    objectCodec({
      status: literal("pending"),
      commandId: identifier,
      intentDigest: sha256,
      phase: enumeration(["prepared", "dispatched", "accepted", "observing"]),
      attemptGeneration: positiveInteger,
      launchProviderActionJournalRef: LAUNCH_PROVIDER_ACTION_JOURNAL_REF_V1_CODEC,
    }),
    objectCodec({
      status: literal("pending"),
      commandId: identifier,
      intentDigest: sha256,
      phase: literal("prepared"),
      attemptGeneration: positiveInteger,
      gitCustody: gitCustodyStatusCodec,
    }),
    objectCodec({
      status: literal("ambiguous"),
      commandId: identifier,
      intentDigest: sha256,
      attemptGeneration: positiveInteger,
      effectRef: artifactRefCodec,
    }),
    objectCodec({
      status: literal("ambiguous"),
      commandId: identifier,
      intentDigest: sha256,
      attemptGeneration: positiveInteger,
      launchProviderActionJournalRef: LAUNCH_PROVIDER_ACTION_JOURNAL_REF_V1_CODEC,
    }, { effectRef: artifactRefCodec }),
    objectCodec({
      status: literal("ambiguous"),
      commandId: identifier,
      intentDigest: sha256,
      attemptGeneration: positiveInteger,
      gitCustody: gitCustodyStatusCodec,
    }, { effectRef: artifactRefCodec }),
    objectCodec({
      status: literal("conflict"),
      commandId: identifier,
      intentDigest: sha256,
      attemptGeneration: positiveInteger,
      gitCustody: gitCustodyStatusCodec,
    }),
    objectCodec({
      status: literal("quarantined"),
      commandId: identifier,
      intentDigest: sha256,
      attemptGeneration: positiveInteger,
      gitCustody: gitCustodyStatusCodec,
    }),
    parserBacked(objectCodec({ status: literal("committed"), commandId: identifier, receipt: operatorActionReceiptCodec }, {
      launchProviderActionJournalRef: LAUNCH_PROVIDER_ACTION_JOURNAL_REF_V1_CODEC,
      seatProvisioning: mcpSeatProvisioningDescriptorV1Codec,
    }), (value) => {
      const status = value as Record<string, unknown>;
      const journal = status.launchProviderActionJournalRef as Record<string, unknown> | undefined;
      const seatProvisioning = status.seatProvisioning;
      const receipt = status.receipt as Record<string, unknown>;
      if (journal === undefined) {
        if (seatProvisioning !== undefined) {
          throw new TypeError("operatorActionStatus seatProvisioning requires a terminal-success launch");
        }
        if (receipt.launchProviderActionJournalRef !== undefined) {
          throw new TypeError("operatorActionStatus launch receipt requires terminal settlement");
        }
        return value;
      }
      if (receipt.launchProviderActionJournalRef === undefined) {
        throw new TypeError("operatorActionStatus launch settlement requires a launch receipt");
      }
      if (journal.journalState !== "terminal") {
        throw new TypeError("operatorActionStatus committed launch journal must be terminal");
      }
      if (journal.outcomeKind === "terminal-success") {
        if (seatProvisioning === undefined) {
          throw new TypeError("operatorActionStatus terminal-success launch requires seatProvisioning");
        }
        return value;
      }
      if (journal.outcomeKind === "terminal-no-effect" && seatProvisioning === undefined) return value;
      throw new TypeError("operatorActionStatus seatProvisioning requires a terminal-success launch");
    }, {
      status: "committed",
      commandId: "command_launch_01",
      receipt: operatorActionReceiptCodec.example,
    }),
    objectCodec({
      status: literal("rejected"),
      commandId: identifier,
      intentDigest: sha256,
      code: enumeration([
        "authority-insufficient",
        "preview-expired",
        "preview-stale",
        "state-changed",
        "generation-stale",
        "git-state-changed",
        "external-contract-unknown",
        "external-contract-stale",
        "release-binding-mismatch",
        "dedupe-conflict",
      ]),
      evidenceRefs: artifactRefsCodec,
    }),
  ]);
  const operatorActionStatusCodec = parserBacked(
    operatorActionStatusBaseCodec,
    (value) => {
      const status = value as Record<string, unknown>;
      const custody = status.gitCustody as Record<string, unknown> | undefined;
      if (custody === undefined) return value;
      const predecessorPresent = custody.predecessorCustodyId !== null && custody.predecessorConflictGeneration !== null;
      const eligibility = custody.resolutionEligibility as Record<string, unknown>;
      if (status.status === "pending" && (
        status.phase !== "prepared" || !predecessorPresent || custody.ownedConflictGeneration !== null || eligibility.kind !== "none"
      )) throw new TypeError("Git custody pending status requires one inherited predecessor and no owned conflict or eligibility");
      if (status.status === "conflict" && (
        typeof custody.ownedConflictGeneration !== "number" || eligibility.kind !== "none"
      )) throw new TypeError("Git custody conflict status requires one owned conflict and no resolution eligibility");
      return value;
    },
    operatorActionStatusBaseCodec.example,
  );


  const fragment = {
    [FABRIC_OPERATIONS.operatorActionPreview]: { input: operatorActionPreviewInputCodec, result: operatorActionPreviewCodec },
    [FABRIC_OPERATIONS.operatorActionCommit]: { input: operatorActionCommitCodec, result: operatorActionReceiptCodec },
    [FABRIC_OPERATIONS.operatorActionStatus]: { input: operatorActionStatusInputCodec, result: operatorActionStatusCodec },
    [FABRIC_OPERATIONS.operatorActionReconcile]: { input: operatorActionReconcileCodec, result: operatorActionStatusCodec },
  } satisfies OperationCodecFragment;

  return { fragment, operatorActionPreviewCodec } as const;
}
