import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { DEFAULT_CONFIG } from "../src/constants.js";
import { matchesGlob, scanProject } from "../src/scanner.js";

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "prodocs-test-"));
  await fs.mkdir(path.join(root, "src"));
  await fs.writeFile(
    path.join(root, "src", "main.js"),
    'import { greet } from "./greet.js";\nexport function run() { return greet("world"); }\n'
  );
  await fs.writeFile(
    path.join(root, "src", "greet.js"),
    "export function greet(name) { return `hello ${name}`; }\n"
  );
  return root;
}

test("scanProject indexes symbols, entrypoints, and local imports", async (t) => {
  const root = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  const graph = await scanProject(root, DEFAULT_CONFIG);

  assert.equal(graph.stats.files, 2);
  assert.equal(graph.stats.symbols, 2);
  assert.equal(graph.stats.edges, 1);
  assert.equal(
    graph.nodes.find((node) => node.path === "src/main.js").entrypoint,
    true
  );
  assert.deepEqual(graph.edges[0], {
    type: "imports",
    from: "file:src/main.js",
    to: "file:src/greet.js",
    evidence: {
      source: "src/main.js",
      specifier: "./greet.js"
    }
  });
});

test("scanProject resolves JSONC TypeScript path aliases", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "prodocs-alias-test-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, "src", "lib"), { recursive: true });
  await fs.writeFile(
    path.join(root, "src", "main.ts"),
    'import { greet } from "@/lib/greet";\nexport const result = greet();\n'
  );
  await fs.writeFile(
    path.join(root, "src", "lib", "greet.ts"),
    'export function greet() { return "hello"; }\n'
  );
  await fs.writeFile(
    path.join(root, "tsconfig.json"),
    `{
      // TypeScript permits comments and trailing commas.
      "compilerOptions": {
        "baseUrl": ".",
        "paths": { "@/*": ["src/*",], },
      },
    }\n`
  );

  const graph = await scanProject(root, DEFAULT_CONFIG);

  assert.equal(graph.stats.edges, 1);
  assert.equal(graph.runtime.resolution.resolved, 1);
  assert.equal(graph.runtime.resolution.aliases, 1);
  assert.equal(graph.runtime.resolution.unresolvedLocal, 0);
  assert.deepEqual(graph.runtime.resolution.unresolved, []);
  assert.deepEqual(graph.edges[0], {
    type: "imports",
    from: "file:src/main.ts",
    to: "file:src/lib/greet.ts",
    evidence: { source: "src/main.ts", specifier: "@/lib/greet" }
  });
});

test("module resolution configuration participates in the input hash", async (t) => {
  const root = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const first = await scanProject(root, DEFAULT_CONFIG);
  await fs.writeFile(
    path.join(root, "tsconfig.json"),
    '{"compilerOptions":{"paths":{"@/*":["src/*"]}}}\n'
  );
  const configured = await scanProject(root, DEFAULT_CONFIG);

  assert.equal(configured.sourceHash, first.sourceHash);
  assert.notEqual(configured.inputHash, first.inputHash);
});

test("stylesheet imports are assets rather than unresolved source", async (t) => {
  const root = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.appendFile(path.join(root, "src", "main.js"), 'import "./app.css";\n');
  const graph = await scanProject(root, DEFAULT_CONFIG);

  assert.equal(graph.runtime.resolution.unresolvedLocal, 0);
  assert.equal(graph.runtime.resolution.external, 1);
});

test("source hash is deterministic and changes with evidence", async (t) => {
  const root = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  const first = await scanProject(root, DEFAULT_CONFIG);
  const second = await scanProject(root, DEFAULT_CONFIG);
  assert.equal(first.sourceHash, second.sourceHash);

  await fs.appendFile(path.join(root, "src", "greet.js"), "\nexport const version = 1;\n");
  const changed = await scanProject(root, DEFAULT_CONFIG);
  assert.notEqual(first.sourceHash, changed.sourceHash);
});

test("source hash is stable across operating-system line endings", async (t) => {
  const root = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  const initial = await scanProject(root, structuredClone(DEFAULT_CONFIG));
  const sourcePath = path.join(root, "src", "main.js");
  const source = await fs.readFile(sourcePath, "utf8");
  await fs.writeFile(sourcePath, source.replaceAll("\n", "\r\n"));
  const windowsStyle = await scanProject(
    root,
    structuredClone(DEFAULT_CONFIG)
  );

  assert.equal(windowsStyle.sourceHash, initial.sourceHash);
});

test("input hash changes when documentation configuration changes", async (t) => {
  const root = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  const first = await scanProject(root, DEFAULT_CONFIG);
  const changed = await scanProject(root, {
    ...DEFAULT_CONFIG,
    documentation: {
      ...DEFAULT_CONFIG.documentation,
      productName: "Changed"
    }
  });

  assert.equal(first.sourceHash, changed.sourceHash);
  assert.notEqual(first.inputHash, changed.inputHash);
});

