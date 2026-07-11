import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";

const countPath = process.env.SUPERVISOR_COUNT_PATH;
if (countPath === undefined) throw new Error("SUPERVISOR_COUNT_PATH is required");
const count = existsSync(countPath) ? Number(readFileSync(countPath, "utf8")) : 0;
writeFileSync(countPath, String(count + 1), { mode: 0o600 });
const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
lines.on("line", async (line) => {
  const request = JSON.parse(line) as {
    id: string;
    method: string;
    params?: { providerContractDigest?: unknown };
  };
  const delay = Number(process.env.SUPERVISOR_DELAY_MS ?? "0");
  if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
  const capability = process.env.AGENT_FABRIC_CAPABILITY;
  const socketPath = process.env.AGENT_FABRIC_SOCKET_PATH;
  if (request.method === "launch_chair") {
    const observation = {
        privateCapabilityPresent: typeof capability === "string" && capability.length > 0,
        privateSocketPresent: typeof socketPath === "string" && socketPath.length > 0,
        requestContainsPrivate:
          (capability !== undefined && line.includes(capability)) ||
          (socketPath !== undefined && line.includes(socketPath)),
    };
    const observationPath = process.env.SUPERVISOR_OBSERVATION_PATH;
    if (observationPath !== undefined) {
      writeFileSync(observationPath, JSON.stringify(observation), { mode: 0o600 });
    }
  }
  const providerContractDigest = request.params?.providerContractDigest;
  const result = request.method === "launch_chair"
    ? {
        resumeReference: "fixture-chair-session",
        providerSessionGeneration: 1,
        fabricContinuity: {
          schemaVersion: 1,
          kind: "authenticated-fabric-continuity",
          providerContractDigest,
          providerSessionRef: "fixture-chair-session",
          providerSessionGeneration: 1,
          authenticated: true,
        },
      }
    : { method: request.method, pid: process.pid };
  process.stdout.write(`${JSON.stringify({ id: request.id, result })}\n`);
});
