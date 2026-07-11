export type ExecutionProfileName = "headless" | "observed" | "interactive" | "paired-observed" | "paired-visible" | "hybrid";
export type ControlMode = "managed" | "attached-interactive";
export type VisibilityMode = "none" | "event-mirror" | "provider-tui";
export type InboxDeliveryMode = "structured-push" | "cooperative-pull";

export type RoleExecution = {
  controlMode: ControlMode;
  visibilityMode: VisibilityMode;
  inboxDeliveryMode: InboxDeliveryMode;
};

export type ResolvedExecutionProfile = {
  name: ExecutionProfileName;
  default: RoleExecution;
  roles: { chair: RoleExecution; pairedPrimary: RoleExecution; worker: RoleExecution };
  herdr: { layout: "none" | "side-by-side" };
  degradations: string[];
};

export class ExecutionProfileError extends Error {
  readonly code = "PROFILE_CAPABILITY_UNAVAILABLE";
  readonly capability: string;

  constructor(role: string, capability: string) {
    super(`${role} lacks required execution capability ${capability}`);
    this.name = "ExecutionProfileError";
    this.capability = capability;
  }
}

const MANAGED: RoleExecution = {
  controlMode: "managed",
  visibilityMode: "none",
  inboxDeliveryMode: "structured-push",
};
const INTERACTIVE: RoleExecution = {
  controlMode: "attached-interactive",
  visibilityMode: "provider-tui",
  inboxDeliveryMode: "cooperative-pull",
};

function requireCapability(role: string, capabilities: string[], capability: string): void {
  if (!capabilities.includes(capability)) {
    throw new ExecutionProfileError(role, capability);
  }
}

function validateRole(role: string, execution: RoleExecution, capabilities: string[]): void {
  if (execution.controlMode === "managed") {
    requireCapability(role, capabilities, "send_turn");
  } else {
    requireCapability(role, capabilities, "attach");
    requireCapability(role, capabilities, "wakeup");
  }
}

export function resolveExecutionProfile(input: {
  name: ExecutionProfileName;
  chairInHerdr: boolean;
  capabilities: { chair: string[]; pairedPrimary: string[]; worker: string[] };
}): ResolvedExecutionProfile {
  let roles: ResolvedExecutionProfile["roles"];
  let layout: ResolvedExecutionProfile["herdr"]["layout"] = "none";
  const degradations: string[] = [];

  switch (input.name) {
    case "headless":
      roles = { chair: MANAGED, pairedPrimary: MANAGED, worker: MANAGED };
      break;
    case "observed":
      roles = {
        chair: { ...MANAGED, visibilityMode: "event-mirror" },
        pairedPrimary: { ...MANAGED, visibilityMode: "event-mirror" },
        worker: { ...MANAGED, visibilityMode: "event-mirror" },
      };
      break;
    case "interactive":
      roles = { chair: INTERACTIVE, pairedPrimary: MANAGED, worker: MANAGED };
      layout = "side-by-side";
      if (!input.chairInHerdr) degradations.push("visibility-degraded");
      break;
    case "paired-observed":
    case "hybrid":
      roles = {
        chair: INTERACTIVE,
        pairedPrimary: { ...MANAGED, visibilityMode: "event-mirror" },
        worker: MANAGED,
      };
      layout = "side-by-side";
      if (!input.chairInHerdr) degradations.push("visibility-degraded");
      break;
    case "paired-visible":
      roles = { chair: INTERACTIVE, pairedPrimary: INTERACTIVE, worker: MANAGED };
      layout = "side-by-side";
      if (!input.chairInHerdr) degradations.push("visibility-degraded");
      break;
  }

  if (input.name !== "headless") {
    validateRole("chair", roles.chair, input.capabilities.chair);
    validateRole("pairedPrimary", roles.pairedPrimary, input.capabilities.pairedPrimary);
    validateRole("worker", roles.worker, input.capabilities.worker);
  }
  return {
    name: input.name,
    default: MANAGED,
    roles,
    herdr: { layout },
    degradations,
  };
}
