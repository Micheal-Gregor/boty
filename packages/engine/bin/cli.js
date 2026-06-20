#!/usr/bin/env node
// CLI launcher — the terminal client, a reference consumer of the engine. Run with
// `npm start` (from the engine package) or `node bin/cli.js`.

import { runCli } from "../src/ui/cli.js";

runCli().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
