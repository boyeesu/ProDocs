import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { atomicWriteFile } from "./safe-fs.js";

const executeFile = promisify(execFile);

const PRE_PUSH = `#!/bin/sh
set -eu

PRODOCS_COMMAND="\${PRODOCS_BIN:-prodocs}"
"$PRODOCS_COMMAND" check
"$PRODOCS_COMMAND" policy

base="$(git merge-base HEAD '@{upstream}' 2>/dev/null || git rev-parse HEAD~1)"
mkdir -p .prodocs
"$PRODOCS_COMMAND" impact "$base...HEAD" --json > .prodocs/last-impact.json
`;

async function git(root, args) {
  try {
    return await executeFile("git", ["-C", root, ...args], {
      encoding: "utf8",
      timeout: 15_000,
      windowsHide: true
    });
  } catch (error) {
    throw new Error(error.stderr?.trim() || error.message);
  }
}

export async function installGitHooks(root, { force = false } = {}) {
  await git(root, ["rev-parse", "--show-toplevel"]);
  let existing = "";
  try {
    existing = (
      await executeFile(
        "git",
        ["-C", root, "config", "--get", "core.hooksPath"],
        { encoding: "utf8", timeout: 15_000, windowsHide: true }
      )
    ).stdout.trim();
  } catch (error) {
    if (error.code !== 1) throw error;
  }
  if (existing && existing !== ".prodocs/hooks" && !force) {
    throw new Error(
      `core.hooksPath is already ${existing}; rerun with --force to replace it.`
    );
  }
  const directory = path.join(root, ".prodocs", "hooks");
  await fs.mkdir(directory, { recursive: true });
  const stat = await fs.lstat(directory);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error("Refusing unsafe .prodocs/hooks directory.");
  }
  const hookPath = path.join(directory, "pre-push");
  await atomicWriteFile(hookPath, PRE_PUSH);
  await fs.chmod(hookPath, 0o755);
  await git(root, ["config", "core.hooksPath", ".prodocs/hooks"]);
  return {
    path: ".prodocs/hooks/pre-push",
    hooksPath: ".prodocs/hooks",
    checks: ["check", "policy", "impact"]
  };
}
