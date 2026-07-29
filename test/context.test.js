import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import {
  buildContextPacket,
  normalizeRequestedPaths,
  selectContext,
  validateContextPacket
} from "../src/context.js";

const hashes = {
  source: "a".repeat(64),
  input: "b".repeat(64),
  a: "c".repeat(64),
  b: "d".repeat(64),
  c: "e".repeat(64)
};

function node(name, contentHash) {
  return {
    id: `file:src/${name}.js`,
    type: "file",
    path: `src/${name}.js`,
    language: "JavaScript",
    contentHash,
    lines: 2,
    owner: null,
    entrypoint: name === "a",
    symbols: [
      {
        name,
        kind: "function",
        line: 1
      }
    ]
  };
}

function edge(from, to) {
  return {
    type: "imports",
    from: `file:src/${from}.js`,
    to: `file:src/${to}.js`,
    evidence: {
      source: `src/${from}.js`,
      specifier: `./${to}.js`
    }
  };
}

function graph() {
  return {
    schemaVersion: 1,
    sourceHash: hashes.source,
    inputHash: hashes.input,
    nodes: [
      node("a", hashes.a),
      node("b", hashes.b),
      node("c", hashes.c)
    ],
    edges: [edge("a", "b"), edge("b", "c")]
  };
}

test("requested paths are normalized, deduplicated, and sorted", () => {
  assert.deepEqual(
    normalizeRequestedPaths(["src/b.js", "./src/a.js", "src/a.js"]),
    ["src/a.js", "src/b.js"]
  );
  assert.throws(
    () => normalizeRequestedPaths(["../outside.js"]),
    /Invalid requested path/
  );
  assert.throws(
    () => normalizeRequestedPaths(["/absolute.js"]),
    /Invalid requested path/
  );
});

test("context selection is a deterministic one-hop neighborhood", () => {
  const selection = selectContext(graph(), ["src/a.js"]);

  assert.deepEqual(
    selection.nodes.map((item) => item.path),
    ["src/a.js", "src/b.js"]
  );
  assert.deepEqual(selection.edges, [edge("a", "b")]);
});

test("context packets describe relevance, freshness, and size", () => {
  const packet = buildContextPacket(graph(), ["./src/a.js"], {
    sourceHash: hashes.source,
    inputHash: hashes.input
  });

  assert.equal(packet.kind, "prodocs.context-packet");
  assert.deepEqual(packet.request.paths, ["src/a.js"]);
  assert.equal(packet.freshness.status, "fresh");
  assert.equal(packet.stats.files, 2);
  assert.equal(packet.stats.symbols, 2);
  assert.equal(packet.stats.relationships, 1);
  assert.ok(packet.stats.contextBytes > 0);
  assert.equal(
    packet.stats.estimatedTokens,
    Math.ceil(packet.stats.contextBytes / 4)
  );
  assert.deepEqual(packet.nodes[0].selection, {
    reason: "requested",
    matchedPaths: ["src/a.js"],
    relatedTo: []
  });
  assert.deepEqual(packet.nodes[1].selection, {
    reason: "dependency",
    matchedPaths: [],
    relatedTo: ["file:src/a.js"]
  });
  assert.equal(validateContextPacket(packet), packet);
});

test("context packets distinguish stale and missing documentation", () => {
  assert.equal(
    buildContextPacket(graph(), ["src/a.js"]).freshness.status,
    "missing"
  );
  assert.equal(
    buildContextPacket(graph(), ["src/a.js"], {
      sourceHash: "f".repeat(64),
      inputHash: "f".repeat(64)
    }).freshness.status,
    "stale"
  );
});

test("context validation rejects contract and integrity violations", () => {
  const packet = buildContextPacket(graph(), ["src/a.js"]);

  const unknown = structuredClone(packet);
  unknown.unexpected = true;
  assert.throws(() => validateContextPacket(unknown), /unknown unexpected/);

  const wrongStats = structuredClone(packet);
  wrongStats.stats.files = 99;
  assert.throws(
    () => validateContextPacket(wrongStats),
    /stats.files: expected 2/
  );

  const danglingEdge = structuredClone(packet);
  danglingEdge.edges[0].to = "file:src/missing.js";
  assert.throws(
    () => validateContextPacket(danglingEdge),
    /edge endpoints must exist/
  );

  const falseRelevance = structuredClone(packet);
  falseRelevance.nodes[1].selection.relatedTo = ["file:src/b.js"];
  assert.throws(
    () => validateContextPacket(falseRelevance),
    /dependency references must be requested nodes connected by an edge/
  );
});

test("the public schema requires the runtime packet fields", async () => {
  const schema = JSON.parse(
    await fs.readFile("schemas/context-packet.schema.json", "utf8")
  );
  const packet = buildContextPacket(graph(), ["src/a.js"]);

  assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.deepEqual([...schema.required].sort(), Object.keys(packet).sort());
  assert.equal(schema.properties.schemaVersion.const, packet.schemaVersion);
  assert.equal(schema.properties.kind.const, packet.kind);
});
