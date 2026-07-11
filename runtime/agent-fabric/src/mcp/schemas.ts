// Single source of truth for the Stage 2 MCP surface (spec section 14).
// Both the Claude-labelled and Codex-labelled proxies serve these objects
// verbatim, which is what makes NFR-007 schema symmetry testable.

import { AUTHORITY_ACTION_VOCABULARY } from "../domain/operations.js";
import { GENERIC_BUDGET_UNIT_KEYS, ISO_4217_CURRENCY_CODES } from "../domain/unit-keys.js";

type JsonSchema = Record<string, unknown>;

export type FabricToolDefinition = {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
  daemonMethod: string;
};

const STRING = { type: "string" } as const;
const INTEGER = { type: "integer" } as const;
const objectOutput = (properties: Record<string, unknown>, required: string[]): JsonSchema => ({
  type: "object",
  properties,
  required,
  additionalProperties: true,
});

const TASK_OUTPUT = objectOutput(
  { taskId: STRING, ownerAgentId: { anyOf: [STRING, { type: "null" }] }, state: STRING, revision: INTEGER, ownerLeaseGeneration: INTEGER },
  ["taskId", "ownerAgentId", "state", "revision", "ownerLeaseGeneration"],
);

const BUDGET_PROPERTY_NAMES: JsonSchema = {
  anyOf: [
    { enum: GENERIC_BUDGET_UNIT_KEYS },
    { enum: ISO_4217_CURRENCY_CODES.map((code) => `cost:${code}`) },
    { pattern: "^(?:input_tokens|output_tokens):[a-z0-9]+(?:[.-][a-z0-9]+)*$" },
  ],
};

const NUMBER_RECORD: JsonSchema = {
  type: "object",
  propertyNames: BUDGET_PROPERTY_NAMES,
  additionalProperties: { type: "integer", minimum: 0 },
};

const BUDGET_DIMENSIONS_INPUT: JsonSchema = {
  ...NUMBER_RECORD,
  minProperties: 1,
};

const BUDGET_OUTPUT: JsonSchema = {
  type: "object",
  properties: {
    budgetId: STRING,
    parentBudgetId: { anyOf: [STRING, { type: "null" }] },
    state: { enum: ["active", "usage-unknown", "released"] },
    dimensions: {
      type: "object",
      additionalProperties: {
        type: "object",
        properties: {
          granted: INTEGER,
          reserved: INTEGER,
          consumed: INTEGER,
          available: INTEGER,
          usageUnknown: { type: "boolean" },
        },
        required: ["granted", "reserved", "consumed", "available", "usageUnknown"],
        additionalProperties: false,
      },
    },
    returned: NUMBER_RECORD,
  },
  required: ["budgetId", "parentBudgetId", "state", "dimensions", "returned"],
  additionalProperties: false,
};

const TEAM_OUTPUT: JsonSchema = {
  type: "object",
  properties: {
    teamId: STRING,
    parentTeamId: { anyOf: [STRING, { type: "null" }] },
    depth: INTEGER,
    leaderAgentId: STRING,
    rootTaskId: STRING,
    ownedTaskIds: { type: "array", items: STRING },
    memberAgentIds: { type: "array", items: STRING },
    budgetId: STRING,
    state: { enum: ["active", "frozen", "barrier-closed"] },
    generation: INTEGER,
    successorAgentId: { anyOf: [STRING, { type: "null" }] },
    discussionGroups: {
      type: "array",
      items: {
        type: "object",
        properties: {
          groupId: STRING,
          memberAgentIds: { type: "array", items: STRING },
        },
        required: ["groupId", "memberAgentIds"],
        additionalProperties: false,
      },
    },
    reservedBudget: NUMBER_RECORD,
  },
  required: [
    "teamId",
    "parentTeamId",
    "depth",
    "leaderAgentId",
    "rootTaskId",
    "ownedTaskIds",
    "memberAgentIds",
    "budgetId",
    "state",
    "generation",
    "successorAgentId",
    "discussionGroups",
    "reservedBudget",
  ],
  additionalProperties: false,
};

