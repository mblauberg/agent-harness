import { describe, expect, it } from "vitest";

import { AUTHORITY_ACTION_VOCABULARY, FABRIC_OPERATIONS } from "../../src/domain/operations.js";
import { ISO_4217_CURRENCY_CODES } from "../../src/domain/unit-keys.js";
import {
  isJsonObject,
  readProtocolSchema,
  readSchema,
  readYamlObject,
  requiredSchemaFiles,
  validateWithSchema,
} from "../support/schema-testkit.js";
import { TEST_AUTHORITY_V2_FIELDS } from "../support/authority-v2-testkit.ts";

const draft202012 = "https://json-schema.org/draft/2020-12/schema";
const requiredRealAdapters = [
  "agy",
  "claude-agent-sdk",
  "codex-app-server",
  "cursor-agent",
  "herdr",
  "kiro-acp",
  "pi-rpc",
] as const;

describe("Stage 1 versioned JSON Schemas", () => {
  it.each(requiredSchemaFiles)("publishes a strict versioned %s", async (file) => {
    const schema = await readSchema(file);

    expect(schema.$schema).toBe(draft202012);
    expect(typeof schema.$id).toBe("string");
    expect(new URL(String(schema.$id)).pathname).toContain("/v1/");
    expect(schema.type).toBe("object");
    expect(schema.additionalProperties).not.toBe(true);

    const unknownOnly = validateWithSchema(schema, { unexpectedStage1Field: true });
    expect(unknownOnly.valid).toBe(false);
    expect(unknownOnly.keywords.some((keyword) => keyword === "additionalProperties" || keyword === "propertyNames")).toBe(true);
  });

  it("validates the checked-in global fabric configuration and rejects unknown keys", async () => {
    const schema = await readSchema("config.schema.json");
    const configuration = await readYamlObject("agent-fabric.yaml");

    const result = validateWithSchema(schema, configuration);
    expect(result.details).toEqual([]);
    expect(result.valid).toBe(true);

    const unknown = validateWithSchema(schema, {
      ...configuration,
      unexpectedStage1Field: true,
    });
    expect(unknown.valid).toBe(false);
    expect(unknown.keywords).toContain("additionalProperties");
  });

  it("admits an account-default rejection route without treating the request as resolved", async () => {
    const receiptSchema = await readSchema("fabric-receipt.schema.json");
    const definitions = receiptSchema.$defs;
    if (!isJsonObject(definitions) || !isJsonObject(definitions.modelRouteReceipt)) {
      throw new TypeError("fabric receipt model-route schema is invalid");
    }
    const rejectedRoute = {
      schema_version: 1,
      status: "adapter_account_default_only",
      adapter: "codex",
      alias: "flagship",
      role: "lead",
      endpoint_provider: "openai",
      model_family: "openai",
      resolved_model: "",
      task_class: "mechanical",
      route_source: "task-class",
      requested_model: "gpt-5.6-sol",
      catalog_model: "gpt-5.6-sol",
      model_selection: "account-default",
      identity_source: "account-default",
    };

    const result = validateWithSchema(definitions.modelRouteReceipt, rejectedRoute);
    expect(result.details).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("validates adapter compatibility and exposes only explicitly gated adapters", async () => {
    const schema = await readSchema("adapter-compatibility.schema.json");
    const compatibility = await readYamlObject("adapter-compatibility.yaml");

    const result = validateWithSchema(schema, compatibility);
    expect(result.details).toEqual([]);
    expect(result.valid).toBe(true);

    const adapters = compatibility.adapters;
    expect(isJsonObject(adapters)).toBe(true);
    if (!isJsonObject(adapters)) {
      throw new TypeError("adapter compatibility must contain an adapters object");
    }
    expect(Object.keys(adapters).sort()).toEqual([...requiredRealAdapters].sort());
    const enabledAdapters = new Set(["agy", "claude-agent-sdk", "codex-app-server", "cursor-agent", "kiro-acp"]);
    for (const adapterId of requiredRealAdapters) {
      const adapter = adapters[adapterId];
      expect(isJsonObject(adapter), `${adapterId} must be an object`).toBe(true);
      if (!isJsonObject(adapter)) {
        throw new TypeError(`${adapterId} must be an object`);
      }
      expect(adapter.enabled, `${adapterId} activation state`).toBe(enabledAdapters.has(adapterId));
    }
    expect(adapters.agy).toMatchObject({
      implementation: {
        executable: "${USER_HOME}/.local/bin/agy",
      },
      contract: { protocol_version: "headless-cli" },
      model_family_constraints: { allowed: ["google", "anthropic"] },
    });
    expect(adapters["cursor-agent"]).toMatchObject({
      implementation: {
        executable: "${USER_HOME}/.local/bin/cursor-agent",
        cursor_install_root: "${USER_HOME}/.local/share/cursor-agent",
      },
      contract: { protocol_version: "stream-json-cli" },
      model_family_constraints: {
        allowed: ["cursor-composer", "xai", "anthropic", "openai", "google"],
      },
    });
    expect(adapters["kiro-acp"]).toMatchObject({
      implementation: { executable: "${USER_HOME}/.local/bin/kiro-cli" },
      contract: { protocol_version: 1 },
      model_family_constraints: { allowed: ["open-weight"] },
    });
    const claude = adapters["claude-agent-sdk"];
    if (!isJsonObject(claude) || !isJsonObject(claude.implementation)) {
      throw new TypeError("Claude implementation compatibility is invalid");
    }
    const malformedIntegrity = {
      ...compatibility,
      adapters: {
        ...adapters,
        "claude-agent-sdk": {
          ...claude,
          implementation: { ...claude.implementation, lock_integrity_sha512: "not-a-sha512-digest" },
        },
      },
    };
    expect(validateWithSchema(schema, malformedIntegrity).valid).toBe(false);

    const unknown = validateWithSchema(schema, {
      ...compatibility,
      unexpectedStage1Field: true,
    });
    expect(unknown.valid).toBe(false);
    expect(unknown.keywords).toContain("additionalProperties");
  });

  it("publishes only the exact current operation vocabulary and rejects coarse actions", async () => {
    const schema = await readProtocolSchema("authority-envelope.v2.schema.json");
    const properties = schema.properties;
    if (!isJsonObject(properties) || !isJsonObject(properties.actions) || !isJsonObject(properties.actions.items)) {
      throw new TypeError("authority actions schema is invalid");
    }
    const authority = {
      ...TEST_AUTHORITY_V2_FIELDS,
      workspaceRoots: ["."],
      sourcePaths: ["src"],
      artifactPaths: [".agent-run"],
      actions: [FABRIC_OPERATIONS.getTask, FABRIC_OPERATIONS.sendMessage],
      disclosure: { level: "scoped", scopes: ["local"] } as const,
      expiresAt: "2099-01-01T00:00:00.000Z",
      budget: { turns: 1 },
    };
    for (const action of AUTHORITY_ACTION_VOCABULARY) {
      expect(validateWithSchema(schema, { ...authority, actions: [action] }).valid, action).toBe(true);
    }
    expect(validateWithSchema(schema, authority).valid).toBe(true);
    for (const action of ["read", "write", "delegate", "message", "team"]) {
      expect(validateWithSchema(schema, { ...authority, actions: [action] }).valid, action).toBe(false);
    }
    expect(validateWithSchema(schema, { ...authority, actions: ["deploy"] }).valid).toBe(false);
    expect(validateWithSchema(schema, { ...authority, actions: ["fabric.v1.deploy"] }).valid).toBe(false);
  });

  it("publishes only the closed current disclosure policy", async () => {
    const schema = await readProtocolSchema("authority-envelope.v2.schema.json");
    const base = {
      ...TEST_AUTHORITY_V2_FIELDS,
      workspaceRoots: ["."],
      sourcePaths: ["src"],
      artifactPaths: [".agent-run"],
      actions: [FABRIC_OPERATIONS.getTask, FABRIC_OPERATIONS.updateTask],
      deniedPaths: ["src/private"],
      deniedActions: ["fabric.v1.artifact.publish"],
      expiresAt: "2099-01-01T00:00:00.000Z",
      budget: { turns: 4, "cost:USD": 2, "input_tokens:google": 100 },
    };

    expect(validateWithSchema(schema, {
      ...base,
      disclosure: { level: "scoped", scopes: ["local", "approved-provider"] } as const,
    }).valid).toBe(true);
    expect(validateWithSchema(schema, { ...base, disclosure: ["local"] }).valid).toBe(false);
    expect(validateWithSchema(schema, { ...base, disclosure: { level: "scoped", scopes: [] } as const }).valid).toBe(false);
    expect(validateWithSchema(schema, { ...base, disclosure: { level: "forbidden", scopes: ["local"] } }).valid).toBe(false);
    expect(validateWithSchema(schema, { ...base, budget: { costUsd: 2 } }).valid).toBe(false);
    expect(validateWithSchema(schema, { ...base, budget: { "cost:ZZZ": 2 } }).valid).toBe(false);
    for (const currency of ISO_4217_CURRENCY_CODES) {
      expect(validateWithSchema(schema, {
        ...base,
        disclosure: { level: "scoped", scopes: ["local"] } as const,
        budget: { [`cost:${currency}`]: 1 },
      }).valid, currency).toBe(true);
    }
  });

  it("publishes qualified budget unit keys and rejects legacy ambiguous keys", async () => {
    const schema = await readSchema("budget.schema.json");

    expect(validateWithSchema(schema, {
      turns: 1,
      "cost:USD": 2,
      "input_tokens:google": 3,
      "output_tokens:openai": 4,
    }).valid).toBe(true);
    expect(validateWithSchema(schema, { costUsd: 2 }).valid).toBe(false);
    expect(validateWithSchema(schema, { input_tokens: 3 }).valid).toBe(false);
  });
});
