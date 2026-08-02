import { execFile } from "node:child_process";
import { promisify } from "node:util";

const executeFile = promisify(execFile);
const REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/@{}~^:+-]{0,511}$/;

export async function readHistoricalGraph(root, outputPath, reference) {
  if (typeof reference !== "string" || !REF_PATTERN.test(reference)) {
    throw new Error("Historical reference is invalid.");
  }
  const graphPath = `${outputPath.replaceAll("\\", "/")}/knowledge.json`;
  let stdout;
  try {
    ({ stdout } = await executeFile(
      "git",
      ["-C", root, "show", `${reference}:${graphPath}`],
      {
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
        timeout: 30_000,
        windowsHide: true
      }
    ));
  } catch (error) {
    throw new Error(
      `Could not read ProDocs history at ${reference}: ${error.stderr?.trim() || error.message}`
    );
  }
  const graph = JSON.parse(stdout);
  if (
    !graph ||
    ![1, 2].includes(graph.schemaVersion) ||
    !Array.isArray(graph.nodes) ||
    !Array.isArray(graph.edges)
  ) {
    throw new Error(`Historical graph at ${reference} is invalid.`);
  }
  return {
    reference,
    graph,
    generatedAt: graph.generatedAt,
    sourceHash: graph.sourceHash,
    knowledgeHash: graph.knowledgeHash ?? null
  };
}
