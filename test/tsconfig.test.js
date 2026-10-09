import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { DEFAULT_CONFIG } from "../src/constants.js";
import { scanProject } from "../src/scanner.js";
import { aliasCandidates } from "../src/tsconfig.js";

async function fixture(t, files) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "prodocs-tsconfig-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  for (const [relative, contents] of Object.entries(files)) {
    const absolute = path.join(root, relative);
    await fs.mkdir(path.dirname(absolute), { recursive: true });
    await fs.writeFile(absolute, typeof contents === "string"
      ? contents
      : JSON.stringify(contents));
  }
  return root;
}

function targets(graph, from = "src/main.ts") {
  return graph.edges
    .filter((edge) => edge.from === `file:${from}`)
    .map((edge) => [edge.evidence.specifier, edge.to]);
}

test("tsconfig JSONC supports comments, BOMs, trailing commas, and escaped strings", async (t) => {
  const root = await fixture(t, {
    "tsconfig.json": '\uFEFF' + String.raw`{
      // Comment containing "quotes" and a trailing comma,
      "$schema": "https://example.com/tsconfig.schema.json",
      "note": "/* literal */ // \"quoted\" ,} ,] \\",
      /* Another
         comment */
      "compilerOptions": {
        "paths": { "@/*": ["src\\*", /* fallback */], },
      },
    } // end`,
    "src/main.ts": 'import "@/target.js";',
    "src/target.ts": "export const target = true;"
  });
  const graph = await scanProject(root, DEFAULT_CONFIG);
  assert.deepEqual(targets(graph), [["@/target.js", "file:src/target.ts"]]);
});

test("tsconfig aliases are discovered above source directories and individual files", async (t) => {
  const root = await fixture(t, {
    "tsconfig.json": { compilerOptions: { paths: { "@/*": ["src/*"] } } },
    "src/main.ts": 'import "@/target.js";',
    "src/target.ts": "export const target = true;",
    "unrelated/tsconfig.json": "not valid JSON",
    "unrelated/main.ts": "export {};"
  });
  for (const source of [["src"], ["src/main.ts", "src/target.ts"], ["src", "src/main.ts"]]) {
    const graph = await scanProject(root, { ...DEFAULT_CONFIG, source });
    assert.deepEqual(targets(graph), [["@/target.js", "file:src/target.ts"]]);
  }
});

test("paths without baseUrl do not turn arbitrary bare imports into local edges", async (t) => {
  const root = await fixture(t, {
    "tsconfig.json": { compilerOptions: { paths: { "@/*": ["src/*"] } } },
    "src/main.ts": 'import "@/target"; import "src/target"; import "node:fs";',
    "src/target.ts": "export const target = true;"
  });
  const graph = await scanProject(root, DEFAULT_CONFIG);
  assert.deepEqual(targets(graph), [["@/target", "file:src/target.ts"]]);
});

test("an empty nested tsconfig stops parent aliases leaking into another package", async (t) => {
  const root = await fixture(t, {
    "tsconfig.json": { compilerOptions: { paths: { "@/*": ["src/*"] } } },
    "src/main.ts": 'import "@/target";',
    "src/target.ts": "export const target = true;",
    "packages/api/tsconfig.json": { compilerOptions: { strict: true } },
    "packages/api/src/main.ts": 'import "@/target";'
  });
  const graph = await scanProject(root, DEFAULT_CONFIG);
  assert.deepEqual(targets(graph), [["@/target", "file:src/target.ts"]]);
  assert.deepEqual(targets(graph, "packages/api/src/main.ts"), []);
});

test("nested jsconfig aliases work while tsconfig takes precedence in the same scope", async (t) => {
  const root = await fixture(t, {
    "jsconfig.json": { compilerOptions: { paths: { "@/*": ["shared/*"] } } },
    "shared/target.ts": "export {};",
    "packages/api/jsconfig.json": {
      compilerOptions: { paths: { "@/*": ["src/*"] } }
    },
    "packages/api/src/main.ts": 'import "@/target.js";',
    "packages/api/src/target.ts": "export {};"
  });
  assert.deepEqual(targets(await scanProject(root, DEFAULT_CONFIG), "packages/api/src/main.ts"), [
    ["@/target.js", "file:packages/api/src/target.ts"]
  ]);
  await fs.writeFile(path.join(root, "packages/api/tsconfig.json"), "{}");
  assert.deepEqual(targets(await scanProject(root, DEFAULT_CONFIG), "packages/api/src/main.ts"), []);
});

