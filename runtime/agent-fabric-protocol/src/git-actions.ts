import type {
  ProjectId,
  ProjectSessionId,
  CoordinationRunId,
  Sha256Digest,
  Timestamp,
} from "./primitives.js";

export const GIT_OPERATION_VARIANTS = [
  "fetch",
  "pull-fast-forward-only",
  "pull-merge-commit-start",
  "pull-rebase-start",
  "stage",
  "unstage",
  "commit",
  "merge-fast-forward-only-start",
  "merge-commit-start",
  "merge-continue",
  "merge-abort",
  "rebase-current-branch-no-autostash-start",
  "rebase-continue",
  "rebase-abort",
  "push-fast-forward-only",
  "push-force-with-lease",
  "branch-create",
  "branch-rename",
  "branch-delete-merged-only",
  "branch-delete-force",
  "worktree-create-detached",
  "worktree-create-new-branch",
  "worktree-create-existing-branch",
  "worktree-move",
  "worktree-remove-clean",
  "worktree-remove-force",
  "upstream-set",
  "upstream-unset",
] as const;

export type GitOperationVariant = (typeof GIT_OPERATION_VARIANTS)[number];

export const PREAUTHORISED_GIT_OPERATION_VARIANTS = [
  "fetch",
  "pull-fast-forward-only",
  "stage",
  "unstage",
  "commit",
  "push-fast-forward-only",
  "branch-create",
  "branch-rename",
  "branch-delete-merged-only",
  "worktree-create-detached",
  "worktree-create-new-branch",
  "worktree-create-existing-branch",
  "worktree-move",
  "worktree-remove-clean",
  "upstream-set",
  "upstream-unset",
] as const satisfies readonly GitOperationVariant[];

export type PreauthorisedGitOperationVariant = (typeof PREAUTHORISED_GIT_OPERATION_VARIANTS)[number];

export type GitRepositoryBinding = {
  repositoryRoot: string;
  worktreePath: string;
  gitCommonDir: string;
  commonDirectoryIdentityDigest: Sha256Digest;
  repositoryStateDigest: Sha256Digest;
  headDigest: Sha256Digest;
  indexDigest: Sha256Digest;
  worktreeDigest: Sha256Digest;
  remoteStateDigest: Sha256Digest;
  configDigest: Sha256Digest;
  worktreeRegistryDigest: Sha256Digest;
};

export type GitExecutionProfileBinding = {
  profileId: string;
  revision: number;
  digest: Sha256Digest;
  gitBinaryDigest: Sha256Digest;
  objectFormat: "sha1" | "sha256";
};

export type GitRemoteBinding = {
  registrationId: string;
  revision: number;
  generation: number;
  remoteName: string;
  targetDigest: Sha256Digest;
  adapterId: string;
  adapterContractDigest: Sha256Digest;
};

export type GitIdentity = {
  name: string;
  email: string;
  timestamp: Timestamp;
};

export type GitCommitMapping = {
  sourceObjectDigest: Sha256Digest | null;
  parentDigests: readonly Sha256Digest[];
  treeDigest: Sha256Digest;
  author: GitIdentity;
  committer: GitIdentity;
  message: string;
  resultObjectDigest: Sha256Digest;
};

export type GitRefUpdateRecipe = {
  refName: string;
  beforeObjectDigest: Sha256Digest | null;
  afterObjectDigest: Sha256Digest | null;
};

export type GitConfigUpdateRecipe = {
  section: "branch";
  subsection: string;
  key: "remote" | "merge";
  beforeValue: string | null;
  afterValue: string | null;
};

export type GitAffectedPathRecipe = {
  path: string;
  beforeDigest: Sha256Digest | null;
  afterDigest: Sha256Digest | null;
};

export type GitConflictRecipe = {
  kind: "merge" | "rebase";
  operationStateDigest: Sha256Digest;
  indexDigest: Sha256Digest;
  worktreeDigest: Sha256Digest;
  conflictPaths: readonly {
    path: string;
    stage1Digest: Sha256Digest | null;
    stage2Digest: Sha256Digest | null;
    stage3Digest: Sha256Digest | null;
  }[];
};

