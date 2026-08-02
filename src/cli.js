import fs from "node:fs/promises";
import path from "node:path";
import { loadConfig, writeDefaultConfig } from "./config.js";
import { buildContextPacket } from "./context.js";
import {
  evaluateContextSuite,
  readEvaluationSuite
} from "./evaluate.js";
import { readHistoricalGraph } from "./history.js";
import { installGitHooks } from "./hooks.js";
import { analyzeImpact, createImpactProposal } from "./impact.js";
import { writeIntegrations } from "./integrations.js";
import { runMcpServer } from "./mcp.js";
import { evaluatePolicies } from "./policy.js";
import { resolveOutputPath, isInside } from "./paths.js";
import {
  applyProposal,
  readProposal,
  validateProposal
} from "./proposals.js";
import {
  openAiCompatibleProposal,
  templateProposal
} from "./providers.js";
import { renderAudienceView, writeArtifacts } from "./render.js";
import { runbookPlan, verifyRunbook } from "./runbooks.js";
import { readRegularFile, atomicWriteFile } from "./safe-fs.js";
import { scanProject } from "./scanner.js";
import { listenForCollaboration } from "./server.js";
import {
  normalizeRepositoryPath
} from "./security.js";
import { verifyDeclarativePlugin } from "./plugins.js";
import { VERSION } from "./constants.js";

function hasFlag(args, flag) {
  return args.includes(flag);
}

function valueAfter(args, flag, fallback = null) {
  const index = args.indexOf(flag);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function valuesAfter(args, flag) {
  const values = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === flag && args[index + 1]) values.push(args[index + 1]);
  }
  return values;
}

function integerAfter(args, flag, fallback) {
  const value = valueAfter(args, flag);
  if (value === null) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`${flag} requires an integer.`);
  }
  return parsed;
}

function help() {
  return `ProDocs ${VERSION} — evidence-backed product knowledge for humans and coding agents

Core:
  prodocs init                         Create config and agent/MCP recipes
  prodocs sync                         Incrementally index and refresh all views
  prodocs check                        Fail when generated knowledge is stale
  prodocs status [--json]              Show evidence and knowledge health
  prodocs context --path <path>        Return bounded task-shaped context

Change intelligence:
  prodocs impact [<base>...<head>]      Map changes to knowledge, tests, and owners
  prodocs policy                        Evaluate documentation contracts
  prodocs propose --impact <file>      Create a cited narrative proposal
  prodocs proposal validate <file>     Validate a reviewable proposal
  prodocs proposal apply <file>        Apply an approved authored-doc proposal

Agents and extensions:
  prodocs mcp                           Run the local stdio MCP server
  prodocs evaluate --suite <file>       Measure context quality and token use
  prodocs plugin verify <file>          Run collector conformance fixtures
  prodocs hooks install                 Install the reviewed local pre-push gate
  prodocs capabilities                  List stable interfaces and adapters

Product knowledge:
  prodocs view --audience <name>        Render an audience-specific view
  prodocs history --at <git-ref>        Read a versioned knowledge snapshot
  prodocs runbook plan <id>             Produce a content-bound execution plan
  prodocs runbook verify <id>           Verify an explicitly approved runbook
  prodocs serve                         Start the optional collaboration API

Common options:
  --root <directory>                    Project root (default: current directory)
  --json                                Emit machine-readable output
  --help                                Show help
  --version                             Show version

Safety:
  Repository content is always treated as untrusted data. Model egress and
  runbook/proposal writes require explicit, content-bound approval.
`;
}

function rootFrom(args) {
  const index = args.indexOf("--root");
  return path.resolve(
    index >= 0 && args[index + 1] ? args[index + 1] : process.cwd()
  );
}

