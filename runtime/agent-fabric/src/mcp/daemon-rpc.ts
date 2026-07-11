import { TimedNdjsonTransport } from "../transport/ndjson-rpc.js";

// Generic NDJSON RPC client for the fabric daemon socket. The MCP facade needs
// the full daemon method surface while retaining the daemon's existing wire protocol.
export class DaemonRpc {
  readonly #transport: TimedNdjsonTransport;

  private constructor(transport: TimedNdjsonTransport) {
    this.#transport = transport;
  }

  static async connect(options: { socketPath: string; capability: string }): Promise<DaemonRpc> {
    return new DaemonRpc(await TimedNdjsonTransport.connect(options));
  }

  async call(method: string, params: Record<string, unknown>): Promise<unknown> {
    return this.#transport.call(method, params);
  }

  async close(): Promise<void> {
    await this.#transport.close();
  }
}
