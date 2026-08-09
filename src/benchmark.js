import { performance } from "node:perf_hooks";
import { evaluateContextSuite } from "./evaluate.js";
import { scanProject } from "./scanner.js";

async function timed(operation) {
  const start = performance.now();
  const value = await operation();
  return { value, milliseconds: Number((performance.now() - start).toFixed(3)) };
}

export async function benchmarkProject(root, config, manifest, suite) {
  const cold = await timed(() => scanProject(root, config, { indexMode: "write" }));
  const warm = await timed(() => scanProject(root, config, { indexMode: "write" }));
  const evaluation = evaluateContextSuite(warm.value, manifest, suite, {
    maxFiles: config.limits.maxContextFiles,
    maxTokens: config.limits.maxContextTokens
  });
  const misses = warm.value.runtime.index.cacheMisses;
  const hits = warm.value.runtime.index.cacheHits;
  return {
    schemaVersion: 1,
    kind: "prodocs.product-benchmark",
    privacy: "local-only; no telemetry or repository content is transmitted",
    repository: {
      files: warm.value.stats.files,
      symbols: warm.value.stats.symbols,
      relationships: warm.value.stats.edges,
      knowledge: warm.value.stats.knowledge.total
    },
    indexing: {
      coldMilliseconds: cold.milliseconds,
      warmMilliseconds: warm.milliseconds,
      warmCacheHits: hits,
      warmCacheMisses: misses,
      warmCacheHitRate: hits + misses === 0 ? 1 : hits / (hits + misses)
    },
    context: evaluation
  };
}
