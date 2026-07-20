import { createHash } from "node:crypto";

import type Database from "better-sqlite3";

import {
  ProviderActionAdmissionCoordinator,
  type ProviderActionInsert,
  type ProviderActionTicket,
} from "../../src/application/provider-action-admission.ts";
import type { ProviderActionCustodyOwner } from "../../src/application/provider-action-owner.ts";

function digest(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

export function admitProviderActionFixture(
  database: Database.Database,
  action: ProviderActionInsert,
  canonicalInput: unknown = {
    schemaVersion: 1,
    fixture: "provider-action",
    adapterId: action.adapterId,
    actionId: action.actionId,
    operation: action.operation,
    payloadJson: action.payloadJson,
  },
  beforeAdmission?: (ticket: ProviderActionTicket) => void,
  expectedOwner: ProviderActionCustodyOwner = "generic",
): ProviderActionTicket {
  const coordinator = new ProviderActionAdmissionCoordinator({
    database,
    clock: () => action.updatedAt,
  });
  const project = database.prepare(`
    SELECT session.project_id
      FROM runs run
      JOIN project_sessions session ON session.project_session_id=run.project_session_id
     WHERE run.run_id=?
  `).get(action.runId) as { project_id?: unknown } | undefined;
  if (typeof project?.project_id !== "string") {
    throw new Error("provider action fixture requires a run-bound project");
  }
  const ticket = coordinator.preflight({
    actionRef: { adapterId: action.adapterId, actionId: action.actionId },
    scope: { kind: "run-action", runId: action.runId },
    principal: {
      kind: "integration",
      integrationId: action.adapterId,
      projectId: project.project_id,
    },
    canonicalInput,
  });
  beforeAdmission?.(ticket);
  database.transaction(() => {
    coordinator.admitUnroutedInCurrentTransaction(ticket, action, expectedOwner);
  }).immediate();
  return ticket;
}

export function insertProviderActionPreflightParent(
  database: Database.Database,
  input: Readonly<{
    runId: string;
    adapterId: string;
    actionId: string;
    state?: "resolving" | "admitted" | "released";
    now?: number;
  }>,
): void {
  const now = input.now ?? 1;
  const actorPrincipalDigest = digest(`fixture-principal:${input.runId}`);
  const inputDigest = digest(`fixture-input:${input.runId}:${input.adapterId}:${input.actionId}`);
  const ownerDigest = digest(
    `fixture-owner:${input.runId}:${input.adapterId}:${input.actionId}:${actorPrincipalDigest}:${inputDigest}`,
  );
  database.prepare(`
    INSERT INTO provider_action_pair_preflights(
      adapter_id,action_id,scope_kind,run_id,owner_digest,actor_principal_digest,
      input_digest,state,failure_json,created_at,updated_at
    ) VALUES (?,?,'run-action',?,?,?,?,?,?,?,?)
  `).run(
    input.adapterId,
    input.actionId,
    input.runId,
    ownerDigest,
    actorPrincipalDigest,
    inputDigest,
    input.state ?? "resolving",
    input.state === "released"
      ? JSON.stringify({ name: "Error", message: "fixture provider action preflight was released" })
      : null,
    now,
    now,
  );
}