const OUTPUT_SCHEMAS: Record<string, JsonSchema> = {
  createTeam: objectOutput({ teamId: STRING, leaderAgentId: STRING, rootTaskId: STRING, generation: INTEGER }, ["teamId", "leaderAgentId", "rootTaskId", "generation"]),
  spawnAgent: objectOutput({ capability: STRING, providerSessionRef: STRING, adapterId: STRING, actionId: STRING }, ["capability", "providerSessionRef", "adapterId", "actionId"]),
  attachAgent: objectOutput({ capability: STRING, providerSessionRef: STRING, adapterId: STRING, actionId: STRING }, ["capability", "providerSessionRef", "adapterId", "actionId"]),
  steerAgent: objectOutput({ actionId: STRING, status: STRING, history: { type: "array", items: STRING } }, ["actionId", "status", "history"]),
  releaseAgent: objectOutput({ agentId: STRING, lifecycle: STRING, providerSessionGeneration: INTEGER }, ["agentId", "lifecycle", "providerSessionGeneration"]),
  requestLifecycle: objectOutput({ agentId: STRING, lifecycle: STRING, providerSessionGeneration: INTEGER }, ["agentId", "lifecycle", "providerSessionGeneration"]),
  recordOperatorIntervention: objectOutput({ interventionId: STRING }, ["interventionId"]),
  publishArtifact: objectOutput({ artifactId: STRING, relativePath: STRING, sha256: STRING }, ["artifactId", "relativePath", "sha256"]),
  closeBarrier: objectOutput({ scope: STRING, closed: { const: true }, receipt: { type: "object" } }, ["scope", "closed", "receipt"]),
  acknowledgeDelivery: objectOutput({ result: { type: "null" } }, ["result"]),
  abandonDelivery: objectOutput({ deliveryId: STRING, status: { const: "abandoned" }, reason: STRING }, ["deliveryId", "status", "reason"]),
  receiveMessages: objectOutput({
    deliveries: {
      type: "array",
      items: objectOutput(
        {
          deliveryId: STRING,
          messageId: STRING,
          sequence: INTEGER,
          body: STRING,
          attempt: INTEGER,
          senderId: STRING,
          kind: { enum: ["request", "response", "event", "steer", "cancel", "escalate", "ack"] },
          requiresAck: { type: "boolean" },
        },
        ["deliveryId", "messageId", "sequence", "body", "attempt", "senderId", "kind", "requiresAck"],
      ),
    },
  }, ["deliveries"]),
  sendMessage: objectOutput({ messageId: STRING }, ["messageId"]),
  createRun: objectOutput({ runId: STRING, chairAuthorityId: STRING, chairCapability: STRING }, ["runId", "chairAuthorityId", "chairCapability"]),
  getRunStatus: objectOutput({ runId: STRING, chairAgentId: STRING, barrier: { type: "object" }, counts: { type: "object" } }, ["runId", "chairAgentId", "barrier", "counts"]),
  createTask: TASK_OUTPUT,
  claimTask: TASK_OUTPUT,
  updateTask: TASK_OUTPUT,
  freezeSubtree: TEAM_OUTPUT,
  adoptSubtree: TEAM_OUTPUT,
  closeSubtreeBarrier: {
    type: "object",
    properties: { teamId: STRING, generation: INTEGER, closed: { const: true } },
    required: ["teamId", "generation", "closed"],
    additionalProperties: false,
  },
  reserveBudget: BUDGET_OUTPUT,
  recordBudgetUsage: BUDGET_OUTPUT,
  reconcileBudgetUsage: BUDGET_OUTPUT,
  releaseBudget: BUDGET_OUTPUT,
  getBudget: BUDGET_OUTPUT,
  acknowledgeTaskHandoff: {
    type: "object",
    properties: { acknowledged: { const: true } },
    required: ["acknowledged"],
    additionalProperties: false,
  },
};

