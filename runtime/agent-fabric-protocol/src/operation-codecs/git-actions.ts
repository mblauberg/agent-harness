import {
  arrayOf,
  boolean,
  boundedString,
  enumeration,
  identifier,
  integer,
  literal,
  nullable,
  objectCodec,
  parserBacked,
  relativePath,
  sha256,
  timestamp,
  unionOf,
} from "../codec.js";
import { FABRIC_OPERATIONS } from "../operations.js";
import {
  absoluteFilesystemPathCodec,
  artifactRefCodec,
  credentialCodec,
  object,
  positiveInteger,
  projectionFact,
  text,
  type OperationCodecFragment,
  type OperationShapeFragment,
} from "./common.js";

export const GIT_ACTIONS_INPUT_SHAPES = {
  [FABRIC_OPERATIONS.operatorRepositoryRead]: object(
    ["credential", "projectId", "snapshotRevision", "target", "diff", "log"],
    ["projectSessionId"],
  ),
} as const satisfies OperationShapeFragment;

export const GIT_ACTIONS_RESULT_SHAPES = {
  [FABRIC_OPERATIONS.operatorRepositoryRead]: object(
    ["status"],
    ["projectId", "projectSessionId", "snapshotRevision", "readTransactionId", "repository", "reason", "currentSnapshotRevision"],
  ),
} as const satisfies OperationShapeFragment;

const canonicalAbsoluteFilesystemPathCodec = boundedString({
  maxBytes: 4096,
  pattern: "^/(?!.*(?:^|/)\\.{1,2}(?:/|$))(?!.*//).+$",
  example: "/workspace/project",
});

const gitRefNameCodec = boundedString({ maxBytes: 1024, example: "refs/heads/main" });

const gitDiffSelectorCodec = unionOf([
  objectCodec({ kind: literal("working-tree") }),
  objectCodec({ kind: literal("staged") }),
  objectCodec({ kind: literal("objects"), baseObjectDigest: sha256, targetObjectDigest: sha256 }),
]);

const gitLogCursorCodec = objectCodec({ repositoryStateDigest: sha256, afterObjectDigest: sha256 });

const gitLogRequestCodec = objectCodec(
  { limit: integer({ minimum: 1, maximum: 128 }) },
  { cursor: gitLogCursorCodec },
);

const repositoryReadCommonFields = {
  credential: credentialCodec,
  projectId: identifier,
  snapshotRevision: positiveInteger,
  diff: gitDiffSelectorCodec,
  log: gitLogRequestCodec,
};

const gitRepositoryReadInputCodec = unionOf([
  objectCodec({
    ...repositoryReadCommonFields,
    target: objectCodec({ kind: literal("project-root") }),
  }, { projectSessionId: identifier }),
  objectCodec({
    ...repositoryReadCommonFields,
    projectSessionId: identifier,
    target: objectCodec({
      kind: literal("session-worktree"),
      canonicalWorktreePath: canonicalAbsoluteFilesystemPathCodec,
    }),
  }),
]);

const gitHeadCodec = unionOf([
  objectCodec({ detached: literal(false), refName: gitRefNameCodec, objectDigest: sha256 }),
  objectCodec({ detached: literal(true), objectDigest: sha256 }),
]);

const gitPathPageCodec = objectCodec({
  paths: arrayOf(relativePath, { maximum: 256, unique: true }),
  truncated: boolean,
});

const gitOperationStateCodec = unionOf([
  objectCodec({ kind: literal("clean") }),
  objectCodec({ kind: literal("merge") }),
  objectCodec({ kind: literal("rebase") }),
  objectCodec({ kind: literal("cherry-pick") }),
  objectCodec({ kind: literal("bisect") }),
]);

const gitUpstreamIdentityCodec = objectCodec({ remoteName: identifier, branchName: gitRefNameCodec });

const gitUpstreamCodec = objectCodec({
  remoteName: identifier,
  branchName: gitRefNameCodec,
  ahead: integer(),
  behind: integer(),
});

const gitHostedChecksCodec = objectCodec({
  repository: boundedString({ maxBytes: 1024 }),
  headObjectDigest: sha256,
  state: enumeration(["passing", "failing", "pending", "unknown"]),
  total: integer(),
  passing: integer(),
  failing: integer(),
  pending: integer(),
});

