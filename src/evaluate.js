import { buildContextPacket } from "./context.js";
import { readRegularFile } from "./safe-fs.js";

export async function readEvaluationSuite(filePath) {
  const { contents } = await readRegularFile(filePath, {
    maxBytes: 4 * 1024 * 1024
  });
  const suite = JSON.parse(contents);
  if (
    !suite ||
    typeof suite !== "object" ||
    suite.schemaVersion !== 1 ||
    !Array.isArray(suite.cases) ||
    suite.cases.length === 0 ||
    suite.cases.length > 1000
  ) {
    throw new Error("Invalid ProDocs context evaluation suite.");
  }
  return suite;
}

export function evaluateContextSuite(graph, manifest, suite, defaults = {}) {
  const cases = suite.cases.map((item, index) => {
    if (
      !item ||
      typeof item.name !== "string" ||
      !Array.isArray(item.paths) ||
      !Array.isArray(item.expectedPaths)
    ) {
      throw new Error(`Invalid evaluation case at index ${index}.`);
    }
    const packet = buildContextPacket(graph, item.paths, manifest, {
      task: item.task,
      maxFiles: item.maxFiles ?? defaults.maxFiles,
      maxTokens: item.maxTokens ?? defaults.maxTokens
    });
    const actualPaths = new Set(
      packet.nodes
        .filter((node) => node.type === "file")
        .map((node) => node.path)
    );
    const expected = new Set(item.expectedPaths);
    const unwanted = new Set(item.unwantedPaths ?? []);
    const hits = [...expected].filter((value) => actualPaths.has(value)).length;
    const falsePositives = [...unwanted].filter((value) =>
      actualPaths.has(value)
    ).length;
    const recall = expected.size === 0 ? 1 : hits / expected.size;
    const precision =
      actualPaths.size === 0
        ? expected.size === 0
          ? 1
          : 0
        : Math.max(0, (actualPaths.size - falsePositives) / actualPaths.size);
    const passed =
      recall === 1 &&
      falsePositives === 0 &&
      packet.stats.estimatedTokens <=
        (item.maxTokens ?? defaults.maxTokens);
    return {
      name: item.name,
      agent: item.agent ?? "generic",
      passed,
      recall,
      precision,
      expected: expected.size,
      returned: actualPaths.size,
      tokens: packet.stats.estimatedTokens,
      truncated: packet.request.budget.truncated
    };
  });
  return {
    schemaVersion: 1,
    kind: "prodocs.context-evaluation",
    passed: cases.every((item) => item.passed),
    summary: {
      cases: cases.length,
      passed: cases.filter((item) => item.passed).length,
      meanRecall:
        cases.reduce((total, item) => total + item.recall, 0) / cases.length,
      meanPrecision:
        cases.reduce((total, item) => total + item.precision, 0) / cases.length,
      totalTokens: cases.reduce((total, item) => total + item.tokens, 0)
    },
    byAgent: Object.fromEntries(
      [...new Set(cases.map((item) => item.agent))]
        .sort()
        .map((agent) => {
          const selected = cases.filter((item) => item.agent === agent);
          return [
            agent,
            {
              cases: selected.length,
              passed: selected.filter((item) => item.passed).length,
              meanRecall:
                selected.reduce((total, item) => total + item.recall, 0) /
                selected.length,
              meanPrecision:
                selected.reduce((total, item) => total + item.precision, 0) /
                selected.length,
              totalTokens: selected.reduce((total, item) => total + item.tokens, 0)
            }
          ];
        })
    ),
    cases
  };
}
