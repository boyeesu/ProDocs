import fs from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

function javascriptFiles(directory) {
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) return javascriptFiles(file);
      return entry.isFile() && entry.name.endsWith(".js") ? [file] : [];
    })
    .sort();
}

const files = [path.join("bin", "prodocs.js"), ...javascriptFiles("src")];

for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], {
    stdio: "inherit"
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
