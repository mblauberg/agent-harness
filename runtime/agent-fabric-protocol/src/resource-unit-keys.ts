import { defineCodec, type Codec, type JsonSchema } from "./codec.js";

export const GENERIC_BUDGET_UNIT_KEYS = Object.freeze([
  "turns",
  "provider_calls",
  "concurrent_turns",
  "descendants",
  "message_bytes",
  "artifact_bytes",
  "wall_clock_milliseconds",
] as const);

/**
 * The pinned Node/ICU runtime is the single ISO-4217 catalogue owner.  Both
 * protocol schemas and daemon admission consume this exact frozen snapshot;
 * a syntactically plausible but unrecognised currency is never authority.
 */
export const ISO_4217_CURRENCY_CODES = Object.freeze(
  [...Intl.supportedValuesOf("currency")].sort(),
);

export const COST_BUDGET_UNIT_KEYS = Object.freeze(
  ISO_4217_CURRENCY_CODES.map((currency) => `cost:${currency}` as const),
);

const genericUnitKeys: ReadonlySet<string> = new Set(GENERIC_BUDGET_UNIT_KEYS);
const costUnitKeys: ReadonlySet<string> = new Set(COST_BUDGET_UNIT_KEYS);
const providerTokenUnit = /^(?:input_tokens|output_tokens):[a-z0-9]+(?:[.-][a-z0-9]+)*$/u;
const costUnitPattern = `^cost:(?:${ISO_4217_CURRENCY_CODES.join("|")})$`;

export function isBudgetUnitKey(value: string): boolean {
  return genericUnitKeys.has(value) || costUnitKeys.has(value) || providerTokenUnit.test(value);
}

const schema = Object.freeze({
  oneOf: [
    { type: "string", enum: [...GENERIC_BUDGET_UNIT_KEYS] },
    // Keep the generated schema exact without copying the full prefixed
    // catalogue into every resource-map key schema.
    { type: "string", pattern: costUnitPattern },
    { type: "string", pattern: "^(?:input_tokens|output_tokens):[a-z0-9]+(?:[.-][a-z0-9]+)*$" },
  ],
}) as JsonSchema;

export const budgetUnitKey: Codec<string> = defineCodec(
  schema,
  "concurrent_turns",
  (value, path) => {
    if (typeof value !== "string" || !isBudgetUnitKey(value)) {
      throw new TypeError(`${path} must be a recognised qualified budget unit`);
    }
    return value;
  },
);
