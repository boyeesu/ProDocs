import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { performance } from "node:perf_hooks";
import { DEFAULT_CONFIG } from "../src/constants.js";
import { buildContextPacket } from "../src/context.js";
import { scanProject } from "../src/scanner.js";

const repositoryPath = process.argv[2];
const requestedPath = process.argv[3] ?? null;

if (!repositoryPath) {
  console.error(
    "Usage: node scripts/validate-repository.js <repository> [context-path]"
  );
  process.exit(2);
}

const root = await fs.realpath(path.resolve(repositoryPath));
const revisionResult = spawnSync(
  "git",
  ["-C", root, "rev-parse", "HEAD"],
  { encoding: "utf8" }
);
if (revisionResult.status !== 0) {
  throw new Error(
    `Could not identify repository revision: ${revisionResult.stderr.trim()}`
  );
}

const startedAt = performance.now();
const graph = await scanProject(root, structuredClone(DEFAULT_CONFIG));
const elapsedMs = Math.round((performance.now() - startedAt) * 100) / 100;
const selectedPath =
  requestedPath ??
  graph.nodes.find((node) => node.entrypoint)?.path ??
  graph.nodes[0]?.path ??
  null;
const packet = selectedPath
  ? buildContextPacket(graph, [selectedPath], null)
  : null;

console.log(
  JSON.stringify(
    {
      repository: path.basename(root),
      revision: revisionResult.stdout.trim(),
      sourceHash: graph.sourceHash,
      indexing: {
        elapsedMs,
        files: graph.stats.files,
        lines: graph.stats.lines,
        symbols: graph.stats.symbols,
        relationships: graph.stats.edges,
        languages: graph.stats.languages
      },
      context: packet
        ? {
            path: selectedPath,
            files: packet.stats.files,
            relationships: packet.stats.relationships,
            bytes: packet.stats.contextBytes,
            estimatedTokens: packet.stats.estimatedTokens
          }
        : null
    },
    null,
    2
  )
);
