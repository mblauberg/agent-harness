#!/usr/bin/env node

import { runHerdrCli } from "./cli.js";

process.exitCode = await runHerdrCli(process.argv.slice(2), {
  stdin: process.stdin,
  stdout: process.stdout,
  stderr: process.stderr,
});