async function readManifest(root, config) {
  const outputPath = await resolveOutputPath(root, config.output);
  const manifestPath = path.join(outputPath, "manifest.json");
  try {
    const { contents } = await readRegularFile(manifestPath, {
      maxBytes: 1024 * 1024
    });
    return JSON.parse(contents);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw new Error(`Could not read generated manifest: ${error.message}`);
  }
}

async function writeRepositoryJson(root, relativePath, value) {
  const normalized = normalizeRepositoryPath(relativePath, "Output path");
  const absoluteRoot = path.resolve(root);
  const absolute = path.resolve(absoluteRoot, normalized);
  if (!isInside(absoluteRoot, absolute)) {
    throw new Error("Output path escapes the repository.");
  }
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  await atomicWriteFile(absolute, `${JSON.stringify(value, null, 2)}\n`);
  return normalized;
}

async function init(root, _args, json) {
  const configResult = await writeDefaultConfig(root);
  const integrations = await writeIntegrations(root);
  const result = { root, config: configResult, integrations };
  if (json) return console.log(JSON.stringify(result, null, 2));
  console.log(
    `${configResult.created ? "Created" : "Kept"} ${path.relative(root, configResult.path)}`
  );
  for (const integration of integrations) {
    console.log(
      `${integration.created ? "Created" : "Kept"} ${path.relative(root, integration.path)}`
    );
  }
  console.log("\nNext: add authored knowledge, then run `prodocs sync`.");
}

async function sync(root, _args, json) {
  const config = await loadConfig(root);
  const graph = await scanProject(root, config, { indexMode: "write" });
  const existingManifest = await readManifest(root, config);
  if (
    existingManifest?.inputHash === graph.inputHash &&
    existingManifest.generatedAt
  ) {
    graph.generatedAt = existingManifest.generatedAt;
  }
  const artifacts = await writeArtifacts(root, config, graph);
  const result = { graph, artifacts };
  if (json) return console.log(JSON.stringify(result, null, 2));
  console.log(
    `Indexed ${graph.stats.files} files, ${graph.stats.symbols} symbols, ${graph.stats.knowledge.total} authored knowledge items, and ${graph.stats.edges} relationships.`
  );
  console.log(
    `SQLite cache: ${graph.runtime.index.cacheHits} hit(s), ${graph.runtime.index.cacheMisses} miss(es).`
  );
  console.log(
    `Wrote ${artifacts.length} artifacts to ${path.relative(root, path.dirname(artifacts[0]))}.`
  );
}

async function freshness(root) {
  const config = await loadConfig(root);
  const [graph, manifest] = await Promise.all([
    scanProject(root, config, { indexMode: "read" }),
    readManifest(root, config)
  ]);
  return {
    fresh:
      manifest?.sourceHash === graph.sourceHash &&
      manifest?.knowledgeHash === graph.knowledgeHash &&
      manifest?.inputHash === graph.inputHash,
    graph,
    manifest,
    config
  };
}

async function check(root, _args, json) {
  const result = await freshness(root);
  const output = {
    fresh: result.fresh,
    currentSourceHash: result.graph.sourceHash,
    documentedSourceHash: result.manifest?.sourceHash ?? null,
    currentKnowledgeHash: result.graph.knowledgeHash,
    documentedKnowledgeHash: result.manifest?.knowledgeHash ?? null,
    currentInputHash: result.graph.inputHash,
    documentedInputHash: result.manifest?.inputHash ?? null,
    knowledge: result.graph.stats.knowledge
  };
  if (json) console.log(JSON.stringify(output, null, 2));
  else if (result.fresh) {
    console.log(
      `Documentation and authored knowledge are fresh (${result.graph.sourceHash.slice(0, 12)}).`
    );
  } else {
    console.error(
      result.manifest
        ? "Documentation is stale. Run `prodocs sync` and commit the result."
        : "Documentation has not been generated. Run `prodocs sync`."
    );
  }
  if (!result.fresh) process.exitCode = 1;
}

