import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  collectSourceEvidence,
  createCollectorRegistry,
  defaultCollectorRegistry,
  defineCollector
} from "@danielesuga/prodocs/collectors";

const fixtures = [
  {
    input: "javascript-module.mjs",
    expected: "javascript-module.expected.json",
    language: "JavaScript"
  },
  {
    input: "typescript-component.tsx",
    expected: "typescript-component.expected.json",
    language: "TypeScript"
  }
];

test("JavaScript and TypeScript collector fixtures conform", async () => {
  for (const fixture of fixtures) {
    const filePath = path.posix.join("fixtures/collectors", fixture.input);
    const [source, expected] = await Promise.all([
      fs.readFile(filePath, "utf8"),
      fs
        .readFile(
          path.posix.join("fixtures/collectors", fixture.expected),
          "utf8"
        )
        .then(JSON.parse)
    ]);

    const evidence = await collectSourceEvidence({
      source,
      filePath,
      language: fixture.language
    });

    assert.deepEqual(evidence, expected);
  }
});

test("parser ignores import-like text and records static import forms", async () => {
  const evidence = await collectSourceEvidence({
    source: [
      'const text = "require(\\"./ignored.js\\")";',
      '// import "./also-ignored.js";',
      'export { value } from "./exported.js";',
      'const lazy = import(`./lazy.js`);',
      'const dynamic = import(`./${name}.js`);'
    ].join("\n"),
    filePath: "src/imports.js",
    language: "JavaScript"
  });

  assert.deepEqual(
    evidence.imports.map((imported) => imported.specifier),
    ["./exported.js", "./lazy.js"]
  );
});

test("parser diagnostics identify malformed source without executing it", async () => {
  const evidence = await collectSourceEvidence({
    source: "export const broken = ;",
    filePath: "src/broken.ts",
    language: "TypeScript"
  });

  assert.equal(evidence.symbols.length, 0);
  assert.equal(evidence.imports.length, 0);
  assert.equal(evidence.diagnostics[0].severity, "error");
  assert.equal(evidence.diagnostics[0].line, 1);
});

test("recoverable parser diagnostics preserve evidence as warnings", async () => {
  const evidence = await collectSourceEvidence({
    source: "type Duplicate = 1;\ntype Duplicate = 2;\n",
    filePath: "test-d/duplicate.ts",
    language: "TypeScript"
  });

  assert.deepEqual(evidence.symbols, [
    { name: "Duplicate", kind: "type", line: 1 },
    { name: "Duplicate", kind: "type", line: 2 }
  ]);
  assert.equal(evidence.diagnostics[0].severity, "warning");
  assert.equal(evidence.diagnostics[0].code, "VarRedeclaration");
});

test("parser covers TypeScript module syntax and destructured declarations", async () => {
  const evidence = await collectSourceEvidence({
    source: [
      'import legacy = require("./legacy.cjs");',
      "export default function () {}",
      "export const { first, nested: { second }, ...rest } = value;",
      "export const [head, , ...tail] = values;",
      "namespace Tools {",
      '  export interface API { "call"(): void }',
      "}",
      "class Secret { #run() {} }"
    ].join("\n"),
    filePath: "src/module.cts",
    language: "TypeScript"
  });

  assert.deepEqual(
    evidence.symbols.map((symbol) => symbol.name),
    [
      "default",
      "first",
      "rest",
      "second",
      "head",
      "tail",
      "Tools",
      "API",
      "API.call",
      "Secret",
      "Secret.#run"
    ]
  );
  assert.deepEqual(evidence.imports, [
    { specifier: "./legacy.cjs", line: 1 }
  ]);
});

test("legacy collectors remain available through the same result contract", async () => {
  const python = await collectSourceEvidence({
    source: "from .service import run\nclass Worker:\n    pass\n",
    filePath: "src/worker.py",
    language: "Python"
  });
  const rust = await collectSourceEvidence({
    source: "pub mod worker;\npub struct Service;\n",
    filePath: "src/lib.rs",
    language: "Rust"
  });

  assert.deepEqual(python.symbols, [
    { name: "Worker", kind: "class", line: 2 }
  ]);
  assert.deepEqual(python.imports, [{ specifier: ".service", line: 1 }]);
  assert.deepEqual(rust.symbols, [
    { name: "Service", kind: "type", line: 2 }
  ]);
  assert.deepEqual(rust.imports, [{ specifier: "./worker", line: 1 }]);
});

