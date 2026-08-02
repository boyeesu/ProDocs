import fs from "node:fs/promises";
import path from "node:path";
import {
  EXTENSION_LANGUAGE,
  SUPPORTED_EXTENSIONS
} from "./constants.js";
import {
  createCollectorRegistry,
  databaseSchemaCollector,
  javascriptTypeScriptCollector,
  legacyLanguageCollector,
  openApiCollector
} from "./collectors/index.js";
import { openIndexStore } from "./index-store.js";
import { collectAuthoredKnowledge } from "./knowledge.js";
import { loadDeclarativePlugin } from "./plugins.js";
import { resolveSourcePath } from "./paths.js";
import { readRegularFile } from "./safe-fs.js";
import {
  detectPromptInjection,
  sha256,
  stableJson,
  toPosix
} from "./security.js";

function normalizeSource(value) {
  return value.replace(/\r\n?/g, "\n");
}

function isExcluded(relativePath, excluded) {
  const segments = toPosix(relativePath).split("/");
  return excluded.some((rule) => {
    const normalized = rule.replace(/^\.\//, "").replace(/\/$/, "");
    return normalized.includes("/")
      ? toPosix(relativePath) === normalized ||
          toPosix(relativePath).startsWith(`${normalized}/`)
      : segments.includes(normalized);
  });
}

export function matchesGlob(glob, value) {
  const pattern = toPosix(glob).replace(/^\.\//, "");
  const candidate = toPosix(value);
  const tokens = [];
  for (let index = 0; index < pattern.length; index += 1) {
    if (
      pattern[index] === "*" &&
      pattern[index + 1] === "*" &&
      pattern[index + 2] === "/"
    ) {
      tokens.push("**/");
      index += 2;
    } else if (pattern[index] === "*" && pattern[index + 1] === "*") {
      tokens.push("**");
      index += 1;
    } else {
      tokens.push(pattern[index]);
    }
  }

  let next = new Uint8Array(candidate.length + 1);
  next[candidate.length] = 1;
  for (let tokenIndex = tokens.length - 1; tokenIndex >= 0; tokenIndex -= 1) {
    const current = new Uint8Array(candidate.length + 1);
    let globstarDirectoryMatch = 0;
    for (
      let candidateIndex = candidate.length;
      candidateIndex >= 0;
      candidateIndex -= 1
    ) {
      const token = tokens[tokenIndex];
      if (token === "**/") {
        if (
          candidateIndex < candidate.length &&
          candidate[candidateIndex] === "/" &&
          next[candidateIndex + 1]
        ) {
          globstarDirectoryMatch = 1;
        }
        current[candidateIndex] =
          next[candidateIndex] || globstarDirectoryMatch;
      } else if (token === "**") {
        current[candidateIndex] =
          next[candidateIndex] ||
          (candidateIndex < candidate.length &&
            current[candidateIndex + 1]);
      } else if (token === "*") {
        current[candidateIndex] =
          next[candidateIndex] ||
          (candidateIndex < candidate.length &&
            candidate[candidateIndex] !== "/" &&
            current[candidateIndex + 1]);
      } else if (token === "?") {
        current[candidateIndex] =
          candidateIndex < candidate.length &&
          candidate[candidateIndex] !== "/" &&
          next[candidateIndex + 1];
      } else {
        current[candidateIndex] =
          candidateIndex < candidate.length &&
          token === candidate[candidateIndex] &&
          next[candidateIndex + 1];
      }
    }
    next = current;
  }
  return next[0] === 1;
}

function isIncluded(relativePath, include) {
  if (!include?.length) return true;
  return include.some((pattern) => matchesGlob(pattern, relativePath));
}

async function walk(
  directory,
  root,
  excluded,
  include,
  maxFiles,
  languageMap,
  files = []
) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    const relative = path.relative(root, absolute);
    if (isExcluded(relative, excluded)) continue;
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      await walk(
        absolute,
        root,
        excluded,
        include,
        maxFiles,
        languageMap,
        files
      );
    } else if (
      entry.isFile() &&
      languageForPath(relative, languageMap) &&
      isIncluded(relative, include)
    ) {
      files.push(absolute);
      if (files.length > maxFiles) {
        throw new Error(
          `Source discovery exceeded limits.maxFiles (${maxFiles}).`
        );
      }
    }
  }
  return files;
}

