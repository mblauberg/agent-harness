import {
  parseCanonicalRelativePath,
  parseJsonValue,
  parseSha256Digest,
  parseTimestamp,
  safeInteger,
  strictRecord,
  type JsonValue,
} from "./primitives.js";

export type JsonSchema = Readonly<Record<string, JsonValue>>;

export type Codec<T> = {
  readonly schema: JsonSchema;
  readonly example: T;
  parse(value: unknown, path: string): T;
};

export type CodecOutput<Definition> = Definition extends Codec<infer Output> ? Output : never;

export function defineCodec<T>(
  schema: JsonSchema,
  example: T,
  parse: (value: unknown, path: string) => T,
): Codec<T> {
  return Object.freeze({ schema: Object.freeze(schema), example, parse });
}

export function parserBacked<Input, Output>(
  base: Codec<Input>,
  parse: (value: unknown, path: string) => Output,
  example: Output,
): Codec<Output> {
  return defineCodec(base.schema, example, (value, path) => parse(base.parse(value, path), path));
}

export function boundedString(options: {
  minBytes?: number;
  maxBytes?: number;
  pattern?: string;
  example?: string;
} = {}): Codec<string> {
  const minBytes = options.minBytes ?? 1;
  const maxBytes = options.maxBytes ?? 4096;
  const pattern = options.pattern === undefined ? undefined : new RegExp(options.pattern, "u");
  return defineCodec({
    type: "string",
    minLength: minBytes === 0 ? 0 : 1,
    maxLength: maxBytes,
    ...(options.pattern === undefined ? {} : { pattern: options.pattern }),
  }, options.example ?? "value_01", (value, path) => {
    if (typeof value !== "string") throw new TypeError(`${path} must be a string`);
    const bytes = Buffer.byteLength(value, "utf8");
    if (bytes < minBytes || bytes > maxBytes) {
      throw new TypeError(`${path} must contain ${String(minBytes)}-${String(maxBytes)} UTF-8 bytes`);
    }
    if (pattern !== undefined && !pattern.test(value)) throw new TypeError(`${path} has invalid format`);
    return value;
  });
}

export const identifier = boundedString({
  maxBytes: 128,
  pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$",
  example: "id_01",
});

export const secret = boundedString({ minBytes: 16, maxBytes: 4096, example: "secret-token-0001" });

export const timestamp = defineCodec<string>(
  { type: "string", format: "date-time" },
  "2026-07-11T10:00:00Z",
  parseTimestamp,
);

export const sha256 = defineCodec<string>(
  { type: "string", pattern: "^sha256:[a-f0-9]{64}$" },
  "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  parseSha256Digest,
);

export const relativePath = defineCodec<string>(
  {
    type: "string",
    minLength: 1,
    maxLength: 4096,
    pattern: "^(?!/)(?![A-Za-z]:)(?!.*(?:^|/)\\.{1,2}(?:/|$))(?!.*[\\\\*?\\[\\]{}]).+$",
  },
  "artifacts/item.json",
  parseCanonicalRelativePath,
);

export function integer(options: { minimum?: number; maximum?: number; example?: number } = {}): Codec<number> {
  const minimum = options.minimum ?? 0;
  return defineCodec({
    type: "integer",
    minimum,
    ...(options.maximum === undefined ? {} : { maximum: options.maximum }),
  }, options.example ?? Math.max(minimum, 1), (value, path) => {
    const parsed = safeInteger(value, path, minimum);
    if (options.maximum !== undefined && parsed > options.maximum) {
      throw new TypeError(`${path} must be at most ${String(options.maximum)}`);
    }
    return parsed;
  });
}

export const boolean = defineCodec<boolean>({ type: "boolean" }, true, (value, path) => {
  if (typeof value !== "boolean") throw new TypeError(`${path} must be a boolean`);
  return value;
});

export function literal<const Value extends string | number | boolean | null>(value: Value): Codec<Value> {
  return defineCodec({ const: value }, value, (candidate, path) => {
    if (candidate !== value) throw new TypeError(`${path} must equal ${String(value)}`);
    return value;
  });
}

export function enumeration<const Values extends readonly [string, ...string[]]>(values: Values): Codec<Values[number]> {
  return defineCodec({ type: "string", enum: [...values] }, values[0], (value, path) => {
    const match = values.find((candidate) => candidate === value);
    if (match === undefined) throw new TypeError(`${path} must be one of ${values.join(", ")}`);
    return match;
  });
}

export function nullable<T>(codec: Codec<T>): Codec<T | null> {
  return defineCodec({ oneOf: [codec.schema, { type: "null" }] }, null, (value, path) => (
    value === null ? null : codec.parse(value, path)
  ));
}

