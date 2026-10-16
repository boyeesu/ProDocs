import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { testFiles } from "../scripts/test-files.js";
import { isExcluded } from "../src/paths.js";

test("test discovery includes root and tutorial suites but not nested projects", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "prodocs test discovery "));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const included = [
    "test/root.test.js",
    "test/nested/child.test.js",
    "examples/getting-started/test/delivery.test.js"
  ];
  for (const file of [
    ...included,
    "test/helper.js",
    "ProDocs-complete-roadmap/test/failing.test.js",
    "ProDocs-product-launch/test/failing.test.js",
    "another-checkout/test/failing.test.js"
  ]) {
    const target = path.join(root, file);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, "throw new Error('must not execute during discovery');\n");
  }
  assert.deepEqual(testFiles(root), included.map((file) => path.join(root, file)).sort());
});

test("repository indexing excludes nested historical project copies", async () => {
  const config = JSON.parse(await fs.readFile("prodocs.config.json", "utf8"));
  for (const directory of ["ProDocs-complete-roadmap", "ProDocs-product-launch"]) {
    assert.equal(isExcluded(`${directory}/src/cli.js`, config.exclude), true);
  }
  assert.equal(isExcluded("src/cli.js", config.exclude), false);
});
