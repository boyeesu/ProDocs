import fs from "node:fs/promises";
import path from "node:path";
import { DEFAULT_CONFIG } from "./constants.js";
import { resolveOutputPath } from "./paths.js";
import { normalizeRepositoryPath } from "./security.js";

const FILES = {
  "src/delivery.js": `export function retryDelivery(attempt) {
  return attempt < 3 ? "retry" : "failed";
}
`,
  "test/delivery.test.js": `import assert from "node:assert/strict";
import test from "node:test";
import { retryDelivery } from "../src/delivery.js";

test("delivery retries stop after three attempts", () => {
  assert.equal(retryDelivery(1), "retry");
  assert.equal(retryDelivery(3), "failed");
});
`,
  "docs/knowledge/features/delivery-retries.md": `---
kind: feature
id: delivery-retries
title: Delivery retry behavior
status: active
audiences:
  - product
  - support
evidence:
  - src/delivery.js#retryDelivery
  - test/delivery.test.js
customerImpact: Failed deliveries retry automatically before requiring attention.
---
Delivery attempts stop after the reviewed retry limit.
`,
  "CODEOWNERS": `* @example-maintainer
`,
  "package.json": `${JSON.stringify({
    name: "prodocs-getting-started",
    private: true,
    type: "module",
    scripts: { test: "node --test" }
  }, null, 2)}
`,
  "README.md": `# ProDocs getting-started tutorial

From this directory run:

1. \`prodocs sync\`
2. \`prodocs doctor\`
3. \`prodocs context --path src/delivery.js --task "change retry behavior" --json\`
4. Edit \`src/delivery.js\`, then run \`prodocs check\` to see drift.
5. Run \`prodocs sync\`, \`prodocs policy\`, and \`npm test\`.

The example is local-only and sends no repository data over the network.
`
};

export async function createTutorial(root, relativeOutput = "prodocs-tutorial") {
  const output = normalizeRepositoryPath(relativeOutput, "Tutorial output");
  const destination = await resolveOutputPath(root, output);
  try {
    await fs.mkdir(destination, { recursive: false });
  } catch (error) {
    if (error.code === "EEXIST") {
      throw new Error(`Tutorial destination already exists: ${output}`);
    }
    throw error;
  }

  const config = structuredClone(DEFAULT_CONFIG);
  config.documentation.productName = "Delivery Example";
  config.documentation.oneLineDescription =
    "A tiny evidence-backed delivery retry example.";
  config.entrypoints = ["src/delivery.js"];
  const files = {
    ...FILES,
    "prodocs.config.json": `${JSON.stringify(config, null, 2)}\n`
  };

  const written = [];
  for (const [file, contents] of Object.entries(files)) {
    const target = path.join(destination, file);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, contents, { flag: "wx", encoding: "utf8" });
    written.push(path.posix.join(output, file));
  }
  return { output, files: written.sort() };
}
