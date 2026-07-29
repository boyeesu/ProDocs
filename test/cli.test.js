import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";

const cli = path.resolve("bin/prodocs.js");

function execute(args, cwd) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cli, ...args], { cwd });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

test("init, sync, check, and stale detection form a complete loop", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "prodocs-cli-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, "src"));
  await fs.writeFile(path.join(root, "src", "main.ts"), "export function main() {}\n");

  assert.equal((await execute(["init"], root)).code, 0);
  assert.equal((await execute(["sync"], root)).code, 0);
  assert.equal((await execute(["check"], root)).code, 0);
  const firstManifest = await fs.readFile(
    path.join(root, "docs", "prodocs", "manifest.json"),
    "utf8"
  );
  assert.equal((await execute(["sync"], root)).code, 0);
  assert.equal(
    await fs.readFile(path.join(root, "docs", "prodocs", "manifest.json"), "utf8"),
    firstManifest
  );

  await fs.appendFile(path.join(root, "src", "main.ts"), "export const changed = true;\n");
  const stale = await execute(["check"], root);
  assert.equal(stale.code, 1);
  assert.match(stale.stderr, /stale/);
});

test("check detects documentation configuration drift", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "prodocs-config-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, "main.py"), "def main():\n    pass\n");

  await execute(["init"], root);
  await execute(["sync"], root);
  const configPath = path.join(root, "prodocs.config.json");
  const config = JSON.parse(await fs.readFile(configPath, "utf8"));
  config.documentation.productName = "Changed";
  await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);

  assert.equal((await execute(["check"], root)).code, 1);
});
