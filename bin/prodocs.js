#!/usr/bin/env node

import { run } from "../src/cli.js";

run(process.argv.slice(2)).catch((error) => {
  console.error(`prodocs: ${error.message}`);
  if (process.env.PRODOCS_DEBUG) console.error(error.stack);
  process.exitCode = 1;
});
