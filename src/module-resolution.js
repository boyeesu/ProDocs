import path from "node:path";
import { DEFAULT_CONFIG } from "./constants.js";
import { isInside } from "./paths.js";
import {
  aliasContextForFile,
  loadAliasContexts,
  resolveAlias
} from "./tsconfig.js";

const EXTENSIONS = [
  ".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".mts", ".cts", ".py", ".go", ".rs"
];
const TYPESCRIPT_EXTENSIONS = [
  ".ts", ".tsx", ".d.ts",
  ...EXTENSIONS.filter((extension) => extension !== ".ts" && extension !== ".tsx")
];
const RUNTIME_EXTENSION_SOURCES = {
  ".js": [".ts", ".tsx", ".d.ts"],
  ".jsx": [".ts", ".tsx", ".d.ts"],
  ".mjs": [".mts", ".d.mts"],
  ".cjs": [".cts", ".d.cts"]
};

export async function loadModuleResolution(
  root,
  config = DEFAULT_CONFIG,
  absoluteFiles = []
) {
  const loaded = await loadAliasContexts(root, config, absoluteFiles);
  const rootContext = loaded.contexts.find((context) => context.directory === root);
  return {
    source: rootContext?.source ?? null,
    hash: loaded.fingerprint,
    contexts: loaded.contexts,
    bytesRead: loaded.bytesRead
  };
}

// Literal runtime files keep precedence; substitute TypeScript sources only
// when absent from the index. Extensionless TS imports prefer TS sources.
function candidates(stem, language) {
  const extension = path.extname(stem);
  const sources = RUNTIME_EXTENSION_SOURCES[extension] ?? [];
  const extensions = language === "TypeScript" ? TYPESCRIPT_EXTENSIONS : EXTENSIONS;
  return [
    stem,
    ...sources.map((source) => `${stem.slice(0, -extension.length)}${source}`),
    ...extensions.map((suffix) => `${stem}${suffix}`),
    ...extensions.map((suffix) => path.join(stem, `index${suffix}`)),
    path.join(stem, "mod.rs")
  ];
}

function resolvePythonImport(fromFile, specifier, knownFiles) {
  if (!specifier.startsWith(".")) return { kind: "external", targetPath: null };
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

export function resolveImport({
  root,
  fromFile,
  specifier,
  language,
  resolution,
  knownFiles
}) {
  if (language === "Python") {
    return resolvePythonImport(fromFile, specifier, knownFiles);
  }
  const explicitExtension = path.extname(specifier).toLowerCase();
  if (explicitExtension && !EXTENSIONS.includes(explicitExtension)) {
    return { kind: "asset", targetPath: null };
  }
  let stems = [];
  let kind = "external";
  if (specifier.startsWith(".")) {
    kind = "relative";
    stems = [path.resolve(path.dirname(fromFile), specifier)];
  } else if (language === "JavaScript" || language === "TypeScript") {
    const context = aliasContextForFile(fromFile, resolution.contexts);
    const alias = resolveAlias(specifier, context);
    stems = alias.stems;
    if (alias.matched) kind = "alias";
  }
  for (const stem of stems) {
    for (const candidate of candidates(stem, language)) {
      const absolute = path.resolve(candidate);
      if (isInside(root, absolute) && knownFiles.has(absolute)) {
        return { kind: kind === "external" ? "baseUrl" : kind, targetPath: absolute };
      }
    }
  }
  return {
    kind: kind === "external" ? kind : `unresolved-${kind}`,
    targetPath: null
  };
}