export type GitResultRecipeV1 = {
  schemaVersion: 1;
  executionProfileDigest: Sha256Digest;
  resultRecipeDigest: Sha256Digest;
  beforeRepositoryStateDigest: Sha256Digest;
  expectedSuccessRepositoryStateDigest: Sha256Digest;
  expectedConflict: GitConflictRecipe | null;
  refUpdates: readonly GitRefUpdateRecipe[];
  configUpdates: readonly GitConfigUpdateRecipe[];
  commitMappings: readonly GitCommitMapping[];
  affectedPaths: readonly GitAffectedPathRecipe[];
  bounds: {
    maximumRefOrConfigUpdates: 64;
    maximumCommitMappings: 128;
    maximumConflictPaths: 4096;
  };
};

type GitRemoteOperation = {
  remote: GitRemoteBinding;
  sourceRef: string;
  destinationRef: string;
  sourceObjectDigest: Sha256Digest;
  destinationObjectDigest: Sha256Digest | null;
};

type GitConflictSuccessor = {
  predecessorCustodyId: string;
  predecessorConflictGeneration: number;
  expectedConflictStateDigest: Sha256Digest;
};

export type GitOperation =
  | ({ variant: "fetch" } & GitRemoteOperation)
  | ({ variant: "pull-fast-forward-only" | "pull-merge-commit-start" | "pull-rebase-start" } & GitRemoteOperation)
  | { variant: "stage" | "unstage"; paths: readonly string[] }
  | {
      variant: "commit";
      sourceIndexDigest: Sha256Digest;
      parentObjectDigest: Sha256Digest;
      treeDigest: Sha256Digest;
      message: string;
      author: GitIdentity;
      committer: GitIdentity;
      resultingCommitDigest: Sha256Digest;
    }
  | {
      variant: "merge-fast-forward-only-start" | "merge-commit-start";
      sourceRef: string;
      sourceObjectDigest: Sha256Digest;
      destinationRef: string;
      destinationObjectDigest: Sha256Digest;
    }
  | ({ variant: "merge-continue" | "merge-abort" } & GitConflictSuccessor)
  | {
      variant: "rebase-current-branch-no-autostash-start";
      sourceRef: string;
      sourceObjectDigest: Sha256Digest;
      destinationRef: string;
      destinationObjectDigest: Sha256Digest;
    }
  | ({ variant: "rebase-continue" | "rebase-abort" } & GitConflictSuccessor)
  | ({ variant: "push-fast-forward-only" } & GitRemoteOperation)
  | ({ variant: "push-force-with-lease"; expectedRemoteObjectDigest: Sha256Digest } & GitRemoteOperation)
  | {
      variant: "branch-create";
      sourceObjectDigest: Sha256Digest;
      destinationRef: string;
    }
  | {
      variant: "branch-rename";
      sourceRef: string;
      sourceObjectDigest: Sha256Digest;
      destinationRef: string;
    }
  | {
      variant: "branch-delete-merged-only";
      sourceRef: string;
      sourceObjectDigest: Sha256Digest;
      mergedIntoObjectDigest: Sha256Digest;
    }
  | {
      variant: "branch-delete-force";
      sourceRef: string;
      sourceObjectDigest: Sha256Digest;
    }
  | {
      variant: "worktree-create-detached";
      destinationWorktreePath: string;
      sourceObjectDigest: Sha256Digest;
    }
  | {
      variant: "worktree-create-new-branch";
      destinationWorktreePath: string;
      sourceObjectDigest: Sha256Digest;
      branchRef: string;
    }
  | {
      variant: "worktree-create-existing-branch";
      destinationWorktreePath: string;
      sourceObjectDigest: Sha256Digest;
      branchRef: string;
    }
  | {
      variant: "worktree-move";
      sourceWorktreePath: string;
      destinationWorktreePath: string;
      expectedWorktreeStateDigest: Sha256Digest;
    }
  | {
      variant: "worktree-remove-clean" | "worktree-remove-force";
      sourceWorktreePath: string;
      expectedWorktreeStateDigest: Sha256Digest;
    }
  | {
      variant: "upstream-set";
      localBranchRef: string;
      remote: GitRemoteBinding;
      remoteBranchRef: string;
      expectedConfigDigest: Sha256Digest;
    }
  | {
      variant: "upstream-unset";
      localBranchRef: string;
      remote: GitRemoteBinding;
      remoteBranchRef: string;
      expectedConfigDigest: Sha256Digest;
    };

export function gitOperationVariant(operation: GitOperation): GitOperationVariant {
  return operation.variant;
}

