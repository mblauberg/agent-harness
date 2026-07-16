import { describe, expect, it } from "vitest";

import {
  FABRIC_OPERATIONS,
  OPERATION_REGISTRY,
  assertProjectSessionLaunchCurrentState,
  parseLaunchAdapterOutcomeV1,
  parseLaunchProviderActionJournalRefV1,
  parseLaunchPacketV1,
  parseLaunchResourcePlanV1,
  parseOperationInput,
  parseOperationResult,
  parseProjectSessionLaunchCurrentState,
  requiredOperatorActionForIntent,
} from "../src/index.js";

const digest = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const artifact = { path: "launch/packet.json", digest } as const;
const command = {
  credential: { capabilityId: "capability_launch_01", token: "test-launch-capability" },
  commandId: "command_launch_preview_01",
  expectedRevision: 7,
  actor: "operator_01",
  provenance: { kind: "console-direct-input", clientId: "client_01", inputEventId: "input_launch_01" },
  evidenceRefs: [artifact],
} as const;
const intent = {
  kind: "project-session-launch",
  projectId: "project_01",
  projectSessionId: "ps_01",
  expectedProjectRevision: 3,
  expectedSessionRevision: 4,
  expectedSessionGeneration: 2,
  trustRecordDigest: digest,
  launchPacketRef: artifact,
  authorityRef: digest,
  budgetRef: "budget_01",
  resourcePlanRef: { path: "launch/resources.json", digest },
  providerAdapterId: "claude-agent-sdk",
  providerActionId: "provider_action_launch_01",
  providerContractDigest: digest,
  resourceStateDigest: digest,
} as const;

const launchPacket = {
  schemaVersion: 1,
  projectId: "project_01",
  projectSessionId: "ps_01",
  runId: "run_launch_01",
  chairAgentId: "agent_chair_01",
  projectRunDirectory: ".agent-run/AFAB-005",
  topologyMode: "coordinated",
  budgetRef: "budget_01",
  resourcePlanRef: { path: "launch/resources.json", digest },
  chairAuthority: {
    schemaVersion: 2,
    approval: { approvedBy: "human-maintainer", evidenceId: "authority-approval", evidenceDigest: digest },
    workspaceRoots: ["project"],
    sourcePaths: ["project/runtime/agent-fabric"],
    artifactPaths: ["project/.agent-run/AFAB-005"],
    actions: [FABRIC_OPERATIONS.createTask],
    deniedPaths: [],
    deniedActions: [],
    prohibitedActions: [],
    disclosure: { level: "forbidden" },
    secrets: { access: "none" },
    deployment: { allowed: false },
    irreversibleActions: { allowed: false },
    network: { toolEgress: "none" },
    expiresAt: "2026-07-12T12:00:00Z",
    budget: { concurrent_turns: 2 },
  },
  provider: {
    adapterId: "claude-agent-sdk",
    actionId: "provider_action_launch_01",
    contractDigest: digest,
    inputSchemaId: "claude-launch-input.v1",
    input: { model: "claude-opus-4-1", promptRef: "launch/prompt.txt" },
  },
} as const;

const resourcePlan = {
  schemaVersion: 1,
  projectId: "project_01",
  projectSessionId: "ps_01",
  runId: "run_launch_01",
  budgetRef: "budget_01",
  scopes: {
    project: { scopeId: "scope_project_01", limits: { concurrent_turns: 4 } },
    projectSession: { scopeId: "scope_session_01", limits: { concurrent_turns: 3 } },
    coordinationRun: { scopeId: "scope_run_01", limits: { concurrent_turns: 2 } },
  },
  launchReservation: { amounts: { concurrent_turns: 1 } },
} as const;

