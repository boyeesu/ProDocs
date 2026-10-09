import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { EXTENSION_LANGUAGE } from "./constants.js";
import { isExcluded, isInside } from "./paths.js";
import { readRegularFile } from "./safe-fs.js";
import { toPosix } from "./security.js";
import { parseConfig } from "./tsconfig-json.js";

const MAX_EXTENDS_DEPTH = 32;
const MAX_CONFIG_FILES = 5000;
const CONFIG_NAMES = ["tsconfig.json", "jsconfig.json"];
const EMPTY_OPTIONS = { baseDirectory: null, pathsDirectory: null, paths: [] };

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validPath(value) {
  return typeof value === "string" && value.length <= 1024 && !value.includes("\0");
}

function resolveConfigPath(directory, value) {
  return path.resolve(directory, value.replaceAll("\\", "/"));
}

function isAbsoluteConfigPath(value) {
  return path.posix.isAbsolute(value.replaceAll("\\", "/")) ||
    path.win32.isAbsolute(value);
}

function normalizePaths(paths) {
  if (!isObject(paths)) throw new Error("compilerOptions.paths must be an object.");
  const entries = [];
  if (Object.keys(paths).length > 256) {
    throw new Error("compilerOptions.paths exceeds the 256-entry safety limit.");
  }
  for (const [pattern, targets] of Object.entries(paths)) {
    if (!validPath(pattern) || !pattern || pattern.split("*").length > 2) {
      throw new Error(`Invalid compilerOptions.paths pattern: ${pattern}`);
    }
    if (!Array.isArray(targets) || targets.length === 0 || targets.length > 16) {
      throw new Error(`Path mapping ${pattern} must contain 1 to 16 targets.`);
    }
    if (targets.some((target) =>
      !validPath(target) || !target.trim() ||
      isAbsoluteConfigPath(target) || target.split("*").length > 2
    )) {
      throw new Error(`Invalid target in compilerOptions.paths.${pattern}.`);
    }
    entries.push({ pattern, targets });
  }
  return entries;
}

// Inspect ancestors of indexed JS/TS files, rather than crawling unrelated
// projects. This also finds root configs when source is a directory or file.
export async function loadAliasContexts(root, config, absoluteFiles) {
  const directories = new Set([root]);
  for (const file of absoluteFiles) {
    const language = EXTENSION_LANGUAGE[path.extname(file)];
    if (language !== "JavaScript" && language !== "TypeScript") continue;
    for (let directory = path.dirname(file); isInside(root, directory);) {
      if (directories.has(directory)) break;
      directories.add(directory);
      if (directory === root) break;
      directory = path.dirname(directory);
    }
  }

  const cache = new Map();
  const active = new Set();
  let filesRead = 0;
  let bytesRead = 0;

  async function readConfig(absolutePath) {
    if (!isInside(root, absolutePath)) {
      throw new Error("TypeScript config escapes the project root.");
    }
    if (isExcluded(path.relative(root, absolutePath), config.exclude)) {
      throw new Error("TypeScript config is excluded from indexing.");
    }
    // Do not canonicalize away a symlink before the safe file reader sees it.
    let current = root;
    for (const segment of path.relative(root, absolutePath).split(path.sep)) {
      current = path.join(current, segment);
      const stat = await fs.lstat(current);
      if (stat.isSymbolicLink()) {
        throw new Error("TypeScript config path contains a symbolic link.");
      }
    }
    filesRead += 1;
    if (filesRead > MAX_CONFIG_FILES) {
      throw new Error(`TypeScript config discovery exceeds ${MAX_CONFIG_FILES} files.`);
    }
    const file = await readRegularFile(absolutePath, {
      maxBytes: Math.min(1024 * 1024, config.limits.maxFileSizeBytes)
    });
    bytesRead += file.size;
    if (bytesRead > config.limits.maxTotalBytes) {
      throw new Error("TypeScript configs exceed limits.maxTotalBytes.");
    }
    try {
      return parseConfig(file.contents);
    } catch (error) {
      throw new Error(`Could not parse ${path.relative(root, absolutePath)}: ${error.message}`);
    }
  }

  async function resolveCompilerOptions(absolutePath, depth = 0) {
    if (depth > MAX_EXTENDS_DEPTH) {
      throw new Error(`TypeScript config extends exceeds ${MAX_EXTENDS_DEPTH} levels.`);
    }
    if (active.has(absolutePath)) throw new Error("Circular TypeScript config extends.");
    if (cache.has(absolutePath)) return cache.get(absolutePath);
    let document;
    try {
      document = await readConfig(absolutePath);
    } catch (error) {
      if (error.code === "ENOENT") {
        cache.set(absolutePath, null);
        return null;
      }
      throw new Error(`Could not read ${path.relative(root, absolutePath)}: ${error.message}`);
    }

    active.add(absolutePath);
    try {
      const directory = path.dirname(absolutePath);
      const inherited = { ...EMPTY_OPTIONS };
      const extendValues = document.extends === undefined
        ? []
        : Array.isArray(document.extends) ? document.extends : [document.extends];
      for (const entry of extendValues) {
        if (!validPath(entry) || entry === "") {
          throw new Error(`Invalid TypeScript config extends in ${path.relative(root, absolutePath)}.`);
        }
        // Package configs would depend on installed node_modules state. Only
        // repository-local relative extends are supported by this resolver.
        if (!entry.startsWith(".")) continue;
        const extendedPath = resolveConfigPath(
          directory,
          entry.endsWith(".json") ? entry : `${entry}.json`
        );
        const parent = await resolveCompilerOptions(extendedPath, depth + 1);
        if (!parent) {
          throw new Error(`Extended TypeScript config does not exist: ${path.relative(root, extendedPath)}`);
        }
        // Later bases win, but paths and baseUrl inherit independently.
        if (parent.baseDirectory !== null) inherited.baseDirectory = parent.baseDirectory;
        if (parent.pathsDirectory !== null) {
          inherited.pathsDirectory = parent.pathsDirectory;
          inherited.paths = parent.paths;
        }
      }

      const options = document.compilerOptions ?? {};
      if (!isObject(options)) throw new Error("compilerOptions must be an object.");
      if (Object.hasOwn(options, "baseUrl")) {
        if (!validPath(options.baseUrl)) throw new Error("compilerOptions.baseUrl must be a path string.");
        if (isAbsoluteConfigPath(options.baseUrl)) {
          throw new Error("compilerOptions.baseUrl must be relative.");
        }
        inherited.baseDirectory = resolveConfigPath(directory, options.baseUrl);
        if (!isInside(root, inherited.baseDirectory)) {
          throw new Error("compilerOptions.baseUrl escapes the project root.");
        }
      }
      if (Object.hasOwn(options, "paths")) {
        inherited.paths = normalizePaths(options.paths);
        inherited.pathsDirectory = directory;
      }
      cache.set(absolutePath, inherited);
      return inherited;
    } finally {
      active.delete(absolutePath);
    }
  }

  const contexts = [];
  for (const directory of [...directories].sort((a, b) =>
    toPosix(a).localeCompare(toPosix(b))
  )) {
    for (const name of CONFIG_NAMES) {
      const absolutePath = path.join(directory, name);
      if (isExcluded(path.relative(root, absolutePath), config.exclude)) continue;
      const options = await resolveCompilerOptions(absolutePath);
      // Even an empty nested config is a scope boundary. TypeScript configs
      // take precedence over jsconfig in the same directory.
      if (options) {
        contexts.push({
          directory,
          source: path.relative(root, absolutePath).split(path.sep).join("/"),
          ...options
        });
        break;
      }
    }
  }
  const relative = (value) => value === null
    ? null
    : path.relative(root, value).split(path.sep).join("/");
  const fingerprint = crypto
    .createHash("sha256")
    .update(JSON.stringify(
      contexts.map((context) => ({
        directory: relative(context.directory),
        source: context.source,
        baseDirectory: relative(context.baseDirectory),
        pathsDirectory: relative(context.pathsDirectory),
        paths: context.paths
      }))
    ))
    .digest("hex");
  return { contexts, fingerprint, bytesRead };
}