async function status(root, _args, json) {
  const result = await freshness(root);
  const output = {
    fresh: result.fresh,
    generatedAt: result.manifest?.generatedAt ?? null,
    sourceHash: result.graph.sourceHash,
    knowledgeHash: result.graph.knowledgeHash,
    inputHash: result.graph.inputHash,
    stats: result.graph.stats,
    output: result.config.output
  };
  if (json) return console.log(JSON.stringify(output, null, 2));
  console.log(`Documentation: ${output.fresh ? "fresh" : "stale or missing"}`);
  console.log(
    `Files: ${output.stats.files}  Symbols: ${output.stats.symbols}  Knowledge: ${output.stats.knowledge.total}  Relationships: ${output.stats.edges}`
  );
  console.log(
    `Unsupported: ${output.stats.knowledge.unsupported}  Contradictions: ${output.stats.knowledge.contradictions}`
  );
  console.log(`Output: ${output.output}`);
}

async function context(root, args, json) {
  const requestedPaths = valuesAfter(args, "--path");
  if (requestedPaths.length === 0) {
    throw new Error("`context` requires at least one --path <path>.");
  }
  const config = await loadConfig(root);
  const [graph, manifest] = await Promise.all([
    scanProject(root, config, { indexMode: "read" }),
    readManifest(root, config)
  ]);
  const result = buildContextPacket(graph, requestedPaths, manifest, {
    task: valueAfter(args, "--task"),
    maxFiles: integerAfter(
      args,
      "--max-files",
      config.limits.maxContextFiles
    ),
    maxTokens: integerAfter(
      args,
      "--max-tokens",
      config.limits.maxContextTokens
    )
  });
  if (json) return console.log(JSON.stringify(result, null, 2));
  if (result.nodes.length === 0) {
    return console.log("No indexed knowledge matched the requested path.");
  }
  for (const node of result.nodes) {
    const marker = node.selection.reason === "requested" ? "*" : " ";
    console.log(
      `${marker} ${node.path} — ${node.type}${node.language ? `, ${node.language}` : ""}`
    );
  }
  console.log(
    `\n${result.stats.relationships} relationships; approximately ${result.stats.estimatedTokens} tokens${result.request.budget.truncated ? `; ${result.stats.omittedNodes} nodes omitted by budget` : ""}.`
  );
  console.log(`Documentation: ${result.freshness.status}`);
}

async function impact(root, args, json) {
  const config = await loadConfig(root);
  const graph = await scanProject(root, config, { indexMode: "read" });
  const positional = args[1] && !args[1].startsWith("-") ? args[1] : null;
  const report = await analyzeImpact(root, graph, {
    range: positional,
    base: valueAfter(args, "--base")
  });
  const patchPath = valueAfter(args, "--patch");
  const output = patchPath
    ? {
        impact: report,
        proposalPath: await writeRepositoryJson(
          root,
          patchPath,
          createImpactProposal(report)
        )
      }
    : report;
  if (json || patchPath) return console.log(JSON.stringify(output, null, 2));
  console.log(
    `${report.changes.length} changed path(s); ${Object.values(report.affected).flat().length} affected graph item(s).`
  );
  for (const [kind, values] of Object.entries(report.affected)) {
    if (values.length) console.log(`${kind}: ${values.map((item) => item.id).join(", ")}`);
  }
}

async function policy(root, _args, json) {
  const config = await loadConfig(root);
  const graph = await scanProject(root, config, { indexMode: "read" });
  const report = evaluatePolicies(graph, config);
  if (json) console.log(JSON.stringify(report, null, 2));
  else if (report.passed) console.log("All documentation contracts passed.");
  else {
    for (const item of report.violations) {
      console.error(`${item.policy}: ${item.path} — ${item.message}`);
    }
  }
  if (!report.passed) process.exitCode = 1;
}

