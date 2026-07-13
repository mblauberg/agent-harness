import { Buffer } from "node:buffer";

import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";

import {
  MCP_PROJECTION_REGISTRY,
  REVIEW_BUNDLE_READ_ARGS_V1_CODEC,
  REVIEW_BUNDLE_READ_RESULT_V1_CODEC,
  REVIEW_BUNDLE_SEARCH_ARGS_V1_CODEC,
  REVIEW_PORTAL_REQUEST_V1_CODEC,
  REVIEW_PORTAL_RESPONSE_V1_CODEC,
  addProtocolSchemaKeywords,
  encodeReviewPortalResponse,
  parseReviewPortalRequestBytes,
} from "../src/index.js";

describe("Spec 05 isolated review portal", () => {
  it("publishes closed portal codecs without registering portal tools as Fabric MCP operations", () => {
    expect(REVIEW_BUNDLE_READ_ARGS_V1_CODEC.parse(REVIEW_BUNDLE_READ_ARGS_V1_CODEC.example, "read"))
      .toStrictEqual(REVIEW_BUNDLE_READ_ARGS_V1_CODEC.example);
    expect(REVIEW_BUNDLE_SEARCH_ARGS_V1_CODEC.parse(REVIEW_BUNDLE_SEARCH_ARGS_V1_CODEC.example, "search"))
      .toStrictEqual(REVIEW_BUNDLE_SEARCH_ARGS_V1_CODEC.example);
    expect(Object.values(MCP_PROJECTION_REGISTRY).some((projection) => (
      projection.projection === "tool" && (["review_bundle_read", "review_bundle_search"] as readonly string[]).includes(projection.name)
    ))).toBe(false);
  });

  it("parses exactly one duplicate-free UTF-8 portal request plus LF", () => {
    const request = {
      jsonrpc: "2.0",
      id: "request_01",
      method: "tools/call",
      params: { name: "review_bundle_read", arguments: REVIEW_BUNDLE_READ_ARGS_V1_CODEC.example },
    } as const;
    const bytes = Buffer.from(`${JSON.stringify(request)}\n`, "utf8");
    expect(parseReviewPortalRequestBytes(bytes)).toStrictEqual(request);
    expect(REVIEW_PORTAL_REQUEST_V1_CODEC.parse(request, "request")).toStrictEqual(request);

    const duplicate = Buffer.from('{"jsonrpc":"2.0","id":1,"id":2,"method":"tools/call","params":{"name":"review_bundle_read","arguments":' +
      `${JSON.stringify(REVIEW_BUNDLE_READ_ARGS_V1_CODEC.example)}}}\n`, "utf8");
    expect(() => parseReviewPortalRequestBytes(duplicate)).toThrow(/duplicate/i);
    expect(() => parseReviewPortalRequestBytes(Buffer.from(`${JSON.stringify(request)}\r\n`, "utf8"))).toThrow(/CRLF|LF/);
    expect(() => parseReviewPortalRequestBytes(Buffer.from(`${JSON.stringify(request)}\n{}\n`, "utf8"))).toThrow(/trailing|one|framing/i);
    expect(() => parseReviewPortalRequestBytes(Buffer.from(`[${JSON.stringify(request)}]\n`, "utf8"))).toThrow(/object|batch/i);
    expect(() => REVIEW_PORTAL_REQUEST_V1_CODEC.parse({ ...request, id: "x".repeat(65) }, "request")).toThrow(/64/);
  });

  it("writes canonical closed portal responses within exact transport bounds", () => {
    const result = {
      ...REVIEW_BUNDLE_READ_RESULT_V1_CODEC.example,
      rawByteLength: 65_536,
      payload: Buffer.alloc(65_536, 1).toString("base64"),
    };
    const response = { jsonrpc: "2.0", id: "x".repeat(64), result } as const;
    expect(REVIEW_PORTAL_RESPONSE_V1_CODEC.parse(response, "response")).toStrictEqual(response);
    const encoded = encodeReviewPortalResponse(response);
    expect(encoded.at(-1)).toBe(0x0a);
    expect(encoded.byteLength).toBeLessThanOrEqual(98_304);
    expect(encoded.toString("utf8").startsWith(`{"id":"${"x".repeat(20)}`)).toBe(true);
    expect(encodeReviewPortalResponse(response)).toStrictEqual(encoded);

    const ajv = new Ajv2020({ strict: false, allErrors: true });
    addProtocolSchemaKeywords(ajv);
    expect(ajv.compile(REVIEW_PORTAL_RESPONSE_V1_CODEC.schema)(response)).toBe(true);
  });
});
