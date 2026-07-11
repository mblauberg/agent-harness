import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";

import { applyMigrations, type Migration } from "../../../src/core/migrations.ts";
import { OperatorStore } from "../../../src/operator/store.ts";
import { preflightProjectSessionOperations } from "../../../src/persistence/project-session-preflight.ts";

const databases: Database.Database[] = [];
const trustDigest = `sha256:${"a".repeat(64)}`;
const subjectHash = `sha256:${"b".repeat(64)}`;
const now = Date.parse("2027-01-01T00:00:00.000Z");

function migration(version: number, filename: string, preflight?: Migration["preflight"]): Migration {
  return {
    version,
    name: filename.replace(/^[0-9]+-/u, "").replace(/\.sql$/u, ""),
    sql: readFileSync(new URL(`../../../migrations/${filename}`, import.meta.url), "utf8"),
    ...(preflight === undefined ? {} : { preflight }),
  };
}

function setup(): { database: Database.Database; store: OperatorStore } {
  const database = new Database(":memory:");
  databases.push(database);
  applyMigrations(database, [
    migration(1, "0001-core.sql"),
    migration(2, "0002-observer-event-sequence.sql"),
    migration(3, "0003-integrity-and-query-plans.sql"),
    migration(4, "0004-project-session-operations.sql", preflightProjectSessionOperations),
  ]);
  return { database, store: new OperatorStore({ database, clock: () => now }) };
}

const provisionInput = {
  canonicalRoot: "/project/one",
  trustRecordDigest: trustDigest,
  authenticatedSubjectHash: subjectHash,
  projectAuthorityGeneration: 1,
  principalGeneration: 1,
  actions: ["launch", "read"] as const,
  expiresAt: "2028-01-01T00:00:00.000Z",
};

function insertDraftSession(database: Database.Database, projectId: string, operatorId: string): void {
  database.prepare(`
    INSERT INTO project_sessions(
      project_session_id, project_id, mode, state, revision, generation, authority_ref,
      budget_ref, launch_packet_path, launch_packet_digest, membership_revision,
      origin_kind, origin_operator_id, created_at, updated_at
    ) VALUES (
      'session_01', ?, 'coordinated', 'draft', 1, 1, ?,
      'budget_01', 'docs/launch.json', ?, 1,
      'operator-launch', ?, ?, ?
    )
  `).run(projectId, trustDigest, trustDigest, operatorId, now, now);
}

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