export function isPreauthorisedGitOperationVariant(
  variant: GitOperationVariant,
): variant is PreauthorisedGitOperationVariant {
  return (PREAUTHORISED_GIT_OPERATION_VARIANTS as readonly string[]).includes(variant);
}

export type GitActionAuthorisationDecision =
  | {
      kind: "preauthorised";
      grantId: string;
      expectedGrantRevision: number;
      grantDigest: Sha256Digest;
    }
  | {
      kind: "gate";
      draftId: string;
      expectedDraftRevision: number;
      draftDigest: Sha256Digest;
      gateId: string;
      expectedGateRevision: number;
      expectedGateStatus: "approved";
      blockedOperationId: string;
    };

export type GitActionAuthorisation = {
  projectId: ProjectId;
  projectSessionId: ProjectSessionId;
  expectedSessionRevision: number;
  expectedSessionGeneration: number;
  coordinationRunId: CoordinationRunId;
  expectedRunRevision: number;
  expectedDependencyRevision: number;
  authorityRef: Sha256Digest;
  expectedAuthorityRevision: number;
  expectedGitAllowlistEpoch: number;
  gitAllowlistDigest: Sha256Digest | null;
  repositoryRoot: string;
  worktreePath: string;
  repositoryStateDigest: Sha256Digest;
  executionProfileId: string;
  executionProfileRevision: number;
  executionProfileDigest: Sha256Digest;
  operationVariant: GitOperationVariant;
  remoteBinding: GitRemoteBinding | null;
  resultRecipeDigest: Sha256Digest;
  operationId: string;
  effectBindingDigest: Sha256Digest;
  decision: GitActionAuthorisationDecision;
};

export type OperatorGitIntent = {
  kind: "git";
  authorisation: GitActionAuthorisation;
  repository: GitRepositoryBinding;
  executionProfile: GitExecutionProfileBinding;
  operation: GitOperation;
  resultRecipe: GitResultRecipeV1;
};

export type GitGrantConstraints = {
  operationVariants: readonly PreauthorisedGitOperationVariant[];
  remoteBindings: readonly GitRemoteBinding[];
  refs: readonly string[];
  pathPrefixes: readonly string[];
  allowWorktreeCreation: boolean;
};

export type GitActionGrant = {
  grantId: string;
  revision: number;
  projectId: ProjectId;
  projectSessionId: ProjectSessionId;
  sessionGeneration: number;
  issuingSessionRevision: number;
  coordinationRunId: CoordinationRunId;
  issuingRunRevision: number;
  issuingDependencyRevision: number;
  authorityRef: Sha256Digest;
  authorityRevision: number;
  gitAllowlistEpoch: number;
  gitAllowlistDigest: Sha256Digest;
  repositoryRoot: string;
  worktreePath: string;
  executionProfileId: string;
  executionProfileRevision: number;
  executionProfileDigest: Sha256Digest;
  constraints: GitGrantConstraints;
  sourceAuthority: { kind: "launch-envelope" | "operator-command"; digest: Sha256Digest };
  expiresAt: Timestamp;
  grantDigest: Sha256Digest;
};

type GitAuthoriseCommon = {
  kind: "git-authorise";
  projectId: ProjectId;
  projectSessionId: ProjectSessionId;
  expectedSessionRevision: number;
  expectedSessionGeneration: number;
  coordinationRunId: CoordinationRunId;
  expectedRunRevision: number;
  expectedDependencyRevision: number;
  authorityRef: Sha256Digest;
  expectedAuthorityRevision: number;
  expectedGitAllowlistEpoch: number;
  gitAllowlistDigest: Sha256Digest;
};

export type GitAuthoriseIntent = GitAuthoriseCommon & (
  | { action: "issue"; proposedGrant: GitActionGrant }
  | { action: "revise"; currentGrant: GitActionGrant; proposedGrant: GitActionGrant }
  | { action: "revoke"; currentGrant: GitActionGrant }
);

export type GitMutationDraftBinding = {
  kind: "mutation";
  authorisation: Omit<GitActionAuthorisation, "operationId" | "decision">;
  repository: GitRepositoryBinding;
  executionProfile: GitExecutionProfileBinding;
  operation: GitOperation;
  resultRecipe: GitResultRecipeV1;
};

