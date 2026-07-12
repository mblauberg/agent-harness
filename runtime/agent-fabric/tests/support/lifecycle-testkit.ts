import { createHash } from "node:crypto";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { AUTHORITY_ACTION_VOCABULARY, openFabric } from "../../src/index.ts";
import type { AuthorityInput, Fabric, FabricClient } from "../../src/index.ts";

import { createCurrentSessionRun } from "./current-session-testkit.ts";
import { ManualClock } from "./manual-clock.ts";

const fakeProvider = fileURLToPath(new URL("./lifecycle-fake-provider.ts", import.meta.url));

export type LifecycleCheckpoint = {
  relativePath: string;
  sha256: string;
  mailboxWatermark: number;
  acknowledgedAboveWatermark: number[];
  inFlightChildren: string[];
  openWork: string[];
  nextAction: string;
  providerResumeReference: string;
};

export type LifecycleResult = {
  agentId: string;
  lifecycle: string;
  providerSessionGeneration: number;
  rotation?: { kind: "in-place" | "replacement-session"; priorResumeReference: string };
};

export type ProviderActionResult = {
  actionId: string;
  status: "prepared" | "dispatched" | "accepted" | "terminal" | "ambiguous" | "quarantined";
  history: string[];
  executionCount: number;
  effectCount: number;
  result?: unknown;
};

type Stage3OpenOptions = {
  databasePath: string;
  workspaceRoots: string[];
  clock: ManualClock["now"];
  maximumConcurrentProviderTurns?: number;
  adapters: Record<string, { command: string[]; environment: Record<string, string> }>;
};

export type LifecycleFixture = {
  directory: string;
  runDirectory: string;
  databasePath: string;
  providerJournalPath: string;
  providerSessionMarker: string;
  clock: ManualClock;
  fabric: Fabric;
  capabilities: { chair: string; leader: string; child: string };
  chairAuthorityId: string;
  rootAuthority: AuthorityInput;
  chair: FabricClient;
  leader: FabricClient;
  child: FabricClient;
  runId: string;
  leaderTask: { taskId: string; revision: number };
  childTask: { taskId: string; revision: number };
};

export function asLifecycleClient(client: FabricClient): FabricClient {
  return client;
}

function adapterOptions(fixture: {
  databasePath: string;
  directory: string;
  clock: ManualClock;
  providerJournalPath: string;
  providerStatus?: "healthy" | "unmanaged" | "missing-evidence";
  capabilitiesDelayMs?: number;
  spawnDelayMs?: number;
  mandatoryUsageUnits?: boolean;
  maximumConcurrentProviderTurns?: number;
}): Stage3OpenOptions {
  return {
    databasePath: fixture.databasePath,
    workspaceRoots: [fixture.directory],
    clock: fixture.clock.now,
    ...(fixture.maximumConcurrentProviderTurns === undefined
      ? {}
      : { maximumConcurrentProviderTurns: fixture.maximumConcurrentProviderTurns }),
    adapters: {
      "fake-lifecycle": {
        command: [process.execPath, "--import", "tsx", fakeProvider],
        environment: {
          LIFECYCLE_FAKE_JOURNAL: fixture.providerJournalPath,
          LIFECYCLE_FAKE_STATUS: fixture.providerStatus ?? "healthy",
          ...(fixture.capabilitiesDelayMs === undefined
            ? {}
            : { LIFECYCLE_FAKE_CAPABILITIES_DELAY_MS: String(fixture.capabilitiesDelayMs) }),
          ...(fixture.spawnDelayMs === undefined
            ? {}
            : { LIFECYCLE_FAKE_SPAWN_DELAY_MS: String(fixture.spawnDelayMs) }),
          LIFECYCLE_FAKE_MANDATORY_USAGE: fixture.mandatoryUsageUnits === true ? "1" : "0",
        },
      },
    },
  };
}

