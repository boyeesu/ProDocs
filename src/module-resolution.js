import fs from "node:fs/promises";
import path from "node:path";
import { isInside } from "./paths.js";
import { readRegularFile } from "./safe-fs.js";
import { sha256 } from "./security.js";

const CONFIG_NAMES = ["tsconfig.json", "jsconfig.json"];
const EXTENSIONS = [
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

function stripJsonComments(source) {
  let result = "";
  let inString = false;
  let escaped = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    if (inString) {
      result += character;
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
      result += character;
    } else if (character === "/" && next === "/") {
      while (index < source.length && source[index] !== "\n") index += 1;
      result += "\n";
    } else if (character === "/" && next === "*") {
      index += 2;
      while (
        index < source.length &&
        !(source[index] === "*" && source[index + 1] === "/")
      ) {
        if (source[index] === "\n") result += "\n";
        index += 1;
      }
      index += 1;
    } else {
      result += character;
    }
  }
  return result;
}

function stripTrailingCommas(source) {
  let result = "";
  let inString = false;
  let escaped = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (inString) {
      result += character;
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
      result += character;
      continue;
    }
    if (character === ",") {
      let cursor = index + 1;
      while (/\s/.test(source[cursor] ?? "")) cursor += 1;
      if (source[cursor] === "}" || source[cursor] === "]") continue;
    }
    result += character;
  }
  return result;
}

function parseConfig(contents, name) {
  try {
    return JSON.parse(stripTrailingCommas(stripJsonComments(contents)));
  } catch (error) {
    throw new Error(`Could not parse ${name}: ${error.message}`);
  }
}

function wildcardCount(value) {
  return [...value].filter((character) => character === "*").length;
}

function validateMappings(paths) {
  if (paths === undefined) return [];
  if (!paths || typeof paths !== "object" || Array.isArray(paths)) {
    throw new Error("compilerOptions.paths must be an object.");
  }
  const entries = Object.entries(paths);
  if (entries.length > 256) {
    throw new Error("compilerOptions.paths exceeds the 256-entry safety limit.");
  }
  return entries.map(([pattern, targets]) => {
    if (!pattern || wildcardCount(pattern) > 1) {
      throw new Error(`Invalid compilerOptions.paths pattern: ${pattern}`);
    }
    if (!Array.isArray(targets) || targets.length === 0 || targets.length > 16) {
      throw new Error(`Path mapping ${pattern} must contain 1 to 16 targets.`);
    }
    const validatedTargets = targets.map((target) => {
      if (
        typeof target !== "string" ||
        target.trim() === "" ||
        path.isAbsolute(target) ||
        wildcardCount(target) > 1
      ) {
        throw new Error(`Invalid target in compilerOptions.paths.${pattern}.`);
      }
      return target;
    });
    return { pattern, targets: validatedTargets };
  });
}

export async function loadModuleResolution(root) {
  for (const name of CONFIG_NAMES) {
    const configPath = path.join(root, name);
    try {
      const { contents } = await readRegularFile(configPath, {
        maxBytes: 1024 * 1024
      });
      const parsed = parseConfig(contents, name);
      const compilerOptions = parsed.compilerOptions ?? {};
      const baseUrl = compilerOptions.baseUrl ?? ".";
      if (typeof baseUrl !== "string" || path.isAbsolute(baseUrl)) {
        throw new Error(`${name} compilerOptions.baseUrl must be relative.`);
      }
      const absoluteBaseUrl = path.resolve(root, baseUrl);
      if (!isInside(root, absoluteBaseUrl)) {
        throw new Error(`${name} compilerOptions.baseUrl escapes the project root.`);
      }
      return {
        source: name,
        hash: sha256(contents.replace(/\r\n?/g, "\n")),
        root,
        baseUrl: absoluteBaseUrl,
        mappings: validateMappings(compilerOptions.paths)
      };
    } catch (error) {
      if (error.code === "ENOENT") continue;
      throw new Error(`Could not safely load module resolution: ${error.message}`);
    }
  }
  return { source: null, hash: sha256(""), root, baseUrl: root, mappings: [] };
}

function candidates(stem) {
  return [
    stem,
    ...EXTENSIONS.map((extension) => `${stem}${extension}`),
    ...EXTENSIONS.map((extension) => path.join(stem, `index${extension}`)),
    path.join(stem, "mod.rs")
  ];
}

function aliasStems(specifier, resolution) {
  const stems = [];
  for (const mapping of resolution.mappings) {
    const star = mapping.pattern.indexOf("*");
    let replacement = "";
    if (star === -1) {
      if (specifier !== mapping.pattern) continue;
    } else {
      const prefix = mapping.pattern.slice(0, star);
      const suffix = mapping.pattern.slice(star + 1);
      if (!specifier.startsWith(prefix) || !specifier.endsWith(suffix)) continue;
      replacement = specifier.slice(prefix.length, specifier.length - suffix.length);
    }
    for (const target of mapping.targets) {
      const substituted = target.includes("*")
        ? target.replaceAll("*", replacement)
        : target;
      const absolute = path.resolve(resolution.baseUrl, substituted);
      if (isInside(resolution.root, absolute)) stems.push(absolute);
    }
  }
  return stems;
}

export function resolveImport({
  root,
  fromFile,
  specifier,
  language,
  resolution,
  knownFiles
}) {
  let stems = [];
  let kind = "external";
  const explicitExtension = path.extname(specifier).toLowerCase();
  if (
    explicitExtension &&
    !EXTENSIONS.includes(explicitExtension)
  ) {
    return { kind: "asset", targetPath: null };
  }
  if (language === "Python") {
    if (!specifier.startsWith(".")) return { kind, targetPath: null };
    const dotCount = specifier.match(/^\.+/)?.[0].length ?? 0;
    let base = path.dirname(fromFile);
    for (let index = 1; index < dotCount; index += 1) base = path.dirname(base);
    const modulePath = specifier.slice(dotCount).replaceAll(".", path.sep);
    const stem = path.join(base, modulePath);
    const targetPath = [`${stem}.py`, path.join(stem, "__init__.py")].find(
      (candidate) => knownFiles.has(path.resolve(candidate))
    );
    return { kind: targetPath ? "relative" : "unresolved-relative", targetPath };
  }
  if (specifier.startsWith(".")) {
    kind = "relative";
    stems = [path.resolve(path.dirname(fromFile), specifier)];
  } else {
    stems = aliasStems(specifier, resolution);
    if (stems.length > 0) kind = "alias";
  }
  for (const stem of stems) {
    for (const candidate of candidates(stem)) {
      const absolute = path.resolve(candidate);
      if (isInside(root, absolute) && knownFiles.has(absolute)) {
        return { kind, targetPath: absolute };
      }
    }
  }
  return {
    kind: kind === "external" ? kind : `unresolved-${kind}`,
    targetPath: null
  };
}