test("collector registry exposes stable capabilities and normalizes output", async () => {
  const collector = defineCollector({
    id: "fixture",
    version: 2,
    languages: ["Fixture"],
    extensions: [".fixture"],
    collect() {
      return {
        symbols: [
          { name: "later", kind: "value", line: 2 },
          { name: "first", kind: "function", line: 1 },
          { name: "first", kind: "function", line: 1 }
        ],
        imports: [
          { specifier: "./b", line: 2 },
          { specifier: "./a", line: 1 }
        ],
        diagnostics: []
      };
    }
  });
  const registry = createCollectorRegistry([collector]);

  assert.deepEqual(registry.capabilities(), [
    {
      id: "fixture",
      version: 2,
      languages: ["Fixture"],
      extensions: [".fixture"]
    }
  ]);
  const result = await registry.collect({
    source: "",
    filePath: "sample.fixture",
    language: "Fixture"
  });
  assert.deepEqual(result.symbols, [
    { name: "first", kind: "function", line: 1 },
    { name: "later", kind: "value", line: 2 }
  ]);
  assert.deepEqual(
    result.imports.map((imported) => imported.specifier),
    ["./a", "./b"]
  );
});

test("collector registry selects the most specific compound extension", async () => {
  const general = defineCollector({
    id: "json",
    version: 1,
    languages: ["JSON"],
    extensions: [".json"],
    collect: () => ({ symbols: [], imports: [], diagnostics: [] })
  });
  const schema = defineCollector({
    id: "schema-json",
    version: 1,
    languages: ["Schema"],
    extensions: [".schema.json"],
    collect: () => ({ symbols: [], imports: [], diagnostics: [] })
  });
  const registry = createCollectorRegistry([general, schema]);

  const result = await registry.collect({
    source: "{}",
    filePath: "api.schema.json",
    language: "Schema"
  });

  assert.equal(result.collector.id, "schema-json");
});

test("collector registry rejects ambiguous or malformed collectors", async () => {
  const first = defineCollector({
    id: "first",
    version: 1,
    languages: ["Fixture"],
    extensions: [".fixture"],
    collect: () => ({ symbols: [], imports: [], diagnostics: [] })
  });
  const second = defineCollector({
    id: "second",
    version: 1,
    languages: ["Fixture"],
    extensions: [".fixture"],
    collect: () => ({ symbols: [], imports: [], diagnostics: [] })
  });

  assert.throws(
    () => createCollectorRegistry([first, second]),
    /claimed by both/
  );
  await assert.rejects(
    defaultCollectorRegistry.collect({
      source: "",
      filePath: "README.md",
      language: "Markdown"
    }),
    /No collector is registered/
  );
});

test("collector contract rejects invalid definitions, inputs, and results", async () => {
  assert.throws(() => defineCollector(null), /definition must be an object/);
  assert.throws(
    () =>
      defineCollector({
        id: "Invalid ID",
        version: 1,
        languages: ["Fixture"],
        extensions: [".fixture"],
        collect() {}
      }),
    /collector id/
  );
  assert.throws(
    () =>
      defineCollector({
        id: "fixture",
        version: 0,
        languages: ["Fixture"],
        extensions: [".fixture"],
        collect() {}
      }),
    /positive integer/
  );
  assert.throws(
    () =>
      defineCollector({
        id: "fixture",
        version: 1,
        languages: ["Fixture"],
        extensions: ["fixture"],
        collect() {}
      }),
    /file extension/
  );
  assert.throws(() => createCollectorRegistry([]), /at least one collector/);

  const invalidResult = defineCollector({
    id: "invalid-result",
    version: 1,
    languages: ["Fixture"],
    extensions: [".fixture"],
    collect: () => ({ symbols: "invalid", imports: [], diagnostics: [] })
  });
  const registry = createCollectorRegistry([invalidResult]);

  await assert.rejects(
    registry.collect({
      source: "",
      filePath: "sample.fixture",
      language: "Other"
    }),
    /does not support Other/
  );
  await assert.rejects(
    registry.collect({
      source: "",
      filePath: "sample.fixture",
      language: "Fixture"
    }),
    /symbols must be an array/
  );
});

test("published collector schema describes the normalized result", async () => {
  const schema = JSON.parse(
    await fs.readFile("schemas/collector-result.schema.json", "utf8")
  );

  assert.equal(schema.properties.schemaVersion.const, 1);
  assert.deepEqual(schema.required, [
    "schemaVersion",
    "collector",
    "source",
    "symbols",
    "imports",
    "diagnostics"
  ]);
  assert.equal(schema.additionalProperties, false);
});
