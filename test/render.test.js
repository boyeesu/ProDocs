import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { DEFAULT_CONFIG } from "../src/constants.js";
import { writeArtifacts } from "../src/render.js";

function graph() {
  return {
    schemaVersion: 1,
    generatedAt: "2026-07-29T00:00:00.000Z",
    sourceHash: "a".repeat(64),
    inputHash: "b".repeat(64),
    root: ".",
    stats: {
      files: 1,
      lines: 1,
      symbols: 0,
      edges: 0,
      languages: { JavaScript: 1 }
    },
    nodes: [
      {
        id: "file:src/a file.js",
        type: "file",
        path: "src/a file.js",
        language: "JavaScript",
        contentHash: "c".repeat(64),
        lines: 1,
        owner: "<team>",
        entrypoint: true,
        symbols: []
      }
    ],
    edges: []
  };
}

test("rendered links follow custom output directories and encode paths", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "prodocs-render-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const config = {
    ...structuredClone(DEFAULT_CONFIG),
    output: ".generated/docs",
    documentation: {
      productName: "<Product>",
      oneLineDescription: "A <safe> description.",
      audiences: []
    }
  };

  await writeArtifacts(root, config, graph());
  const overview = await fs.readFile(
    path.join(root, ".generated", "docs", "SYSTEM_OVERVIEW.md"),
    "utf8"
  );

  assert.match(overview, /\.\.\/\.\.\/src\/a%20file\.js/);
  assert.match(overview, /&lt;Product&gt;/);
  assert.match(overview, /&lt;team&gt;/);
  assert.doesNotMatch(overview, /<Product>/);
});
