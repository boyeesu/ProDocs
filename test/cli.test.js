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

test("context emits a validated packet with freshness and relevance", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "prodocs-context-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, "src"));
  await fs.writeFile(
    path.join(root, "src", "main.ts"),
    'import "./dependency.ts";\nexport function main() {}\n'
  );
  await fs.writeFile(
    path.join(root, "src", "dependency.ts"),
    "export const dependency = true;\n"
  );

  await execute(["init"], root);
  await execute(["sync"], root);
  const result = await execute(
    ["context", "--path", "./src/main.ts", "--json"],
    root
  );
  const packet = JSON.parse(result.stdout);

  assert.equal(result.code, 0);
  assert.equal(packet.kind, "prodocs.context-packet");
  assert.deepEqual(packet.request.paths, ["src/main.ts"]);
  assert.equal(packet.freshness.status, "fresh");
  assert.equal(packet.stats.files, 2);
  assert.equal(
    packet.nodes.find((node) => node.path === "src/main.ts").selection.reason,
    "requested"
  );
  assert.equal(
    packet.nodes.find((node) => node.path === "src/dependency.ts").selection
      .reason,
    "dependency"
  );
});
