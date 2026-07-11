import type { FabricErrorCode } from "./domain/types.js";

export class FabricError extends Error {
  readonly code: FabricErrorCode;
  readonly field?: string;

  constructor(code: FabricErrorCode, message: string, options?: { field?: string; cause?: unknown }) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = "FabricError";
    this.code = code;
    if (options?.field !== undefined) {
      this.field = options.field;
    }
  }
}
