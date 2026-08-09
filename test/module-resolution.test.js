import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  loadModuleResolution,
  resolveImport
} from "../src/module-resolution.js";

async function temporaryRoot(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "prodocs-resolution-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}

test("module resolution falls back to jsconfig and resolves exact aliases", async (t) => {
  const root = await temporaryRoot(t);
  const target = path.join(root, "src", "library", "index.ts");
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, "export const value = true;\n");
  await fs.writeFile(
    path.join(root, "jsconfig.json"),
    `{
      /* URLs such as https://example.test and escaped quotes stay strings. */
      "label": "https://example.test/\\\"config\\\"",
      "compilerOptions": {
        "baseUrl": "src",
        "paths": { "#library": ["library"] }
      }
    }\n`
  );
  const resolution = await loadModuleResolution(root);
  const knownFiles = new Set([target]);

  assert.equal(resolution.source, "jsconfig.json");
  assert.deepEqual(
    resolveImport({
      root,
      fromFile: path.join(root, "src", "main.ts"),
      specifier: "#library",
      language: "TypeScript",
      resolution,
      knownFiles
    }),
    { kind: "alias", targetPath: target }
  );
  assert.deepEqual(
    resolveImport({
      root,
      fromFile: target,
      specifier: "third-party-package",
      language: "TypeScript",
      resolution,
      knownFiles
    }),
    { kind: "external", targetPath: null }
  );
});

test("module resolution rejects malformed and escaping configuration", async (t) => {
  const root = await temporaryRoot(t);
  const cases = [
    ["{", /Could not parse tsconfig\.json/],
    ['{"compilerOptions":{"paths":[]}}', /paths must be an object/],
    ['{"compilerOptions":{"paths":{"@/**":["src/*"]}}}', /Invalid .* pattern/],
    ['{"compilerOptions":{"paths":{"@/*":[]}}}', /must contain 1 to 16 targets/],
    ['{"compilerOptions":{"paths":{"@/*":[""]}}}', /Invalid target/],
    ['{"compilerOptions":{"baseUrl":"/tmp"}}', /baseUrl must be relative/],
    ['{"compilerOptions":{"baseUrl":"../outside"}}', /escapes the project root/]
  ];

  for (const [contents, expected] of cases) {
    await fs.writeFile(path.join(root, "tsconfig.json"), contents);
    await assert.rejects(loadModuleResolution(root), expected);
  }
});

test("Python imports resolve packages and report missing local modules", async (t) => {
  const root = await temporaryRoot(t);
  const packageInit = path.join(root, "src", "helpers", "__init__.py");
  const caller = path.join(root, "src", "main.py");
  await fs.mkdir(path.dirname(packageInit), { recursive: true });
  await fs.writeFile(packageInit, "VALUE = 1\n");
  const resolution = await loadModuleResolution(root);
  const knownFiles = new Set([packageInit, caller]);
  const base = { root, fromFile: caller, language: "Python", resolution, knownFiles };

  assert.deepEqual(resolveImport({ ...base, specifier: ".helpers" }), {
    kind: "relative",
    targetPath: packageInit
  });
  assert.deepEqual(resolveImport({ ...base, specifier: ".missing" }), {
    kind: "unresolved-relative",
    targetPath: undefined
  });
  assert.deepEqual(resolveImport({ ...base, specifier: "requests" }), {
    kind: "external",
    targetPath: null
  });
});