const launchCurrentState = {
  schemaVersion: 1,
  projectId: "project_01",
  projectRevision: 3,
  projectSessionId: "ps_01",
  sessionRevision: 4,
  sessionGeneration: 2,
  sessionState: "awaiting_launch",
  currentLaunchPacketRef: artifact,
  trustRecordDigest: digest,
  providerAdapterId: "claude-agent-sdk",
  providerContractDigest: digest,
  resourceStateDigest: digest,
  provedFailedAttempt: null,
} as const;
const terminalSuccessOutcome = {
  schemaVersion: 1,
  providerAdapterId: "claude-agent-sdk",
  providerActionId: "provider_action_launch_01",
  providerContractDigest: digest,
  observationKind: "lookup",
  observedAt: "2026-07-12T11:00:00Z",
  outcome: {
    kind: "terminal-success",
    providerSessionRef: "provider_session_01",
    providerSessionGeneration: 1,
    effectDigest: digest,
    resourceUsage: { concurrent_turns: 1, "input_tokens:anthropic": "unknown" },
  },
} as const;
const providerActionRef = {
  schemaVersion: 1,
  projectSessionId: "ps_01",
  coordinationRunId: "run_launch_01",
  actionRef: { adapterId: "claude-agent-sdk", actionId: "provider_action_launch_01" },
  providerContractDigest: digest,
  custodyAttemptGeneration: 1,
  journalRevision: 3,
  journalState: "terminal",
  outcomeKind: "terminal-success",
  outcomeDigest: digest,
} as const;

function parseLaunchIntent(value: unknown) {
  const parsed = parseOperationInput(FABRIC_OPERATIONS.operatorActionPreview, {
    command,
    projectId: "project_01",
    intent: value,
  });
  if (parsed.intent.kind !== "project-session-launch") throw new TypeError("expected project-session-launch intent");
  return parsed.intent;
}

describe("reviewed project-session launch intent", () => {
  it("round-trips the complete closed intent and maps it only to launch authority", () => {
    const parsed = parseOperationInput(FABRIC_OPERATIONS.operatorActionPreview, {
      command,
      projectId: "project_01",
      intent,
    });
    expect(parsed).toMatchObject({ intent });
    expect(requiredOperatorActionForIntent(parsed.intent)).toBe("launch");
    expect(OPERATION_REGISTRY[FABRIC_OPERATIONS.operatorActionPreview].principals).toStrictEqual(["operator"]);
  });

  it.each([
    "projectId",
    "projectSessionId",
    "expectedProjectRevision",
    "expectedSessionRevision",
    "expectedSessionGeneration",
    "trustRecordDigest",
    "launchPacketRef",
    "authorityRef",
    "budgetRef",
    "resourcePlanRef",
    "providerAdapterId",
    "providerActionId",
    "providerContractDigest",
    "resourceStateDigest",
  ] as const)("rejects a launch intent missing %s", (field) => {
    const incomplete = { ...intent } as Record<string, unknown>;
    delete incomplete[field];
    expect(() => parseOperationInput(FABRIC_OPERATIONS.operatorActionPreview, {
      command,
      projectId: "project_01",
      intent: incomplete,
    })).toThrowError(new RegExp(field, "iu"));
  });

  it("rejects malformed or widened launch authority", () => {
    for (const changed of [
      { ...intent, authorityRef: "not-a-digest" },
      { ...intent, resourcePlanRef: { path: "/outside/root", digest } },
      { ...intent, shell: "claude --dangerously-skip-permissions" },
    ]) {
      expect(() => parseOperationInput(FABRIC_OPERATIONS.operatorActionPreview, {
        command,
        projectId: "project_01",
        intent: changed,
      })).toThrow();
    }
  });
});