export async function createLifecycleFixture(
  options: {
    capabilitiesDelayMs?: number;
    spawnDelayMs?: number;
    mandatoryUsageUnits?: boolean;
    maximumConcurrentProviderTurns?: number;
  } = {},
): Promise<LifecycleFixture> {
  const directory = await mkdtemp(join(tmpdir(), "agent-fabric-lifecycle-"));
  const runDirectory = join(directory, ".agent-run", "run-stage3");
  const databasePath = join(directory, "fabric.sqlite3");
  const providerJournalPath = join(directory, "fake-provider-journal.json");
  const providerSessionMarker = join(directory, "provider-native-session.json");
  const clock = new ManualClock();
  await mkdir(join(directory, "src", "leader", "child"), { recursive: true });
  await mkdir(runDirectory, { recursive: true });
  await writeFile(providerSessionMarker, '{"provider":"fake","session":"leader"}\n');
  const fabric = await openFabric(adapterOptions({
    databasePath,
    directory,
    clock,
    providerJournalPath,
    ...options,
  }));
  const rootAuthority = {
    workspaceRoots: ["."],
    sourcePaths: ["src"],
    artifactPaths: [".agent-run/run-stage3"],
    actions: [...AUTHORITY_ACTION_VOCABULARY],
    disclosure: { level: "scoped", scopes: ["local", "approved-provider"] } as const,
    expiresAt: "2099-01-01T00:00:00.000Z",
    budget: {
      turns: 40,
      provider_calls: 40,
      concurrent_turns: 8,
      wall_clock_milliseconds: 1_000_000,
      "cost:USD": 20,
      "input_tokens:fake": 100_000,
      "output_tokens:fake": 100_000,
      descendants: 10,
      message_bytes: 1_000_000,
      artifact_bytes: 1_000_000,
    },
  };
  const run = await createCurrentSessionRun({
    databasePath,
    workspaceRoot: directory,
    runId: "run-stage3",
    projectRunDirectory: runDirectory,
    chair: { agentId: "chair", authority: rootAuthority },
  });
  const chairBase = fabric.connect(run.chairCapability);
  const leaderAuthority = await chairBase.delegateAuthority({
    parentAuthorityId: run.chairAuthorityId,
    authority: {
      ...rootAuthority,
      sourcePaths: ["src/leader"],
      actions: [...rootAuthority.actions],
      budget: { turns: 20, "cost:USD": 10 },
    },
  });
  const leaderRegistration = await chairBase.registerAgent({
    agentId: "leader",
    authorityId: leaderAuthority.authorityId,
    providerSessionRef: providerSessionMarker,
    adapterId: "fake-lifecycle",
  });
  const leaderBase = fabric.connect(leaderRegistration.capability);
  const childAuthority = await leaderBase.delegateAuthority({
    parentAuthorityId: leaderAuthority.authorityId,
    authority: {
      ...rootAuthority,
      sourcePaths: ["src/leader/child"],
      actions: [...rootAuthority.actions],
      budget: { turns: 5, "cost:USD": 2 },
    },
  });
  const childRegistration = await leaderBase.registerAgent({
    agentId: "child",
    authorityId: childAuthority.authorityId,
    providerSessionRef: "fake-session:child:g1",
    adapterId: "fake-lifecycle",
  });
  const childBase = fabric.connect(childRegistration.capability);
  const leaderTaskReady = await chairBase.createTask({
    taskId: "leader-task",
    authorityId: leaderAuthority.authorityId,
    participantAgentIds: ["chair", "leader"],
    eligibleAgentIds: ["leader"],
    objective: "own the Stage 3 lifecycle",
    baseRevision: "stage3-base",
    commandId: "stage3:create:leader-task",
  });
  const leaderTask = await leaderBase.claimTask({
    taskId: leaderTaskReady.taskId,
    expectedRevision: leaderTaskReady.revision,
    commandId: "stage3:claim:leader-task",
  });
  const childTaskReady = await leaderBase.createTask({
    taskId: "child-task",
    authorityId: childAuthority.authorityId,
    eligibleAgentIds: ["child"],
    objective: "perform bounded child work",
    baseRevision: "stage3-base",
    commandId: "stage3:create:child-task",
  });
  const childTask = await childBase.claimTask({
    taskId: childTaskReady.taskId,
    expectedRevision: childTaskReady.revision,
    commandId: "stage3:claim:child-task",
  });

  return {
    directory,
    runDirectory,
    databasePath,
    providerJournalPath,
    providerSessionMarker,
    clock,
    fabric,
    capabilities: {
      chair: run.chairCapability,
      leader: leaderRegistration.capability,
      child: childRegistration.capability,
    },
    chairAuthorityId: run.chairAuthorityId,
    rootAuthority,
    chair: asLifecycleClient(chairBase),
    leader: asLifecycleClient(leaderBase),
    child: asLifecycleClient(childBase),
    runId: run.runId,
    leaderTask,
    childTask,
  };
}

export async function reopenLifecycleFabric(
  fixture: LifecycleFixture,
  options: { providerStatus?: "healthy" | "unmanaged" | "missing-evidence" } = {},
): Promise<Fabric> {
  return await openFabric(
    adapterOptions({
      databasePath: fixture.databasePath,
      directory: fixture.directory,
      clock: fixture.clock,
      providerJournalPath: fixture.providerJournalPath,
      ...(options.providerStatus === undefined ? {} : { providerStatus: options.providerStatus }),
    }),
  );
}

export async function writeLifecycleCheckpoint(
  fixture: LifecycleFixture,
  options: {
    agentId: "leader" | "child";
    inFlightChildren?: string[];
    openWork?: string[];
    nextAction?: string;
  },
): Promise<LifecycleCheckpoint> {
  const relativePath = join("checkpoints", `${options.agentId}-${Date.now()}.json`);
  const absolutePath = join(fixture.runDirectory, relativePath);
  await mkdir(join(fixture.runDirectory, "checkpoints"), { recursive: true });
  const document = {
    schemaVersion: 1,
    agentId: options.agentId,
    mailboxWatermark: 0,
    acknowledgedAboveWatermark: [],
    inFlightChildren: options.inFlightChildren ?? [],
    openWork: options.openWork ?? [],
    nextAction: options.nextAction ?? "release",
    providerResumeReference:
      options.agentId === "leader" ? fixture.providerSessionMarker : "fake-session:child:g1",
  };
  const bytes = `${JSON.stringify(document, null, 2)}\n`;
  await writeFile(absolutePath, bytes, { mode: 0o600 });
  return {
    relativePath,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    mailboxWatermark: document.mailboxWatermark,
    acknowledgedAboveWatermark: document.acknowledgedAboveWatermark,
    inFlightChildren: document.inFlightChildren,
    openWork: document.openWork,
    nextAction: document.nextAction,
    providerResumeReference: document.providerResumeReference,
  };
}