const AUTHORITY_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    workspaceRoots: { type: "array", items: { type: "string", minLength: 1 }, minItems: 1, uniqueItems: true },
    sourcePaths: { type: "array", items: { type: "string", minLength: 1 }, uniqueItems: true },
    artifactPaths: { type: "array", items: { type: "string", minLength: 1 }, uniqueItems: true },
    actions: { type: "array", items: { enum: AUTHORITY_ACTION_VOCABULARY }, uniqueItems: true },
    deniedPaths: { type: "array", items: { type: "string", minLength: 1 }, uniqueItems: true },
    deniedActions: { type: "array", items: { enum: AUTHORITY_ACTION_VOCABULARY }, uniqueItems: true },
    disclosure: {
      oneOf: [
        { type: "array", items: { enum: ["local", "approved-provider", "external"] }, uniqueItems: true },
        { type: "object", properties: { level: { const: "allowed" } }, required: ["level"], additionalProperties: false },
        { type: "object", properties: { level: { const: "forbidden" } }, required: ["level"], additionalProperties: false },
        {
          type: "object",
          properties: {
            level: { const: "scoped" },
            scopes: {
              type: "array",
              items: { enum: ["local", "approved-provider", "external"] },
              minItems: 1,
              maxItems: 2,
              uniqueItems: true,
            },
          },
          required: ["level", "scopes"],
          additionalProperties: false,
        },
      ],
    },
    expiresAt: { type: "string", minLength: 1 },
    budget: NUMBER_RECORD,
  },
  required: ["workspaceRoots", "sourcePaths", "artifactPaths", "actions", "disclosure", "expiresAt", "budget"],
  additionalProperties: false,
};