describe("launch packet v1", () => {
  it("parses the exact closed packet and rejects a widened provider envelope", () => {
    expect(parseLaunchPacketV1(launchPacket)).toStrictEqual(launchPacket);
    expect(() => parseLaunchPacketV1({
      ...launchPacket,
      provider: { ...launchPacket.provider, executable: "/tmp/provider" },
    })).toThrowError(/executable|unknown field/iu);
  });

  it.each([
    ["operator-only", FABRIC_OPERATIONS.operatorActionPreview],
    ["integration-only", FABRIC_OPERATIONS.integrationInputAttest],
    ["provider-launch-only", FABRIC_OPERATIONS.launchAttest],
  ] as const)("rejects %s operations from chair authority", (_kind, operation) => {
    expect(parseLaunchPacketV1(launchPacket).chairAuthority.actions)
      .toStrictEqual([FABRIC_OPERATIONS.createTask]);
    expect(() => parseLaunchPacketV1({
      ...launchPacket,
      chairAuthority: { ...launchPacket.chairAuthority, actions: [operation] },
    })).toThrow(/agent authority operation/u);
  });

  it.each(["workspaceRoots", "sourcePaths", "artifactPaths", "deniedPaths"] as const)(
    "permits the exact project root in chairAuthority.%s only",
    (field) => {
      const authority = {
        ...launchPacket.chairAuthority,
        ...(field === "sourcePaths" || field === "artifactPaths" ? { workspaceRoots: ["."] } : {}),
        [field]: ["."],
      };
      expect(parseLaunchPacketV1({ ...launchPacket, chairAuthority: authority }).chairAuthority[field])
        .toStrictEqual(["."]);
      for (const unsafe of ["../outside", "/absolute"]) {
        expect(() => parseLaunchPacketV1({
          ...launchPacket,
          chairAuthority: { ...launchPacket.chairAuthority, [field]: [unsafe] },
        })).toThrow();
      }
    },
  );

  it("keeps the exact-root marker forbidden for artifact refs and projectRunDirectory", () => {
    expect(() => parseLaunchPacketV1({ ...launchPacket, projectRunDirectory: "." })).toThrow();
    expect(() => parseLaunchPacketV1({
      ...launchPacket,
      resourcePlanRef: { ...launchPacket.resourcePlanRef, path: "." },
    })).toThrow();
  });
});

describe("launch resource plan v1", () => {
  it("parses the closed hierarchy and rejects unknown or unqualified limits", () => {
    expect(parseLaunchResourcePlanV1(resourcePlan)).toStrictEqual(resourcePlan);
    expect(() => parseLaunchResourcePlanV1({
      ...resourcePlan,
      scopes: {
        ...resourcePlan.scopes,
        coordinationRun: { ...resourcePlan.scopes.coordinationRun, inherited: true },
      },
    })).toThrowError(/inherited|unknown field/iu);
    expect(() => parseLaunchResourcePlanV1({
      ...resourcePlan,
      launchReservation: { amounts: { arbitrary_unit: 1 } },
    })).toThrowError(/qualified resource unit|invalid key/iu);
  });
});

describe("launch current-state binding", () => {
  it("binds a first attempt and rejects stale trust or retry authority", () => {
    const current = parseProjectSessionLaunchCurrentState(launchCurrentState);
    expect(current).toStrictEqual(launchCurrentState);
    expect(() => assertProjectSessionLaunchCurrentState(parseLaunchIntent(intent), current)).not.toThrow();
    const staleTrust = parseProjectSessionLaunchCurrentState({
      ...launchCurrentState,
      trustRecordDigest: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    });
    expect(() => assertProjectSessionLaunchCurrentState(parseLaunchIntent(intent), staleTrust)).toThrowError(/trust record/iu);
    expect(() => assertProjectSessionLaunchCurrentState(parseLaunchIntent({
      ...intent,
      retryOf: { providerAdapterId: "claude-agent-sdk", providerActionId: "provider_action_failed_01" },
    }), current)).toThrowError(/retryOf.*awaiting_launch/iu);
  });

  it("requires a retry to bind the exact proved no-effect attempt and a new action", () => {
    const current = parseProjectSessionLaunchCurrentState({
      ...launchCurrentState,
      sessionState: "launch_failed",
      provedFailedAttempt: {
        providerAdapterId: "claude-agent-sdk",
        providerActionId: "provider_action_failed_01",
      },
    });
    if (current.sessionState !== "launch_failed") throw new TypeError("expected launch_failed current state");
    expect(() => assertProjectSessionLaunchCurrentState(parseLaunchIntent({
      ...intent,
      retryOf: current.provedFailedAttempt,
    }), current)).not.toThrow();
    expect(() => assertProjectSessionLaunchCurrentState(parseLaunchIntent(intent), current)).toThrowError(/retryOf.*required/iu);
    expect(() => assertProjectSessionLaunchCurrentState(parseLaunchIntent({
      ...intent,
      providerActionId: "provider_action_failed_01",
      retryOf: current.provedFailedAttempt,
    }), current)).toThrowError(/new provider action/iu);
  });
});