test("relationship diagnostics count NodeNext, aliases, assets, and genuine misses correctly", async (t) => {
  const root = await fixture(t, {
    "tsconfig.json": {
      compilerOptions: { baseUrl: ".", paths: { "@/*": ["src/*"] } }
    },
    "src/main.ts": [
      'import "./env.js";',
      'import "@/database.js";',
      'import "src/base";',
      'import "./missing.js";',
      'import "@/missing.js";',
      'import "./styles.css";',
      'import "third-party";'
    ].join("\n"),
    "src/env.ts": "export {};",
    "src/database.ts": "export {};",
    "src/base.ts": "export {};"
  });
  const graph = await scanProject(root, DEFAULT_CONFIG);
  assert.equal(graph.runtime.resolution.resolved, 3);
  assert.equal(graph.runtime.resolution.aliases, 1);
  assert.equal(graph.runtime.resolution.external, 2);
  assert.equal(graph.runtime.resolution.unresolvedLocal, 2);
  assert.deepEqual(graph.runtime.resolution.unresolved.map((item) => item.specifier).sort(), [
    "./missing.js", "@/missing.js"
  ]);
});

test("paths use exact and longest-prefix matches and ordered target fallbacks", async (t) => {
  const root = await fixture(t, {
    "tsconfig.json": {
      compilerOptions: {
        paths: {
          "*": ["src/broad.ts"],
          "@/*": ["src/broad.ts"],
          "@/feature/*": ["missing/*", "src/features/*"],
          "@/feature/exact": ["src/exact.ts"],
          "@/feature/not-found": ["missing.ts"]
        }
      }
    },
    "src/main.ts": 'import "@/feature/target"; import "@/feature/exact"; import "@/feature/not-found";',
    "src/broad.ts": "export {};",
    "src/exact.ts": "export {};",
    "src/features/target/index.ts": "export {};"
  });
  const graph = await scanProject(root, DEFAULT_CONFIG);
  assert.deepEqual(targets(graph), [
    ["@/feature/exact", "file:src/exact.ts"],
    ["@/feature/target", "file:src/features/target/index.ts"]
  ]);
});

test("wildcard captures are substituted literally and respect suffix boundaries", () => {
  const baseDirectory = path.resolve("test-root");
  const context = {
    baseDirectory: null,
    pathsDirectory: baseDirectory,
    paths: [{ pattern: "@/*/end", targets: ["src/*"] }]
  };
  for (const capture of ["target", "nested/file", "$&", "$`", "$'", "$$", "日本語"]) {
    assert.deepEqual(aliasCandidates(`@/${capture}/end`, context), [
      path.join(baseDirectory, "src", capture)
    ]);
  }
  assert.deepEqual(aliasCandidates("@/target/other", context), []);
  assert.deepEqual(aliasCandidates("@/end", context), []);
  assert.deepEqual(aliasCandidates("node:fs", context), []);
  assert.deepEqual(aliasCandidates("/absolute", context), []);
  assert.deepEqual(aliasCandidates("../relative", context), []);
});

test("tsconfig extends inherits baseUrl and paths independently", async (t) => {
  const root = await fixture(t, {
    "config/base.json": {
      compilerOptions: { baseUrl: "../shared", paths: { "@/*": ["*"] } }
    },
    "tsconfig.json": { extends: "./config/base" },
    "src/main.ts": 'import "@/target.js"; import "target";',
    "shared/target.ts": "export {};",
    "packages/api/tsconfig.json": {
      extends: "../../config/base.json",
      compilerOptions: { paths: { "#/*": ["*"] } }
    },
    "packages/api/main.ts": 'import "#/target.js"; import "@/target";',
    "packages/web/tsconfig.json": {
      extends: "../../config/base.json",
      compilerOptions: { baseUrl: "./src" }
    },
    "packages/web/main.ts": 'import "@/target.js";',
    "packages/web/src/target.ts": "export {};"
  });
  const graph = await scanProject(root, DEFAULT_CONFIG);
  assert.deepEqual(targets(graph), [
    ["@/target.js", "file:shared/target.ts"],
    ["target", "file:shared/target.ts"]
  ]);
  assert.deepEqual(targets(graph, "packages/api/main.ts"), [
    ["#/target.js", "file:shared/target.ts"]
  ]);
  assert.deepEqual(targets(graph, "packages/web/main.ts"), [
    ["@/target.js", "file:packages/web/src/target.ts"]
  ]);
});