export function aliasContextForFile(absoluteFile, contexts) {
  let best = null;
  for (const context of contexts) {
    if (absoluteFile === context.directory || !isInside(context.directory, absoluteFile)) continue;
    if (!best || context.directory.length > best.directory.length) best = context;
  }
  return best;
}

function matchPattern(pattern, specifier) {
  const star = pattern.indexOf("*");
  if (star === -1) return pattern === specifier ? "" : null;
  const prefix = pattern.slice(0, star);
  const suffix = pattern.slice(star + 1);
  if (
    specifier.length < prefix.length + suffix.length ||
    !specifier.startsWith(prefix) ||
    !specifier.endsWith(suffix)
  ) return null;
  return specifier.slice(prefix.length, specifier.length - suffix.length);
}

// Exact paths win over wildcards; otherwise choose the longest matching prefix.
// Only the selected pattern's targets are fallbacks, in their declared order.
export function resolveAlias(specifier, context) {
  if (
    !context ||
    specifier.startsWith(".") ||
    specifier.startsWith("/") ||
    /^[a-z][a-z\d+.-]*:/i.test(specifier)
  ) return { stems: [], matched: false };
  let best = null;
  let captured = null;
  for (const entry of context.paths) {
    const match = matchPattern(entry.pattern, specifier);
    if (match === null) continue;
    if (!entry.pattern.includes("*")) {
      best = entry;
      captured = match;
      break;
    }
    if (!best || entry.pattern.indexOf("*") > best.pattern.indexOf("*")) {
      best = entry;
      captured = match;
    }
  }
  const base = context.baseDirectory ?? context.pathsDirectory;
  const candidates = best
    ? best.targets.map((target) =>
        resolveConfigPath(base, target.replace("*", () => captured))
      )
    : [];
  if (context.baseDirectory !== null) {
    candidates.push(resolveConfigPath(context.baseDirectory, specifier));
  }
  return { stems: candidates, matched: best !== null };
}

export function aliasCandidates(specifier, context) {
  return resolveAlias(specifier, context).stems;
}
