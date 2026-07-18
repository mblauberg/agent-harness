import { startFabricDaemon } from "../../src/daemon/client.ts";

const encoded = process.env.DAEMON_LAUNCHER_OPTIONS;
if (encoded === undefined) throw new Error("DAEMON_LAUNCHER_OPTIONS is required");
const options: unknown = JSON.parse(encoded);
if (typeof options !== "object" || options === null) throw new Error("daemon launcher options are invalid");

const daemon = await startFabricDaemon(options as Parameters<typeof startFabricDaemon>[0]);
daemon.release();
await new Promise<void>((resolve) => process.stdout.write(`${JSON.stringify({ pid: daemon.pid, released: true })}\n`, () => resolve()));
setInterval(() => undefined, 60_000);
