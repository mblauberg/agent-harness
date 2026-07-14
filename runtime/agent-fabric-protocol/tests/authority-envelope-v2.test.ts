import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  AUTHORITY_ENVELOPE_V2_CODEC,
  FABRIC_OPERATIONS,
  authorityEnvelopeV2Contained,
  type AuthorityEnvelopeV2,
} from "../src/index.ts";

const DIGEST = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;

function authority(overrides: Partial<AuthorityEnvelopeV2> = {}): AuthorityEnvelopeV2 {
  return {
    schemaVersion: 2,
    approval: {
      approvedBy: "human-maintainer",
      evidenceId: "authority-approval",
      evidenceDigest: DIGEST,
    },
    workspaceRoots: ["."],
    sourcePaths: ["src"],
    artifactPaths: ["artifacts"],
    actions: [FABRIC_OPERATIONS.getTask],
    deniedPaths: ["secrets"],
    deniedActions: [FABRIC_OPERATIONS.dispatchProviderAction],
    prohibitedActions: ["external-publish"],
    disclosure: { level: "scoped", scopes: ["local"] },
    secrets: { access: "use-without-disclosure", references: ["provider-token"] },
    deployment: { allowed: true, targets: ["staging"] },
    irreversibleActions: { allowed: true, actionIds: ["migration-01"] },
    network: { toolEgress: "allowlist", allowedHosts: ["localhost"] },
    expiresAt: "2026-07-20T00:00:00.000Z",
    budget: { turns: 4 },
    ...overrides,
  };
}

describe("AuthorityEnvelopeV2", () => {
  it("decodes the canonical cross-language Delivery mapping fixture", async () => {
    const path = fileURLToPath(new URL(
      "../../../tests/fixtures/authority-envelope-v2/fabric-authority.json",
      import.meta.url,
    ));
    const fixture: unknown = JSON.parse(await readFile(path, "utf8"));
    expect(AUTHORITY_ENVELOPE_V2_CODEC.parse(fixture, "authority fixture")).toEqual(fixture);
  });

  it("strictly decodes the complete closed envelope", () => {
    const input = authority();
    expect(AUTHORITY_ENVELOPE_V2_CODEC.parse(input, "authority")).toEqual(input);
  });

  it("rejects unversioned, incomplete, and extended inputs", () => {
    const valid = authority() as unknown as Record<string, unknown>;
    for (const field of [
      "schemaVersion",
      "approval",
      "deniedPaths",
      "deniedActions",
      "prohibitedActions",
      "secrets",
      "deployment",
      "irreversibleActions",
      "network",
    ]) {
      const candidate = { ...valid };
      delete candidate[field];
      expect(() => AUTHORITY_ENVELOPE_V2_CODEC.parse(candidate, "authority"), field).toThrow();
    }
    expect(() => AUTHORITY_ENVELOPE_V2_CODEC.parse({ ...valid, legacy: true }, "authority")).toThrow(
      /unknown|unexpected|properties/i,
    );
  });

  it("rejects invalid approval and empty enabled variants", () => {
    const invalid = [
      authority({ approval: { ...authority().approval, evidenceDigest: "sha256:not-a-digest" as `sha256:${string}` } }),
      authority({ secrets: { access: "use-without-disclosure", references: [] } }),
      authority({ deployment: { allowed: true, targets: [] } }),
      authority({ irreversibleActions: { allowed: true, actionIds: [] } }),
      authority({ network: { toolEgress: "allowlist", allowedHosts: [] } }),
    ];
    for (const candidate of invalid) {
      expect(() => AUTHORITY_ENVELOPE_V2_CODEC.parse(candidate, "authority")).toThrow();
    }
  });

  it("accepts a child only when every authority dimension narrows", () => {
    const parent = authority({
      workspaceRoots: ["."],
      sourcePaths: ["src"],
      artifactPaths: ["artifacts"],
      actions: [FABRIC_OPERATIONS.getTask, FABRIC_OPERATIONS.updateTask],
      deniedPaths: ["secrets"],
      deniedActions: [FABRIC_OPERATIONS.dispatchProviderAction],
      prohibitedActions: ["external-publish"],
      disclosure: { level: "allowed" },
      budget: { turns: 4, provider_calls: 2 },
    });
    const child = authority({
      sourcePaths: ["src/domain"],
      artifactPaths: ["artifacts/review"],
      actions: [FABRIC_OPERATIONS.getTask],
      deniedPaths: ["secrets", "src/private"],
      deniedActions: [FABRIC_OPERATIONS.dispatchProviderAction, FABRIC_OPERATIONS.updateTask],
      prohibitedActions: ["external-publish", "release"],
      disclosure: { level: "scoped", scopes: ["local"] },
      secrets: { access: "none" },
      deployment: { allowed: false },
      irreversibleActions: { allowed: false },
      network: { toolEgress: "none" },
      expiresAt: "2026-07-19T00:00:00.000Z",
      budget: { turns: 3 },
    });
    expect(authorityEnvelopeV2Contained(child, parent)).toBe(true);
  });

  it("rejects each individual child widening", () => {
    const parent = authority({
      workspaceRoots: ["project"],
      sourcePaths: ["project/src"],
      artifactPaths: ["project/artifacts"],
    });
    const child = (overrides: Partial<AuthorityEnvelopeV2>): AuthorityEnvelopeV2 => ({ ...parent, ...overrides });
    const widenings: AuthorityEnvelopeV2[] = [
      child({ approval: { ...parent.approval, evidenceId: "other-approval" } }),
      child({ workspaceRoots: ["other"] }),
      child({ sourcePaths: ["other"] }),
      child({ artifactPaths: ["other"] }),
      child({ actions: [FABRIC_OPERATIONS.updateTask] }),
      child({ deniedPaths: [] }),
      child({ deniedActions: [] }),
      child({ prohibitedActions: [] }),
      child({ disclosure: { level: "allowed" } }),
      child({ secrets: { access: "use-without-disclosure", references: ["provider-token", "other-token"] } }),
      child({ deployment: { allowed: true, targets: ["staging", "production"] } }),
      child({ irreversibleActions: { allowed: true, actionIds: ["migration-01", "migration-02"] } }),
      child({ network: { toolEgress: "allowlist", allowedHosts: ["localhost", "example.com"] } }),
      child({ expiresAt: "2026-07-21T00:00:00.000Z" }),
      child({ budget: { turns: 5 } }),
      child({ budget: { turns: 1, tokens: 1 } }),
    ];
    for (const candidate of widenings) {
      expect(authorityEnvelopeV2Contained(candidate, parent), JSON.stringify(candidate)).toBe(false);
    }
  });
});