const RAW_FABRIC_MCP_TOOLS: Array<Omit<FabricToolDefinition, "outputSchema">> = [
  {
    name: "fabric_team_create",
    description: "Atomically create a bounded leader team, root task, registered members, discussion groups and reserved budget.",
    inputSchema: {
      type: "object",
      properties: {
        teamId: { type: "string" },
        parentTeamId: { type: "string" },
        leader: {
          type: "object",
          properties: { agentId: { type: "string" }, authority: AUTHORITY_SCHEMA },
          required: ["agentId", "authority"],
          additionalProperties: false,
        },
        rootTask: {
          type: "object",
          properties: { taskId: { type: "string" }, objective: { type: "string" }, baseRevision: { type: "string" } },
          required: ["taskId", "objective", "baseRevision"],
          additionalProperties: false,
        },
        initialMembers: {
          type: "array",
          maxItems: 5,
          items: {
            type: "object",
            properties: { agentId: { type: "string" }, authority: AUTHORITY_SCHEMA },
            required: ["agentId", "authority"],
            additionalProperties: false,
          },
        },
        discussionGroups: {
          type: "array",
          items: {
            type: "object",
            properties: {
              groupId: { type: "string" },
              memberAgentIds: { type: "array", items: { type: "string" }, minItems: 2 },
            },
            required: ["groupId", "memberAgentIds"],
            additionalProperties: false,
          },
        },
        reservedBudget: BUDGET_DIMENSIONS_INPUT,
        commandId: { type: "string" },
      },
      required: ["teamId", "leader", "rootTask", "initialMembers", "discussionGroups", "reservedBudget", "commandId"],
      additionalProperties: false,
    },
    daemonMethod: "createTeam",
  },
  {
    name: "fabric_subtree_freeze",
    description: "Chair-only: freeze a team subtree at an expected generation without silently promoting a successor.",
    inputSchema: {
      type: "object",
      properties: {
        teamId: { type: "string", minLength: 1 },
        expectedGeneration: { type: "integer", minimum: 1 },
        reason: { type: "string", minLength: 1 },
        commandId: { type: "string", minLength: 1 },
      },
      required: ["teamId", "expectedGeneration", "reason", "commandId"],
      additionalProperties: false,
    },
    daemonMethod: "freezeSubtree",
  },
  {
    name: "fabric_subtree_adopt",
    description: "Chair-only: adopt a frozen subtree using an explicit successor, generation fence and handoff evidence.",
    inputSchema: {
      type: "object",
      properties: {
        teamId: { type: "string", minLength: 1 },
        successorAgentId: { type: "string", minLength: 1 },
        expectedGeneration: { type: "integer", minimum: 1 },
        handoffEvidence: { type: "string", minLength: 1 },
        commandId: { type: "string", minLength: 1 },
      },
      required: ["teamId", "successorAgentId", "expectedGeneration", "handoffEvidence", "commandId"],
      additionalProperties: false,
    },
    daemonMethod: "adoptSubtree",
  },
  {
    name: "fabric_subtree_barrier_close",
    description: "Current leader only: close a reconciled subtree barrier at an expected team generation.",
    inputSchema: {
      type: "object",
      properties: {
        teamId: { type: "string", minLength: 1 },
        expectedGeneration: { type: "integer", minimum: 1 },
        commandId: { type: "string", minLength: 1 },
      },
      required: ["teamId", "expectedGeneration", "commandId"],
      additionalProperties: false,
    },
    daemonMethod: "closeSubtreeBarrier",
  },
  {
    name: "fabric_budget_reserve",
    description: "Current team leader only: reserve a named child budget from the active team budget.",
    inputSchema: {
      type: "object",
      properties: {
        teamId: { type: "string", minLength: 1 },
        expectedTeamGeneration: { type: "integer", minimum: 1 },
        parentBudgetId: { type: "string", minLength: 1 },
        budgetId: { type: "string", minLength: 1 },
        dimensions: BUDGET_DIMENSIONS_INPUT,
        commandId: { type: "string", minLength: 1 },
      },
      required: ["teamId", "expectedTeamGeneration", "parentBudgetId", "budgetId", "dimensions", "commandId"],
      additionalProperties: false,
    },
    daemonMethod: "reserveBudget",
  },
  {
    name: "fabric_budget_usage_record",
    description: "Budget owner only: record monotonic cumulative usage or mark a dimension unknown.",
    inputSchema: {
      type: "object",
      properties: {
        budgetId: { type: "string", minLength: 1 },
        usage: {
          type: "object",
          minProperties: 1,
          propertyNames: BUDGET_PROPERTY_NAMES,
          additionalProperties: {
            anyOf: [{ type: "integer", minimum: 0 }, { type: "null" }],
          },
        },
        commandId: { type: "string", minLength: 1 },
      },
      required: ["budgetId", "usage", "commandId"],
      additionalProperties: false,
    },
    daemonMethod: "recordBudgetUsage",
  },
  {
    name: "fabric_budget_usage_reconcile",
    description: "Chair-only: replace unknown budget usage with bounded cumulative consumption evidence.",
    inputSchema: {
      type: "object",
      properties: {
        budgetId: { type: "string", minLength: 1 },
        consumed: BUDGET_DIMENSIONS_INPUT,
        commandId: { type: "string", minLength: 1 },
      },
      required: ["budgetId", "consumed", "commandId"],
      additionalProperties: false,
    },
    daemonMethod: "reconcileBudgetUsage",
  },
  {
    name: "fabric_budget_release",
    description: "Budget owner only: release reconciled unused budget to its parent or freeze it when usage remains unknown.",
    inputSchema: {
      type: "object",
      properties: {
        budgetId: { type: "string", minLength: 1 },
        commandId: { type: "string", minLength: 1 },
      },
      required: ["budgetId", "commandId"],
      additionalProperties: false,
    },
    daemonMethod: "releaseBudget",
  },
  {
    name: "fabric_budget_get",
    description: "Read one relationship-authorised budget and its per-dimension accounting state.",
    inputSchema: {
      type: "object",
      properties: { budgetId: { type: "string", minLength: 1 } },
      required: ["budgetId"],
      additionalProperties: false,
    },
    daemonMethod: "getBudget",
  },
  {
    name: "fabric_task_handoff_acknowledge",
    description: "Intended next owner only: acknowledge a terminal task handoff at the exact task revision and owner generation.",
    inputSchema: {
      type: "object",
      properties: {
        taskId: { type: "string", minLength: 1 },
        taskRevision: { type: "integer", minimum: 1 },
        ownerLeaseGeneration: { type: "integer", minimum: 1 },
        commandId: { type: "string", minLength: 1 },
      },
      required: ["taskId", "taskRevision", "ownerLeaseGeneration", "commandId"],
      additionalProperties: false,
    },
    daemonMethod: "acknowledgeTaskHandoff",
  },
  {
    name: "fabric_agent_spawn",
    description: "Register a managed provider session created by an activated, capability-verified adapter.",
    inputSchema: {
      type: "object",
      properties: {
        agentId: { type: "string" },
        authorityId: { type: "string" },
        adapterId: { type: "string" },
        actionId: { type: "string" },
        payload: { type: "object" },
      },
      required: ["agentId", "authorityId", "adapterId", "actionId", "payload"],
      additionalProperties: false,
    },
    daemonMethod: "spawnAgent",
  },
  {
    name: "fabric_agent_attach",
    description: "Attach an existing interactive provider session to a registered fabric agent without claiming turn control.",
    inputSchema: {
      type: "object",
      properties: {
        agentId: { type: "string" },
        authorityId: { type: "string" },
        adapterId: { type: "string" },
        actionId: { type: "string" },
        providerSessionRef: { type: "string" },
      },
      required: ["agentId", "authorityId", "adapterId", "actionId", "providerSessionRef"],
      additionalProperties: false,
    },
    daemonMethod: "attachAgent",
  },
  {
    name: "fabric_agent_steer",
    description: "Dispatch a stable-ID steer action through an activated managed-session adapter.",
    inputSchema: {
      type: "object",
      properties: {
        adapterId: { type: "string" },
        actionId: { type: "string" },
        payload: { type: "object" },
        commandId: { type: "string" },
      },
      required: ["adapterId", "actionId", "payload", "commandId"],
      additionalProperties: false,
    },
    daemonMethod: "steerAgent",
  },
  {
    name: "fabric_agent_release",
    description: "Checkpoint and non-destructively release an agent whose task, children, leases and barrier are reconciled.",
    inputSchema: {
      type: "object",
      properties: {
        agentId: { type: "string" },
        taskId: { type: "string" },
        taskRevision: { type: "integer", minimum: 1 },
        checkpoint: { type: "object" },
        commandId: { type: "string" },
      },
      required: ["agentId", "taskId", "taskRevision", "checkpoint", "commandId"],
      additionalProperties: false,
    },
    daemonMethod: "releaseAgent",
  },
  {
    name: "fabric_lifecycle_request",
    description: "Request compact, rotation, completion-ready or release through a revision-bound durable checkpoint.",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["compact", "rotate", "completion-ready", "release"] },
        agentId: { type: "string" },
        taskId: { type: "string" },
        taskRevision: { type: "integer", minimum: 1 },
        checkpoint: {
          type: "object",
          properties: {
            relativePath: { type: "string" },
            sha256: { type: "string", pattern: "^[0-9a-f]{64}$" },
            mailboxWatermark: { type: "integer", minimum: 0 },
            acknowledgedAboveWatermark: { type: "array", items: { type: "integer", minimum: 1 } },
            inFlightChildren: { type: "array", items: { type: "string" } },
            openWork: { type: "array", items: { type: "string" } },
            nextAction: { type: "string" },
            providerResumeReference: { type: "string" },
          },
          required: ["relativePath", "sha256", "mailboxWatermark", "acknowledgedAboveWatermark", "inFlightChildren", "openWork", "nextAction", "providerResumeReference"],
          additionalProperties: false,
        },
        commandId: { type: "string" },
      },
      required: ["action", "agentId", "taskId", "taskRevision", "checkpoint", "commandId"],
      additionalProperties: false,
    },
    daemonMethod: "requestLifecycle",
  },
  {
    name: "fabric_operator_intervention",
    description: "Journal fabric-mediated or integration-reported operator input with explicit provenance limits.",
    inputSchema: {
      type: "object",
      properties: {
        source: { type: "string", enum: ["fabric", "integration"] },
        directInputProvenance: { type: "string", enum: ["complete", "partial", "unavailable"] },
        taskRevision: { type: "integer", minimum: 0 },
        summary: { type: "string" },
        commandId: { type: "string" },
      },
      required: ["source", "directInputProvenance", "taskRevision", "summary", "commandId"],
      additionalProperties: false,
    },
    daemonMethod: "recordOperatorIntervention",
  },
  {
    name: "fabric_artifact_publish",
    description:
      "Record a project artifact by workspace-bounded relative path and SHA-256. The fabric stores the reference; the project directory remains the owner of the bytes.",
    inputSchema: {
      type: "object",
      properties: {
        taskId: { type: "string" },
        relativePath: { type: "string", description: "Relative to the run's project directory; no traversal or absolute paths." },
        sha256: { type: "string", pattern: "^[0-9a-f]{64}$" },
        commandId: { type: "string" },
      },
      required: ["relativePath", "sha256", "commandId"],
      additionalProperties: false,
    },
    daemonMethod: "publishArtifact",
  },
  {
    name: "fabric_barrier_close",
    description:
      "Chair-only: close the run or stage barrier. Refused while required tasks, write leases or requires-ack deliveries remain unresolved; exports the fabric receipt on success.",
    inputSchema: {
      type: "object",
      properties: {
        scope: { type: "string", enum: ["run", "stage"] },
        stageId: { type: "string" },
        commandId: { type: "string" },
      },
      required: ["scope", "commandId"],
      additionalProperties: false,
    },
    daemonMethod: "closeBarrier",
  },
  {
    name: "fabric_message_ack",
    description: "Acknowledge one claimed delivery by its delivery ID. Acknowledgement is consumption evidence for the calling agent only.",
    inputSchema: {
      type: "object",
      properties: {
        deliveryId: { type: "string" },
      },
      required: ["deliveryId"],
      additionalProperties: false,
    },
    daemonMethod: "acknowledgeDelivery",
  },
  {
    name: "fabric_message_abandon",
    description: "Chair-only: abandon an unresolved delivery with an auditable reason so mailbox and barrier recovery can proceed.",
    inputSchema: {
      type: "object",
      properties: {
        deliveryId: { type: "string" },
        reason: { type: "string", minLength: 1 },
        commandId: { type: "string" },
      },
      required: ["deliveryId", "reason", "commandId"],
      additionalProperties: false,
    },
    daemonMethod: "abandonDelivery",
  },
  {
    name: "fabric_message_receive",
    description: "Claim ready deliveries for the calling agent up to a limit, with a visibility timeout for redelivery on crash.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "integer", minimum: 0 },
        visibilityTimeoutMs: { type: "integer", minimum: 1 },
      },
      required: ["limit", "visibilityTimeoutMs"],
      additionalProperties: false,
    },
    daemonMethod: "receiveMessages",
  },
  {
    name: "fabric_message_send",
    description: "Send a durable message to explicit agent recipients. Delivery is at-least-once; dedupeKey makes retries idempotent.",
    inputSchema: {
      type: "object",
      properties: {
        audience: {
          oneOf: [
            {
              type: "object",
              properties: {
                kind: { const: "agents" },
                agentIds: { type: "array", items: { type: "string" }, minItems: 1 },
              },
              required: ["kind", "agentIds"],
              additionalProperties: false,
            },
            {
              type: "object",
              properties: { kind: { const: "team" }, teamId: { type: "string" } },
              required: ["kind", "teamId"],
              additionalProperties: false,
            },
            {
              type: "object",
              properties: { kind: { const: "task" }, taskId: { type: "string" } },
              required: ["kind", "taskId"],
              additionalProperties: false,
            },
          ],
        },
        context: {
          oneOf: [
            { type: "object", properties: { kind: { const: "direct" } }, required: ["kind"], additionalProperties: false },
            { type: "object", properties: { kind: { const: "task" }, taskId: { type: "string" } }, required: ["kind", "taskId"], additionalProperties: false },
            { type: "object", properties: { kind: { const: "task-dependency" }, fromTaskId: { type: "string" }, toTaskId: { type: "string" } }, required: ["kind", "fromTaskId", "toTaskId"], additionalProperties: false },
            { type: "object", properties: { kind: { const: "discussion-group" }, groupId: { type: "string" } }, required: ["kind", "groupId"], additionalProperties: false },
          ],
        },
        kind: { type: "string", enum: ["request", "response", "event", "steer", "cancel", "escalate", "ack"] },
        body: { type: "string", maxLength: 4096 },
        requiresAck: { type: "boolean" },
        dedupeKey: { type: "string" },
        conversationId: { type: "string" },
        replyToMessageId: { type: "string" },
        taskRevision: { type: "integer", minimum: 1 },
        hopCount: { type: "integer", minimum: 0, maximum: 4 },
        expiresAt: { type: "string" },
      },
      required: ["audience", "kind", "body", "requiresAck", "dedupeKey"],
      additionalProperties: false,
    },
    daemonMethod: "sendMessage",
  },
  {
    name: "fabric_run_create",
    description: "Create a run with its chair agent and root authority. Valid only under the daemon bootstrap capability.",
    inputSchema: {
      type: "object",
      properties: {
        runId: { type: "string" },
        projectRunDirectory: { type: "string" },
        chair: {
          type: "object",
          properties: {
            agentId: { type: "string" },
            authority: AUTHORITY_SCHEMA,
          },
          required: ["agentId", "authority"],
          additionalProperties: false,
        },
      },
      required: ["runId", "chair"],
      additionalProperties: false,
    },
    daemonMethod: "createRun",
  },
  {
    name: "fabric_run_status",
    description: "Read the shared status of a run: chair, counts and barrier state. Identical for every connected client.",
    inputSchema: {
      type: "object",
      properties: {
        runId: { type: "string" },
      },
      required: ["runId"],
      additionalProperties: false,
    },
    daemonMethod: "getRunStatus",
  },
  {
    name: "fabric_task_assign",
    description: "Create a ready task under a delegated authority with an explicit eligible-agent set (chair or owning parent only).",
    inputSchema: {
      type: "object",
      properties: {
        taskId: { type: "string" },
        authorityId: { type: "string" },
        eligibleAgentIds: { type: "array", items: { type: "string" }, minItems: 1 },
        proposedOwnerAgentId: { type: "string" },
        participantAgentIds: { type: "array", items: { type: "string" } },
        dependencies: { type: "array", items: { type: "string" } },
        expectedArtifacts: { type: "array", items: { type: "string" } },
        objectiveChecks: { type: "array", items: { type: "string" } },
        humanGates: { type: "array", items: { type: "string" } },
        objective: { type: "string" },
        baseRevision: { type: "string" },
        commandId: { type: "string" },
      },
      required: ["taskId", "authorityId", "eligibleAgentIds", "objective", "baseRevision", "commandId"],
      additionalProperties: false,
    },
    daemonMethod: "createTask",
  },
  {
    name: "fabric_task_claim",
    description: "Atomically claim a ready task at an expected revision; the claimer becomes its sole owner.",
    inputSchema: {
      type: "object",
      properties: {
        taskId: { type: "string" },
        expectedRevision: { type: "integer", minimum: 1 },
        commandId: { type: "string" },
      },
      required: ["taskId", "expectedRevision", "commandId"],
      additionalProperties: false,
    },
    daemonMethod: "claimTask",
  },
  {
    name: "fabric_task_complete",
    description: "Owner-only: move an active task to complete, cancelled or degraded at an expected revision.",
    inputSchema: {
      type: "object",
      properties: {
        taskId: { type: "string" },
        expectedRevision: { type: "integer", minimum: 1 },
        state: { type: "string", enum: ["complete", "cancelled", "degraded"] },
        commandId: { type: "string" },
      },
      required: ["taskId", "expectedRevision", "state", "commandId"],
      additionalProperties: false,
    },
    daemonMethod: "updateTask",
  },
];

