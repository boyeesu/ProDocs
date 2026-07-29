const HASH_PATTERN = /^[a-f0-9]{64}$/;
const PACKET_KEYS = [
  "schemaVersion",
  "kind",
  "root",
  "sourceHash",
  "inputHash",
  "request",
  "freshness",
  "stats",
  "nodes",
  "edges"
];

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function fail(path, message) {
  throw new Error(`Invalid context packet at ${path}: ${message}`);
}

function requireObject(value, path) {
  if (!isObject(value)) fail(path, "expected an object.");
}

function requireExactKeys(value, keys, path) {
  requireObject(value, path);
  const expected = new Set(keys);
  const missing = keys.filter((key) => !(key in value));
  const unknown = Object.keys(value).filter((key) => !expected.has(key));
  if (missing.length > 0) fail(path, `missing ${missing.join(", ")}.`);
  if (unknown.length > 0) fail(path, `unknown ${unknown.join(", ")}.`);
}

function requireString(value, path, { pattern, nullable = false } = {}) {
  if (nullable && value === null) return;
  if (typeof value !== "string" || value.length === 0) {
    fail(
      path,
      nullable
        ? "expected a non-empty string or null."
        : "expected a non-empty string."
    );
  }
  if (pattern && !pattern.test(value)) fail(path, "has an invalid format.");
}

function requireInteger(value, path) {
  if (!Number.isSafeInteger(value) || value < 0) {
    fail(path, "expected a non-negative integer.");
  }
}

function requireStringArray(
  value,
  path,
  {
    minItems = 0,
    maxItems = Number.MAX_SAFE_INTEGER,
    unique = true
  } = {}
) {
  if (
    !Array.isArray(value) ||
    value.length < minItems ||
    value.length > maxItems ||
    value.some((item) => typeof item !== "string" || item.length === 0)
  ) {
    fail(
      path,
      `expected ${minItems > 0 ? `at least ${minItems} and ` : ""}at most ${maxItems} non-empty strings.`
    );
  }
  if (unique && new Set(value).size !== value.length) {
    fail(path, "items must be unique.");
  }
}

function normalizedPath(value) {
  const segments = value
    .replaceAll("\\", "/")
    .split("/")
    .filter((segment) => segment !== "" && segment !== ".");
  return segments.length === 0 ? "." : segments.join("/");
}

export function normalizeRequestedPaths(requestedPaths) {
  requireStringArray(requestedPaths, "request.paths", {
    minItems: 1,
    maxItems: 256,
    unique: false
  });

  const normalized = requestedPaths.map((value) => {
    const slashPath = value.replaceAll("\\", "/");
    if (
      value.length > 1024 ||
      value.includes("\0") ||
      slashPath.startsWith("/") ||
      /^[A-Za-z]:\//.test(slashPath) ||
      slashPath.split("/").some((segment) => segment === "..")
    ) {
      throw new Error(`Invalid requested path: ${value}`);
    }
    const result = normalizedPath(value);
    return result;
  });

  return [...new Set(normalized)].sort();
}

function matchesRequestedPath(nodePath, requestedPath) {
  if (requestedPath === ".") return true;
  return (
    nodePath === requestedPath ||
    nodePath.startsWith(`${requestedPath}/`) ||
    requestedPath.startsWith(`${nodePath}/`)
  );
}

export function selectContext(graph, requestedPaths) {
  const normalized = normalizeRequestedPaths(requestedPaths);
  const directlySelectedIds = new Set(
    graph.nodes
      .filter((node) =>
        normalized.some((requested) =>
          matchesRequestedPath(node.path, requested)
        )
      )
      .map((node) => node.id)
  );
  const selectedIds = new Set(directlySelectedIds);

  for (const edge of graph.edges) {
    if (
      directlySelectedIds.has(edge.from) ||
      directlySelectedIds.has(edge.to)
    ) {
      selectedIds.add(edge.from);
      selectedIds.add(edge.to);
    }
  }

  return {
    requestedPaths: normalized,
    directlySelectedIds,
    nodes: graph.nodes.filter((node) => selectedIds.has(node.id)),
    edges: graph.edges.filter(
      (edge) => selectedIds.has(edge.from) && selectedIds.has(edge.to)
    )
  };
}

