import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

import { openFabric } from "../../../src/index.ts";
import { createCurrentSessionRun } from "../../support/current-session-testkit.ts";
import { createLifecycleFixture, reopenLifecycleFabric } from "../../support/lifecycle-testkit.ts";

const lifecycleAdapter = fileURLToPath(
  new URL("../../support/lifecycle-fake-provider.ts", import.meta.url),
);
const actionAdapter = fileURLToPath(
  new URL("../../support/daemon-fake-adapter.ts", import.meta.url),
);
const turnAdapter = fileURLToPath(
  new URL("../../support/provider-turn-fake-adapter.ts", import.meta.url),
);

function authority(root: string, actions = ["read", "write", "delegate", "message"]) {
  void root;
  return {
    workspaceRoots: ["."],
    sourcePaths: ["src"],
    artifactPaths: [".agent-run"],
    actions,
    disclosure: ["local", "approved-provider"],
    expiresAt: "2099-01-01T00:00:00.000Z",
    budget: { turns: 20 },
  };
}

async function currentRun(
  directory: string,
  input: Omit<Parameters<typeof createCurrentSessionRun>[0], "databasePath" | "workspaceRoot">,
) {
  return await createCurrentSessionRun({
    databasePath: join(directory, "fabric.sqlite3"),
    workspaceRoot: directory,
    ...input,
  });
}

