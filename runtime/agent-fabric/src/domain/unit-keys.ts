export const GENERIC_BUDGET_UNIT_KEYS = [
  "turns",
  "provider_calls",
  "concurrent_turns",
  "descendants",
  "message_bytes",
  "artifact_bytes",
  "wall_clock_milliseconds",
] as const;

const genericUnitKeys = new Set<string>(GENERIC_BUDGET_UNIT_KEYS);
export const ISO_4217_CURRENCY_CODES = Intl.supportedValuesOf("currency");
const iso4217Codes = new Set(ISO_4217_CURRENCY_CODES);
const providerFamily = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/u;

export function isBudgetUnitKey(value: string): boolean {
  if (genericUnitKeys.has(value)) return true;
  if (value.startsWith("cost:")) return iso4217Codes.has(value.slice("cost:".length));
  for (const prefix of ["input_tokens:", "output_tokens:"] as const) {
    if (value.startsWith(prefix)) return providerFamily.test(value.slice(prefix.length));
  }
  return false;
}
