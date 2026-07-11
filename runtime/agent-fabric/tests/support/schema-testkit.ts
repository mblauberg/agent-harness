import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { Ajv2020 } from "ajv/dist/2020.js";
import { parse } from "yaml";

export type JsonObject = Record<string, unknown>;

export type SchemaValidation = {
  valid: boolean;
  keywords: string[];
  details: string[];
};

export const packageRoot = fileURLToPath(new URL("../../", import.meta.url));
export const repositoryRoot = fileURLToPath(new URL("../../../../", import.meta.url));

export const requiredSchemaFiles = [
  "config.schema.json",
  "adapter-compatibility.schema.json",
  "authority.schema.json",
  "budget.schema.json",
  "adapter.schema.json",
  "command.schema.json",
  "event.schema.json",
  "fabric-receipt.schema.json",
] as const;

export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readObject(path: string, decode: (text: string) => unknown): Promise<JsonObject> {
  const value: unknown = decode(await readFile(path, "utf8"));
  if (!isJsonObject(value)) {
    throw new TypeError(`${path} must contain an object`);
  }
  return value;
}

export function schemaPath(file: string): string {
  return fileURLToPath(new URL(`../../schemas/${file}`, import.meta.url));
}

export function repositoryConfigPath(file: string): string {
  return fileURLToPath(new URL(`../../../../config/${file}`, import.meta.url));
}

export async function readSchema(file: string): Promise<JsonObject> {
  return readObject(schemaPath(file), (text) => JSON.parse(text));
}

export async function readYamlObject(file: string): Promise<JsonObject> {
  return readObject(repositoryConfigPath(file), (text) => parse(text));
}

export function validateWithSchema(schema: JsonObject, value: unknown): SchemaValidation {
  const ajv = new Ajv2020({ allErrors: true, strict: true, validateFormats: false });
  const validate = ajv.compile(schema);
  const valid = validate(value);
  return {
    valid,
    keywords: validate.errors?.map((error) => error.keyword) ?? [],
    details:
      validate.errors?.map(
        (error) => `${error.instancePath || "/"} ${error.message ?? error.keyword}`,
      ) ?? [],
  };
}
