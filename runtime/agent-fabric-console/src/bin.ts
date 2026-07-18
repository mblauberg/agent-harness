#!/usr/bin/env node

import { runConsoleCli } from "./cli.js";

runConsoleCli(process.argv.slice(2)).catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
