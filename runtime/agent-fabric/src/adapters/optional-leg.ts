type OptionalDispatchResult =
  | { state: "unavailable"; acknowledged: false; reason: string }
  | { state: "accepted"; acknowledged: false; providerActionRef: string }
  | { state: "terminal"; acknowledged: true; providerActionRef: string };

type OptionalLookupResult =
  | { state: "unknown"; acknowledged: false }
  | { state: "accepted"; acknowledged: false; providerActionRef: string }
  | { state: "terminal"; acknowledged: true; providerActionRef: string };

type OptionalAdapter = {
  dispatch(input: { actionId: string; payload: Record<string, unknown> }): Promise<OptionalDispatchResult>;
  lookupAction(actionId: string): Promise<OptionalLookupResult>;
};

type OptionalLegResult = {
  adapterId: string;
  actionId: string;
  state: "terminal" | "degraded" | "failed";
  reason: string;
  attempts: number;
  acknowledged: boolean;
  requiredPrimaryBlocked: false;
  deadlineExceeded: boolean;
  receipt: Record<string, unknown>;
};

export function startOptionalAdapterLeg(input: {
  adapterId: string;
  adapter: OptionalAdapter;
  action: { actionId: string; payload: Record<string, unknown> };
  policy: {
    retryDelaysMs: number[];
    acknowledgementDeadlineMs: number;
    acknowledgementPollMs: number;
    deadlineState: "degraded" | "failed";
  };
  clock: { now(): number; sleep(milliseconds: number): Promise<void> };
}): { blocking: false; completion: Promise<OptionalLegResult> } {
  const completion = runOptionalLeg(input);
  return { blocking: false, completion };
}

async function runOptionalLeg(input: {
  adapterId: string;
  adapter: OptionalAdapter;
  action: { actionId: string; payload: Record<string, unknown> };
  policy: {
    retryDelaysMs: number[];
    acknowledgementDeadlineMs: number;
    acknowledgementPollMs: number;
    deadlineState: "degraded" | "failed";
  };
  clock: { now(): number; sleep(milliseconds: number): Promise<void> };
}): Promise<OptionalLegResult> {
  const deadline = input.clock.now() + input.policy.acknowledgementDeadlineMs;
  let attempts = 0;
  let lastReason = "provider-unavailable";
  let providerActionRef: string | undefined;

  for (let attempt = 0; attempt <= input.policy.retryDelaysMs.length; attempt += 1) {
    attempts += 1;
    const dispatched = await input.adapter.dispatch(input.action);
    if (dispatched.state === "terminal") {
      return result(input, attempts, "terminal", "completed", true, false, dispatched.providerActionRef);
    }
    if (dispatched.state === "accepted") {
      providerActionRef = dispatched.providerActionRef;
      while (input.clock.now() < deadline) {
        const delay = Math.min(input.policy.acknowledgementPollMs, deadline - input.clock.now());
        await input.clock.sleep(delay);
        const lookup = await input.adapter.lookupAction(input.action.actionId);
        if (lookup.state === "terminal") {
          return result(input, attempts, "terminal", "completed", true, false, lookup.providerActionRef);
        }
        if ("providerActionRef" in lookup) providerActionRef = lookup.providerActionRef;
      }
      return result(
        input,
        attempts,
        input.policy.deadlineState,
        "acknowledgement-deadline-exceeded",
        false,
        true,
        providerActionRef,
      );
    }
    lastReason = dispatched.reason;
    const retryDelay = input.policy.retryDelaysMs[attempt];
    if (retryDelay !== undefined) await input.clock.sleep(retryDelay);
  }

  if (input.clock.now() < deadline) await input.clock.sleep(deadline - input.clock.now());
  return result(input, attempts, input.policy.deadlineState, lastReason, false, true, providerActionRef);
}

function result(
  input: { adapterId: string; action: { actionId: string } },
  attempts: number,
  state: "terminal" | "degraded" | "failed",
  reason: string,
  acknowledged: boolean,
  deadlineExceeded: boolean,
  providerActionRef?: string,
): OptionalLegResult {
  const receipt = {
    adapterId: input.adapterId,
    actionId: input.action.actionId,
    status: state,
    reason,
    attempts,
    acknowledged,
    ...(providerActionRef === undefined ? {} : { providerActionRef }),
  };
  return {
    adapterId: input.adapterId,
    actionId: input.action.actionId,
    state,
    reason,
    attempts,
    acknowledged,
    requiredPrimaryBlocked: false,
    deadlineExceeded,
    receipt,
  };
}