export type GitCustodyResolutionDraftBinding = {
  kind: "custody-resolution";
  projectId: ProjectId;
  projectSessionId: ProjectSessionId;
  expectedSessionRevision: number;
  expectedSessionGeneration: number;
  coordinationRunId: CoordinationRunId;
  expectedRunRevision: number;
  expectedDependencyRevision: number;
  authorityRef: Sha256Digest;
  expectedAuthorityRevision: number;
  custodyId: string;
  expectedCustodyState: "ambiguous" | "quarantined";
  expectedLookupGeneration: number;
  lookupEvidenceDigest: Sha256Digest;
  resolutionEligibilityReason: GitResolutionEligibilityReason;
  adjudication: "applied" | "no-effect" | "quarantine-accepted";
  reason: string;
};

export type GitOperationDraftIntent =
  | {
      kind: "git-operation-draft";
      action: "create";
      draftRequestId: string;
      expiresAt: Timestamp;
      binding: GitMutationDraftBinding | GitCustodyResolutionDraftBinding;
    }
  | {
      kind: "git-operation-draft";
      action: "cancel";
      projectId: ProjectId;
      projectSessionId: ProjectSessionId;
      expectedSessionRevision: number;
      expectedSessionGeneration: number;
      coordinationRunId: CoordinationRunId;
      expectedRunRevision: number;
      expectedDependencyRevision: number;
      draftId: string;
      expectedDraftRevision: number;
      draftDigest: Sha256Digest;
    };

export const GIT_LOOKUP_OUTCOMES = [
  "exact-conflict",
  "exact-applied",
  "exact-no-effect",
  "incomplete",
  "unavailable",
  "inconsistent",
  "inspector-unavailable",
  "remote-proof-permanently-unavailable",
  "mixed-local-remote-evidence",
  "evidence-integrity-failure",
  "conflict-state-unverifiable",
] as const;

export type GitLookupOutcome = (typeof GIT_LOOKUP_OUTCOMES)[number];
export type GitResolutionEligibilityReason = Extract<GitLookupOutcome,
  | "inspector-unavailable"
  | "remote-proof-permanently-unavailable"
  | "mixed-local-remote-evidence"
  | "evidence-integrity-failure"
  | "conflict-state-unverifiable"
>;

export type GitCustodyResolveIntent = {
  kind: "git-custody-resolve";
  projectId: ProjectId;
  projectSessionId: ProjectSessionId;
  expectedSessionRevision: number;
  expectedSessionGeneration: number;
  coordinationRunId: CoordinationRunId;
  expectedRunRevision: number;
  expectedDependencyRevision: number;
  authorityRef: Sha256Digest;
  expectedAuthorityRevision: number;
  draftId: string;
  expectedDraftRevision: number;
  draftDigest: Sha256Digest;
  operationId: string;
  custodyId: string;
  expectedCustodyState: "ambiguous" | "quarantined";
  expectedLookupGeneration: number;
  lookupEvidenceDigest: Sha256Digest;
  resolutionEligibilityReason: GitResolutionEligibilityReason;
  adjudication: "applied" | "no-effect" | "quarantine-accepted";
  reason: string;
  gateId: string;
  expectedGateRevision: number;
  expectedGateStatus: "approved";
};

export type GitCustodyStatus = {
  custodyId: string;
  bindingStateRevision: number;
  reservationGeneration: number;
  commonDirectoryIdentityDigest: Sha256Digest;
  predecessorCustodyId: string | null;
  predecessorConflictGeneration: number | null;
  ownedConflictGeneration: number | null;
  lookupGeneration: number;
  lookupEvidenceDigest: Sha256Digest | null;
  lookupOutcome: GitLookupOutcome | null;
  lookupFailureSignatureDigest: Sha256Digest | null;
  lookupObservedAt: Timestamp | null;
  resolutionEligibility:
    | { kind: "none" }
    | {
        kind: "eligible";
        lookupGeneration: number;
        evidenceDigest: Sha256Digest;
        reason: GitResolutionEligibilityReason;
      };
};

