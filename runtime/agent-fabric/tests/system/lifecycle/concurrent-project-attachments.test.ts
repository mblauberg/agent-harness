import { afterEach, describe, expect, it } from "vitest";

import { readGlobalLiveness } from "../../../src/lifecycle/global-liveness.ts";
import { createLivenessDatabase, seedProject } from "./liveness-fixture.ts";

const databases: ReturnType<typeof createLivenessDatabase>[] = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

describe("project-bound operator attachments", () => {
  it("keeps two projects independent before and after session narrowing", () => {
    const database = createLivenessDatabase();
    databases.push(database);
    seedProject(database, { projectId: "project_a", projectSessionId: "session_a", sessionGeneration: 5 });
    seedProject(database, { projectId: "project_b", projectSessionId: "session_b", sessionGeneration: 8 });
    const insert = database.prepare(`
      INSERT INTO operator_client_attachments(
        attachment_id, project_id, project_authority_generation, project_session_id, session_generation,
        daemon_instance_generation, state, expires_at
      ) VALUES(?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insert.run("attach_a", "project_a", 3, null, null, 7, "active", 2_000);
    insert.run("attach_b", "project_b", 3, null, null, 7, "active", 2_000);
    expect(readGlobalLiveness(database, { now: 1_000, daemonInstanceGeneration: 7 })).toMatchObject({
      idle: false,
      contributors: { operatorAttachments: 2 },
    });

    database.prepare("UPDATE operator_client_attachments SET state = 'detached' WHERE attachment_id = 'attach_a'").run();
    expect(readGlobalLiveness(database, { now: 1_000, daemonInstanceGeneration: 7 })).toMatchObject({
      idle: false,
      contributors: { operatorAttachments: 1 },
    });

    database.prepare(`
      UPDATE operator_client_attachments
      SET project_session_id = 'session_b', session_generation = 8
      WHERE attachment_id = 'attach_b'
    `).run();
    expect(readGlobalLiveness(database, { now: 1_000, daemonInstanceGeneration: 7 })).toMatchObject({
      contributors: { operatorAttachments: 1 },
    });
    database.prepare("UPDATE operator_client_attachments SET session_generation = 7 WHERE attachment_id = 'attach_b'").run();
    expect(readGlobalLiveness(database, { now: 1_000, daemonInstanceGeneration: 7 })).toMatchObject({ idle: true });
  });

  it("ignores expired and stale daemon, project and session generations", () => {
    const database = createLivenessDatabase();
    databases.push(database);
    seedProject(database);
    const insert = database.prepare(`
      INSERT INTO operator_client_attachments(
        attachment_id, project_id, project_authority_generation, project_session_id, session_generation,
        daemon_instance_generation, state, expires_at
      ) VALUES(?, 'project_01', ?, ?, ?, ?, 'active', ?)
    `);
    insert.run("expired", 3, null, null, 7, 1_000);
    insert.run("old_daemon", 3, null, null, 6, 2_000);
    insert.run("old_project", 2, null, null, 7, 2_000);
    insert.run("old_session", 3, "session_01", 4, 7, 2_000);
    expect(readGlobalLiveness(database, { now: 1_000, daemonInstanceGeneration: 7 })).toMatchObject({
      idle: true,
      failClosed: false,
      contributors: { operatorAttachments: 0 },
    });
  });
});
