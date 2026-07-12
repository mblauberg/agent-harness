import type {
  GitConflictRecipe,
  GitLookupOutcome,
  GitRepositoryBinding,
  OperatorGitIntent,
  Sha256Digest,
} from "@local/agent-fabric-protocol";

import { ProjectFabricCoreError } from "../project-session/contracts.js";
import { observeGitRepositoryForMutation } from "./git-repository-read.js";

export type GitMutationInspection = {
  outcome: GitLookupOutcome;
  repository: GitRepositoryBinding;
  evidenceDigest: Sha256Digest;
  failureSignatureDigest: Sha256Digest | null;
  conflict: GitConflictRecipe | null;
};

export type GitMutationDispatchContext = {
  remoteTarget: string | null;
};

/** Called by a mutation port only after its native fences are held and final observation is complete. */
export type GitMutationPointOfUse = () => void;

export interface GitMutationPort {
  assertAvailable(intent: OperatorGitIntent): void;
  observe(repositoryRoot: string, worktreePath: string): Promise<GitRepositoryBinding>;
  dispatch(
    intent: OperatorGitIntent,
    context: GitMutationDispatchContext,
    pointOfUse: GitMutationPointOfUse,
  ): Promise<GitMutationInspection>;
  inspect(intent: OperatorGitIntent, context: GitMutationDispatchContext): Promise<GitMutationInspection>;
}

export type FixedGitMutationPortOptions = Readonly<{
  privateStateRoot: string;
  clock?: () => number;
}>;

/**
 * Production fail-closed owner.
 *
 * The approved typed contract remains available to an injected substrate port,
 * but the Node runtime advertises no mutation variant until a native helper can
 * bind locks, path identities and the point-of-use claim without a pathname gap.
 */
export class FixedGitMutationPort implements GitMutationPort {
  constructor(_options: FixedGitMutationPortOptions) {}

  observe(repositoryRoot: string, worktreePath: string): Promise<GitRepositoryBinding> {
    return observeGitRepositoryForMutation(repositoryRoot, worktreePath);
  }

  assertAvailable(intent: OperatorGitIntent): never {
    throw unavailable(intent);
  }

  async dispatch(
    intent: OperatorGitIntent,
    _context: GitMutationDispatchContext,
    _pointOfUse: GitMutationPointOfUse,
  ): Promise<GitMutationInspection> {
    throw unavailable(intent);
  }

  async inspect(intent: OperatorGitIntent, _context: GitMutationDispatchContext): Promise<GitMutationInspection> {
    throw unavailable(intent);
  }
}

function unavailable(intent: OperatorGitIntent): ProjectFabricCoreError {
  return new ProjectFabricCoreError(
    "CAPABILITY_UNAVAILABLE",
    `typed Git variant ${intent.operation.variant} has no verified native first-mutation fence`,
  );
}
