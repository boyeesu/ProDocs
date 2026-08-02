import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const npmCli =
  process.env.npm_execpath ??
  (process.platform === "win32"
    ? path.join(
        path.dirname(process.execPath),
        "node_modules",
        "npm",
        "bin",
        "npm-cli.js"
      )
    : null);

function execute(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      ...options,
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

function executeNpm(args, options = {}) {
  return npmCli
    ? execute(process.execPath, [npmCli, ...args], options)
    : execute("npm", args, options);
}

test("published package installs and completes the documented workflow", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "prodocs-package-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const packDirectory = path.join(root, "pack");
  const dependencyPackDirectory = path.join(root, "dependencies");
  const consumer = path.join(root, "consumer");
  const project = path.join(consumer, "project");
  const npmCache = path.join(root, "npm-cache");
  const npmEnvironment = {
    ...process.env,
    NPM_CONFIG_CACHE: npmCache,
    NPM_CONFIG_DRY_RUN: "false",
    npm_config_cache: npmCache,
    npm_config_dry_run: "false"
  };
  await fs.mkdir(packDirectory);
  await fs.mkdir(dependencyPackDirectory);
  await fs.mkdir(path.join(project, "src"), { recursive: true });

  const packed = await executeNpm(
    [
      "pack",
      "--ignore-scripts",
      "--json",
      "--pack-destination",
      packDirectory
    ],
    {
      cwd: process.cwd(),
      env: npmEnvironment
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

  const dependencyTarballs = [];
  for (const dependencyPath of [
    ["@babel", "parser"],
    ["@babel", "types"],
    ["@babel", "helper-string-parser"],
    ["@babel", "helper-validator-identifier"]
  ]) {
    const dependencyPackage = await executeNpm(
      [
        "pack",
        "--ignore-scripts",
        "--json",
        "--pack-destination",
        dependencyPackDirectory,
        path.join(process.cwd(), "node_modules", ...dependencyPath)
      ],
      { cwd: root, env: npmEnvironment }
    );
    assert.equal(dependencyPackage.code, 0, dependencyPackage.stderr);
    const [{ filename: dependencyFilename }] = JSON.parse(
      dependencyPackage.stdout
    );
    dependencyTarballs.push(
      path.join(dependencyPackDirectory, dependencyFilename)
    );
  }

  const installed = await executeNpm(
    [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--offline",
      "--prefer-offline",
      "--prefix",
      consumer,
      tarball,
      ...dependencyTarballs
    ],
    {
      cwd: root,
      env: npmEnvironment
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