async function proposal(root, args, json) {
  const action = args[1];
  const file = args[2] ?? valueAfter(args, "--file");
  if (!["validate", "apply"].includes(action) || !file) {
    throw new Error("Use `prodocs proposal validate|apply <file>`.");
  }
  const proposalValue = await readProposal(path.resolve(root, file));
  if (action === "validate") {
    const result = {
      valid: true,
      mode: proposalValue.mode,
      operations: proposalValue.operations.length,
      approvalHash: proposalValue.approvalHash
    };
    return console.log(json ? JSON.stringify(result, null, 2) : `Valid proposal ${result.approvalHash}.`);
  }
  const config = await loadConfig(root);
  const result = await applyProposal(
    root,
    config,
    proposalValue,
    valueAfter(args, "--approve")
  );
  console.log(json ? JSON.stringify(result, null, 2) : `Applied ${result.applied.length} authored documentation operation(s).`);
}

async function propose(root, args, json) {
  const impactFile = valueAfter(args, "--impact");
  if (!impactFile) throw new Error("`propose` requires --impact <file>.");
  const { contents } = await readRegularFile(path.resolve(root, impactFile), {
    maxBytes: 8 * 1024 * 1024
  });
  const impactValue = JSON.parse(contents);
  const config = await loadConfig(root);
  const provider = valueAfter(args, "--provider", "template");
  const result =
    provider === "template"
      ? templateProposal(impactValue)
      : provider === "openai-compatible"
        ? await openAiCompatibleProposal(impactValue, {
            endpoint: valueAfter(args, "--endpoint"),
            model: valueAfter(args, "--model"),
            allowNetwork: hasFlag(args, "--allow-network"),
            maxBytes: config.limits.maxProviderBytes
          })
        : (() => {
            throw new Error(`Unknown provider: ${provider}`);
          })();
  const outputPath = valueAfter(args, "--output");
  if (outputPath) await writeRepositoryJson(root, outputPath, result);
  console.log(json || !outputPath ? JSON.stringify(result, null, 2) : `Wrote ${outputPath}.`);
}

async function evaluate(root, args, json) {
  const suitePath = valueAfter(args, "--suite");
  if (!suitePath) throw new Error("`evaluate` requires --suite <file>.");
  const config = await loadConfig(root);
  const [graph, manifest, suite] = await Promise.all([
    scanProject(root, config, { indexMode: "read" }),
    readManifest(root, config),
    readEvaluationSuite(path.resolve(root, suitePath))
  ]);
  const result = evaluateContextSuite(graph, manifest, suite, {
    maxFiles: config.limits.maxContextFiles,
    maxTokens: config.limits.maxContextTokens
  });
  if (json) console.log(JSON.stringify(result, null, 2));
  else console.log(
    `${result.summary.passed}/${result.summary.cases} context cases passed; recall ${result.summary.meanRecall.toFixed(3)}, precision ${result.summary.meanPrecision.toFixed(3)}, ${result.summary.totalTokens} tokens.`
  );
  if (!result.passed) process.exitCode = 1;
}

async function plugin(root, args, json) {
  if (args[1] !== "verify" || !args[2]) {
    throw new Error("Use `prodocs plugin verify <plugin.json>`.");
  }
  const result = await verifyDeclarativePlugin(path.resolve(root, args[2]));
  console.log(json ? JSON.stringify(result, null, 2) : `${result.passed ? "Passed" : "Failed"} ${result.fixtures} fixture(s) for ${result.plugin}.`);
  if (!result.passed) process.exitCode = 1;
}

async function hooks(root, args, json) {
  if (args[1] !== "install") {
    throw new Error("Use `prodocs hooks install`.");
  }
  const result = await installGitHooks(root, {
    force: hasFlag(args, "--force")
  });
  console.log(
    json
      ? JSON.stringify(result, null, 2)
      : `Installed ${result.path}; pre-push now runs ${result.checks.join(", ")}.`
  );
}

