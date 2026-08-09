import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { loadConfig } from "./config.js";
import { resolveOutputPath } from "./paths.js";
import { scanProject } from "./scanner.js";
import { readRegularFile } from "./safe-fs.js";

const executeFile = promisify(execFile);
const INTEGRATIONS = [
  "AGENTS.md",
  "CLAUDE.md",
  "codex.md",
  "opencode.md",
  "vscode.md",
  "mcp.json"
];

function check(id, status, message, remediation = null) {
  return { id, status, message, remediation };
}

async function exists(filePath) {
  try {
    const stat = await fs.lstat(filePath);
    return stat.isFile() && !stat.isSymbolicLink();
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

async function gitRepository(root) {
  try {
    await executeFile("git", ["-C", root, "rev-parse", "--is-inside-work-tree"], {
      encoding: "utf8",
      timeout: 10_000,
      windowsHide: true
    });
    return true;
  } catch {
    return false;
  }
}

export async function diagnoseProject(root) {
  const checks = [];
  const nodeMajor = Number.parseInt(process.versions.node.split(".")[0], 10);
  checks.push(
    check(
      "runtime.node",
      nodeMajor >= 20 ? "pass" : "error",
      `Node.js ${process.versions.node}`,
      nodeMajor >= 20 ? null : "Install Node.js 20 or newer."
    )
  );

  const isGit = await gitRepository(root);
  checks.push(
    check(
      "repository.git",
      isGit ? "pass" : "warning",
      isGit ? "Git worktree detected." : "No Git worktree detected.",
      isGit ? null : "Initialize Git to enable impact and history commands."
    )
  );

  let config;
  try {
    config = await loadConfig(root);
    checks.push(check("configuration", "pass", "Configuration is valid."));
  } catch (error) {
    checks.push(
      check(
        "configuration",
        "error",
        error.message,
        "Run `prodocs init`, then review prodocs.config.json."
      )
    );
    return summarize(checks);
  }

  let graph;
  try {
    graph = await scanProject(root, config, { indexMode: "read" });
    checks.push(
      check(
        "evidence.index",
        graph.stats.files > 0 ? "pass" : "warning",
        `${graph.stats.files} files and ${graph.stats.symbols} symbols indexed.`,
        graph.stats.files > 0
          ? null
          : "Review source/include configuration and add supported source files."
      )
    );
  } catch (error) {
    checks.push(check("evidence.index", "error", error.message));
    return summarize(checks);
  }

  try {
    const outputPath = await resolveOutputPath(root, config.output);
    const manifestPath = path.join(outputPath, "manifest.json");
    const { contents } = await readRegularFile(manifestPath, {
      maxBytes: 1024 * 1024
    });
    const manifest = JSON.parse(contents);
    const fresh =
      manifest.sourceHash === graph.sourceHash &&
      manifest.knowledgeHash === graph.knowledgeHash &&
      manifest.inputHash === graph.inputHash;
    checks.push(
      check(
        "documentation.freshness",
        fresh ? "pass" : "error",
        fresh ? "Generated documentation is fresh." : "Generated documentation is stale.",
        fresh ? null : "Run `prodocs sync` and commit the generated artifacts."
      )
    );
  } catch (error) {
    checks.push(
      check(
        "documentation.freshness",
        "error",
        `Manifest unavailable: ${error.message}`,
        "Run `prodocs sync`."
      )
    );
  }

  const integrationDirectory = path.join(root, ".prodocs", "integrations");
  const integrationResults = await Promise.all(
    INTEGRATIONS.map((name) => exists(path.join(integrationDirectory, name)))
  );
  const integrationCount = integrationResults.filter(Boolean).length;
  checks.push(
    check(
      "agents.integrations",
      integrationCount === INTEGRATIONS.length ? "pass" : "warning",
      `${integrationCount}/${INTEGRATIONS.length} agent integration recipes present.`,
      integrationCount === INTEGRATIONS.length ? null : "Run `prodocs init` to add missing recipes."
    )
  );

  checks.push(
    check(
      "knowledge.health",
      graph.stats.knowledge.unsupported === 0 &&
        graph.stats.knowledge.contradictions === 0
        ? "pass"
        : "error",
      `${graph.stats.knowledge.unsupported} unsupported and ${graph.stats.knowledge.contradictions} contradictory knowledge items.`,
      graph.stats.knowledge.unsupported === 0 &&
        graph.stats.knowledge.contradictions === 0
        ? null
        : "Resolve knowledge evidence and contradictions before release."
    )
  );

  return summarize(checks);
}

function summarize(checks) {
  const counts = {
    pass: checks.filter((item) => item.status === "pass").length,
    warning: checks.filter((item) => item.status === "warning").length,
    error: checks.filter((item) => item.status === "error").length
  };
  return {
    schemaVersion: 1,
    kind: "prodocs.diagnostic-report",
    ready: counts.error === 0,
    counts,
    checks
  };
}