async function discoverFiles(root, config, languageMap) {
  const files = [];
  for (const source of config.source) {
    const absolute = await resolveSourcePath(root, source);
    const stat = await fs.stat(absolute);
    if (stat.isDirectory()) {
      await walk(
        absolute,
        root,
        config.exclude,
        config.include,
        config.limits.maxFiles,
        languageMap,
        files
      );
    } else {
      const relative = path.relative(root, absolute);
      if (
        stat.isFile() &&
        !isExcluded(relative, config.exclude) &&
        languageForPath(relative, languageMap) &&
        isIncluded(relative, config.include)
      ) {
        files.push(absolute);
        if (files.length > config.limits.maxFiles) {
          throw new Error(
            `Source discovery exceeded limits.maxFiles (${config.limits.maxFiles}).`
          );
        }
      }
    }
  }
  return [...new Set(files.map((file) => path.resolve(file)))].sort();
}

function candidateImportPaths(fromFile, specifier, language) {
  if (language === "Python") {
    if (!specifier.startsWith(".")) return [];
    const dotCount = specifier.match(/^\.+/)?.[0].length ?? 0;
    let base = path.dirname(fromFile);
    for (let index = 1; index < dotCount; index += 1) base = path.dirname(base);
    const modulePath = specifier.slice(dotCount).replaceAll(".", path.sep);
    const stem = path.join(base, modulePath);
    return [`${stem}.py`, path.join(stem, "__init__.py")];
  }

  if (!specifier.startsWith(".")) return [];
  const stem = path.resolve(path.dirname(fromFile), specifier);
  const extensions = [
    ".js",
    ".jsx",
    ".mjs",
    ".cjs",
    ".ts",
    ".tsx",
    ".mts",
    ".cts",
    ".py",
    ".go",
    ".rs"
  ];
  return [
    stem,
    ...extensions.map((extension) => `${stem}${extension}`),
    ...extensions.map((extension) => path.join(stem, `index${extension}`)),
    path.join(stem, "mod.rs")
  ];
}

function inferEntrypoint(relativePath) {
  const basename = path.basename(relativePath);
  return [
    "index.js",
    "index.ts",
    "main.js",
    "main.ts",
    "main.py",
    "main.go",
    "main.rs",
    "app.js",
    "app.ts",
    "app.py",
    "server.js",
    "server.ts",
    "cli.js",
    "cli.ts"
  ].includes(basename);
}

function languageForPath(filePath, languageMap = EXTENSION_LANGUAGE) {
  const normalized = filePath.toLowerCase();
  const extension = Object.keys(languageMap)
    .sort((left, right) => right.length - left.length)
    .find((candidate) => normalized.endsWith(candidate));
  return extension ? languageMap[extension] : null;
}

function codeownersMatch(pattern, relativePath) {
  const normalized = pattern
    .replace(/^!/, "")
    .replace(/^\//, "")
    .replace(/\/$/, "/**");
  if (normalized.includes("/")) {
    return matchesGlob(normalized, relativePath);
  }
  return relativePath.split("/").some((segment) =>
    matchesGlob(normalized, segment)
  );
}

async function readCodeowners(root) {
  for (const candidate of [
    ".github/CODEOWNERS",
    "CODEOWNERS",
    "docs/CODEOWNERS"
  ]) {
    const absolute = path.join(root, candidate);
    try {
      const { contents } = await readRegularFile(absolute, {
        maxBytes: 1024 * 1024
      });
      const rules = contents
        .replace(/\r\n?/g, "\n")
        .split("\n")
        .map((line, index) => ({
          line: index + 1,
          text: line.trim()
        }))
        .filter(({ text }) => text && !text.startsWith("#"))
        .map(({ line, text }) => {
          const [pattern, ...owners] = text.split(/\s+/);
          return { pattern, owners, line };
        })
        .filter((rule) => rule.pattern && rule.owners.length > 0);
      return { path: candidate, rules };
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw new Error(`Could not safely read ${candidate}: ${error.message}`);
      }
    }
  }
  return { path: null, rules: [] };
}