test("configured source and include scopes are enforced", async (t) => {
  const root = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, "ignored"));
  await fs.writeFile(path.join(root, "ignored", "other.js"), "export const other = true;\n");
  await fs.writeFile(path.join(root, "src", "ignored.ts"), "export const ignored = true;\n");

  const graph = await scanProject(root, {
    ...DEFAULT_CONFIG,
    source: ["src"],
    include: ["**/*.js"]
  });

  assert.deepEqual(
    graph.nodes.map((node) => node.path).sort(),
    ["src/greet.js", "src/main.js"]
  );
});

test("configured sources cannot escape the project root", async (t) => {
  const root = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  await assert.rejects(
    scanProject(root, { ...DEFAULT_CONFIG, source: ["../"] }),
    /escapes the project root/
  );
});

test("glob matching is bounded and preserves globstar semantics", () => {
  assert.equal(matchesGlob("**/*.js", "main.js"), true);
  assert.equal(matchesGlob("**/*.js", "src/deep/main.js"), true);
  assert.equal(matchesGlob("src/?ain.*", "src/main.js"), true);
  assert.equal(matchesGlob("src/*.js", "src/deep/main.js"), false);
  assert.equal(matchesGlob("src/**/x.js", "src/foox.js"), false);
  assert.equal(matchesGlob("src/**/x.js", "src/deep/x.js"), true);
  assert.equal(matchesGlob("**/*.js", "src/main.ts"), false);

  const adversarial = `${"*".repeat(256)}.js`;
  assert.equal(matchesGlob(adversarial, `${"a".repeat(4096)}.js`), true);
});

test("scanProject enforces file count and byte limits", async (t) => {
  const root = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  await assert.rejects(
    scanProject(root, {
      ...structuredClone(DEFAULT_CONFIG),
      limits: {
        ...DEFAULT_CONFIG.limits,
        maxFiles: 1
      }
    }),
    /exceeded limits.maxFiles/
  );
  await assert.rejects(
    scanProject(root, {
      ...structuredClone(DEFAULT_CONFIG),
      limits: {
        ...DEFAULT_CONFIG.limits,
        maxFileSizeBytes: 1
      }
    }),
    /File exceeds the configured 1-byte limit/
  );
  await assert.rejects(
    scanProject(root, {
      ...structuredClone(DEFAULT_CONFIG),
      limits: {
        ...DEFAULT_CONFIG.limits,
        maxTotalBytes: 1
      }
    }),
    /limits.maxTotalBytes/
  );
});

test("scanProject refuses incomplete evidence when parser diagnostics are errors", async (t) => {
  const root = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(
    path.join(root, "src", "broken.ts"),
    "export const broken = ;\n"
  );

  await assert.rejects(
    scanProject(root, DEFAULT_CONFIG),
    /Could not parse src\/broken\.ts with babel-javascript-typescript/
  );
});

test("scanProject accepts evidence recovered from intentionally invalid type tests", async (t) => {
  const root = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(
    path.join(root, "src", "type-test.ts"),
    "type Duplicate = 1;\ntype Duplicate = 2;\n"
  );

  const graph = await scanProject(root, DEFAULT_CONFIG);
  const typeTest = graph.nodes.find(
    (node) => node.path === "src/type-test.ts"
  );

  assert.deepEqual(typeTest.symbols, [
    { name: "Duplicate", kind: "type", line: 1 },
    { name: "Duplicate", kind: "type", line: 2 }
  ]);
});

test("scanProject supports modern JavaScript and TypeScript module extensions", async (t) => {
  const root = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(
    path.join(root, "src", "module.mts"),
    'export { greet } from "./greet.js";\n'
  );
  await fs.writeFile(
    path.join(root, "src", "consumer.cjs"),
    'const module = require("./module.mts");\n'
  );

  const graph = await scanProject(root, DEFAULT_CONFIG);

  assert.equal(
    graph.nodes.find((node) => node.path === "src/module.mts").language,
    "TypeScript"
  );
  assert.equal(
    graph.nodes.find((node) => node.path === "src/consumer.cjs").language,
    "JavaScript"
  );
  assert.equal(
    graph.edges.some(
      (edge) =>
        edge.from === "file:src/consumer.cjs" &&
        edge.to === "file:src/module.mts"
    ),
    true
  );
});

