import type {
  Intake,
  IntakeDraft,
  IntakeDraftCreateRequest,
  IntakeRevisionRequest,
  IntakeSubmission,
  TaskRequest,
  TaskRequestCommit,
} from "@local/agent-fabric-protocol";
import { parseIntake } from "@local/agent-fabric-protocol";
import type Database from "better-sqlite3";

import type { OperatorStore } from "../operator/store.js";
import {
  ProjectFabricCoreError,
  type AuthenticatedOperatorContext,
  type CoreServiceOptions,
} from "./contracts.js";
import { canonicalJson, digest, integer, row, text } from "./store-support.js";

export interface IntakeTaskRequestCommitter {
  commitTaskRequest(request: TaskRequest): TaskRequestCommit;
}

export class IntakeStore {
  readonly #database: Database.Database;
  readonly #operatorStore: OperatorStore;
  readonly #clock: () => number;
  readonly #fault: (label: string) => void;
  readonly #requestCommitter: IntakeTaskRequestCommitter | undefined;

  constructor(options: CoreServiceOptions & {
    operatorStore: OperatorStore;
    requestCommitter?: IntakeTaskRequestCommitter;
  }) {
    this.#database = options.database;
    this.#operatorStore = options.operatorStore;
    this.#clock = options.clock ?? Date.now;
    this.#fault = options.fault ?? (() => undefined);
    this.#requestCommitter = options.requestCommitter;
  }