async function view(root, args) {
  const audience = valueAfter(args, "--audience");
  if (!audience) throw new Error("`view` requires --audience <name>.");
  const config = await loadConfig(root);
  const at = valueAfter(args, "--at");
  const graph = at
    ? (await readHistoricalGraph(root, config.output, at)).graph
    : await scanProject(root, config, { indexMode: "read" });
  console.log(renderAudienceView(graph, config, audience));
}

async function history(root, args, json) {
  const reference = valueAfter(args, "--at");
  if (!reference) throw new Error("`history` requires --at <git-ref>.");
  const config = await loadConfig(root);
  const result = await readHistoricalGraph(root, config.output, reference);
  console.log(
    json
      ? JSON.stringify(result, null, 2)
      : `${result.reference}: ${result.generatedAt}, source ${result.sourceHash.slice(0, 12)}, knowledge ${result.knowledgeHash?.slice(0, 12) ?? "legacy"}.`
  );
}

async function runbook(root, args, json) {
  const action = args[1];
  const id = args[2];
  if (!["plan", "verify"].includes(action) || !id) {
    throw new Error("Use `prodocs runbook plan|verify <id>`.");
  }
  const config = await loadConfig(root);
  const graph = await scanProject(root, config, { indexMode: "read" });
  if (action === "plan") {
    const result = runbookPlan(graph, id);
    return console.log(json ? JSON.stringify(result, null, 2) : JSON.stringify(result, null, 2));
  }
  try {
    const result = await verifyRunbook(
      root,
      graph,
      id,
      valueAfter(args, "--approve")
    );
    console.log(json ? JSON.stringify(result, null, 2) : `${result.passed ? "Passed" : "Failed"} ${result.results.length}/${result.plan.steps.length} runbook step(s).`);
    if (!result.passed) process.exitCode = 1;
  } catch (error) {
    if (error.plan) console.error(JSON.stringify(error.plan, null, 2));
    throw error;
  }
}

function capabilities(json) {
  const result = {
    version: VERSION,
    graphSchema: 2,
    contextSchema: 2,
    commands: [
      "init", "sync", "check", "status", "context", "impact", "policy",
      "propose", "proposal", "mcp", "evaluate", "plugin", "hooks", "view", "history",
      "runbook", "serve"
    ],
    collectors: [
      "JavaScript/TypeScript AST", "multi-language patterns", "OpenAPI",
      "SQL schema", "CODEOWNERS", "test relationships", "declarative plugins"
    ],
    adapters: ["Markdown", "JSON", "MCP stdio", "HTTP collaboration API"]
  };
  console.log(json ? JSON.stringify(result, null, 2) : JSON.stringify(result, null, 2));
}

async function serve(root, args) {
  const host = valueAfter(args, "--host", "127.0.0.1");
  const port = integerAfter(args, "--port", 43110);
  const server = await listenForCollaboration(root, { host, port });
  const address = server.address();
  console.log(`ProDocs collaboration API listening on http://${host}:${address.port}`);
  await new Promise((resolve) => server.once("close", resolve));
}

export async function run(args) {
  if (hasFlag(args, "--help") || hasFlag(args, "-h")) {
    return console.log(help());
  }
  if (hasFlag(args, "--version") || hasFlag(args, "-v")) {
    return console.log(VERSION);
  }
  const command = args[0] ?? "status";
  const root = rootFrom(args);
  const json = hasFlag(args, "--json");
  const commands = {
    init,
    sync,
    check,
    status,
    context,
    impact,
    policy,
    proposal,
    propose,
    evaluate,
    plugin,
    hooks,
    view,
    history,
    runbook
  };
  if (command === "mcp") return runMcpServer(root);
  if (command === "capabilities") return capabilities(json);
  if (command === "serve") return serve(root, args);
  if (commands[command]) return commands[command](root, args, json);
  throw new Error(`Unknown command "${command}". Run \`prodocs --help\`.`);
}

export { validateProposal };