function ownerFor(relativePath, ownership, codeowners) {
  let resolved = null;
  for (const rule of codeowners.rules) {
    if (codeownersMatch(rule.pattern, relativePath)) {
      resolved = rule.owners.join(" ");
    }
  }
  if (resolved) return resolved;
  for (const [pattern, owner] of Object.entries(ownership ?? {})) {
    const prefix = pattern.replace(/\*+$/, "").replace(/\/$/, "");
    if (relativePath.startsWith(prefix)) return owner;
  }
  return null;
}

function roleFor(relativePath, evidence, entrypoint) {
  if (
    /(^|\/)(?:test|tests|__tests__|spec)(?:\/|\.|$)/i.test(relativePath) ||
    /\.(?:test|spec)\.[^.]+$/i.test(relativePath)
  ) {
    return "test";
  }
  if (evidence.symbols.some((symbol) => symbol.kind === "endpoint")) return "api";
  if (
    evidence.symbols.some((symbol) =>
      ["table", "view"].includes(symbol.kind)
    )
  ) {
    return "database";
  }
  return entrypoint ? "entrypoint" : "source";
}

export async function scanProject(
  root,
  config,
  { indexMode = "write" } = {}
) {
  const canonicalRoot = await fs.realpath(root);
  const pluginCollectors = [];
  const languageMap = { ...EXTENSION_LANGUAGE };
  for (const pluginPath of config.plugins.paths) {
    const absolutePluginPath = await resolveSourcePath(canonicalRoot, pluginPath);
    const plugin = await loadDeclarativePlugin(absolutePluginPath);
    pluginCollectors.push(plugin.collector);
    for (const extension of plugin.collector.extensions) {
      languageMap[extension] = plugin.collector.languages[0];
    }
  }
  const absoluteFiles = await discoverFiles(canonicalRoot, config, languageMap);
  const knownFiles = new Set(absoluteFiles.map((file) => path.resolve(file)));
  const codeowners = await readCodeowners(canonicalRoot);
  const collectorRegistry = createCollectorRegistry([
    javascriptTypeScriptCollector,
    openApiCollector,
    databaseSchemaCollector,
    legacyLanguageCollector,
    ...pluginCollectors
  ]);
  const index = await openIndexStore(canonicalRoot, config, {
    readOnly: indexMode !== "write"
  });
  const nodes = [];
  let totalBytes = 0;
  let cacheHits = 0;
  let cacheMisses = 0;

  try {
    for (const absolutePath of absoluteFiles) {
      const relativePath = toPosix(path.relative(canonicalRoot, absolutePath));
      let sourceFile;
      try {
        sourceFile = await readRegularFile(absolutePath, {
          maxBytes: config.limits.maxFileSizeBytes
        });
      } catch (error) {
        throw new Error(`Could not safely read ${relativePath}: ${error.message}`);
      }
      totalBytes += sourceFile.size;
      if (totalBytes > config.limits.maxTotalBytes) {
        throw new Error(
          `Indexed source exceeds limits.maxTotalBytes (${config.limits.maxTotalBytes}) at ${relativePath}.`
        );
      }
      const source = normalizeSource(sourceFile.contents);
      const contentHash = sha256(source);
      const language = languageForPath(relativePath, languageMap);
      let evidence = index.get(relativePath, contentHash);
      if (evidence) {
        cacheHits += 1;
      } else {
        cacheMisses += 1;
        evidence = await collectorRegistry.collect({
          source,
          filePath: relativePath,
          language
        });
        index.set(relativePath, contentHash, evidence);
      }
      const parseErrors = evidence.diagnostics.filter(
        (diagnostic) => diagnostic.severity === "error"
      );
      if (parseErrors.length > 0) {
        const first = parseErrors[0];
        throw new Error(
          `Could not parse ${relativePath} with ${evidence.collector.id}: ${first.message} (${first.line}:${first.column}).`
        );
      }
      const imports = [
        ...new Set(evidence.imports.map((imported) => imported.specifier))
      ];
      const entrypoint =
        config.entrypoints.includes(relativePath) ||
        inferEntrypoint(relativePath);
      const role = roleFor(relativePath, evidence, entrypoint);
      nodes.push({
        id: `file:${relativePath}`,
        type: "file",
        path: relativePath,
        language,
        contentHash,
        lines: source === "" ? 0 : source.split("\n").length,
        owner: ownerFor(relativePath, config.ownership, codeowners),
        entrypoint,
        publicSurface: entrypoint || role === "api",
        role,
        symbols: evidence.symbols,
        trust: {
          repositoryContent: "untrusted",
          instructionSignals: detectPromptInjection(source)
        },
        unresolvedImports: imports,
        _absolutePath: absolutePath
      });
    }
    index.removeMissing(nodes.map((node) => node.path));
  } finally {
    await index.close();
  }

  const nodeByAbsolutePath = new Map(
    nodes.map((node) => [path.resolve(node._absolutePath), node])
  );
  const edges = [];
  for (const node of nodes) {
    for (const specifier of node.unresolvedImports) {
      const targetPath = candidateImportPaths(
        node._absolutePath,
        specifier,
        node.language
      ).find((candidate) => knownFiles.has(path.resolve(candidate)));
      if (!targetPath) continue;
      const target = nodeByAbsolutePath.get(path.resolve(targetPath));
      if (!target || target.id === node.id) continue;
      edges.push({
        type: "imports",
        from: node.id,
        to: target.id,
        evidence: {
          source: node.path,
          specifier
        }
      });
      if (node.role === "test") {
        edges.push({
          type: "tests",
          from: node.id,
          to: target.id,
          evidence: {
            source: node.path,
            reference: specifier
          }
        });
      }
    }
    delete node._absolutePath;
    delete node.unresolvedImports;
  }

  const sourceNodes = [...nodes];
  const languages = {};
  for (const node of nodes) {
    languages[node.language] = (languages[node.language] ?? 0) + 1;
  }
  const sourceHash = sha256(
    sourceNodes
      .map((node) => `${node.path}:${node.contentHash}`)
      .sort()
      .join("\n")
  );
  const partialGraph = {
    nodes: sourceNodes,
    edges
  };
  const authored = await collectAuthoredKnowledge(
    canonicalRoot,
    config,
    partialGraph
  );
  nodes.push(...authored.nodes);
  edges.push(...authored.edges);

  const ownerValues = [
    ...new Set(
      sourceNodes
        .flatMap((node) => node.owner?.split(/\s+/) ?? [])
        .filter(Boolean)
    )
  ].sort();
  for (const owner of ownerValues) {
    const ownerNode = {
      id: `owner:${owner}`,
      type: "owner",
      path: codeowners.path ?? "prodocs.config.json",
      title: owner,
      trust: {
        authored: true,
        repositoryContent: "untrusted",
        instructionSignals: []
      }
    };
    nodes.push(ownerNode);
    for (const node of sourceNodes.filter((candidate) =>
      candidate.owner?.split(/\s+/).includes(owner)
    )) {
      edges.push({
        type: "owns",
        from: ownerNode.id,
        to: node.id,
        evidence: {
          source: codeowners.path ?? "prodocs.config.json",
          reference: node.path
        }
      });
    }
  }

  edges.sort((left, right) =>
    `${left.type}:${left.from}:${left.to}`.localeCompare(
      `${right.type}:${right.from}:${right.to}`
    )
  );
  const inputHash = sha256(
    `${sourceHash}\n${authored.knowledgeHash}\n${stableJson(config)}`
  );

  const graph = {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    sourceHash,
    knowledgeHash: authored.knowledgeHash,
    inputHash,
    root: ".",
    stats: {
      files: sourceNodes.length,
      lines: sourceNodes.reduce((total, node) => total + node.lines, 0),
      symbols: sourceNodes.reduce(
        (total, node) => total + node.symbols.length,
        0
      ),
      edges: edges.length,
      languages,
      knowledge: authored.coverage,
      index: {
        backend: index.backend,
        entries: sourceNodes.length
      }
    },
    nodes,
    edges
  };
  Object.defineProperty(graph, "runtime", {
    value: {
      index: {
        backend: index.backend,
        cacheHits,
        cacheMisses
      }
    },
    enumerable: false
  });
  return graph;
}