export function arrayOf<T>(
  item: Codec<T>,
  options: { minimum?: number; maximum?: number; unique?: boolean; example?: readonly T[] } = {},
): Codec<readonly T[]> {
  const minimum = options.minimum ?? 0;
  const maximum = options.maximum ?? 256;
  const example = options.example ?? (minimum > 0 ? [item.example] : []);
  return defineCodec({
    type: "array",
    items: item.schema,
    minItems: minimum,
    maxItems: maximum,
    ...(options.unique === true ? { uniqueItems: true } : {}),
  }, example, (value, path) => {
    if (!Array.isArray(value) || value.length < minimum || value.length > maximum) {
      throw new TypeError(`${path} must be an array with ${String(minimum)}-${String(maximum)} items`);
    }
    const parsed = value.map((entry, index) => item.parse(entry, `${path}[${String(index)}]`));
    if (options.unique === true && new Set(parsed.map((entry) => JSON.stringify(entry))).size !== parsed.length) {
      throw new TypeError(`${path} must contain unique items`);
    }
    return parsed;
  });
}

type PropertyCodecs = Readonly<Record<string, Codec<unknown>>>;

export function objectCodec(
  required: PropertyCodecs,
  optional: PropertyCodecs = {},
  options: { example?: Readonly<Record<string, JsonValue>> } = {},
): Codec<Readonly<Record<string, JsonValue>>> {
  const requiredNames = Object.keys(required);
  const propertyEntries = [...Object.entries(required), ...Object.entries(optional)];
  const properties = Object.fromEntries(propertyEntries.map(([name, codec]) => [name, codec.schema]));
  const generatedExample = Object.fromEntries(Object.entries(required).map(([name, codec]) => [name, codec.example]));
  return defineCodec({
    type: "object",
    additionalProperties: false,
    required: requiredNames,
    properties,
  }, options.example ?? parseJsonValue(generatedExample, "codec.example") as Readonly<Record<string, JsonValue>>, (value, path) => {
    const record = strictRecord(value, path, propertyEntries.map(([name]) => name));
    const result: Record<string, JsonValue> = {};
    for (const [name, codec] of Object.entries(required)) {
      if (record[name] === undefined) throw new TypeError(`${path}.${name} is required`);
      result[name] = parseJsonValue(codec.parse(record[name], `${path}.${name}`), `${path}.${name}`);
    }
    for (const [name, codec] of Object.entries(optional)) {
      if (record[name] !== undefined) {
        result[name] = parseJsonValue(codec.parse(record[name], `${path}.${name}`), `${path}.${name}`);
      }
    }
    return result;
  });
}

export function unionOf<const Codecs extends readonly [Codec<unknown>, ...Codec<unknown>[]]>(
  codecs: Codecs,
): Codec<CodecOutput<Codecs[number]>> {
  return defineCodec({ oneOf: codecs.map((codec) => codec.schema) }, codecs[0].example as CodecOutput<Codecs[number]>, (value, path) => {
    const errors: string[] = [];
    for (const codec of codecs) {
      try {
        return codec.parse(value, path) as CodecOutput<Codecs[number]>;
      } catch (error: unknown) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }
    throw new TypeError(`${path} does not match any allowed variant: ${errors.join("; ")}`);
  });
}

export function recordOf<T>(
  valueCodec: Codec<T>,
  options: { minimum?: number; maximum?: number; keyPattern?: string } = {},
): Codec<Readonly<Record<string, T>>> {
  const minimum = options.minimum ?? 0;
  const maximum = options.maximum ?? 256;
  const pattern = options.keyPattern === undefined ? undefined : new RegExp(options.keyPattern, "u");
  return defineCodec({
    type: "object",
    minProperties: minimum,
    maxProperties: maximum,
    ...(options.keyPattern === undefined ? {} : { propertyNames: { pattern: options.keyPattern } }),
    additionalProperties: valueCodec.schema,
  }, minimum > 0 ? { key_01: valueCodec.example } : {}, (value, path) => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError(`${path} must be an object`);
    const entries = Object.entries(value);
    if (entries.length < minimum || entries.length > maximum) {
      throw new TypeError(`${path} must contain ${String(minimum)}-${String(maximum)} properties`);
    }
    const result: Record<string, T> = {};
    for (const [key, entry] of entries) {
      if (pattern !== undefined && !pattern.test(key)) throw new TypeError(`${path}.${key} has an invalid key`);
      result[key] = valueCodec.parse(entry, `${path}.${key}`);
    }
    return result;
  });
}

export const jsonValue = defineCodec<JsonValue>({
  type: ["object", "array", "string", "number", "boolean", "null"],
}, {}, parseJsonValue);

export function refined<T>(
  codec: Codec<T>,
  check: (value: T, path: string) => void,
): Codec<T> {
  return defineCodec(codec.schema, codec.example, (value, path) => {
    const parsed = codec.parse(value, path);
    check(parsed, path);
    return parsed;
  });
}