test("scanProject resolves NodeNext runtime extensions to TypeScript sources", async (t) => {
  const root = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(
    path.join(root, "src", "consumer.ts"),
    [
      'import { typescript } from "./typescript.js";',
      'import { view } from "./view.js";',
      'import { component } from "./component.jsx";',
      'import { module } from "./module.mjs";',
      'import { commonjs } from "./commonjs.cjs";',
      'import type { Declared } from "./declared.js";',
      'import type { ESM } from "./esm-types.mjs";',
      'import type { CJS } from "./cjs-types.cjs";',
      'export { exported } from "./exported.js";',
      'const lazy = import("./lazy.js");',
      'const required = require("./required.js");',
      'import "./folder/index.js";',
      'import "./missing.js";'
    ].join("\n")
  );
  await fs.writeFile(
    path.join(root, "src", "view.tsx"),
    "export const view = true;\n"
  );
  await fs.writeFile(
    path.join(root, "src", "typescript.ts"),
    "export const typescript = true;\n"
  );
  await fs.writeFile(
    path.join(root, "src", "component.tsx"),
    "export const component = true;\n"
  );
  await fs.writeFile(
    path.join(root, "src", "module.mts"),
    "export const module = true;\n"
  );
  await fs.writeFile(
    path.join(root, "src", "commonjs.cts"),
    "export const commonjs = true;\n"
  );
  await fs.writeFile(
    path.join(root, "src", "declared.d.ts"),
    "export interface Declared { value: string }\n"
  );
  await fs.writeFile(
    path.join(root, "src", "esm-types.d.mts"),
    "export interface ESM { value: string }\n"
  );
  await fs.writeFile(
    path.join(root, "src", "cjs-types.d.cts"),
    "export interface CJS { value: string }\n"
  );
  for (const name of ["exported", "lazy", "required"]) {
    await fs.writeFile(
      path.join(root, "src", `${name}.ts`),
      `export const ${name} = true;\n`
    );
  }
  await fs.mkdir(path.join(root, "src", "folder"));
  await fs.writeFile(
    path.join(root, "src", "folder", "index.ts"),
    "export const folder = true;\n"
  );

  const graph = await scanProject(root, DEFAULT_CONFIG);
  const targets = graph.edges
    .filter((edge) => edge.from === "file:src/consumer.ts")
    .map((edge) => edge.to)
    .sort();

  assert.deepEqual(targets, [
    "file:src/cjs-types.d.cts",
    "file:src/commonjs.cts",
    "file:src/component.tsx",
    "file:src/declared.d.ts",
    "file:src/esm-types.d.mts",
    "file:src/exported.ts",
    "file:src/folder/index.ts",
    "file:src/lazy.ts",
    "file:src/module.mts",
    "file:src/required.ts",
    "file:src/typescript.ts",
    "file:src/view.tsx"
  ]);
});

test("scanProject prefers an existing runtime file over a TypeScript substitute", async (t) => {
  const root = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(
    path.join(root, "src", "consumer.ts"),
    'import { target } from "./target.js";\n'
  );
  await fs.writeFile(
    path.join(root, "src", "target.js"),
    "export const target = 'javascript';\n"
  );
  await fs.writeFile(
    path.join(root, "src", "target.ts"),
    "export const target = 'typescript';\n"
  );

  const graph = await scanProject(root, DEFAULT_CONFIG);
  const edge = graph.edges.find(
    (candidate) => candidate.from === "file:src/consumer.ts"
  );

  assert.equal(edge.to, "file:src/target.js");
});

test("scanProject resolves tsconfig path aliases and baseUrl imports", async (t) => {
  const root = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(
    path.join(root, "src", "greet.ts"),
    "export function greet(name: string) { return `hello ${name}`; }\n"
  );
  await fs.writeFile(
    path.join(root, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        baseUrl: ".",
        paths: { "@/*": ["src/*"], "@config": ["src/greet.ts"] }
      }
    })
  );
  await fs.writeFile(
    path.join(root, "src", "aliased.ts"),
    [
      'import { greet } from "@/greet";',
      'import { pluginConfig } from "@config";',
      'import { base } from "src/greet";'
    ].join("\n")
  );

  const graph = await scanProject(root, DEFAULT_CONFIG);
  const targets = graph.edges
    .filter((edge) => edge.from === "file:src/aliased.ts")
    .map((edge) => edge.to)
    .sort();

  assert.deepEqual(targets, [
    "file:src/greet.ts",
    "file:src/greet.ts",
    "file:src/greet.ts"
  ]);
  assert.equal(
    graph.edges.filter((edge) => edge.from === "file:src/aliased.ts").length,
    3
  );
});