export const FABRIC_MCP_TOOLS: FabricToolDefinition[] = RAW_FABRIC_MCP_TOOLS.map((tool) => {
  const outputSchema = OUTPUT_SCHEMAS[tool.daemonMethod];
  if (outputSchema === undefined) throw new Error(`missing MCP output schema for ${tool.daemonMethod}`);
  return { ...tool, outputSchema };
});

export type FabricResourceTemplate = {
  uriTemplate: string;
  name: string;
  description: string;
  mimeType: string;
};

export const FABRIC_MCP_RESOURCE_TEMPLATES: FabricResourceTemplate[] = [
  {
    uriTemplate: "fabric://runs/{run_id}/status",
    name: "Run status",
    description: "Chair, lifecycle counts and barrier state for one run.",
    mimeType: "application/json",
  },
  {
    uriTemplate: "fabric://runs/{run_id}/tasks",
    name: "Run tasks",
    description: "Task graph records for one run.",
    mimeType: "application/json",
  },
  {
    uriTemplate: "fabric://runs/{run_id}/agents",
    name: "Run agents",
    description: "Registered agents and lifecycle states for one run.",
    mimeType: "application/json",
  },
  {
    uriTemplate: "fabric://runs/{run_id}/receipts",
    name: "Run receipts",
    description: "Exported coordination receipts for one run.",
    mimeType: "application/json",
  },
];

const RESOURCE_VIEW_METHODS: Record<string, string> = {
  status: "getRunStatus",
  tasks: "listTasks",
  agents: "listAgents",
  receipts: "listReceipts",
};

export function resolveResourceUri(uri: string): { runId: string; daemonMethod: string } {
  const match = /^fabric:\/\/runs\/([^/]+)\/(status|tasks|agents|receipts)$/u.exec(uri);
  if (match === null || match[1] === undefined || match[2] === undefined) {
    throw new Error(`unknown fabric resource uri: ${uri}`);
  }
  const daemonMethod = RESOURCE_VIEW_METHODS[match[2]];
  if (daemonMethod === undefined) {
    throw new Error(`unknown fabric resource view: ${match[2]}`);
  }
  return { runId: decodeURIComponent(match[1]), daemonMethod };
}
