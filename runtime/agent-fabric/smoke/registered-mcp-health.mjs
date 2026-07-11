#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const projectRoot = resolve(process.argv[2] ?? process.cwd());
const stateDirectory = process.env.AGENT_FABRIC_STATE_DIRECTORY
  ?? join(process.env.HOME ?? "", ".local", "state", "agent-harness", "fabric");
const socketPath = process.env.AGENT_FABRIC_SOCKET_PATH
  ?? join(stateDirectory, "runtime", "fabric-v1.sock");
const projectKey = process.env.AGENT_FABRIC_PROJECT_KEY;
if (projectKey === undefined) throw new Error("AGENT_FABRIC_PROJECT_KEY is required");

const seats = ["agy", "claude", "codex", "cursor", "kiro"];
const requiredTools = ["fabric_message_send", "fabric_message_receive", "fabric_message_ack", "fabric_run_status"];

const results = [];
const seatRoot = join(stateDirectory, "seats", projectKey);
const pointer = await readFile(join(seatRoot, "current.json"), "utf8").then(JSON.parse).catch(() => undefined);
const seatDirectory = pointer?.generation === undefined ? seatRoot : join(seatRoot, "generations", pointer.generation);
for (const seat of seats) {
  const metadata = JSON.parse(await readFile(join(seatDirectory, `${seat}.json`), "utf8"));
  const transport = new StdioClientTransport({
    command: join(projectRoot, "scripts", "agent-fabric-mcp"),
    cwd: projectRoot,
    env: {
      AGENT_FABRIC_SOCKET_PATH: socketPath,
      AGENT_FABRIC_STATE_DIRECTORY: stateDirectory,
      AGENT_FABRIC_SEAT: seat,
      AGENT_FABRIC_CLIENT_LABEL: seat,
      PATH: process.env.PATH ?? "/usr/bin:/bin",
      ...(process.env.HOME === undefined ? {} : { HOME: process.env.HOME }),
    },
  });
  const client = new Client({ name: `registered-health-${seat}`, version: "1" });
  await client.connect(transport);
  try {
    const [tools, templates, status] = await Promise.all([
      client.listTools(),
      client.listResourceTemplates(),
      client.callTool({ name: "fabric_run_status", arguments: { runId: metadata.runId } }),
    ]);
    const names = new Set(tools.tools.map((tool) => tool.name));
    for (const name of requiredTools) {
      if (!names.has(name)) throw new Error(`${seat} is missing ${name}`);
    }
    if (status.isError === true) throw new Error(`${seat} could not read its registered run`);
    results.push({
      seat,
      role: metadata.role,
      tools: tools.tools.length,
      resourceTemplates: templates.resourceTemplates.length,
      runStatus: "readable",
    });
  } finally {
    await client.close();
  }
}

process.stdout.write(`${JSON.stringify({ status: "pass", seats: results }, null, 2)}\n`);