describe("private local operator provisioning kernel", () => {
  it("atomically provisions deterministic identities and returns plaintext only on first issuance", () => {
    const fixture = setup();
    const first = fixture.store.provisionLocalOperator(provisionInput);
    if (!first.issued) throw new Error("fixture project capability was not issued");

    expect(first).toMatchObject({
      issued: true,
      kind: "project-launch",
      projectAuthorityGeneration: 1,
      principalGeneration: 1,
      actions: ["read", "launch"],
      issuedAt: "2027-01-01T00:00:00.000Z",
      expiresAt: provisionInput.expiresAt,
      credential: { capabilityId: first.capabilityId, token: expect.stringMatching(/^afop_[A-Za-z0-9_-]+$/u) },
    });
    expect(first.projectId).toMatch(/^project:local:[a-f0-9]{64}$/u);
    expect(first.operatorId).toMatch(/^operator:local:[a-f0-9]{64}$/u);
    expect(first.capabilityId).toMatch(/^capability:project-launch:[a-f0-9]{64}$/u);

    expect(fixture.database.prepare(`
      SELECT canonical_root, trust_record_digest, revision, authority_generation FROM projects
    `).get()).toEqual({
      canonical_root: provisionInput.canonicalRoot,
      trust_record_digest: trustDigest,
      revision: 1,
      authority_generation: 1,
    });
    expect(fixture.database.prepare(`
      SELECT operator_id, project_id, authenticated_subject_hash,
             project_authority_generation, principal_generation, state
        FROM operator_principals
    `).get()).toEqual({
      operator_id: first.operatorId,
      project_id: first.projectId,
      authenticated_subject_hash: subjectHash,
      project_authority_generation: 1,
      principal_generation: 1,
      state: "active",
    });
    const storedCapability = fixture.database.prepare("SELECT * FROM operator_capabilities").get() as Record<string, unknown>;
    expect(storedCapability).toMatchObject({
      capability_id: first.capabilityId,
      operator_id: first.operatorId,
      project_id: first.projectId,
      project_session_id: null,
      project_authority_generation: 1,
      session_generation: null,
      principal_generation: 1,
      kind: "project-launch",
      operations_json: '["read","launch"]',
      token_hash: createHash("sha256").update(first.credential.token).digest("hex"),
    });
    expect(JSON.stringify(storedCapability)).not.toContain(first.credential.token);

    const replay = fixture.store.provisionLocalOperator({ ...provisionInput, actions: ["read", "launch"] });
    expect(replay).toEqual({
      ...first,
      issued: false,
      credential: undefined,
    });

    const independent = setup().store.provisionLocalOperator(provisionInput);
    expect({
      projectId: independent.projectId,
      operatorId: independent.operatorId,
      capabilityId: independent.capabilityId,
    }).toEqual({
      projectId: first.projectId,
      operatorId: first.operatorId,
      capabilityId: first.capabilityId,
    });
  });

  it("issues one exact session capability bounded by project, subject, trust, generation and expiries", () => {
    const fixture = setup();
    const project = fixture.store.provisionLocalOperator(provisionInput);
    if (!project.issued) throw new Error("fixture project capability was not issued");
    insertDraftSession(fixture.database, project.projectId, project.operatorId);

    const input = {
      projectId: project.projectId,
      canonicalRoot: provisionInput.canonicalRoot,
      trustRecordDigest: trustDigest,
      authenticatedSubjectHash: subjectHash,
      projectCapability: project.credential,
      projectSessionId: "session_01",
      sessionGeneration: 1,
      actions: ["launch", "read", "decide"] as const,
      expiresAt: "2027-06-01T00:00:00.000Z",
      launchEnvelopeExpiresAt: "2027-07-01T00:00:00.000Z",
    };
    const first = fixture.store.issueLocalOperatorSessionCapability(input);
    if (!first.issued) throw new Error("fixture session capability was not issued");

    expect(first).toMatchObject({
      issued: true,
      projectId: project.projectId,
      operatorId: project.operatorId,
      projectSessionId: "session_01",
      projectAuthorityGeneration: 1,
      sessionGeneration: 1,
      principalGeneration: 1,
      kind: "session",
      actions: ["read", "decide", "launch"],
      issuedAt: "2027-01-01T00:00:00.000Z",
      expiresAt: input.expiresAt,
      credential: { capabilityId: first.capabilityId, token: expect.stringMatching(/^afop_[A-Za-z0-9_-]+$/u) },
    });
    expect(first.capabilityId).toMatch(/^capability:session:[a-f0-9]{64}$/u);
    expect(fixture.store.authenticateCredential(first.credential.token)).toEqual({
      context: {
        operatorId: project.operatorId,
        projectId: project.projectId,
        projectAuthorityGeneration: 1,
        principalGeneration: 1,
      },
      capabilityId: first.capabilityId,
      kind: "session",
      projectSessionId: "session_01",
      sessionGeneration: 1,
      actions: ["read", "decide", "launch"],
    });
    expect(JSON.stringify(fixture.database.prepare(`
      SELECT * FROM operator_capabilities WHERE capability_id=?
    `).get(first.capabilityId))).not.toContain(first.credential.token);

    expect(fixture.store.issueLocalOperatorSessionCapability({
      ...input,
      actions: ["read", "decide", "launch"],
    })).toEqual({
      ...first,
      issued: false,
      credential: undefined,
    });
  });

  it("rotates the exact principal generation and atomically revokes every older capability", () => {
    const fixture = setup();
    const project = fixture.store.provisionLocalOperator(provisionInput);
    if (!project.issued) throw new Error("fixture project capability was not issued");
    insertDraftSession(fixture.database, project.projectId, project.operatorId);
    const session = fixture.store.issueLocalOperatorSessionCapability({
      projectId: project.projectId,
      canonicalRoot: provisionInput.canonicalRoot,
      trustRecordDigest: trustDigest,
      authenticatedSubjectHash: subjectHash,
      projectCapability: project.credential,
      projectSessionId: "session_01",
      sessionGeneration: 1,
      actions: ["read", "launch"],
      expiresAt: "2027-06-01T00:00:00.000Z",
      launchEnvelopeExpiresAt: "2027-07-01T00:00:00.000Z",
    });
    if (!session.issued) throw new Error("fixture session capability was not issued");

    expect(fixture.store.rotatePrincipal({
      projectId: project.projectId,
      operatorId: project.operatorId,
      canonicalRoot: provisionInput.canonicalRoot,
      trustRecordDigest: trustDigest,
      authenticatedSubjectHash: subjectHash,
      projectAuthorityGeneration: 1,
      expectedPrincipalGeneration: 1,
    })).toEqual({
      projectId: project.projectId,
      operatorId: project.operatorId,
      principalGeneration: 2,
      revokedCapabilityCount: 2,
    });
    expect(fixture.database.prepare(`
      SELECT principal_generation FROM operator_principals WHERE operator_id=?
    `).get(project.operatorId)).toEqual({ principal_generation: 2 });
    expect(fixture.database.prepare(`
      SELECT count(*) AS count FROM operator_capabilities
       WHERE operator_id=? AND revoked_at=?
    `).get(project.operatorId, now)).toEqual({ count: 2 });
    expect(() => fixture.store.authenticateCredential(project.credential.token)).toThrowError(
      expect.objectContaining({ code: "CAPABILITY_REVOKED" }),
    );
    expect(() => fixture.store.authenticateCredential(session.credential.token)).toThrowError(
      expect.objectContaining({ code: "CAPABILITY_REVOKED" }),
    );
    expect(() => fixture.store.rotatePrincipal({
      projectId: project.projectId,
      operatorId: project.operatorId,
      canonicalRoot: provisionInput.canonicalRoot,
      trustRecordDigest: trustDigest,
      authenticatedSubjectHash: subjectHash,
      projectAuthorityGeneration: 1,
      expectedPrincipalGeneration: 1,
    })).toThrowError(expect.objectContaining({ code: "STALE_PRINCIPAL_GENERATION" }));

    const replacement = fixture.store.provisionLocalOperator({ ...provisionInput, principalGeneration: 2 });
    expect(replacement).toMatchObject({ issued: true, principalGeneration: 2 });
    expect(replacement.capabilityId).not.toBe(project.capabilityId);
  });

  it("fails changed or stale provisioning input closed without partial rows", () => {
    const fixture = setup();
    fixture.store.provisionLocalOperator(provisionInput);

    for (const changed of [
      { ...provisionInput, actions: ["read"] as const },
      { ...provisionInput, expiresAt: "2028-02-01T00:00:00.000Z" },
      { ...provisionInput, trustRecordDigest: `sha256:${"c".repeat(64)}` },
      { ...provisionInput, authenticatedSubjectHash: `sha256:${"d".repeat(64)}` },
    ]) {
      expect(() => fixture.store.provisionLocalOperator(changed)).toThrowError(
        expect.objectContaining({ code: "CONFLICT" }),
      );
    }
    expect(fixture.database.prepare("SELECT count(*) AS count FROM projects").get()).toEqual({ count: 1 });
    expect(fixture.database.prepare("SELECT count(*) AS count FROM operator_principals").get()).toEqual({ count: 1 });
    expect(fixture.database.prepare("SELECT count(*) AS count FROM operator_capabilities").get()).toEqual({ count: 1 });

    const empty = setup();
    expect(() => empty.store.provisionLocalOperator({
      ...provisionInput,
      principalGeneration: 2,
    })).toThrowError(expect.objectContaining({ code: "STALE_PRINCIPAL_GENERATION" }));
    expect(empty.database.prepare("SELECT count(*) AS count FROM projects").get()).toEqual({ count: 0 });
    expect(empty.database.prepare("SELECT count(*) AS count FROM operator_principals").get()).toEqual({ count: 0 });
    expect(empty.database.prepare("SELECT count(*) AS count FROM operator_capabilities").get()).toEqual({ count: 0 });
  });

  it("rejects widened session issuance without persisting another capability", () => {
    const fixture = setup();
    const project = fixture.store.provisionLocalOperator(provisionInput);
    if (!project.issued) throw new Error("fixture project capability was not issued");
    insertDraftSession(fixture.database, project.projectId, project.operatorId);
    const input = {
      projectId: project.projectId,
      canonicalRoot: provisionInput.canonicalRoot,
      trustRecordDigest: trustDigest,
      authenticatedSubjectHash: subjectHash,
      projectCapability: project.credential,
      projectSessionId: "session_01",
      sessionGeneration: 1,
      actions: ["read", "launch"] as const,
      expiresAt: "2027-06-01T00:00:00.000Z",
      launchEnvelopeExpiresAt: "2027-07-01T00:00:00.000Z",
    };

    expect(() => fixture.store.issueLocalOperatorSessionCapability({
      ...input,
      trustRecordDigest: `sha256:${"c".repeat(64)}`,
    })).toThrowError(expect.objectContaining({ code: "CONFLICT" }));
    expect(() => fixture.store.issueLocalOperatorSessionCapability({
      ...input,
      authenticatedSubjectHash: `sha256:${"d".repeat(64)}`,
    })).toThrowError(expect.objectContaining({ code: "AUTHENTICATION_FAILED" }));
    expect(() => fixture.store.issueLocalOperatorSessionCapability({
      ...input,
      sessionGeneration: 2,
    })).toThrowError(expect.objectContaining({ code: "STALE_GENERATION" }));
    expect(() => fixture.store.issueLocalOperatorSessionCapability({
      ...input,
      expiresAt: "2027-08-01T00:00:00.000Z",
    })).toThrowError(expect.objectContaining({ code: "CAPABILITY_FORBIDDEN" }));
    expect(() => fixture.store.issueLocalOperatorSessionCapability({
      ...input,
      actions: ["takeover"],
    } as never)).toThrowError(expect.objectContaining({ code: "CAPABILITY_FORBIDDEN" }));
    expect(fixture.database.prepare("SELECT count(*) AS count FROM operator_capabilities").get()).toEqual({ count: 1 });
  });

  it("rolls rotation back when the project generation is stale", () => {
    const fixture = setup();
    const project = fixture.store.provisionLocalOperator(provisionInput);
    if (!project.issued) throw new Error("fixture project capability was not issued");
    fixture.database.prepare("UPDATE projects SET authority_generation=2 WHERE project_id=?").run(project.projectId);

    expect(() => fixture.store.rotatePrincipal({
      projectId: project.projectId,
      operatorId: project.operatorId,
      canonicalRoot: provisionInput.canonicalRoot,
      trustRecordDigest: trustDigest,
      authenticatedSubjectHash: subjectHash,
      projectAuthorityGeneration: 1,
      expectedPrincipalGeneration: 1,
    })).toThrowError(expect.objectContaining({ code: "STALE_GENERATION" }));
    expect(fixture.database.prepare(`
      SELECT principal_generation FROM operator_principals WHERE operator_id=?
    `).get(project.operatorId)).toEqual({ principal_generation: 1 });
    expect(fixture.database.prepare(`
      SELECT revoked_at FROM operator_capabilities WHERE capability_id=?
    `).get(project.capabilityId)).toEqual({ revoked_at: null });
  });
});
