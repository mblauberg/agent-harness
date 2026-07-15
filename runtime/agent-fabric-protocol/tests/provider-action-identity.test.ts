import { describe, expect, it } from "vitest";

import {
  FABRIC_OPERATIONS,
  parseLaunchProviderActionJournalRefV1,
  parseOperationInput,
  parseProviderActionRefV1,
} from "../src/index.js";

const digest = `sha256:${"a".repeat(64)}`;

describe("Agent Fabric canonical provider-action identity", () => {
  it("accepts only the closed adapter/action pair", () => {
    expect(parseProviderActionRefV1({
      adapterId: "claude-agent-sdk",
      actionId: "provider_action_01",
    })).toStrictEqual({
      adapterId: "claude-agent-sdk",
      actionId: "provider_action_01",
    });

    expect(() => parseProviderActionRefV1({
      schemaVersion: 1,
      projectSessionId: "ps_01",
      coordinationRunId: "run_01",
      providerAdapterId: "claude-agent-sdk",
      providerActionId: "provider_action_01",
      providerContractDigest: digest,
      custodyAttemptGeneration: 1,
      journalRevision: 1,
      journalState: "prepared",
      outcomeKind: null,
      outcomeDigest: null,
    })).toThrow(/unknown field|adapterId/);
  });

  it("uses the canonical pair for every provider-action operation", () => {
    expect(parseOperationInput(FABRIC_OPERATIONS.getProviderAction, {
      adapterId: "claude-agent-sdk",
      actionId: "provider_action_01",
      expectedActionKind: "non-review",
    })).toStrictEqual({
      adapterId: "claude-agent-sdk",
      actionId: "provider_action_01",
      expectedActionKind: "non-review",
    });
    expect(() => parseOperationInput(FABRIC_OPERATIONS.getProviderAction, {
      actionId: "provider_action_01",
    })).toThrow(/adapterId/);
    expect(parseOperationInput(FABRIC_OPERATIONS.reconcileProviderAction, {
      adapterId: "claude-agent-sdk",
      actionId: "provider_action_01",
      expectedActionKind: "non-review",
      commandId: "command_01",
    })).toMatchObject({ adapterId: "claude-agent-sdk", actionId: "provider_action_01" });
  });

  it("requires reconnect-stable provider-action classification on reads and reconciles", () => {
    const read = {
      adapterId: "claude-agent-sdk",
      actionId: "provider_action_01",
      expectedActionKind: "certifying-review",
    } as const;
    expect(() => parseOperationInput(FABRIC_OPERATIONS.getProviderAction, {
      adapterId: read.adapterId,
      actionId: read.actionId,
    })).toThrow(/expectedActionKind|classification/);
    expect(parseOperationInput(FABRIC_OPERATIONS.getProviderAction, read)).toStrictEqual(read);

    const reconcile = {
      ...read,
      commandId: "command_01",
    } as const;
    expect(() => parseOperationInput(FABRIC_OPERATIONS.reconcileProviderAction, {
      adapterId: reconcile.adapterId,
      actionId: reconcile.actionId,
      commandId: reconcile.commandId,
    })).toThrow(/expectedActionKind|classification/);
    expect(parseOperationInput(FABRIC_OPERATIONS.reconcileProviderAction, reconcile)).toStrictEqual(reconcile);
  });

  it("keeps launch journal identity under its owned name and equality-binds actionRef", () => {
    const journal = {
      schemaVersion: 1,
      projectSessionId: "ps_01",
      coordinationRunId: "run_01",
      actionRef: {
        adapterId: "claude-agent-sdk",
        actionId: "provider_action_01",
      },
      providerContractDigest: digest,
      custodyAttemptGeneration: 1,
      journalRevision: 1,
      journalState: "terminal",
      outcomeKind: "terminal-success",
      outcomeDigest: digest,
    } as const;

    expect(parseLaunchProviderActionJournalRefV1(journal)).toStrictEqual(journal);
    expect(() => parseLaunchProviderActionJournalRefV1({
      ...journal,
      providerActionId: journal.actionRef.actionId,
    })).toThrow(/unknown field/);
  });
});
