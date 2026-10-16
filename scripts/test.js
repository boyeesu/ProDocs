import { spawnSync } from "node:child_process";
import { testFiles } from "./test-files.js";

const result = spawnSync(
  process.execPath,
  ["--test", ...process.argv.slice(2), ...testFiles()],
  { stdio: "inherit" }
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