function hashOrNull(value) {
  return typeof value === "string" && HASH_PATTERN.test(value) ? value : null;
}

function packetMeasurements(request, nodes, edges) {
  const contextBytes = Buffer.byteLength(
    JSON.stringify({ request, nodes, edges }),
    "utf8"
  );
  return {
    contextBytes,
    estimatedTokens: Math.ceil(contextBytes / 4)
  };
}

export function buildContextPacket(graph, requestedPaths, manifest = null) {
  const selection = selectContext(graph, requestedPaths);
  const relatedIdsByNode = new Map();
  for (const edge of selection.edges) {
    if (
      selection.directlySelectedIds.has(edge.from) &&
      !selection.directlySelectedIds.has(edge.to)
    ) {
      const related = relatedIdsByNode.get(edge.to) ?? new Set();
      related.add(edge.from);
      relatedIdsByNode.set(edge.to, related);
    }
    if (
      selection.directlySelectedIds.has(edge.to) &&
      !selection.directlySelectedIds.has(edge.from)
    ) {
      const related = relatedIdsByNode.get(edge.from) ?? new Set();
      related.add(edge.to);
      relatedIdsByNode.set(edge.from, related);
    }
  }
  const nodes = selection.nodes.map((node) => {
    const matchedPaths = selection.requestedPaths.filter((requested) =>
      matchesRequestedPath(node.path, requested)
    );
    const relatedTo = selection.directlySelectedIds.has(node.id)
      ? []
      : [...(relatedIdsByNode.get(node.id) ?? [])].sort();

    return {
      ...node,
      selection: {
        reason: matchedPaths.length > 0 ? "requested" : "dependency",
        matchedPaths,
        relatedTo
      }
    };
  });
  const request = { paths: selection.requestedPaths };
  const documentedSourceHash = hashOrNull(manifest?.sourceHash);
  const documentedInputHash = hashOrNull(manifest?.inputHash);
  const freshnessStatus = !manifest
    ? "missing"
    : documentedSourceHash === graph.sourceHash &&
        documentedInputHash === graph.inputHash
      ? "fresh"
      : "stale";
  const measurements = packetMeasurements(request, nodes, selection.edges);
  const packet = {
    schemaVersion: 1,
    kind: "prodocs.context-packet",
    root: ".",
    sourceHash: graph.sourceHash,
    inputHash: graph.inputHash,
    request,
    freshness: {
      status: freshnessStatus,
      documentedSourceHash,
      documentedInputHash
    },
    stats: {
      files: nodes.length,
      symbols: nodes.reduce(
        (total, node) => total + node.symbols.length,
        0
      ),
      relationships: selection.edges.length,
      ...measurements
    },
    nodes,
    edges: selection.edges
  };

  return validateContextPacket(packet);
}

function validateSymbol(symbol, path) {
  requireExactKeys(symbol, ["name", "kind", "line"], path);
  requireString(symbol.name, `${path}.name`);
  requireString(symbol.kind, `${path}.kind`);
  if (!Number.isSafeInteger(symbol.line) || symbol.line < 1) {
    fail(`${path}.line`, "expected a positive integer.");
  }
}