  createDraft(context: AuthenticatedOperatorContext, request: IntakeDraftCreateRequest): IntakeDraft {
    return this.#operatorStore.executeCommand(
      context,
      request.command,
      {
        projectId: context.projectId,
        requiredAction: "launch",
        commandPayload: {
          intakeId: request.intakeId,
          dedupeKey: request.dedupeKey,
          summary: request.summary,
          artifactRefs: request.artifactRefs,
          gateIds: request.gateIds,
        },
      },
      () => {
        const existing = this.#database.prepare("SELECT revision FROM intakes WHERE intake_id=?").get(request.intakeId);
        if (existing === undefined) return { revision: 0, value: { intakeId: request.intakeId, state: "absent" } };
        const stored = row(existing, "intake");
        return { revision: integer(stored, "revision"), value: this.get(request.intakeId) };
      },
      () => {
        this.#fault("intake:draft");
        const now = this.#clock();
        const payload = {
          summary: request.summary,
          artifactRefs: request.artifactRefs,
          gateIds: request.gateIds,
        };
        const payloadJson = canonicalJson(payload);
        const payloadDigest = digest(payload);
        this.#database.prepare(`
          INSERT INTO intakes(
            intake_id, project_id, project_session_id, coordination_run_id,
            dedupe_key, state, revision, chair_request_id, chair_request_revision,
            summary, artifact_refs_json, gate_ids_json, payload_digest, created_at, updated_at
          ) VALUES (?, ?, NULL, NULL, ?, 'draft', 1, NULL, NULL, ?, ?, ?, ?, ?, ?)
        `).run(
          request.intakeId,
          context.projectId,
          request.dedupeKey,
          request.summary,
          canonicalJson(request.artifactRefs),
          canonicalJson(request.gateIds),
          payloadDigest,
          now,
          now,
        );
        this.#database.prepare(`
          INSERT INTO intake_revisions(intake_id, revision, state, payload_json, payload_digest, actor_ref, created_at)
          VALUES (?, 1, 'draft', ?, ?, ?, ?)
        `).run(request.intakeId, payloadJson, payloadDigest, context.operatorId, now);
        for (const artifact of request.artifactRefs) {
          this.#database.prepare(`
            INSERT INTO intake_artifact_bindings(intake_id, intake_revision, relative_path, sha256)
            VALUES (?, 1, ?, ?)
          `).run(request.intakeId, artifact.path, artifact.digest);
        }
        return this.get(request.intakeId) as IntakeDraft;
      },
    );
  }

  get(intakeId: string): Intake {
    const stored = row(this.#database.prepare("SELECT * FROM intakes WHERE intake_id=?").get(intakeId), "intake");
    const state = text(stored, "state");
    const common = {
      intakeId: text(stored, "intake_id"),
      projectId: text(stored, "project_id"),
      revision: integer(stored, "revision"),
      state,
      dedupeKey: text(stored, "dedupe_key"),
      summary: text(stored, "summary"),
      artifactRefs: JSON.parse(text(stored, "artifact_refs_json")),
      gateIds: JSON.parse(text(stored, "gate_ids_json")),
    };
    if (state === "draft") return parseIntake(common);
    return parseIntake({
      ...common,
      projectSessionId: text(stored, "project_session_id"),
      coordinationRunId: text(stored, "coordination_run_id"),
    });
  }

  submit(context: AuthenticatedOperatorContext, request: IntakeSubmission): Intake {
    if (this.#requestCommitter === undefined) {
      throw new Error("IntakeStore requires the atomic task-request service for submission");
    }
    const session = row(this.#database.prepare(`
      SELECT project_id, generation FROM project_sessions WHERE project_session_id=?
    `).get(request.projectSessionId), "project session");
    if (text(session, "project_id") !== context.projectId) throw new Error("intake session is outside the operator project");
    return this.#operatorStore.executeCommand(
      context,
      request.command,
      {
        projectId: context.projectId,
        projectSessionId: request.projectSessionId,
        sessionGeneration: integer(session, "generation"),
        requiredAction: "decide",
        commandPayload: {
          intakeId: request.intakeId,
          expectedRevision: request.expectedRevision,
          projectSessionId: request.projectSessionId,
          coordinationRunId: request.coordinationRunId,
          summary: request.summary,
          artifactRefs: request.artifactRefs,
          gateIds: request.gateIds,
          chairRequest: request.chairRequest,
        },
      },
      () => {
        const intake = this.get(request.intakeId);
        return { revision: intake.revision, value: intake };
      },
      () => {
        const current = this.get(request.intakeId);
        if (current.projectId !== context.projectId) {
          throw new ProjectFabricCoreError("WRONG_PROJECT", "intake is outside the operator project");
        }
        if (current.state !== "draft" || current.revision !== request.expectedRevision) {
          throw new Error("intake revision or state changed");
        }
        if (
          request.chairRequest.projectSessionId !== request.projectSessionId ||
          request.chairRequest.coordinationRunId !== request.coordinationRunId ||
          request.chairRequest.request.intakeBinding?.intakeId !== request.intakeId ||
          request.chairRequest.request.intakeBinding.intakeRevision !== request.expectedRevision + 1
        ) throw new Error("chair request does not bind the next intake revision");
        if (this.#database.prepare(`
          SELECT 1 FROM runs WHERE project_session_id=? AND run_id=?
        `).get(request.projectSessionId, request.coordinationRunId) === undefined) {
          throw new ProjectFabricCoreError("NOT_FOUND", "intake coordination run was not found in the target session");
        }
        const commit = this.#requestCommitter?.commitTaskRequest(request.chairRequest);
        if (commit === undefined) throw new Error("task request commit is unavailable");
        this.#fault("intake:request");
        const revision = request.expectedRevision + 1;
        const payload = {
          summary: request.summary,
          artifactRefs: request.artifactRefs,
          gateIds: request.gateIds,
          chairRequest: commit,
        };
        const payloadDigest = digest(payload);
        this.#database.prepare(`
          UPDATE intakes
             SET project_session_id=?, coordination_run_id=?, state='awaiting-chair', revision=?,
                 chair_request_id=?, chair_request_revision=?, summary=?, artifact_refs_json=?,
                 gate_ids_json=?, payload_digest=?, updated_at=?
           WHERE intake_id=? AND state='draft' AND revision=?
        `).run(
          request.projectSessionId,
          request.coordinationRunId,
          revision,
          request.chairRequest.request.messageId,
          commit.requestRevision,
          request.summary,
          canonicalJson(request.artifactRefs),
          canonicalJson(request.gateIds),
          payloadDigest,
          this.#clock(),
          request.intakeId,
          request.expectedRevision,
        );
        this.#database.prepare(`
          INSERT INTO intake_revisions(intake_id, revision, state, payload_json, payload_digest, actor_ref, created_at)
          VALUES (?, ?, 'awaiting-chair', ?, ?, ?, ?)
        `).run(
          request.intakeId,
          revision,
          canonicalJson(payload),
          payloadDigest,
          context.operatorId,
          this.#clock(),
        );
        for (const artifact of request.artifactRefs) {
          this.#database.prepare(`
            INSERT INTO intake_artifact_bindings(intake_id, intake_revision, relative_path, sha256)
            VALUES (?, ?, ?, ?)
          `).run(request.intakeId, revision, artifact.path, artifact.digest);
        }
        for (const gateId of request.gateIds) {
          const gate = row(this.#database.prepare(`
            SELECT revision FROM scoped_gates WHERE gate_id=? AND project_session_id=? AND coordination_run_id=?
          `).get(gateId, request.projectSessionId, request.coordinationRunId), "intake gate");
          this.#database.prepare(`
            INSERT INTO intake_gate_bindings(intake_id, intake_revision, gate_id, gate_revision)
            VALUES (?, ?, ?, ?)
          `).run(request.intakeId, revision, gateId, integer(gate, "revision"));
        }
        this.#fault("intake:bound");
        return this.get(request.intakeId);
      },
    );
  }

  revise(_context: AuthenticatedOperatorContext, _request: IntakeRevisionRequest): Intake {
    throw new Error("IntakeStore.revise is not implemented");
  }
}
