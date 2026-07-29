import fs from "node:fs/promises";
import path from "node:path";
import { loadConfig, writeDefaultConfig } from "./config.js";
import { writeIntegrations } from "./integrations.js";
import { writeArtifacts } from "./render.js";
import { scanProject, selectContext } from "./scanner.js";
import { VERSION } from "./constants.js";

function hasFlag(args, flag) {
  return args.includes(flag);
}

function valuesAfter(args, flag) {
  const values = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === flag && args[index + 1]) values.push(args[index + 1]);
  }
  return values;
}

function help() {
  return `ProDocs ${VERSION} — evidence-backed documentation for humans and coding agents

Usage:
  prodocs init                    Create configuration and agent integration guides
  prodocs sync                    Scan source and refresh generated documentation
  prodocs check                   Fail when generated documentation is stale
  prodocs context --path <path>   Return a path and its dependency neighborhood
  prodocs status                  Show documentation freshness and index statistics

Options:
  --root <directory>              Project root (defaults to current directory)
  --path <path>                   File or directory to select; repeatable
  --json                          Emit machine-readable output
  --help                          Show this help
  --version                       Show the version
`;
}

function rootFrom(args) {
  const index = args.indexOf("--root");
  return path.resolve(index >= 0 && args[index + 1] ? args[index + 1] : process.cwd());
}

async function readManifest(root, config) {
  const manifestPath = path.resolve(root, config.output, "manifest.json");
  try {
    return JSON.parse(await fs.readFile(manifestPath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw new Error(`Could not read generated manifest: ${error.message}`);
  }
}

async function init(root, json) {
  const configResult = await writeDefaultConfig(root);
  const integrations = await writeIntegrations(root);
  const result = {
    root,
    config: configResult,
    integrations
  };
  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(
    `${configResult.created ? "Created" : "Kept"} ${path.relative(root, configResult.path)}`
  );
  for (const integration of integrations) {
    console.log(
      `${integration.created ? "Created" : "Kept"} ${path.relative(root, integration.path)}`
    );
  }
  console.log("\nNext: edit prodocs.config.json, then run `prodocs sync`.");
}

async function sync(root, json) {
  const config = await loadConfig(root);
  const graph = await scanProject(root, config);
  const existingManifest = await readManifest(root, config);
  if (
    existingManifest?.inputHash === graph.inputHash &&
    existingManifest.generatedAt
  ) {
    graph.generatedAt = existingManifest.generatedAt;
  }
  const artifacts = await writeArtifacts(root, config, graph);
  if (json) {
    console.log(JSON.stringify({ graph, artifacts }, null, 2));
    return;
  }
  console.log(
    `Indexed ${graph.stats.files} files, ${graph.stats.symbols} symbols, and ${graph.stats.edges} relationships.`
  );
  console.log(`Wrote ${artifacts.length} artifacts to ${path.relative(root, path.dirname(artifacts[0]))}.`);
}

async function freshness(root) {
  const config = await loadConfig(root);
  const [graph, manifest] = await Promise.all([
    scanProject(root, config),
    readManifest(root, config)
  ]);
  return {
    fresh: manifest?.inputHash === graph.inputHash,
    graph,
    manifest,
    output: config.output
  };
}

async function check(root, json) {
  const result = await freshness(root);
  if (json) {
    console.log(
      JSON.stringify(
        {
          fresh: result.fresh,
          currentSourceHash: result.graph.sourceHash,
          documentedSourceHash: result.manifest?.sourceHash ?? null,
          currentInputHash: result.graph.inputHash,
          documentedInputHash: result.manifest?.inputHash ?? null
        },
        null,
        2
      )
    );
  } else if (result.fresh) {
    console.log(`Documentation is fresh (${result.graph.sourceHash.slice(0, 12)}).`);
  } else {
    console.error(
      result.manifest
        ? "Documentation is stale. Run `prodocs sync` and commit the result."
        : "Documentation has not been generated. Run `prodocs sync`."
    );
  }
  if (!result.fresh) process.exitCode = 1;
}

async function status(root, json) {
  const result = await freshness(root);
  const output = {
    fresh: result.fresh,
    generatedAt: result.manifest?.generatedAt ?? null,
    sourceHash: result.graph.sourceHash,
    documentedSourceHash: result.manifest?.sourceHash ?? null,
    inputHash: result.graph.inputHash,
    documentedInputHash: result.manifest?.inputHash ?? null,
    stats: result.graph.stats,
    output: result.output
  };
  if (json) {
    console.log(JSON.stringify(output, null, 2));
    return;
  }
  console.log(`Documentation: ${output.fresh ? "fresh" : "stale or missing"}`);
  console.log(`Files: ${output.stats.files}  Symbols: ${output.stats.symbols}  Relationships: ${output.stats.edges}`);
  console.log(`Output: ${output.output}`);
}

async function context(root, args, json) {
  const requestedPaths = valuesAfter(args, "--path");
  if (requestedPaths.length === 0) {
    throw new Error("`context` requires at least one `--path <file-or-directory>`.");
  }
  const config = await loadConfig(root);
  const graph = await scanProject(root, config);
  const selection = selectContext(graph, requestedPaths);
  const result = {
    schemaVersion: 1,
    sourceHash: graph.sourceHash,
    requestedPaths,
    ...selection
  };

  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (selection.nodes.length === 0) {
    console.log("No indexed source matched the requested path.");
    return;
  }
  for (const node of selection.nodes) {
    const marker = requestedPaths.some(
      (requested) => node.path === requested || node.path.startsWith(`${requested}/`)
    )
      ? "*"
      : " ";
    console.log(`${marker} ${node.path} — ${node.language}, ${node.symbols.length} symbols`);
  }
  console.log(`\n${selection.edges.length} internal relationships in this context.`);
}

export async function run(args) {
  if (hasFlag(args, "--help") || hasFlag(args, "-h")) {
    console.log(help());
    return;
  }
  if (hasFlag(args, "--version") || hasFlag(args, "-v")) {
    console.log(VERSION);
    return;
  }

  const command = args[0] ?? "status";
  const root = rootFrom(args);
  const json = hasFlag(args, "--json");
  const commands = { init, sync, check, status };

  if (command === "context") {
    await context(root, args, json);
  } else if (commands[command]) {
    await commands[command](root, json);
  } else {
    throw new Error(`Unknown command "${command}". Run \`prodocs --help\`.`);
  }
}
