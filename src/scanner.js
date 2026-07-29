import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  EXTENSION_LANGUAGE,
  SUPPORTED_EXTENSIONS
} from "./constants.js";
import { collectSourceEvidence } from "./collectors/index.js";
import { resolveSourcePath } from "./paths.js";
import { readRegularFile } from "./safe-fs.js";

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function toPosix(value) {
  return value.split(path.sep).join("/");
}

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
      await walk(absolute, root, excluded, include, maxFiles, files);
    } else if (
      entry.isFile() &&
      SUPPORTED_EXTENSIONS.has(path.extname(entry.name)) &&
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

async function discoverFiles(root, config) {
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
        files
      );
    } else {
      const relative = path.relative(root, absolute);
      if (
        stat.isFile() &&
        !isExcluded(relative, config.exclude) &&
        SUPPORTED_EXTENSIONS.has(path.extname(absolute)) &&
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

function ownerFor(relativePath, ownership) {
  for (const [pattern, owner] of Object.entries(ownership ?? {})) {
    const prefix = pattern.replace(/\*+$/, "").replace(/\/$/, "");
    if (relativePath.startsWith(prefix)) return owner;
  }
  return null;
}

export async function scanProject(root, config) {
  const canonicalRoot = await fs.realpath(root);
  const absoluteFiles = await discoverFiles(canonicalRoot, config);
  const knownFiles = new Set(absoluteFiles.map((file) => path.resolve(file)));
  const nodes = [];
  let totalBytes = 0;

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
    const language = EXTENSION_LANGUAGE[path.extname(absolutePath)];
    const evidence = await collectSourceEvidence({
      source,
      filePath: relativePath,
      language
    });
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
    nodes.push({
      id: `file:${relativePath}`,
      type: "file",
      path: relativePath,
      language,
      contentHash: sha256(source),
      lines: source === "" ? 0 : source.split("\n").length,
      owner: ownerFor(relativePath, config.ownership),
      entrypoint:
        config.entrypoints.includes(relativePath) || inferEntrypoint(relativePath),
      symbols: evidence.symbols,
      unresolvedImports: imports,
      _absolutePath: absolutePath
    });
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
    }
    delete node._absolutePath;
    delete node.unresolvedImports;
  }

  const languages = {};
  for (const node of nodes) {
    languages[node.language] = (languages[node.language] ?? 0) + 1;
  }
  const sourceHash = sha256(
    nodes
      .map((node) => `${node.path}:${node.contentHash}`)
      .sort()
      .join("\n")
  );
  const inputHash = sha256(`${sourceHash}\n${stableJson(config)}`);

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sourceHash,
    inputHash,
    root: ".",
    stats: {
      files: nodes.length,
      lines: nodes.reduce((total, node) => total + node.lines, 0),
      symbols: nodes.reduce((total, node) => total + node.symbols.length, 0),
      edges: edges.length,
      languages
    },
    nodes,
    edges
  };
}
