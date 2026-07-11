import type {
  OperatorCapabilityGrant,
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

  void closedWithoutEvidence;
  void unboundTakeover;
  void fireAndForget;
  void unboundedClaim;
  void unavailableWithValue;
  void mismatchedRequest;
  void mismatchedResponse;
}