describe("reviewed launch preparation transition", () => {
  const transitionBase = {
    command: { ...command, commandId: "command_prepare_launch_01" },
    projectSessionId: "ps_01",
    expectedGeneration: 2,
  } as const;

  it("requires the packet only for draft to awaiting_launch preparation", () => {
    expect(parseOperationInput(FABRIC_OPERATIONS.projectSessionTransition, {
      ...transitionBase,
      transition: { to: "awaiting_launch", reason: "Launch packet reviewed.", launchPacketRef: artifact },
    })).toMatchObject({ transition: { to: "awaiting_launch", launchPacketRef: artifact } });
    expect(() => parseOperationInput(FABRIC_OPERATIONS.projectSessionTransition, {
      ...transitionBase,
      transition: { to: "awaiting_launch", reason: "Missing packet." },
    })).toThrowError(/launchPacketRef.*required/iu);
    expect(() => parseOperationInput(FABRIC_OPERATIONS.projectSessionTransition, {
      ...transitionBase,
      transition: { to: "active", reason: "Not preparation.", launchPacketRef: artifact },
    })).toThrowError(/launchPacketRef|unknown field/iu);
  });

  it.each(["launching", "launch_ambiguous"] as const)("rejects public transition into %s", (to) => {
    expect(() => parseOperationInput(FABRIC_OPERATIONS.projectSessionTransition, {
      ...transitionBase,
      transition: { to, reason: "Custody-owned state." },
    })).toThrowError(/allowed variant|launch/iu);
  });
});

