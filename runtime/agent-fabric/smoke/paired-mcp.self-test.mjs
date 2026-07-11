import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(new URL("./paired-mcp.mjs", import.meta.url));

function run(args) {
  const child = spawn(process.execPath, [SCRIPT, ...args], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const completion = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`child failed (${code ?? signal})\nstdout:\n${stdout}\nstderr:\n${stderr}`));
    });
  });
  return { child, completion };
}

async function waitForFile(path, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      return await readFile(path, "utf8");
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
  throw new Error(`timed out waiting for ${path}`);
}

test("two separately invoked roles exchange, reply to and acknowledge messages through MCP", async () => {
  const session = await mkdtemp(join(tmpdir(), "agent-fabric-paired-mcp-self-test-"));
  const coordinator = run(["coordinate", "--session", session, "--timeout-ms", "30000"]);
  try {
    const rendezvousPath = join(session, "rendezvous.json");
    const rendezvous = JSON.parse(await waitForFile(rendezvousPath));
    assert.equal((await stat(rendezvousPath)).mode & 0o777, 0o600);

    const codex = run([
      "participant", "--session", session, "--role", "codex",
      "--message", "Codex asks Fable to confirm the shared MCP path.",
    ]);
    const fable = run([
      "participant", "--session", session, "--role", "fable",
      "--message", "Fable asks Codex to confirm the shared MCP path.",
    ]);
    const [codexResult, fableResult, coordinatorResult] = await Promise.all([
      codex.completion,
      fable.completion,
      coordinator.completion,
    ]);

    assert.match(codexResult.stdout, /codex → fable/);
    assert.match(fableResult.stdout, /fable → codex/);
    assert.match(coordinatorResult.stdout, /paired MCP smoke verified/);
    const combinedOutput = `${codexResult.stdout}${fableResult.stdout}${coordinatorResult.stdout}`;
    assert.equal(combinedOutput.includes(rendezvous.participants.codex.capability), false);
    assert.equal(combinedOutput.includes(rendezvous.participants.fable.capability), false);
    await assert.rejects(stat(rendezvousPath), { code: "ENOENT" });

    const summary = JSON.parse(await readFile(join(session, "summary.json"), "utf8"));
    assert.equal(summary.status, "verified");
    assert.deepEqual(summary.roles, ["codex", "fable"]);
    assert.equal(summary.exchange.codex.initial.content.text, "Codex asks Fable to confirm the shared MCP path.");
    assert.equal(summary.exchange.fable.initial.content.text, "Fable asks Codex to confirm the shared MCP path.");
    assert.equal(summary.exchange.codex.reply.replyToMessageId, summary.exchange.fable.initial.messageId);
    assert.equal(summary.exchange.fable.reply.replyToMessageId, summary.exchange.codex.initial.messageId);
    assert.equal(summary.acknowledgements.length, 4);
  } finally {
    coordinator.child.kill("SIGTERM");
    await coordinator.completion.catch(() => undefined);
    await rm(session, { recursive: true, force: true });
  }
});