describe("provider session admission", () => {
  it("rejects provider spawn when delegated authority forbids provider disclosure", async () => {
    const directory = await mkdtemp(join(tmpdir(), "fabric-provider-disclosure-"));
    const journalPath = join(directory, "provider-journal.json");
    const fabric = await openFabric({
      databasePath: join(directory, "fabric.sqlite3"),
      workspaceRoots: [directory],
      adapters: {
        lifecycle: {
          command: [process.execPath, "--import", "tsx", lifecycleAdapter],
          environment: { LIFECYCLE_FAKE_JOURNAL: journalPath },
        },
      },
    });
    try {
      const run = await currentRun(directory, { runId: "provider-disclosure", chair: { agentId: "chair", authority: authority(directory) } });
      const chair = fabric.connect(run.chairCapability);
      const workerAuthority = await chair.delegateAuthority({
        parentAuthorityId: run.chairAuthorityId,
        authority: { ...authority(directory, ["read", "message"]), disclosure: ["local"] },
      });
      await expect(chair.spawnAgent({
        agentId: "worker",
        authorityId: workerAuthority.authorityId,
        adapterId: "lifecycle",
        actionId: "provider-disclosure:spawn",
        payload: { cwd: ".", initialPrompt: "must remain local" },
      })).rejects.toMatchObject({ code: "CAPABILITY_FORBIDDEN" });
      expect(existsSync(journalPath)).toBe(false);
    } finally {
      await fabric.close();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("rejects caller-controlled provider permissions and denied working directories before dispatch", async () => {
    const directory = await mkdtemp(join(tmpdir(), "fabric-provider-controls-"));
    await mkdir(join(directory, "src", "denied"), { recursive: true });
    const journalPath = join(directory, "provider-journal.json");
    const fabric = await openFabric({
      databasePath: join(directory, "fabric.sqlite3"),
      workspaceRoots: [directory],
      adapters: { lifecycle: { command: [process.execPath, "--import", "tsx", lifecycleAdapter], environment: { LIFECYCLE_FAKE_JOURNAL: journalPath } } },
    });
    try {
      const run = await currentRun(directory, { runId: "provider-controls", chair: { agentId: "chair", authority: authority(directory) } });
      const chair = fabric.connect(run.chairCapability);
      const workerAuthority = await chair.delegateAuthority({
        parentAuthorityId: run.chairAuthorityId,
        authority: { ...authority(directory, ["read", "message"]), deniedPaths: ["src/denied"] },
      });
      const base = { agentId: "worker", authorityId: workerAuthority.authorityId, adapterId: "lifecycle" };
      await expect(chair.spawnAgent({
        ...base,
        actionId: "provider-controls:permissions",
        payload: { initialPrompt: "unsafe", allowedTools: ["Bash"] },
      })).rejects.toMatchObject({ code: "CAPABILITY_FORBIDDEN" });
      await expect(chair.spawnAgent({
        ...base,
        actionId: "provider-controls:cwd",
        payload: { initialPrompt: "unsafe", cwd: "src/denied" },
      })).rejects.toMatchObject({ code: "CAPABILITY_FORBIDDEN" });
      expect(existsSync(journalPath)).toBe(false);
    } finally {
      await fabric.close();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("re-admits bound provider turns against the worker authority before provider dispatch", async () => {
    const directory = await mkdtemp(join(tmpdir(), "fabric-provider-turn-controls-"));
    await mkdir(join(directory, "src", "denied"), { recursive: true });
    const journalPath = join(directory, "turns.json");
    const fabric = await openFabric({
      databasePath: join(directory, "fabric.sqlite3"),
      workspaceRoots: [directory],
      adapters: {
        turns: {
          command: [process.execPath, "--import", "tsx", turnAdapter],
          environment: { PROVIDER_TURN_JOURNAL: journalPath },
        },
      },
    });
    try {
      const run = await currentRun(directory, { runId: "provider-turn-controls", chair: { agentId: "chair", authority: authority(directory) } });
      const chair = fabric.connect(run.chairCapability);
      const workerAuthority = await chair.delegateAuthority({
        parentAuthorityId: run.chairAuthorityId,
        authority: { ...authority(directory, ["read", "message"]), deniedPaths: ["src/denied"] },
      });
      await chair.registerAgent({
        agentId: "worker",
        authorityId: workerAuthority.authorityId,
        adapterId: "turns",
        providerSessionRef: "session-1",
      });
      const base = { adapterId: "turns", operation: "send_turn" as const };
      await expect(chair.dispatchProviderAction({
        ...base,
        actionId: "provider-turn-controls:tools",
        payload: { agentId: "worker", providerSessionGeneration: 1, instruction: "unsafe", allowedTools: ["Bash"] },
        commandId: "provider-turn-controls:tools",
      })).rejects.toMatchObject({ code: "CAPABILITY_FORBIDDEN" });
      await expect(chair.dispatchProviderAction({
        ...base,
        actionId: "provider-turn-controls:cwd",
        payload: { agentId: "worker", providerSessionGeneration: 1, instruction: "unsafe", cwd: "src/denied" },
        commandId: "provider-turn-controls:cwd",
      })).rejects.toMatchObject({ code: "CAPABILITY_FORBIDDEN" });
      await chair.revokeCapability({ agentId: "worker", commandId: "provider-turn-controls:revoke" });
      await expect(chair.dispatchProviderAction({
        ...base,
        actionId: "provider-turn-controls:revoked",
        payload: { agentId: "worker", providerSessionGeneration: 1, instruction: "must not dispatch" },
        commandId: "provider-turn-controls:revoked",
      })).rejects.toMatchObject({ code: "AUTHENTICATION_FAILED" });
      expect(existsSync(journalPath)).toBe(false);
    } finally {
      await fabric.close();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("rejects an inadmissible spawn before the provider receives a side effect", async () => {
    const directory = await mkdtemp(join(tmpdir(), "fabric-provider-preflight-"));
    const journalPath = join(directory, "provider-journal.json");
    const fabric = await openFabric({
      databasePath: join(directory, "fabric.sqlite3"),
      workspaceRoots: [directory],
      adapters: {
        lifecycle: {
          command: [process.execPath, "--import", "tsx", lifecycleAdapter],
          environment: { LIFECYCLE_FAKE_JOURNAL: journalPath },
        },
      },
    });
    try {
      const run = await currentRun(directory, {
        runId: "provider-preflight",
        chair: { agentId: "chair", authority: authority(directory) },
      });
      const chair = fabric.connect(run.chairCapability);
      const leaderAuthority = await chair.delegateAuthority({
        parentAuthorityId: run.chairAuthorityId,
        authority: { ...authority(directory), sourcePaths: ["src/leader"] },
      });
      const leaderRegistration = await chair.registerAgent({
        agentId: "leader",
        authorityId: leaderAuthority.authorityId,
      });
      const leader = fabric.connect(leaderRegistration.capability);
      const childAuthority = await leader.delegateAuthority({
        parentAuthorityId: leaderAuthority.authorityId,
        authority: {
          ...authority(directory, ["read", "write", "message"]),
          sourcePaths: ["src/leader/child"],
          budget: { turns: 5 },
        },
      });

      await expect(chair.spawnAgent({
        agentId: "child",
        authorityId: childAuthority.authorityId,
        adapterId: "lifecycle",
        actionId: "inadmissible-spawn",
        payload: { initialPrompt: "must never be dispatched" },
      })).rejects.toMatchObject({ code: "CAPABILITY_FORBIDDEN" });
      expect(existsSync(journalPath)).toBe(false);
    } finally {
      await fabric.close();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("binds an action identity to its adapter and operation", async () => {
    const directory = await mkdtemp(join(tmpdir(), "fabric-provider-identity-"));
    const fabric = await openFabric({
      databasePath: join(directory, "fabric.sqlite3"),
      workspaceRoots: [directory],
      adapters: {
        first: {
          command: [process.execPath, "--import", "tsx", actionAdapter],
          environment: { FAKE_ADAPTER_JOURNAL: join(directory, "first.json") },
        },
        second: {
          command: [process.execPath, "--import", "tsx", actionAdapter],
          environment: { FAKE_ADAPTER_JOURNAL: join(directory, "second.json") },
        },
      },
    });
    try {
      const run = await currentRun(directory, {
        runId: "provider-identity",
        chair: { agentId: "chair", authority: authority(directory) },
      });
      const chair = fabric.connect(run.chairCapability);
      await expect(chair.dispatchProviderAction({
        adapterId: "first",
        actionId: "stable-action",
        operation: "steer",
        payload: { instruction: "same bytes" },
        commandId: "identity:first",
      })).resolves.toMatchObject({ status: "terminal" });

      await expect(chair.dispatchProviderAction({
        adapterId: "second",
        actionId: "stable-action",
        operation: "steer",
        payload: { instruction: "same bytes" },
        commandId: "identity:second",
      })).rejects.toMatchObject({ code: "DEDUPE_CONFLICT" });
    } finally {
      await fabric.close();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("keeps fabric action identity authoritative over colliding provider payload keys", async () => {
    const directory = await mkdtemp(join(tmpdir(), "fabric-provider-reserved-"));
    const journalPath = join(directory, "actions.json");
    const fabric = await openFabric({
      databasePath: join(directory, "fabric.sqlite3"),
      workspaceRoots: [directory],
      adapters: {
        provider: {
          command: [process.execPath, "--import", "tsx", actionAdapter],
          environment: { FAKE_ADAPTER_JOURNAL: journalPath },
        },
      },
    });
    try {
      const run = await currentRun(directory, { runId: "provider-reserved", chair: { agentId: "chair", authority: authority(directory) } });
      const chair = fabric.connect(run.chairCapability);
      await chair.dispatchProviderAction({
        adapterId: "provider",
        actionId: "fabric-action",
        operation: "steer",
        payload: { actionId: "client-action", payload: { instruction: "client envelope" }, instruction: "bounded" },
        commandId: "provider-reserved:dispatch",
      });
      const journal = JSON.parse(await readFile(journalPath, "utf8")) as { actions: Record<string, unknown> };
      expect(Object.keys(journal.actions)).toEqual(["fabric-action"]);
    } finally {
      await fabric.close();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("admits target-less actions even when the adapter has no model policy", async () => {
    const directory = await mkdtemp(join(tmpdir(), "fabric-provider-targetless-admission-"));
    const journalPath = join(directory, "actions.json");
    const fabric = await openFabric({
      databasePath: join(directory, "fabric.sqlite3"),
      workspaceRoots: [directory],
      adapters: {
        provider: {
          command: [process.execPath, "--import", "tsx", actionAdapter],
          environment: { FAKE_ADAPTER_JOURNAL: journalPath },
        },
      },
    });
    try {
      const run = await currentRun(directory, { runId: "provider-targetless-admission", chair: { agentId: "chair", authority: authority(directory) } });
      const chair = fabric.connect(run.chairCapability);
      await expect(chair.dispatchProviderAction({
        adapterId: "provider",
        actionId: "provider-targetless-admission:controls",
        operation: "steer",
        payload: { instruction: "unsafe", allowedTools: ["Bash"] },
        commandId: "provider-targetless-admission:controls",
      })).rejects.toMatchObject({ code: "CAPABILITY_FORBIDDEN" });
      expect(existsSync(journalPath)).toBe(false);
    } finally {
      await fabric.close();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("does not require a model for release and wakeup control actions", async () => {
    const directory = await mkdtemp(join(tmpdir(), "fabric-provider-model-free-controls-"));
    const fabric = await openFabric({
      databasePath: join(directory, "fabric.sqlite3"),
      workspaceRoots: [directory],
      adapters: {
        provider: {
          command: [process.execPath, "--import", "tsx", actionAdapter],
          environment: { FAKE_ADAPTER_JOURNAL: join(directory, "actions.json") },
          modelPolicy: { allowedFamilies: ["openai"], allowedModelPatterns: ["gpt-*"], requiresExplicitModel: true },
        },
      },
    });
    try {
      const run = await currentRun(directory, { runId: "provider-model-free-controls", chair: { agentId: "chair", authority: authority(directory) } });
      const chair = fabric.connect(run.chairCapability);
      await expect(chair.dispatchProviderAction({
        adapterId: "provider", actionId: "provider-control:wakeup", operation: "wakeup", payload: {}, commandId: "provider-control:wakeup",
      })).resolves.toMatchObject({ status: "terminal" });
      await expect(chair.dispatchProviderAction({
        adapterId: "provider", actionId: "provider-control:release", operation: "release", payload: {}, commandId: "provider-control:release",
      })).resolves.toMatchObject({ status: "terminal" });
    } finally {
      await fabric.close();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("rejects an adapter that does not advertise spawn before dispatch", async () => {
    const directory = await mkdtemp(join(tmpdir(), "fabric-provider-capability-"));
    const journalPath = join(directory, "action.json");
    const fabric = await openFabric({
      databasePath: join(directory, "fabric.sqlite3"),
      workspaceRoots: [directory],
      adapters: {
        noSpawn: {
          command: [process.execPath, "--import", "tsx", actionAdapter],
          environment: { FAKE_ADAPTER_JOURNAL: journalPath },
        },
      },
    });
    try {
      const run = await currentRun(directory, {
        runId: "provider-capability",
        chair: { agentId: "chair", authority: authority(directory) },
      });
      const chair = fabric.connect(run.chairCapability);
      const workerAuthority = await chair.delegateAuthority({
        parentAuthorityId: run.chairAuthorityId,
        authority: { ...authority(directory, ["read", "message"]), budget: { turns: 5 } },
      });
      await expect(chair.spawnAgent({
        agentId: "worker",
        authorityId: workerAuthority.authorityId,
        adapterId: "noSpawn",
        actionId: "unsupported-spawn",
        payload: { initialPrompt: "do not dispatch" },
      })).rejects.toMatchObject({ code: "CAPABILITY_FORBIDDEN" });
      expect(existsSync(journalPath)).toBe(false);
    } finally {
      await fabric.close();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("allows only one active send turn for a provider session", async () => {
    const directory = await mkdtemp(join(tmpdir(), "fabric-provider-turn-"));
    const fabric = await openFabric({
      databasePath: join(directory, "fabric.sqlite3"),
      workspaceRoots: [directory],
      maximumConcurrentProviderTurns: 1,
      adapters: {
        turns: {
          command: [process.execPath, "--import", "tsx", turnAdapter],
          environment: {
            PROVIDER_TURN_JOURNAL: join(directory, "turns.json"),
            PROVIDER_TURN_DELAY_MS: "100",
          },
        },
      },
    });
    try {
      const run = await currentRun(directory, {
        runId: "provider-turn",
        chair: { agentId: "chair", authority: authority(directory) },
      });
      const chair = fabric.connect(run.chairCapability);
      const workerAuthority = await chair.delegateAuthority({
        parentAuthorityId: run.chairAuthorityId,
        authority: { ...authority(directory, ["read", "message"]), budget: { turns: 5 } },
      });
      await chair.registerAgent({
        agentId: "worker",
        authorityId: workerAuthority.authorityId,
        adapterId: "turns",
        providerSessionRef: "session-1",
      });
      const first = chair.dispatchProviderAction({
        adapterId: "turns",
        actionId: "turn-1",
        operation: "send_turn",
        payload: { agentId: "worker", providerSessionGeneration: 1, instruction: "first" },
        commandId: "turn:first",
      });
      await new Promise((resolve) => setTimeout(resolve, 20));

      await expect(chair.dispatchProviderAction({
        adapterId: "turns",
        actionId: "turn-2",
        operation: "send_turn",
        payload: { agentId: "worker", providerSessionGeneration: 1, instruction: "second" },
        commandId: "turn:second",
      })).rejects.toMatchObject({ code: "PROVIDER_TURN_ACTIVE" });
      await expect(first).resolves.toMatchObject({ status: "terminal" });
    } finally {
      await fabric.close();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("releases a quarantined turn lease only after terminal reconciliation", async () => {
    const fixture = await createLifecycleFixture();
    try {
      const ambiguous = await fixture.chair.dispatchProviderAction({
        adapterId: "fake-lifecycle",
        actionId: "turn-reconcile-ambiguous",
        operation: "send_turn",
        payload: { scenario: "ambiguous-idempotent", taskId: fixture.leaderTask.taskId },
        commandId: "turn-reconcile:dispatch",
      });
      expect(ambiguous.status).toBe("ambiguous");
      await expect(fixture.chair.dispatchProviderAction({
        adapterId: "fake-lifecycle",
        actionId: "turn-before-reconcile",
        operation: "send_turn",
        payload: { scenario: "terminal", taskId: fixture.leaderTask.taskId },
        commandId: "turn-before-reconcile:dispatch",
      })).rejects.toMatchObject({ code: "PROVIDER_TURN_ACTIVE" });

      await expect(fixture.chair.reconcileProviderAction({
        actionId: ambiguous.actionId,
        commandId: "turn-reconcile:lookup",
      })).resolves.toMatchObject({ status: "terminal" });
      await expect(fixture.chair.dispatchProviderAction({
        adapterId: "fake-lifecycle",
        actionId: "turn-after-reconcile",
        operation: "send_turn",
        payload: { scenario: "terminal", taskId: fixture.leaderTask.taskId },
        commandId: "turn-after-reconcile:dispatch",
      })).resolves.toMatchObject({ status: "terminal" });
    } finally {
      await fixture.fabric.close();
      await rm(fixture.directory, { recursive: true, force: true });
    }
  });

  it("retires direct lifecycle spawn when no elected daemon owns child custody", async () => {
    const directory = await mkdtemp(join(tmpdir(), "fabric-provider-lifecycle-intent-"));
    const journalPath = join(directory, "provider-journal.json");
    const databasePath = join(directory, "fabric.sqlite3");
    const fabric = await openFabric({
      databasePath,
      workspaceRoots: [directory],
      adapters: {
        lifecycle: {
          command: [process.execPath, "--import", "tsx", lifecycleAdapter],
          environment: { LIFECYCLE_FAKE_JOURNAL: journalPath },
        },
      },
    });
    try {
      const run = await currentRun(directory, {
        runId: "provider-lifecycle-intent",
        chair: { agentId: "chair", authority: authority(directory) },
      });
      const chair = fabric.connect(run.chairCapability);
      const workerAuthority = await chair.delegateAuthority({
        parentAuthorityId: run.chairAuthorityId,
        authority: { ...authority(directory, ["read", "message"]), budget: { turns: 5 } },
      });
      const input = {
        agentId: "worker",
        authorityId: workerAuthority.authorityId,
        adapterId: "lifecycle",
        actionId: "spawn-worker-once",
        payload: { initialPrompt: "bounded task" },
      };
      await expect(chair.spawnAgent(input)).rejects.toMatchObject({ code: "CAPABILITY_UNAVAILABLE" });
      await expect(chair.spawnAgent(input)).rejects.toMatchObject({ code: "CAPABILITY_UNAVAILABLE" });
      expect(existsSync(journalPath)).toBe(false);
      const database = new Database(databasePath, { readonly: true });
      try {
        expect(database.prepare("SELECT COUNT(*) AS count FROM provider_lifecycle_intents").get()).toEqual({ count: 0 });
        expect(database.prepare("SELECT COUNT(*) AS count FROM provider_agent_custody").get()).toEqual({ count: 0 });
        expect(database.prepare("SELECT COUNT(*) AS count FROM agents WHERE agent_id='worker'").get()).toEqual({ count: 0 });
      } finally {
        database.close();
      }
    } finally {
      await fabric.close();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("projects registered routing and independent review evidence into the receipt", async () => {
    const directory = await mkdtemp(join(tmpdir(), "fabric-provider-evidence-"));
    const runDirectory = join(directory, ".agent-run", "provider-evidence");
    await mkdir(runDirectory, { recursive: true });
    const fabric = await openFabric({
      databasePath: join(directory, "fabric.sqlite3"),
      workspaceRoots: [directory],
      adapters: {
        claude: {
          command: [process.execPath, "--import", "tsx", actionAdapter],
          environment: { FAKE_ADAPTER_JOURNAL: join(directory, "route-action.json") },
        },
      },
    });
    try {
      const run = await currentRun(directory, {
        runId: "provider-evidence",
        projectRunDirectory: runDirectory,
        chair: { agentId: "chair", authority: authority(directory) },
      });
      const chair = fabric.connect(run.chairCapability);
      const reviewerAuthority = await chair.delegateAuthority({
        parentAuthorityId: run.chairAuthorityId,
        authority: { ...authority(directory, ["read", "message"]), budget: { turns: 2 } },
      });
      await chair.registerAgent({ agentId: "anthropic-reviewer", authorityId: reviewerAuthority.authorityId });
      const routeBytes = `${JSON.stringify({
        schema_version: 1,
        status: "ok",
        adapter: "claude",
        role: "reviewer",
        model_family: "anthropic",
        model: "fable",
        effort: "high",
      })}\n`;
      const reviewBytes = "independent provider-boundary review\n";
      await writeFile(join(runDirectory, "model-route.json"), routeBytes);
      await writeFile(join(runDirectory, "review.md"), reviewBytes);
      const routeSha = createHash("sha256").update(routeBytes).digest("hex");
      const reviewSha = createHash("sha256").update(reviewBytes).digest("hex");
      await chair.publishArtifact({ relativePath: "model-route.json", sha256: routeSha, commandId: "evidence:route:publish" });
      await chair.publishArtifact({ relativePath: "review.md", sha256: reviewSha, commandId: "evidence:review:publish" });
      await chair.dispatchProviderAction({
        adapterId: "claude",
        actionId: "spawn-reviewer",
        operation: "steer",
        payload: { instruction: "run the routed review" },
        commandId: "evidence:routed-action",
      });

      fabric.recordModelRoutingEvidence("provider-evidence", "chair", {
        evidenceId: "route-1",
        actionId: "spawn-reviewer",
        relativePath: "model-route.json",
        sha256: routeSha,
      });
      fabric.recordCrossFamilyReviewEvidence("provider-evidence", "chair", {
        evidenceId: "review-1",
        reviewerAgentId: "anthropic-reviewer",
        providerFamily: "anthropic",
        status: "pass",
        independent: true,
        relativePath: "review.md",
        sha256: reviewSha,
      });

      const exported = await chair.exportReceipt({ commandId: "evidence:receipt" });
      const receipt = JSON.parse(await readFile(join(runDirectory, exported.relativePath), "utf8")) as Record<string, unknown>;
      expect(receipt.modelRoutingReceipts).toEqual([
        expect.objectContaining({ evidenceId: "route-1", actionId: "spawn-reviewer", relativePath: "model-route.json", sha256: routeSha }),
      ]);
      expect(receipt.crossFamilyReviews).toEqual([
        expect.objectContaining({ evidenceId: "review-1", reviewerAgentId: "anthropic-reviewer", providerFamily: "anthropic", independent: true, relativePath: "review.md", sha256: reviewSha }),
      ]);
    } finally {
      await fabric.close();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("marks persisted provider sessions unreconciled when a restarted adapter reports them unmanaged", async () => {
    const fixture = await createLifecycleFixture();
    let reopened: Awaited<ReturnType<typeof reopenLifecycleFabric>> | undefined;
    try {
      await fixture.fabric.close();
      reopened = await reopenLifecycleFabric(fixture, { providerStatus: "unmanaged" });

      await expect(reopened.recoverStartupState()).resolves.toMatchObject({ sessionsDegraded: 2 });
      const chair = reopened.connect(fixture.capabilities.chair);
      await expect(chair.getAgentLifecycle({ agentId: "leader" })).resolves.toMatchObject({
        lifecycle: "context-unreconciled",
      });
      await expect(chair.getAgentLifecycle({ agentId: "child" })).resolves.toMatchObject({
        lifecycle: "context-unreconciled",
      });
    } finally {
      await reopened?.close();
      await fixture.fabric.close();
      await rm(fixture.directory, { recursive: true, force: true });
    }
  });

  it("marks persisted provider sessions unreconciled when health evidence is absent", async () => {
    const fixture = await createLifecycleFixture();
    let reopened: Awaited<ReturnType<typeof reopenLifecycleFabric>> | undefined;
    try {
      await fixture.fabric.close();
      reopened = await reopenLifecycleFabric(fixture, { providerStatus: "missing-evidence" });
      await expect(reopened.recoverStartupState()).resolves.toMatchObject({ sessionsDegraded: 2 });
      const chair = reopened.connect(fixture.capabilities.chair);
      await expect(chair.getAgentLifecycle({ agentId: "leader" })).resolves.toMatchObject({
        lifecycle: "context-unreconciled",
      });
    } finally {
      await reopened?.close();
      await fixture.fabric.close();
      await rm(fixture.directory, { recursive: true, force: true });
    }
  });
});