function validateNode(node, path) {
  requireExactKeys(
    node,
    [
      "id",
      "type",
      "path",
      "language",
      "contentHash",
      "lines",
      "owner",
      "entrypoint",
      "symbols",
      "selection"
    ],
    path
  );
  requireString(node.id, `${path}.id`, { pattern: /^file:.+/ });
  if (node.type !== "file") fail(`${path}.type`, 'expected "file".');
  requireString(node.path, `${path}.path`);
  if (
    node.path === "." ||
    node.path.includes("\0") ||
    /^[A-Za-z]:\//.test(node.path) ||
    normalizedPath(node.path) !== node.path ||
    node.path.split("/").some((segment) => segment === "..")
  ) {
    fail(`${path}.path`, "expected a normalized project-relative file path.");
  }
  if (node.id !== `file:${node.path}`) {
    fail(`${path}.id`, "must identify the node path.");
  }
  requireString(node.language, `${path}.language`);
  requireString(node.contentHash, `${path}.contentHash`, {
    pattern: HASH_PATTERN
  });
  requireInteger(node.lines, `${path}.lines`);
  requireString(node.owner, `${path}.owner`, { nullable: true });
  if (typeof node.entrypoint !== "boolean") {
    fail(`${path}.entrypoint`, "expected a boolean.");
  }
  if (!Array.isArray(node.symbols)) fail(`${path}.symbols`, "expected an array.");
  node.symbols.forEach((symbol, index) =>
    validateSymbol(symbol, `${path}.symbols[${index}]`)
  );
  requireExactKeys(
    node.selection,
    ["reason", "matchedPaths", "relatedTo"],
    `${path}.selection`
  );
  if (!["requested", "dependency"].includes(node.selection.reason)) {
    fail(`${path}.selection.reason`, "expected requested or dependency.");
  }
  requireStringArray(
    node.selection.matchedPaths,
    `${path}.selection.matchedPaths`
  );
  requireStringArray(node.selection.relatedTo, `${path}.selection.relatedTo`);
  if (
    node.selection.reason === "requested" &&
    node.selection.matchedPaths.length === 0
  ) {
    fail(`${path}.selection.matchedPaths`, "requested nodes need a match.");
  }
  if (
    node.selection.reason === "dependency" &&
    node.selection.relatedTo.length === 0
  ) {
    fail(`${path}.selection.relatedTo`, "dependency nodes need a related node.");
  }
}

function validateEdge(edge, path) {
  requireExactKeys(edge, ["type", "from", "to", "evidence"], path);
  if (edge.type !== "imports") fail(`${path}.type`, 'expected "imports".');
  requireString(edge.from, `${path}.from`);
  requireString(edge.to, `${path}.to`);
  requireExactKeys(edge.evidence, ["source", "specifier"], `${path}.evidence`);
  requireString(edge.evidence.source, `${path}.evidence.source`);
  requireString(edge.evidence.specifier, `${path}.evidence.specifier`);
}

