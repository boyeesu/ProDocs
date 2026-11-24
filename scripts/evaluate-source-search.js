import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { searchSource } from "../src/source-search.js";

const tasks = JSON.parse(
  await readFile(new URL("../fixtures/evaluation/source-search.json", import.meta.url), "utf8")
);
const cases = [];
for (const { task, path, evidence } of tasks) {
  const started = performance.now();
  const response = await searchSource(process.cwd(), { task });
  const milliseconds = Number((performance.now() - started).toFixed(2));
  const rank = response.results.findIndex((item) =>
    item.path === path && item.excerpt.includes(evidence)
  ) + 1;
  cases.push({ task, rank: rank || null, estimatedTokens: response.estimatedTokens, milliseconds });
}
const passed = cases.filter((item) => item.rank !== null).length;
console.log(JSON.stringify({ passed, total: cases.length, cases }, null, 2));
if (passed !== cases.length) process.exitCode = 1;
