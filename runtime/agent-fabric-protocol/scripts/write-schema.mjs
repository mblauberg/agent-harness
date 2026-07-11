import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { PROTOCOL_SCHEMA } from "../dist/schema.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
await writeFile(join(root, "schemas/protocol.schema.json"), `${JSON.stringify(PROTOCOL_SCHEMA, null, 2)}\n`, "utf8");