const gitDiffProjectionCodec = objectCodec({
  selector: gitDiffSelectorCodec,
  artifactRef: artifactRefCodec,
  baseDigest: sha256,
  targetDigest: sha256,
});

const gitLogEntryCodec = objectCodec({
  objectDigest: sha256,
  parentObjectDigests: arrayOf(sha256, { maximum: 64, unique: true }),
  subject: boundedString({ maxBytes: 1024 }),
  authorTimestamp: timestamp,
});

const gitLogPageCodec = unionOf([
  objectCodec({
    items: arrayOf(gitLogEntryCodec, { maximum: 128 }),
    hasMore: literal(false),
    nextCursor: literal(null),
  }),
  objectCodec({
    items: arrayOf(gitLogEntryCodec, { maximum: 128 }),
    hasMore: literal(true),
    nextCursor: gitLogCursorCodec,
  }),
]);

const gitBranchRecordCodec = objectCodec({
  refName: gitRefNameCodec,
  objectDigest: sha256,
  checkedOut: boolean,
  upstream: nullable(gitUpstreamIdentityCodec),
});

const gitWorktreeRecordCodec = objectCodec({
  canonicalPath: canonicalAbsoluteFilesystemPathCodec,
  head: gitHeadCodec,
  current: boolean,
  locked: boolean,
});

export const gitRepositoryProjectionCodec = objectCodec({
  freshness: enumeration(["live", "snapshot", "stale"]),
  source: literal("git"),
  revision: positiveInteger,
  observedAt: timestamp,
  canonicalRepositoryRoot: canonicalAbsoluteFilesystemPathCodec,
  canonicalWorktreePath: canonicalAbsoluteFilesystemPathCodec,
  repositoryStateDigest: sha256,
  head: gitHeadCodec,
  headDigest: sha256,
  indexDigest: sha256,
  worktreeDigest: sha256,
  remoteDigest: sha256,
  changes: objectCodec({
    staged: gitPathPageCodec,
    unstaged: gitPathPageCodec,
    untracked: gitPathPageCodec,
    conflicted: gitPathPageCodec,
  }),
  operationState: gitOperationStateCodec,
  upstream: nullable(gitUpstreamCodec),
  diff: gitDiffProjectionCodec,
  log: gitLogPageCodec,
  branches: objectCodec({ items: arrayOf(gitBranchRecordCodec, { maximum: 128 }), truncated: boolean }),
  worktrees: objectCodec({ items: arrayOf(gitWorktreeRecordCodec, { maximum: 64 }), truncated: boolean }),
  hostedChecks: projectionFact(nullable(gitHostedChecksCodec), literal("github")),
});

export const gitRepositorySummaryCodec = objectCodec({
  freshness: enumeration(["live", "snapshot", "stale"]),
  source: literal("git"),
  revision: positiveInteger,
  observedAt: timestamp,
  repositoryStateDigest: sha256,
  head: gitHeadCodec,
  operationState: enumeration(["clean", "merge", "rebase", "cherry-pick", "bisect"]),
  counts: objectCodec({ staged: integer(), unstaged: integer(), untracked: integer(), conflicted: integer() }),
  pathsTruncated: boolean,
  upstream: nullable(gitUpstreamCodec),
  hostedChecks: projectionFact(nullable(gitHostedChecksCodec), literal("github")),
});

const gitRepositoryReadResultCodec = unionOf([
  objectCodec({
    status: literal("current"),
    projectId: identifier,
    projectSessionId: nullable(identifier),
    snapshotRevision: positiveInteger,
    readTransactionId: identifier,
    repository: gitRepositoryProjectionCodec,
  }),
  objectCodec({
    status: literal("resnapshot-required"),
    reason: literal("snapshot-mismatch"),
    currentSnapshotRevision: positiveInteger,
  }),
]);