test("inherited paths without baseUrl stay relative to the declaring config", async (t) => {
  const root = await fixture(t, {
    "config/base.json": { compilerOptions: { paths: { "@/*": ["../src/*"] } } },
    "packages/api/tsconfig.json": { extends: "../../config/base.json" },
    "packages/api/main.ts": 'import "@/target";',
    "src/target.ts": "export {};"
  });
  const graph = await scanProject(root, DEFAULT_CONFIG);
  assert.deepEqual(targets(graph, "packages/api/main.ts"), [
    ["@/target", "file:src/target.ts"]
  ]);
});

test("multiple extends use later bases and empty paths overrides clear inherited aliases", async (t) => {
  const root = await fixture(t, {
    "config/base.json": { compilerOptions: { paths: { "@/*": ["../src/*"] } } },
    "config/first.json": { extends: "./base.json" },
    "config/second.json": {
      extends: "./base.json",
      compilerOptions: { paths: { "@/*": ["../other/*"] } }
    },
    "tsconfig.json": { extends: ["./config/first.json", "./config/second.json"] },
    "src/main.ts": 'import "@/target";',
    "src/target.ts": "export {};",
    "other/target.ts": "export {};"
  });
  const graph = await scanProject(root, DEFAULT_CONFIG);
  assert.deepEqual(targets(graph), [["@/target", "file:other/target.ts"]]);
  await fs.writeFile(path.join(root, "tsconfig.json"), JSON.stringify({
    extends: "./config/base.json",
    compilerOptions: { paths: {} }
  }));
  assert.deepEqual(targets(await scanProject(root, DEFAULT_CONFIG)), []);
});

test("extended alias changes invalidate input hashes, while formatting and root relocation do not", async (t) => {
  const files = {
    "tsconfig.base.json": { compilerOptions: { paths: { "@/*": ["src/*"] } } },
    "tsconfig.json": { extends: "./tsconfig.base.json" },
    "src/main.ts": 'import "@/target";',
    "src/target.ts": "export {};",
    "other/target.ts": "export {};"
  };
  const root = await fixture(t, files);
  const relocated = await fixture(t, files);
  const first = await scanProject(root, DEFAULT_CONFIG);
  const copied = await scanProject(relocated, DEFAULT_CONFIG);
  assert.equal(first.inputHash, copied.inputHash);
  const base = path.join(root, "tsconfig.base.json");
  await fs.writeFile(base, `// reformatted\r\n${JSON.stringify(files["tsconfig.base.json"], null, 2)}\r\n`);
  assert.equal(first.inputHash, (await scanProject(root, DEFAULT_CONFIG)).inputHash);
  await fs.writeFile(base, JSON.stringify({
    compilerOptions: { paths: { "@/*": ["other/*"] } }
  }));
  const changed = await scanProject(root, DEFAULT_CONFIG);
  assert.equal(first.sourceHash, changed.sourceHash);
  assert.notEqual(first.inputHash, changed.inputHash);
  assert.deepEqual(targets(changed), [["@/target", "file:other/target.ts"]]);
});

test("aliases never bypass include/exclude scopes or add unindexed external targets", async (t) => {
  const root = await fixture(t, {
    "tsconfig.json": {
      compilerOptions: {
        paths: {
          "@hidden": ["ignored/hidden.ts"],
          "@filtered": ["src/filtered.js"],
          "@outside": ["../outside.ts"]
        }
      }
    },
    "src/main.ts": 'import "@hidden"; import "@filtered"; import "@outside";',
    "src/filtered.js": "export {};",
    "ignored/tsconfig.json": "invalid",
    "ignored/hidden.ts": "export {};",
    "nested/ignored/tsconfig.json": "invalid",
    "nested/ignored/hidden.ts": "export {};"
  });
  const graph = await scanProject(root, {
    ...DEFAULT_CONFIG,
    include: ["**/*.ts"],
    exclude: [...DEFAULT_CONFIG.exclude, "./ignored/", "nested/ignored"]
  });
  assert.deepEqual(targets(graph), []);
  assert.equal(graph.stats.files, 1);
});

test("package-name extends are not loaded or executed", async (t) => {
  const root = await fixture(t, {
    "tsconfig.json": {
      extends: "@company/tsconfig",
      compilerOptions: { paths: { "@/*": ["src/*"] } }
    },
    "node_modules/@company/tsconfig/tsconfig.json": "this must not be read",
    "src/main.ts": 'import "@/target";',
    "src/target.ts": "export {};"
  });
  const graph = await scanProject(root, DEFAULT_CONFIG);
  assert.deepEqual(targets(graph), [["@/target", "file:src/target.ts"]]);
});