describe("launch adapter outcome and provider-action reference", () => {
  it("parses terminal success, proved no-effect and normalised ambiguity as a closed union", () => {
    expect(parseLaunchAdapterOutcomeV1(terminalSuccessOutcome)).toStrictEqual(terminalSuccessOutcome);
    expect(parseLaunchAdapterOutcomeV1({
      ...terminalSuccessOutcome,
      observationKind: "dispatch-return",
      outcome: {
        kind: "terminal-no-effect",
        failureCode: "provider-rejected",
        noEffectProof: {
          schemaId: "provider-no-effect.v1",
          proof: { providerActionId: "provider_action_launch_01", effectCount: 0 },
          digest,
        },
      },
    })).toMatchObject({ outcome: { kind: "terminal-no-effect" } });
    expect(parseLaunchAdapterOutcomeV1({
      ...terminalSuccessOutcome,
      outcome: { kind: "ambiguous", reasonCode: "missing-resume-reference", evidenceDigest: null },
    })).toMatchObject({ outcome: { kind: "ambiguous" } });
  });

  it("rejects accepted-only, incomplete success and unknown outcome fields", () => {
    expect(() => parseLaunchAdapterOutcomeV1({
      ...terminalSuccessOutcome,
      outcome: { kind: "accepted" },
    })).toThrowError(/allowed|kind/iu);
    const { providerSessionRef: _missing, ...incomplete } = terminalSuccessOutcome.outcome;
    expect(() => parseLaunchAdapterOutcomeV1({ ...terminalSuccessOutcome, outcome: incomplete }))
      .toThrowError(/providerSessionRef|allowed/iu);
    expect(() => parseLaunchAdapterOutcomeV1({
      ...terminalSuccessOutcome,
      outcome: { ...terminalSuccessOutcome.outcome, credential: "secret" },
    })).toThrowError(/credential|unknown field/iu);
  });

  it("correlates journal state and outcome fields in the typed provider-action reference", () => {
    expect(parseLaunchProviderActionJournalRefV1(providerActionRef)).toStrictEqual(providerActionRef);
    expect(() => parseLaunchProviderActionJournalRefV1({
      ...providerActionRef,
      journalState: "accepted",
    })).toThrowError(/outcomeKind|journalState/iu);
  });

  it("carries the typed reference through launch pending, ambiguous and terminal status", () => {
    const seatProvisioning = {
      schemaVersion: 1,
      projectSessionId: "ps_01",
      sessionRevision: 3,
      sessionGeneration: 1,
      coordinationRunId: "run_01",
      runRevision: 1,
      chairAgentId: "agent_chair_01",
      chairGeneration: 1,
      chairLeaseId: "chair:run_01:1",
    } as const;
    const pendingRef = {
      ...providerActionRef,
      journalState: "dispatched",
      outcomeKind: null,
      outcomeDigest: null,
    } as const;
    expect(parseOperationResult(FABRIC_OPERATIONS.operatorActionStatus, {
      status: "pending",
      commandId: "command_launch_commit_01",
      intentDigest: digest,
      phase: "dispatched",
      attemptGeneration: 1,
      launchProviderActionJournalRef: pendingRef,
    })).toMatchObject({ status: "pending", launchProviderActionJournalRef: pendingRef });
    const ambiguousRef = {
      ...providerActionRef,
      journalState: "ambiguous",
      outcomeKind: "ambiguous",
    } as const;
    expect(parseOperationResult(FABRIC_OPERATIONS.operatorActionStatus, {
      status: "ambiguous",
      commandId: "command_launch_commit_01",
      intentDigest: digest,
      attemptGeneration: 1,
      launchProviderActionJournalRef: ambiguousRef,
    })).toMatchObject({ status: "ambiguous", launchProviderActionJournalRef: ambiguousRef });
    expect(parseOperationResult(FABRIC_OPERATIONS.operatorActionStatus, {
      status: "committed",
      commandId: "command_launch_commit_01",
      receipt: {
        commandId: "command_launch_commit_01",
        previewId: "preview_launch_01",
        previewRevision: 1,
        intentDigest: digest,
        beforeStateDigest: digest,
        afterStateDigest: digest,
        launchProviderActionJournalRef: providerActionRef,
        evidenceRefs: [],
        committedAt: "2026-07-12T11:00:00Z",
      },
      launchProviderActionJournalRef: providerActionRef,
      seatProvisioning,
    })).toMatchObject({
      status: "committed",
      receipt: { launchProviderActionJournalRef: providerActionRef },
      launchProviderActionJournalRef: providerActionRef,
      seatProvisioning,
    });
    const committed = {
      status: "committed",
      commandId: "command_launch_commit_01",
      receipt: {
        commandId: "command_launch_commit_01",
        previewId: "preview_launch_01",
        previewRevision: 1,
        intentDigest: digest,
        beforeStateDigest: digest,
        afterStateDigest: digest,
        launchProviderActionJournalRef: providerActionRef,
        evidenceRefs: [],
        committedAt: "2026-07-12T11:00:00Z",
      },
    } as const;
    expect(() => parseOperationResult(FABRIC_OPERATIONS.operatorActionStatus, {
      ...committed,
      seatProvisioning,
    })).toThrow(/terminal-success launch/iu);
    expect(() => parseOperationResult(FABRIC_OPERATIONS.operatorActionStatus, {
      ...committed,
      launchProviderActionJournalRef: {
        ...providerActionRef,
        outcomeKind: "terminal-no-effect",
      },
      seatProvisioning,
    })).toThrow(/terminal-success launch/iu);
    expect(() => parseOperationResult(FABRIC_OPERATIONS.operatorActionStatus, {
      ...committed,
      launchProviderActionJournalRef: providerActionRef,
    })).toThrow(/seatProvisioning/iu);
  });
});