test("scanProject gives a nested tsconfig precedence for its subtree", async (t) => {
  const root = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, "packages", "api", "src"), { recursive: true });
  await fs.writeFile(
    path.join(root, "tsconfig.json"),
    JSON.stringify({ compilerOptions: { baseUrl: ".", paths: { "@/*": ["src/*"] } } })
  );
  await fs.writeFile(
    path.join(root, "packages", "api", "tsconfig.json"),
    JSON.stringify({
      compilerOptions: { baseUrl: ".", paths: { "@/*": ["src/*"] } }
    })
  );
  await fs.writeFile(
    path.join(root, "packages", "api", "src", "app.ts"),
    'import { env } from "@/config/env.js";\n'
  );
  await fs.mkdir(path.join(root, "packages", "api", "src", "config"));
  await fs.writeFile(
    path.join(root, "packages", "api", "src", "config", "env.ts"),
    "export const env = {};\n"
  );
  await fs.writeFile(
    path.join(root, "src", "config.ts"),
    "export const rootConfig = {};\n"
  );

  const graph = await scanProject(root, DEFAULT_CONFIG);
  const edge = graph.edges.find(
    (candidate) => candidate.from === "file:packages/api/src/app.ts"
  );

  assert.equal(edge.to, "file:packages/api/src/config/env.ts");
});

test("scanProject does not resolve aliases when no tsconfig declares them", async (t) => {
  const root = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(
    path.join(root, "src", "aliased.ts"),
    'import { greet } from "@/greet";\n'
  );

  const graph = await scanProject(root, DEFAULT_CONFIG);

  assert.equal(
    graph.edges.some((edge) => edge.from === "file:src/aliased.ts"),
    false
  );
});

test("scanProject follows relative tsconfig extends chains", async (t) => {
  const root = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(
    path.join(root, "src", "greet.ts"),
    "export function greet(name: string) { return `hello ${name}`; }\n"
  );
  await fs.writeFile(
    path.join(root, "tsconfig.base.json"),
    JSON.stringify({ compilerOptions: { baseUrl: ".", paths: { "@/*": ["src/*"] } } })
  );
  await fs.writeFile(
    path.join(root, "tsconfig.json"),
    JSON.stringify({ extends: "./tsconfig.base.json" })
  );
  await fs.writeFile(
    path.join(root, "src", "aliased.ts"),
    'import { greet } from "@/greet";\n'
  );

  const graph = await scanProject(root, DEFAULT_CONFIG);

  assert.equal(
    graph.edges.some(
      (edge) =>
        edge.from === "file:src/aliased.ts" && edge.to === "file:src/greet.ts"
    ),
    true
  );
});

test("tsconfig alias configuration participates in the input hash", async (t) => {
  const root = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const configPath = path.join(root, "tsconfig.json");
  await fs.writeFile(
    configPath,
    JSON.stringify({ compilerOptions: { baseUrl: ".", paths: { "@/*": ["src/*"] } } })
  );
  const first = await scanProject(root, DEFAULT_CONFIG);
  await fs.writeFile(
    configPath,
    JSON.stringify({
      compilerOptions: { baseUrl: ".", paths: { "#/*": ["src/*"] } }
    })
  );
  const changed = await scanProject(root, DEFAULT_CONFIG);

  assert.equal(first.sourceHash, changed.sourceHash);
  assert.notEqual(first.inputHash, changed.inputHash);
});

test("extensionless TypeScript imports prefer sources without changing JavaScript resolution", async (t) => {
  const root = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, "src", "greet.ts"), "export {};");
  await fs.writeFile(path.join(root, "src", "consumer.ts"), 'import "./greet";');
  await fs.writeFile(path.join(root, "src", "consumer.js"), 'import "./greet";');
  const graph = await scanProject(root, DEFAULT_CONFIG);
  for (const extension of ["js", "ts"]) {
    const edge = graph.edges.find((candidate) => candidate.from === `file:src/consumer.${extension}`);
    assert.equal(edge.to, `file:src/greet.${extension}`);
  }
});

test("Python relative imports and Rust modules retain their resolution", async (t) => {
  const root = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, "src", "python", "nested"), { recursive: true });
  await fs.mkdir(path.join(root, "src", "rust", "child"), { recursive: true });
  for (const [name, contents] of Object.entries({
    "python/main.py": "from .target import value\nfrom .nested import nested\n",
    "python/target.py": "value = 1\n",
    "python/nested/__init__.py": "nested = True\n",
    "python/nested/consumer.py": "from ..target import value\n",
    "rust/main.rs": "mod child;\n",
    "rust/child/mod.rs": "pub fn child() {}\n"
  })) {
    await fs.writeFile(path.join(root, "src", name), contents);
  }
  const graph = await scanProject(root, DEFAULT_CONFIG);
  for (const [from, to] of [
    ["python/main.py", "python/target.py"],
    ["python/main.py", "python/nested/__init__.py"],
    ["python/nested/consumer.py", "python/target.py"],
    ["rust/main.rs", "rust/child/mod.rs"]
  ]) {
    assert.equal(graph.edges.some((edge) =>
      edge.from === `file:src/${from}` && edge.to === `file:src/${to}`
    ), true);
  }
});
