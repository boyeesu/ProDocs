import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";

function execute(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      ...options,
      windowsHide: true,
      // Ensure commands that rely on shell resolution or shebangs run on Windows
      shell: true
    });
    let stdout = "";
    let stderr = "";
    if (child.stdout) child.stdout.on("data", (chunk) => (stdout += chunk));
    if (child.stderr) child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

test("published package installs and completes the documented workflow", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "prodocs-package-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const packDirectory = path.join(root, "pack");
  const consumer = path.join(root, "consumer");
  const project = path.join(consumer, "project");
  await fs.mkdir(packDirectory);
  await fs.mkdir(path.join(project, "src"), { recursive: true });

  const packed = await execute(
    npm,
    [
      "pack",
      "--ignore-scripts",
      "--json",
      "--pack-destination",
      packDirectory
    ],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NPM_CONFIG_DRY_RUN: "false",
        npm_config_dry_run: "false"
      }
    }
  );
  assert.equal(packed.code, 0, packed.stderr);
  const [packageDescription] = JSON.parse(packed.stdout);
  const { filename } = packageDescription;
  const packagedPaths = new Set(
    packageDescription.files.map((file) => file.path)
  );
  for (const requiredPath of [
    "bin/prodocs.js",
    "docs/COLLECTORS.md",
    "docs/COMPATIBILITY.md",
    "schemas/collector-result.schema.json",
    "SECURITY.md",
    "SUPPORT.md"
  ]) {
    assert.equal(
      packagedPaths.has(requiredPath),
      true,
      `${requiredPath} is missing from the package`
    );
  }
  const tarball = path.join(packDirectory, filename);

  const installed = await execute(
    npm,
    [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--prefer-offline",
      "--prefix",
      consumer,
      tarball
    ],
    {
      cwd: root,
      env: {
        ...process.env,
        NPM_CONFIG_DRY_RUN: "false",
        npm_config_dry_run: "false"
      }
    }
  );
  assert.equal(installed.code, 0, installed.stderr);

  const installedCli = path.join(
    consumer,
    "node_modules",
    "prodocs",
    "bin",
    "prodocs.js"
  );
  await fs.writeFile(
    path.join(project, "src", "main.ts"),
    "export function main() {}\n"
  );

  const version = await execute(process.execPath, [installedCli, "--version"], {
    cwd: project
  });
  assert.equal(version.code, 0, version.stderr);
  assert.equal(version.stdout.trim(), "0.2.0");

  for (const command of ["init", "sync", "check"]) {
    const result = await execute(process.execPath, [installedCli, command], {
      cwd: project
    });
    assert.equal(result.code, 0, result.stderr);
  }

  const status = await execute(
    process.execPath,
    [installedCli, "status", "--json"],
    { cwd: project }
  );
  assert.equal(status.code, 0, status.stderr);
  const output = JSON.parse(status.stdout);
  assert.equal(output.fresh, true);
  assert.equal(output.stats.files, 1);
  assert.equal(output.stats.symbols, 1);
});
