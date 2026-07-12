import { mkdir } from "node:fs/promises";
import { createInterface } from "node:readline";

import { FLOCK_ELECTION_LOCK_PORT } from "../../../src/daemon/bootstrap-election.ts";

const runtimeDirectory = process.env.FABRIC_TEST_RUNTIME_DIRECTORY;
if (runtimeDirectory === undefined) throw new Error("FABRIC_TEST_RUNTIME_DIRECTORY is required");
await mkdir(runtimeDirectory, { recursive: true, mode: 0o700 });
const lock = await FLOCK_ELECTION_LOCK_PORT.tryAcquire(`${runtimeDirectory}/daemon-election.lock`);
if (lock === undefined) throw new Error("test child could not acquire the election lock");
process.stdout.write("locked\n");
const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
await new Promise<void>((resolve) => lines.once("line", () => resolve()));
lines.close();
await lock.release();
