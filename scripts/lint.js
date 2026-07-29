import fs from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const files = [
  path.join("bin", "prodocs.js"),
  ...fs
    .readdirSync("src", { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".js"))
    .map((entry) => path.join("src", entry.name))
    .sort()
];

for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], {
    stdio: "inherit"
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