const gitRepositoryBindingCodec = objectCodec({
  repositoryRoot: absoluteFilesystemPathCodec,
  worktreePath: absoluteFilesystemPathCodec,
  gitCommonDir: absoluteFilesystemPathCodec,
  commonDirectoryIdentityDigest: sha256,
  repositoryStateDigest: sha256,
  headDigest: sha256,
  indexDigest: sha256,
  worktreeDigest: sha256,
  remoteStateDigest: sha256,
  configDigest: sha256,
  worktreeRegistryDigest: sha256,
});
const gitExecutionProfileBindingCodec = objectCodec({
  profileId: identifier,
  revision: positiveInteger,
  digest: sha256,
  gitBinaryDigest: sha256,
  objectFormat: enumeration(["sha1", "sha256"]),
});
const gitRemoteBindingCodec = objectCodec({
  registrationId: identifier,
  revision: positiveInteger,
  generation: positiveInteger,
  remoteName: identifier,
  targetDigest: sha256,
  adapterId: identifier,
  adapterContractDigest: sha256,
});
const gitIdentityCodec = objectCodec({ name: text, email: text, timestamp });
const gitRefCodec = boundedString({ maxBytes: 1024, pattern: "^refs/", example: "refs/heads/main" });
const gitCommitMappingCodec = objectCodec({
  sourceObjectDigest: nullable(sha256),
  parentDigests: arrayOf(sha256, { maximum: 16 }),
  treeDigest: sha256,
  author: gitIdentityCodec,
  committer: gitIdentityCodec,
  message: text,
  resultObjectDigest: sha256,
});
const gitConflictPathCodec = objectCodec({
  path: relativePath,
  stage1Digest: nullable(sha256),
  stage2Digest: nullable(sha256),
  stage3Digest: nullable(sha256),
});
const gitConflictRecipeCodec = objectCodec({
  kind: enumeration(["merge", "rebase"]),
  operationStateDigest: sha256,
  indexDigest: sha256,
  worktreeDigest: sha256,
  conflictPaths: arrayOf(gitConflictPathCodec, { maximum: 4096, unique: true }),
});
const gitResultRecipeCodec = objectCodec({
  schemaVersion: literal(1),
  executionProfileDigest: sha256,
  resultRecipeDigest: sha256,
  beforeRepositoryStateDigest: sha256,
  expectedSuccessRepositoryStateDigest: sha256,
  expectedConflict: nullable(gitConflictRecipeCodec),
  refUpdates: arrayOf(objectCodec({
    refName: gitRefCodec,
    beforeObjectDigest: nullable(sha256),
    afterObjectDigest: nullable(sha256),
  }), { maximum: 64, unique: true }),
  configUpdates: arrayOf(objectCodec({
    section: literal("branch"),
    subsection: identifier,
    key: enumeration(["remote", "merge"]),
    beforeValue: nullable(text),
    afterValue: nullable(text),
  }), { maximum: 64, unique: true }),
  commitMappings: arrayOf(gitCommitMappingCodec, { maximum: 128, unique: true }),
  affectedPaths: arrayOf(objectCodec({
    path: relativePath,
    beforeDigest: nullable(sha256),
    afterDigest: nullable(sha256),
  }), { maximum: 4096, unique: true }),
  bounds: objectCodec({
    maximumRefOrConfigUpdates: literal(64),
    maximumCommitMappings: literal(128),
    maximumConflictPaths: literal(4096),
  }),
});
const remoteOperationFields = {
  remote: gitRemoteBindingCodec,
  sourceRef: gitRefCodec,
  destinationRef: gitRefCodec,
  sourceObjectDigest: sha256,
  destinationObjectDigest: nullable(sha256),

};
const conflictSuccessorFields = {
  predecessorCustodyId: identifier,
  predecessorConflictGeneration: positiveInteger,
  expectedConflictStateDigest: sha256,
};
const gitOperationCodec = unionOf([
  objectCodec({ variant: literal("fetch"), ...remoteOperationFields }),
  objectCodec({ variant: literal("pull-fast-forward-only"), ...remoteOperationFields }),
  objectCodec({ variant: literal("pull-merge-commit-start"), ...remoteOperationFields }),
  objectCodec({ variant: literal("pull-rebase-start"), ...remoteOperationFields }),
  objectCodec({ variant: literal("stage"), paths: arrayOf(relativePath, { minimum: 1, maximum: 256, unique: true }) }),
  objectCodec({ variant: literal("unstage"), paths: arrayOf(relativePath, { minimum: 1, maximum: 256, unique: true }) }),
  objectCodec({
    variant: literal("commit"),
    sourceIndexDigest: sha256,
    parentObjectDigest: sha256,
    treeDigest: sha256,
    message: text,
    author: gitIdentityCodec,
    committer: gitIdentityCodec,
    resultingCommitDigest: sha256,
  }),
  objectCodec({
    variant: literal("merge-fast-forward-only-start"),
    sourceRef: gitRefCodec,
    sourceObjectDigest: sha256,
    destinationRef: gitRefCodec,
    destinationObjectDigest: sha256,
  }),
  objectCodec({
    variant: literal("merge-commit-start"),
    sourceRef: gitRefCodec,
    sourceObjectDigest: sha256,
    destinationRef: gitRefCodec,
    destinationObjectDigest: sha256,
  }),
  objectCodec({ variant: literal("merge-continue"), ...conflictSuccessorFields }),
  objectCodec({ variant: literal("merge-abort"), ...conflictSuccessorFields }),
  objectCodec({
    variant: literal("rebase-current-branch-no-autostash-start"),
    sourceRef: gitRefCodec,
    sourceObjectDigest: sha256,
    destinationRef: gitRefCodec,
    destinationObjectDigest: sha256,
  }),
  objectCodec({ variant: literal("rebase-continue"), ...conflictSuccessorFields }),
  objectCodec({ variant: literal("rebase-abort"), ...conflictSuccessorFields }),
  objectCodec({ variant: literal("push-fast-forward-only"), ...remoteOperationFields }),
  objectCodec({ variant: literal("push-force-with-lease"), ...remoteOperationFields, expectedRemoteObjectDigest: sha256 }),
  objectCodec({ variant: literal("branch-create"), sourceObjectDigest: sha256, destinationRef: gitRefCodec }),
  objectCodec({
    variant: literal("branch-rename"),
    sourceRef: gitRefCodec,
    sourceObjectDigest: sha256,
    destinationRef: gitRefCodec,
  }),
  objectCodec({
    variant: literal("branch-delete-merged-only"),
    sourceRef: gitRefCodec,
    sourceObjectDigest: sha256,
    mergedIntoObjectDigest: sha256,
  }),
  objectCodec({ variant: literal("branch-delete-force"), sourceRef: gitRefCodec, sourceObjectDigest: sha256 }),
  objectCodec({
    variant: literal("worktree-create-detached"),
    destinationWorktreePath: absoluteFilesystemPathCodec,
    sourceObjectDigest: sha256,
  }),
  objectCodec({
    variant: literal("worktree-create-new-branch"),
    destinationWorktreePath: absoluteFilesystemPathCodec,
    sourceObjectDigest: sha256,
    branchRef: gitRefCodec,
  }),
  objectCodec({
    variant: literal("worktree-create-existing-branch"),
    destinationWorktreePath: absoluteFilesystemPathCodec,
    sourceObjectDigest: sha256,
    branchRef: gitRefCodec,
  }),
  objectCodec({
    variant: literal("worktree-move"),
    sourceWorktreePath: absoluteFilesystemPathCodec,
    destinationWorktreePath: absoluteFilesystemPathCodec,
    expectedWorktreeStateDigest: sha256,
  }),
  objectCodec({
    variant: literal("worktree-remove-clean"),
    sourceWorktreePath: absoluteFilesystemPathCodec,
    expectedWorktreeStateDigest: sha256,
  }),
  objectCodec({
    variant: literal("worktree-remove-force"),
    sourceWorktreePath: absoluteFilesystemPathCodec,
    expectedWorktreeStateDigest: sha256,
  }),
  objectCodec({
    variant: literal("upstream-set"),
    localBranchRef: gitRefCodec,
    remote: gitRemoteBindingCodec,
    remoteBranchRef: gitRefCodec,
    expectedConfigDigest: sha256,
  }),
  objectCodec({
    variant: literal("upstream-unset"),
    localBranchRef: gitRefCodec,
    remote: gitRemoteBindingCodec,
    remoteBranchRef: gitRefCodec,
    expectedConfigDigest: sha256,
  }),
]);
const gitGateDecisionCodec = objectCodec({
  kind: literal("gate"),
  draftId: identifier,
  expectedDraftRevision: positiveInteger,
  draftDigest: sha256,
  gateId: identifier,
  expectedGateRevision: positiveInteger,
  expectedGateStatus: literal("approved"),
  blockedOperationId: identifier,
});
const gitPreauthorisedDecisionCodec = objectCodec({
  kind: literal("preauthorised"),
  grantId: identifier,
  expectedGrantRevision: positiveInteger,
  grantDigest: sha256,
});
const gitDraftAuthorisationFields = {
  projectId: identifier,
  projectSessionId: identifier,
  expectedSessionRevision: positiveInteger,
  expectedSessionGeneration: positiveInteger,
  coordinationRunId: identifier,
  expectedRunRevision: positiveInteger,
  expectedDependencyRevision: positiveInteger,
  authorityRef: sha256,
  expectedAuthorityRevision: positiveInteger,
  expectedGitAllowlistEpoch: positiveInteger,
  gitAllowlistDigest: nullable(sha256),
  repositoryRoot: absoluteFilesystemPathCodec,
  worktreePath: absoluteFilesystemPathCodec,
  repositoryStateDigest: sha256,
  executionProfileId: identifier,
  executionProfileRevision: positiveInteger,
  executionProfileDigest: sha256,
  operationVariant: enumeration([
    "fetch", "pull-fast-forward-only", "pull-merge-commit-start", "pull-rebase-start",
    "stage", "unstage", "commit", "merge-fast-forward-only-start", "merge-commit-start",
    "merge-continue", "merge-abort", "rebase-current-branch-no-autostash-start", "rebase-continue",
    "rebase-abort", "push-fast-forward-only", "push-force-with-lease", "branch-create",
    "branch-rename", "branch-delete-merged-only", "branch-delete-force", "worktree-create-detached",
    "worktree-create-new-branch", "worktree-create-existing-branch", "worktree-move",
    "worktree-remove-clean", "worktree-remove-force", "upstream-set", "upstream-unset",
  ]),
  remoteBinding: nullable(gitRemoteBindingCodec),
  resultRecipeDigest: sha256,
  effectBindingDigest: sha256,
};
const gitAuthorisationFields = { ...gitDraftAuthorisationFields, operationId: identifier };
const gitAuthorisationCodec = objectCodec({
  ...gitAuthorisationFields,
  decision: unionOf([gitPreauthorisedDecisionCodec, gitGateDecisionCodec]),
});
const gitIntentBaseCodec = objectCodec({
  kind: literal("git"),
  authorisation: gitAuthorisationCodec,
  repository: gitRepositoryBindingCodec,
  executionProfile: gitExecutionProfileBindingCodec,
  operation: gitOperationCodec,
  resultRecipe: gitResultRecipeCodec,
});
export const gitIntentCodec = parserBacked(
  gitIntentBaseCodec,
  (value) => {
    const intent = value as Record<string, unknown>;
    const authorisation = intent.authorisation as Record<string, unknown>;
    const operation = intent.operation as Record<string, unknown>;
    const repository = intent.repository as Record<string, unknown>;
    const profile = intent.executionProfile as Record<string, unknown>;
    const recipe = intent.resultRecipe as Record<string, unknown>;
    if (authorisation.operationVariant !== operation.variant) throw new TypeError("git authorisation operationVariant must match operation variant");
    if (authorisation.resultRecipeDigest !== recipe.resultRecipeDigest) throw new TypeError("git authorisation resultRecipeDigest must match recipe");
    if (authorisation.repositoryStateDigest !== repository.repositoryStateDigest || recipe.beforeRepositoryStateDigest !== repository.repositoryStateDigest) {
      throw new TypeError("git repositoryStateDigest must match recipe and authorisation");
    }
    if (authorisation.executionProfileDigest !== profile.digest || recipe.executionProfileDigest !== profile.digest) {
      throw new TypeError("git executionProfileDigest must match recipe and authorisation");
    }
    const decision = authorisation.decision as Record<string, unknown>;
    if (decision.kind === "preauthorised") {
      const gateOnly = new Set([
        "pull-merge-commit-start", "pull-rebase-start", "merge-fast-forward-only-start", "merge-commit-start",
        "merge-continue", "merge-abort", "rebase-current-branch-no-autostash-start", "rebase-continue",
        "rebase-abort", "push-force-with-lease", "branch-delete-force", "worktree-remove-force",
      ]);
      if (gateOnly.has(String(operation.variant))) throw new TypeError("git gate-only variant cannot be preauthorised");
    } else if (decision.blockedOperationId !== authorisation.operationId) {
      throw new TypeError("git gate blockedOperationId must match operationId");
    }
    return value;
  },
  gitIntentBaseCodec.example,
);
const preauthorisedGitVariantCodec = enumeration([
  "fetch", "pull-fast-forward-only", "stage", "unstage", "commit", "push-fast-forward-only",
  "branch-create", "branch-rename", "branch-delete-merged-only", "worktree-create-detached",
  "worktree-create-new-branch", "worktree-create-existing-branch", "worktree-move",
  "worktree-remove-clean", "upstream-set", "upstream-unset",
]);
const gitGrantConstraintsCodec = objectCodec({
  operationVariants: arrayOf(preauthorisedGitVariantCodec, { minimum: 1, maximum: 16, unique: true }),
  remoteBindings: arrayOf(gitRemoteBindingCodec, { maximum: 32, unique: true }),
  refs: arrayOf(gitRefCodec, { maximum: 256, unique: true }),
  pathPrefixes: arrayOf(relativePath, { maximum: 256, unique: true }),
  allowWorktreeCreation: boolean,
});
const gitActionGrantCodec = objectCodec({
  grantId: identifier,
  revision: positiveInteger,
  projectId: identifier,
  projectSessionId: identifier,
  sessionGeneration: positiveInteger,
  issuingSessionRevision: positiveInteger,
  coordinationRunId: identifier,
  issuingRunRevision: positiveInteger,
  issuingDependencyRevision: positiveInteger,
  authorityRef: sha256,
  authorityRevision: positiveInteger,
  gitAllowlistEpoch: positiveInteger,
  gitAllowlistDigest: sha256,
  repositoryRoot: absoluteFilesystemPathCodec,
  worktreePath: absoluteFilesystemPathCodec,
  executionProfileId: identifier,
  executionProfileRevision: positiveInteger,
  executionProfileDigest: sha256,
  constraints: gitGrantConstraintsCodec,
  sourceAuthority: objectCodec({ kind: enumeration(["launch-envelope", "operator-command"]), digest: sha256 }),
  expiresAt: timestamp,
  grantDigest: sha256,
});
const gitAuthoriseCommonFields = {
  kind: literal("git-authorise"),
  projectId: identifier,
  projectSessionId: identifier,
  expectedSessionRevision: positiveInteger,
  expectedSessionGeneration: positiveInteger,
  coordinationRunId: identifier,
  expectedRunRevision: positiveInteger,
  expectedDependencyRevision: positiveInteger,
  authorityRef: sha256,
  expectedAuthorityRevision: positiveInteger,
  expectedGitAllowlistEpoch: positiveInteger,
  gitAllowlistDigest: sha256,
};
export const gitAuthoriseIntentCodec = unionOf([
  objectCodec({ ...gitAuthoriseCommonFields, action: literal("issue"), proposedGrant: gitActionGrantCodec }),
  objectCodec({
    ...gitAuthoriseCommonFields,
    action: literal("revise"),
    currentGrant: gitActionGrantCodec,
    proposedGrant: gitActionGrantCodec,
  }),
  objectCodec({ ...gitAuthoriseCommonFields, action: literal("revoke"), currentGrant: gitActionGrantCodec }),
]);
const gitMutationDraftBindingBaseCodec = objectCodec({
  kind: literal("mutation"),
  authorisation: objectCodec(gitDraftAuthorisationFields),
  repository: gitRepositoryBindingCodec,
  executionProfile: gitExecutionProfileBindingCodec,
  operation: gitOperationCodec,
  resultRecipe: gitResultRecipeCodec,
});
const gitMutationDraftBindingCodec = parserBacked(
  gitMutationDraftBindingBaseCodec,
  (value) => {
    const binding = value as Record<string, unknown>;
    const authorisation = binding.authorisation as Record<string, unknown>;
    const operation = binding.operation as Record<string, unknown>;
    const repository = binding.repository as Record<string, unknown>;
    const profile = binding.executionProfile as Record<string, unknown>;
    const recipe = binding.resultRecipe as Record<string, unknown>;
    if (authorisation.operationVariant !== operation.variant) throw new TypeError("git draft operationVariant must match operation variant");
    if (authorisation.resultRecipeDigest !== recipe.resultRecipeDigest) throw new TypeError("git draft resultRecipeDigest must match recipe");
    if (authorisation.repositoryStateDigest !== repository.repositoryStateDigest || recipe.beforeRepositoryStateDigest !== repository.repositoryStateDigest) {
      throw new TypeError("git draft repositoryStateDigest must match recipe and authorisation");
    }
    if (authorisation.executionProfileDigest !== profile.digest || recipe.executionProfileDigest !== profile.digest) {
      throw new TypeError("git draft executionProfileDigest must match recipe and authorisation");
    }
    return value;
  },
  gitMutationDraftBindingBaseCodec.example,
);
export const gitResolutionEligibilityReasonCodec = enumeration([
  "inspector-unavailable",
  "remote-proof-permanently-unavailable",
  "mixed-local-remote-evidence",
  "evidence-integrity-failure",
  "conflict-state-unverifiable",
]);
const gitCustodyResolutionDraftBindingCodec = objectCodec({
  kind: literal("custody-resolution"),
  projectId: identifier,
  projectSessionId: identifier,
  expectedSessionRevision: positiveInteger,
  expectedSessionGeneration: positiveInteger,
  coordinationRunId: identifier,
  expectedRunRevision: positiveInteger,
  expectedDependencyRevision: positiveInteger,
  authorityRef: sha256,
  expectedAuthorityRevision: positiveInteger,
  custodyId: identifier,
  expectedCustodyState: enumeration(["ambiguous", "quarantined"]),
  expectedLookupGeneration: integer({ minimum: 0 }),
  lookupEvidenceDigest: sha256,
  resolutionEligibilityReason: gitResolutionEligibilityReasonCodec,
  adjudication: enumeration(["applied", "no-effect", "quarantine-accepted"]),
  reason: text,
});
export const gitOperationDraftIntentCodec = unionOf([
  objectCodec({
    kind: literal("git-operation-draft"),
    action: literal("create"),
    draftRequestId: identifier,
    expiresAt: timestamp,
    binding: unionOf([gitMutationDraftBindingCodec, gitCustodyResolutionDraftBindingCodec]),
  }),
  objectCodec({
    kind: literal("git-operation-draft"),
    action: literal("cancel"),
    projectId: identifier,
    projectSessionId: identifier,
    expectedSessionRevision: positiveInteger,
    expectedSessionGeneration: positiveInteger,
    coordinationRunId: identifier,
    expectedRunRevision: positiveInteger,
    expectedDependencyRevision: positiveInteger,
    draftId: identifier,
    expectedDraftRevision: positiveInteger,
    draftDigest: sha256,
  }),
]);
export const gitCustodyResolveIntentCodec = objectCodec({
  kind: literal("git-custody-resolve"),
  projectId: identifier,
  projectSessionId: identifier,
  expectedSessionRevision: positiveInteger,
  expectedSessionGeneration: positiveInteger,
  coordinationRunId: identifier,
  expectedRunRevision: positiveInteger,
  expectedDependencyRevision: positiveInteger,
  authorityRef: sha256,
  expectedAuthorityRevision: positiveInteger,
  draftId: identifier,
  expectedDraftRevision: positiveInteger,
  draftDigest: sha256,
  operationId: identifier,
  custodyId: identifier,
  expectedCustodyState: enumeration(["ambiguous", "quarantined"]),
  expectedLookupGeneration: integer({ minimum: 0 }),
  lookupEvidenceDigest: sha256,
  resolutionEligibilityReason: gitResolutionEligibilityReasonCodec,
  adjudication: enumeration(["applied", "no-effect", "quarantine-accepted"]),
  reason: text,
  gateId: identifier,
  expectedGateRevision: positiveInteger,
  expectedGateStatus: literal("approved"),
});


export const gitActionsOperationCodecFragment = {
  [FABRIC_OPERATIONS.operatorRepositoryRead]: {
    input: gitRepositoryReadInputCodec,
    result: gitRepositoryReadResultCodec,
  },
} satisfies OperationCodecFragment;
