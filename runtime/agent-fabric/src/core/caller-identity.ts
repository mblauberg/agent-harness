import type Database from "better-sqlite3";

import { FabricError } from "../errors.js";

export type CallerIdentity = {
  seat: string;
  agentId: string;
  runId: string;
  authorityId: string;
  generation: string;
  lease: {
    leaseId: string;
    holderAgentId: string;
    generation: number;
    state: "active" | "frozen" | "revoked";
  };
};

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new FabricError("CAPABILITY_FORBIDDEN", "caller is not a current MCP seat");
  }
  return value as Record<string, unknown>;
}

function text(row: Record<string, unknown>, name: string): string {
  const value = row[name];
  if (typeof value !== "string" || value.length === 0) throw new Error(`stored caller ${name} is invalid`);
  return value;
}

export function readCallerIdentity(
  database: Database.Database,
  runId: string,
  agentId: string,
  tokenHash: string,
): CallerIdentity {
  const identity = record(database.prepare(`
    SELECT member.seat,member.generation,agent.authority_id,
           lease.lease_id,lease.holder_agent_id,lease.generation AS lease_generation,lease.status
      FROM current_mcp_seat_generation_members member
      JOIN agents agent ON agent.run_id=member.run_id AND agent.agent_id=member.agent_id
      JOIN mcp_seat_generations seat_generation ON seat_generation.generation=member.generation
      JOIN run_chair_leases lease ON lease.lease_id=seat_generation.chair_lease_id
     WHERE member.token_hash=? AND member.run_id=? AND member.agent_id=?
  `).get(tokenHash, runId, agentId));
  const leaseGeneration = identity.lease_generation;
  if (!Number.isSafeInteger(leaseGeneration) || (leaseGeneration as number) < 1) {
    throw new Error("stored caller lease generation is invalid");
  }
  const state = text(identity, "status");
  if (state !== "active" && state !== "frozen" && state !== "revoked") {
    throw new Error("stored caller lease state is invalid");
  }
  return {
    seat: text(identity, "seat"),
    agentId,
    runId,
    authorityId: text(identity, "authority_id"),
    generation: text(identity, "generation"),
    lease: {
      leaseId: text(identity, "lease_id"),
      holderAgentId: text(identity, "holder_agent_id"),
      generation: leaseGeneration as number,
      state,
    },
  };
}
