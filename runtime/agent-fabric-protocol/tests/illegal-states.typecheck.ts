import type {
  OperatorCapabilityGrant,
  OperatorActionIntent,
  OperatorActionReconcileRequest,
  OperatorGitIntent,
  OperatorMutationContext,
  OperatorRevisionTarget,
  ProjectSession,
  ProjectionFact,
  ResultDelivery,
  TaskRequest,
  ProtocolRequest,
  ProtocolResponse,
} from "../src/index.js";

declare const closedBase: Omit<Extract<ProjectSession, { state: "closed" }>, "state" | "terminalPath">;
declare const takeoverBase: Omit<
  Extract<OperatorCapabilityGrant, { kind: "takeover" }>,
  "kind" | "takeoverBinding"
>;
declare const taskRequest: TaskRequest;
declare const claimedBase: Omit<
  Extract<ResultDelivery, { state: "claimed" }>,
  "state" | "claimedByAgentId" | "claimDeadline"
>;
declare const unavailableFact: Omit<Extract<ProjectionFact<string>, { freshness: "unavailable" }>, "freshness">;
declare const actionTarget: OperatorRevisionTarget;
declare const gitIntent: OperatorGitIntent;
declare const reconcileBase: Omit<OperatorActionReconcileRequest, "mode">;
declare const promotionBase: Omit<Extract<OperatorActionIntent, { kind: "promotion" }>, "releaseBinding">;
declare const externalIntent: Extract<OperatorActionIntent, { kind: "registered-external-effect" }>;
declare const operatorMutation: OperatorMutationContext;

type RequestUnion = ProtocolRequest<"fabric.v1.task.read" | "fabric.v1.task.list">;
type ResponseUnion = ProtocolResponse<"fabric.v1.task.read" | "fabric.v1.task.list">;

export function compileTimeIllegalStateWitnesses(): void {
  // @ts-expect-error closed sessions require an explicit terminal path
  const closedWithoutEvidence: ProjectSession = { ...closedBase, state: "closed" };

  // @ts-expect-error takeover authority requires its generation and handoff binding
  const unboundTakeover: OperatorCapabilityGrant = { ...takeoverBase, kind: "takeover" };

  const fireAndForget: TaskRequest = {
    ...taskRequest,
    request: {
      ...taskRequest.request,
      // @ts-expect-error answer-bearing task requests cannot be fire-and-forget
      requiresAck: false,
    },
  };

  // @ts-expect-error claimed result delivery requires claimant and deadline fields
  const unboundedClaim: ResultDelivery = { ...claimedBase, state: "claimed" };

  const unavailableWithValue: ProjectionFact<string> = {
    ...unavailableFact,
    freshness: "unavailable",
    // @ts-expect-error unavailable projection facts cannot carry a purported value
    value: "fabricated",
  };

  const mismatchedRequest: RequestUnion = {
    id: "request_01",
    operation: "fabric.v1.task.read",
    // @ts-expect-error request input remains correlated with its operation after union distribution
    input: { runId: "run_01" },
  };

  const mismatchedResponse: ResponseUnion = {
    id: "request_01",
    ok: true,
    operation: "fabric.v1.task.read",
    // @ts-expect-error response result remains correlated with its operation after union distribution
    result: { tasks: [] },
  };

  // @ts-expect-error cancel intents require an explicit reason
  const cancelWithoutReason: OperatorActionIntent = { kind: "control", action: "cancel", target: actionTarget };

  const shellGit: OperatorActionIntent = {
    ...gitIntent,
    // @ts-expect-error Git effects are a closed union with no shell or argv escape hatch
    operation: { effect: "shell", shell: "git push" },
  };

  // @ts-expect-error promotion always carries the exact release binding
  const promotionWithoutRelease: OperatorActionIntent = { ...promotionBase };

  const externalWithRelease: typeof externalIntent = {
    ...externalIntent,
    // @ts-expect-error broad external effects cannot carry or satisfy a release binding
    releaseBinding: { artifactDigest: "sha256:invalid" },
  };

  const redispatchReconcile: OperatorActionReconcileRequest = {
    ...reconcileBase,
    // @ts-expect-error reconciliation is observe-only and cannot redispatch
    mode: "redispatch",
  };

  void closedWithoutEvidence;
  void unboundTakeover;
  void fireAndForget;
  void unboundedClaim;
  void unavailableWithValue;
  void mismatchedRequest;
  void mismatchedResponse;
  void cancelWithoutReason;
  void shellGit;
  void promotionWithoutRelease;
  void externalWithRelease;
  void redispatchReconcile;
  void operatorMutation;
}