test("invalid configs, cycles, and missing local bases stop incomplete graph generation", async (t) => {
  const root = await fixture(t, { "src/main.ts": "export {};" });
  const invalid = [
    ["{", /Could not read tsconfig\.json/],
    ["{,}", /Could not read tsconfig\.json/],
    ["{/* never closed", /Unterminated block comment/],
    ["[]", /must be an object/],
    [{ compilerOptions: [] }, /compilerOptions must be an object/],
    [{ compilerOptions: { paths: [] } }, /paths must be an object/],
    [{ compilerOptions: { paths: { "@/*/*": ["src/*"] } } }, /Invalid.*pattern/],
    [{ compilerOptions: { paths: { "@/*": "src/*" } } }, /must contain 1 to 16 targets/],
    [{ compilerOptions: { paths: { "@/*": [] } } }, /must contain 1 to 16 targets/],
    [{ compilerOptions: { paths: { "@/*": [null] } } }, /Invalid target/],
    [{ compilerOptions: { baseUrl: 1 } }, /baseUrl must be a path string/],
    [{ extends: 1 }, /Invalid.*extends/],
    [{ extends: "./tsconfig.json" }, /Circular/],
    [{ extends: "./missing.json" }, /does not exist/],
    [{ extends: "../outside.json" }, /escapes the project root/],
    [{ extends: "./node_modules/base.json" }, /excluded from indexing/]
  ];
  for (const [contents, expected] of invalid) {
    await fs.writeFile(path.join(root, "tsconfig.json"),
      typeof contents === "string" ? contents : JSON.stringify(contents));
    await assert.rejects(scanProject(root, DEFAULT_CONFIG), expected);
  }
});

test("tsconfig reads enforce byte, target-count, and extends-depth bounds", async (t) => {
  const root = await fixture(t, {
    "tsconfig.json": { compilerOptions: { baseUrl: "." } },
    "src/main.ts": "export {};"
  });
  await assert.rejects(scanProject(root, {
    ...DEFAULT_CONFIG,
    limits: { ...DEFAULT_CONFIG.limits, maxFileSizeBytes: 10 }
  }), /10-byte limit/);
  const size = (await fs.stat(path.join(root, "tsconfig.json"))).size;
  await assert.rejects(scanProject(root, {
    ...DEFAULT_CONFIG,
    limits: { ...DEFAULT_CONFIG.limits, maxTotalBytes: size - 1 }
  }), /limits.maxTotalBytes/);
  await assert.rejects(scanProject(root, {
    ...DEFAULT_CONFIG,
    limits: { ...DEFAULT_CONFIG.limits, maxTotalBytes: size }
  }), /limits.maxTotalBytes/);
  await fs.writeFile(path.join(root, "tsconfig.json"), JSON.stringify({
    compilerOptions: { paths: { "@/*": Array(17).fill("src/*") } }
  }));
  await assert.rejects(scanProject(root, DEFAULT_CONFIG), /must contain 1 to 16 targets/);
  await fs.writeFile(path.join(root, "tsconfig.json"), JSON.stringify({
    compilerOptions: {
      paths: Object.fromEntries(Array.from({ length: 257 }, (_, index) =>
        [`alias-${index}`, ["src/main.ts"]]
      ))
    }
  }));
  await assert.rejects(scanProject(root, DEFAULT_CONFIG), /256-entry safety limit/);
  for (let index = 0; index < 34; index += 1) {
    const name = index === 0 ? "tsconfig.json" : `base-${index}.json`;
    await fs.writeFile(path.join(root, name), JSON.stringify({
      extends: `./base-${index + 1}.json`
    }));
  }
  await assert.rejects(scanProject(root, DEFAULT_CONFIG), /exceeds 32 levels/);
});

test("tsconfig reads reject file and ancestor symlinks", {
  skip: process.platform === "win32"
}, async (t) => {
  const root = await fixture(t, {
    "base.json": { compilerOptions: { baseUrl: "." } },
    "src/main.ts": "export {};"
  });
  const configPath = path.join(root, "tsconfig.json");
  await fs.symlink(path.join(root, "base.json"), configPath);
  await assert.rejects(scanProject(root, DEFAULT_CONFIG), /symbolic link/);
  await fs.unlink(configPath);
  await fs.writeFile(configPath, JSON.stringify({ extends: "./linked/base.json" }));
  await fs.symlink(root, path.join(root, "linked"));
  await assert.rejects(scanProject(root, DEFAULT_CONFIG), /symbolic link/);
});
