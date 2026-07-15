import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";

import { beforeEach, describe, expect, it, vi } from "vitest";

const custodyHarness = vi.hoisted(() => ({
  provisionAgent: vi.fn(async (input: Record<string, unknown>) => ({
    actionId: input.actionId,
    adapterId: input.adapterId,
    agentId: input.agentId,
    authorityId: input.authorityId,
    bridgeGeneration: 1,
    bridgeState: "active",
    evidenceDigest: `sha256:${"a".repeat(64)}`,
    providerSessionGeneration: 1,
    providerSessionRef: "golden-provider-session",
  })),
}));

vi.mock("../../../src/project-session/launch-custody.ts", () => ({
  LaunchCustodyService: class {
    readonly provisionAgent = custodyHarness.provisionAgent;
  },
}));

import { AUTHORITY_ACTION_VOCABULARY, openFabric } from "../../../src/index.ts";
import { TEST_AUTHORITY_V2_FIELDS } from "../../support/authority-v2-testkit.ts";
import { createCurrentSessionRun } from "../../support/current-session-testkit.ts";

const captureAdapter = fileURLToPath(
  new URL("../../support/agent-bridge-fake-provider.ts", import.meta.url),
);

function authority() {
  return {
    ...TEST_AUTHORITY_V2_FIELDS,
    workspaceRoots: ["."],
    sourcePaths: ["src"],
    artifactPaths: [".agent-run"],
    actions: [...AUTHORITY_ACTION_VOCABULARY],
    disclosure: { level: "scoped", scopes: ["local", "approved-provider"] } as const,
    expiresAt: "2099-01-01T00:00:00.000Z",
    budget: { turns: 20 },
  };
}

function hydrateWorkspaceRoot(value: unknown, workspaceRoot: string): unknown {
  if (typeof value === "string") return value.replaceAll("$WORKSPACE_ROOT", workspaceRoot);
  if (Array.isArray(value)) return value.map((entry) => hydrateWorkspaceRoot(entry, workspaceRoot));
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, hydrateWorkspaceRoot(entry, workspaceRoot)]),
    );
  }
  return value;
}

async function admittedGolden(workspaceRoot: string): Promise<Record<string, unknown>> {
  const value: unknown = JSON.parse(await readFile(
    new URL("../../fixtures/provider-permissions/review-readonly.admitted.json", import.meta.url),
    "utf8",
  ));
  return hydrateWorkspaceRoot(value, workspaceRoot) as Record<string, unknown>;
}

beforeEach(() => {
  custodyHarness.provisionAgent.mockClear();
});

describe("review-readonly provider permission goldens", () => {
  it("captures the exact provider-neutral payload leaving Fabric admission", async () => {
    const directory = await mkdtemp(join(tmpdir(), "fabric-provider-permission-golden-"));
    await mkdir(join(directory, "src"), { recursive: true });
    const workspaceRoot = await realpath(directory);
    const databasePath = join(directory, "fabric.sqlite3");
    const journalPath = join(directory, "adapter-journal.json");
    const fabric = await openFabric({
      databasePath,
      workspaceRoots: [directory],
      fabricSocketPath: join(directory, "fabric.sock"),
      adapters: {
        capture: {
          command: [process.execPath, "--import", "tsx", captureAdapter],
          environment: { AGENT_BRIDGE_FAKE_JOURNAL: journalPath },
        },
      },
    });
    try {
      const run = await createCurrentSessionRun({
        databasePath,
        workspaceRoot: directory,
        runId: "provider-permission-golden",
        chair: { agentId: "chair", authority: authority() },
      });
      const chair = fabric.connect(run.chairCapability);
      const workerAuthority = await chair.delegateAuthority({
        parentAuthorityId: run.chairAuthorityId,
        authority: { ...authority(), budget: { turns: 5 } },
      });

      await expect(chair.spawnAgent({
        agentId: "worker",
        authorityId: workerAuthority.authorityId,
        adapterId: "capture",
        actionId: "provider-permission-golden:spawn",
        payload: {
          cwd: "src/.",
          initialPrompt: "characterise current read-only projection",
          model: "gpt-5.4",
          modelFamily: "openai",
        },
      })).resolves.toMatchObject({ providerSessionRef: "golden-provider-session" });

      expect(custodyHarness.provisionAgent).toHaveBeenCalledOnce();
      const captured = custodyHarness.provisionAgent.mock.calls[0]?.[0];
      const payload = captured?.payload as Record<string, unknown>;
      const { agentId, ...admittedPayload } = payload;
      expect(agentId).toBe("worker");
      expect(admittedPayload).toStrictEqual(await admittedGolden(workspaceRoot));
      expect(isAbsolute(payload.cwd as string)).toBe(true);
      expect(payload.readOnlyRoot).toBe(payload.cwd);
    } finally {
      await fabric.close();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it.each([
    ["tool widening", { cwd: "src", allowedTools: ["Bash"] }, "CAPABILITY_FORBIDDEN"],
    ["approval widening", { cwd: "src", approvalPolicy: "on-request" }, "CAPABILITY_FORBIDDEN"],
    ["sandbox widening", { cwd: "src", sandbox: "workspace-write" }, "CAPABILITY_FORBIDDEN"],
    ["caller read root", { cwd: "src", readOnlyRoot: "/tmp" }, "CAPABILITY_FORBIDDEN"],
    ["denied cwd", { cwd: "src/denied" }, "CAPABILITY_FORBIDDEN"],
    ["escaping cwd", { cwd: "../outside" }, "AUTHORITY_WIDENING"],
  ])("rejects %s before the adapter", async (_label, payload, code) => {
    const directory = await mkdtemp(join(tmpdir(), "fabric-provider-permission-rejection-"));
    await mkdir(join(directory, "src", "denied"), { recursive: true });
    const databasePath = join(directory, "fabric.sqlite3");
    const journalPath = join(directory, "adapter-journal.json");
    const fabric = await openFabric({
      databasePath,
      workspaceRoots: [directory],
      fabricSocketPath: join(directory, "fabric.sock"),
      adapters: {
        capture: {
          command: [process.execPath, "--import", "tsx", captureAdapter],
          environment: { AGENT_BRIDGE_FAKE_JOURNAL: journalPath },
        },
      },
    });
    try {
      const run = await createCurrentSessionRun({
        databasePath,
        workspaceRoot: directory,
        runId: `provider-permission-rejection-${String(_label).replaceAll(" ", "-")}`,
        chair: { agentId: "chair", authority: authority() },
      });
      const chair = fabric.connect(run.chairCapability);
      const workerAuthority = await chair.delegateAuthority({
        parentAuthorityId: run.chairAuthorityId,
        authority: { ...authority(), deniedPaths: ["src/denied"], budget: { turns: 5 } },
      });

      await expect(chair.spawnAgent({
        agentId: "worker",
        authorityId: workerAuthority.authorityId,
        adapterId: "capture",
        actionId: `provider-permission-rejection:${String(_label)}`,
        payload: { initialPrompt: "must not dispatch", ...payload },
      })).rejects.toMatchObject({ code });
      expect(custodyHarness.provisionAgent).not.toHaveBeenCalled();
      expect(existsSync(journalPath)).toBe(false);
    } finally {
      await fabric.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
});
