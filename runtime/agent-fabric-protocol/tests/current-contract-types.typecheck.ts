import type {
  AuthorityInput,
  BudgetResult,
  DisclosurePolicy,
  LeaseResult,
  LifecycleCheckpoint,
  LifecycleResult,
  MessageInput,
  ObserverEvent,
  OperationInputMap,
  ProviderActionResult,
  ReceiptResult,
  RecoveryEvidence,
  TaskResult,
  TeamCreateInput,
  TeamResult,
} from "../src/index.js";
// @ts-expect-error pre-release compatibility name is intentionally not exported
import type { LegacyAuthorityInput } from "../src/index.js";

type CurrentBaselineContractTypes = readonly [
  AuthorityInput,
  BudgetResult,
  DisclosurePolicy,
  LeaseResult,
  LifecycleCheckpoint,
  LifecycleResult,
  MessageInput,
  ObserverEvent,
  ProviderActionResult,
  ReceiptResult,
  RecoveryEvidence,
  TaskResult,
  TeamCreateInput,
  TeamResult,
];

declare const currentTypes: CurrentBaselineContractTypes;
declare const retiredType: LegacyAuthorityInput;
declare const authority: AuthorityInput;

export function compileTimeCurrentContractWitnesses(): void {
  void currentTypes;
  void retiredType;

  // @ts-expect-error disclosure is a closed policy object, never a target array
  const arrayDisclosure: AuthorityInput = { ...authority, disclosure: ["local"] };

  const identifierOnlyTeam: TeamCreateInput = {
    teamId: "team_01",
    // @ts-expect-error atomic team creation has no identifier-only compatibility input
    leaderAgentId: "agent_lead",
    rootTaskId: "task_root",
    commandId: "command_01",
  };

  const taskWithEmbeddedGate: OperationInputMap["fabric.v1.task.create"] = {
    taskId: "task_01",
    authorityId: "authority_01",
    eligibleAgentIds: ["agent_01"],
    objective: "current contract",
    baseRevision: "base_01",
    commandId: "command_01",
    // @ts-expect-error scoped gates own human approval state
    humanGates: ["approve-release"],
  };

  void arrayDisclosure;
  void identifierOnlyTeam;
  void taskWithEmbeddedGate;
}