export function validateContextPacket(packet) {
  requireExactKeys(packet, PACKET_KEYS, "$");
  if (packet.schemaVersion !== 1) {
    fail("$.schemaVersion", "expected version 1.");
  }
  if (packet.kind !== "prodocs.context-packet") {
    fail("$.kind", 'expected "prodocs.context-packet".');
  }
  if (packet.root !== ".") fail("$.root", 'expected ".".');
  requireString(packet.sourceHash, "$.sourceHash", { pattern: HASH_PATTERN });
  requireString(packet.inputHash, "$.inputHash", { pattern: HASH_PATTERN });

  requireExactKeys(packet.request, ["paths"], "$.request");
  requireStringArray(packet.request.paths, "$.request.paths", {
    minItems: 1,
    maxItems: 256
  });
  const normalizedPaths = normalizeRequestedPaths(packet.request.paths);
  if (JSON.stringify(normalizedPaths) !== JSON.stringify(packet.request.paths)) {
    fail("$.request.paths", "paths must be normalized, unique, and sorted.");
  }

  requireExactKeys(
    packet.freshness,
    ["status", "documentedSourceHash", "documentedInputHash"],
    "$.freshness"
  );
  if (!["fresh", "stale", "missing"].includes(packet.freshness.status)) {
    fail("$.freshness.status", "expected fresh, stale, or missing.");
  }
  requireString(
    packet.freshness.documentedSourceHash,
    "$.freshness.documentedSourceHash",
    { pattern: HASH_PATTERN, nullable: true }
  );
  requireString(
    packet.freshness.documentedInputHash,
    "$.freshness.documentedInputHash",
    { pattern: HASH_PATTERN, nullable: true }
  );
  if (
    packet.freshness.status === "fresh" &&
    (packet.freshness.documentedSourceHash !== packet.sourceHash ||
      packet.freshness.documentedInputHash !== packet.inputHash)
  ) {
    fail("$.freshness", "fresh source and input hashes must match.");
  }
  if (
    packet.freshness.status === "missing" &&
    (packet.freshness.documentedSourceHash !== null ||
      packet.freshness.documentedInputHash !== null)
  ) {
    fail("$.freshness", "missing documentation cannot have documented hashes.");
  }
  if (
    packet.freshness.status === "stale" &&
    packet.freshness.documentedSourceHash === packet.sourceHash &&
    packet.freshness.documentedInputHash === packet.inputHash
  ) {
    fail("$.freshness", "matching hashes must be marked fresh.");
  }

  requireExactKeys(
    packet.stats,
    [
      "files",
      "symbols",
      "relationships",
      "contextBytes",
      "estimatedTokens"
    ],
    "$.stats"
  );
  for (const key of [
    "files",
    "symbols",
    "relationships",
    "contextBytes",
    "estimatedTokens"
  ]) {
    requireInteger(packet.stats[key], `$.stats.${key}`);
  }

  if (!Array.isArray(packet.nodes)) fail("$.nodes", "expected an array.");
  packet.nodes.forEach((node, index) =>
    validateNode(node, `$.nodes[${index}]`)
  );
  if (!Array.isArray(packet.edges)) fail("$.edges", "expected an array.");
  packet.edges.forEach((edge, index) =>
    validateEdge(edge, `$.edges[${index}]`)
  );

  const nodeIds = new Set(packet.nodes.map((node) => node.id));
  const nodeById = new Map(packet.nodes.map((node) => [node.id, node]));
  if (nodeIds.size !== packet.nodes.length) {
    fail("$.nodes", "IDs must be unique.");
  }
  for (const [index, edge] of packet.edges.entries()) {
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) {
      fail(`$.edges[${index}]`, "edge endpoints must exist in the packet.");
    }
    if (nodeById.get(edge.from)?.path !== edge.evidence.source) {
      fail(
        `$.edges[${index}].evidence.source`,
        "must match the source node path."
      );
    }
  }
  const edgePairs = new Set(
    packet.edges.flatMap((edge) => [
      `${edge.from}\0${edge.to}`,
      `${edge.to}\0${edge.from}`
    ])
  );
  for (const [index, node] of packet.nodes.entries()) {
    if (node.selection.relatedTo.some((id) => !nodeIds.has(id))) {
      fail(
        `$.nodes[${index}].selection.relatedTo`,
        "related node IDs must exist in the packet."
      );
    }
    if (node.selection.reason === "requested") {
      if (node.selection.relatedTo.length > 0) {
        fail(
          `$.nodes[${index}].selection.relatedTo`,
          "requested nodes cannot use dependency references."
        );
      }
      if (
        node.selection.matchedPaths.some(
          (requested) =>
            !packet.request.paths.includes(requested) ||
            !matchesRequestedPath(node.path, requested)
        )
      ) {
        fail(
          `$.nodes[${index}].selection.matchedPaths`,
          "matches must come from the request and select this node."
        );
      }
    } else {
      if (node.selection.matchedPaths.length > 0) {
        fail(
          `$.nodes[${index}].selection.matchedPaths`,
          "dependency nodes cannot claim direct path matches."
        );
      }
      if (
        node.selection.relatedTo.some(
          (id) =>
            nodeById.get(id)?.selection.reason !== "requested" ||
            !edgePairs.has(`${node.id}\0${id}`)
        )
      ) {
        fail(
          `$.nodes[${index}].selection.relatedTo`,
          "dependency references must be requested nodes connected by an edge."
        );
      }
    }
  }

  const measurements = packetMeasurements(
    packet.request,
    packet.nodes,
    packet.edges
  );
  const expected = {
    files: packet.nodes.length,
    symbols: packet.nodes.reduce(
      (total, node) => total + node.symbols.length,
      0
    ),
    relationships: packet.edges.length,
    ...measurements
  };
  for (const [key, value] of Object.entries(expected)) {
    if (packet.stats[key] !== value) {
      fail(`$.stats.${key}`, `expected ${value}.`);
    }
  }

  return packet;
}