export type GitConflictReconcileBinding =
  | {
      kind: "owned-conflict";
      custodyId: string;
      expectedBindingState: "conflict";
      expectedBindingStateRevision: number;
      expectedOwnedConflictGeneration: number;
      expectedPredecessorCustodyId: string | null;
      expectedPredecessorConflictGeneration: number | null;
      expectedReservationGeneration: number;
      expectedCommonDirectoryIdentityDigest: Sha256Digest;
      expectedLookupGeneration: number;
      expectedLookupEvidenceDigest: Sha256Digest | null;
      expectedResolutionEligibility: "none";
    }
  | {
      kind: "inherited-successor";
      custodyId: string;
      expectedBindingState: "prepared" | "ambiguous" | "quarantined";
      expectedBindingStateRevision: number;
      expectedOwnedConflictGeneration: null;
      expectedPredecessorCustodyId: string;
      expectedPredecessorConflictGeneration: number;
      expectedReservationGeneration: number;
      expectedCommonDirectoryIdentityDigest: Sha256Digest;
      expectedLookupGeneration: number;
      expectedLookupEvidenceDigest: Sha256Digest | null;
      expectedResolutionEligibility: "none";
    };

export type GitCurrentState = {
  revision: number;
  projectId: ProjectId;
  projectSessionId: ProjectSessionId;
  sessionRevision: number;
  sessionGeneration: number;
  coordinationRunId: CoordinationRunId;
  runRevision: number;
  dependencyRevision: number;
  authorityRef: Sha256Digest;
  authorityRevision: number;
  gitAllowlistEpoch: number;
  gitAllowlistDigest: Sha256Digest | null;
  repository: GitRepositoryBinding;
  executionProfile: GitExecutionProfileBinding;
  remoteBinding: GitRemoteBinding | null;
  grant: GitActionGrant | null;
};

export function assertGitIntentState(intent: OperatorGitIntent, current: GitCurrentState): void {
  const binding = intent.authorisation;
  if (binding.projectId !== current.projectId || binding.projectSessionId !== current.projectSessionId) {
    throw new TypeError("operator Git project/session binding changed");
  }
  if (
    binding.expectedSessionRevision !== current.sessionRevision ||
    binding.expectedSessionGeneration !== current.sessionGeneration ||
    binding.coordinationRunId !== current.coordinationRunId ||
    binding.expectedRunRevision !== current.runRevision ||
    binding.expectedDependencyRevision !== current.dependencyRevision ||
    binding.authorityRef !== current.authorityRef ||
    binding.expectedAuthorityRevision !== current.authorityRevision ||
    binding.expectedGitAllowlistEpoch !== current.gitAllowlistEpoch ||
    binding.gitAllowlistDigest !== current.gitAllowlistDigest
  ) throw new TypeError("operator Git authority revision changed");
  if (
    binding.operationVariant !== intent.operation.variant ||
    binding.resultRecipeDigest !== intent.resultRecipe.resultRecipeDigest ||
    binding.repositoryStateDigest !== intent.repository.repositoryStateDigest ||
    binding.repositoryRoot !== intent.repository.repositoryRoot ||
    binding.worktreePath !== intent.repository.worktreePath ||
    binding.executionProfileId !== intent.executionProfile.profileId ||
    binding.executionProfileRevision !== intent.executionProfile.revision ||
    binding.executionProfileDigest !== intent.executionProfile.digest
  ) throw new TypeError("operator Git effect binding does not match the typed action");
  if (intent.resultRecipe.beforeRepositoryStateDigest !== intent.repository.repositoryStateDigest) {
    throw new TypeError("operator Git result recipe before state does not match");
  }
  if (intent.resultRecipe.executionProfileDigest !== intent.executionProfile.digest) {
    throw new TypeError("operator Git result recipe execution profile does not match");
  }
  if (binding.decision.kind === "preauthorised" && !isPreauthorisedGitOperationVariant(intent.operation.variant)) {
    throw new TypeError("operator Git gate-only variant cannot use preauthorised authority");
  }
  if (binding.decision.kind === "gate" && binding.decision.blockedOperationId !== binding.operationId) {
    throw new TypeError("operator Git gate does not bind the exact operation ID");
  }
  if (
    current.repository.repositoryStateDigest !== intent.repository.repositoryStateDigest ||
    current.executionProfile.digest !== intent.executionProfile.digest
  ) throw new TypeError("operator Git repository or execution profile changed");
  if (binding.decision.kind === "preauthorised") {
    if (
      current.grant === null ||
      current.grant.grantId !== binding.decision.grantId ||
      current.grant.revision !== binding.decision.expectedGrantRevision ||
      current.grant.grantDigest !== binding.decision.grantDigest
    ) throw new TypeError("operator Git grant changed");
  }
}
