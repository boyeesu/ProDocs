import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { readRegularFile } from "./safe-fs.js";
import { detectPromptInjection, toPosix } from "./security.js";

const executeFile = promisify(execFile);
const SOURCE_EXTENSIONS = "(?:js|jsx|mjs|cjs|ts|tsx|mts|cts|py|go|rs)";

function cleanText(value, maximum = 1000) {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/\s+/g, " ").trim().slice(0, maximum);
  if (!cleaned || detectPromptInjection(cleaned).length > 0) return null;
  return cleaned;
}

function lineFor(source, offset) {
  return source.slice(0, offset).split("\n").length;
}

function fieldFromSource(source, field) {
  const pattern = new RegExp(
    `(?:^|[,{\\n]\\s*)${field}\\s*:\\s*(["'\x60])([\\s\\S]{1,2000}?)\\1`,
    "m"
  );
  const match = pattern.exec(source);
  const value = cleanText(match?.[2]);
  return value ? { value, line: lineFor(source, match.index) } : null;
}

function productNameFromHeading(source) {
  const match = /^#\s+(.+)$/m.exec(source);
  const value = cleanText(match?.[1]?.split(/\s+[—–|]\s+/)[0], 200);
  return value ? { value, line: lineFor(source, match.index) } : null;
}

function descriptionFromReadme(source) {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  let paragraph = "";
  let start = 1;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line || line.startsWith("#") || line.startsWith("[!") || line.startsWith("<")) {
      if (paragraph) break;
      continue;
    }
    if (!paragraph) start = index + 1;
    paragraph += `${paragraph ? " " : ""}${line}`;
    if (paragraph.length >= 80) break;
  }
  const value = cleanText(paragraph.replace(/[*_`]/g, ""));
  return value ? { value, line: start } : null;
}

async function optionalFile(root, relativePath, maximum = 1024 * 1024) {
  try {
    return await readRegularFile(path.join(root, relativePath), {
      maxBytes: maximum
    });
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw new Error(`Could not safely inspect ${relativePath}: ${error.message}`);
  }
}

async function packageEvidence(root) {
  const file = await optionalFile(root, "package.json");
  if (!file) return {};
  try {
    const manifest = JSON.parse(file.contents);
    return {
      name: cleanText(manifest.name?.replace(/^@[^/]+\//, ""), 200),
      description: cleanText(manifest.description),
      framework: Object.keys({
        ...(manifest.dependencies ?? {}),
        ...(manifest.devDependencies ?? {})
      }).sort()
    };
  } catch (error) {
    throw new Error(`Could not parse package.json during adoption: ${error.message}`);
  }
}

function humanizePackageName(value) {
  if (!value) return null;
  return value
    .split(/[-_.]+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

async function structuredSiteEvidence(root, sourceNodes) {
  const candidates = sourceNodes
    .map((node) => node.path)
    .filter((file) => /(^|\/)(?:site|brand)(?:\.config)?\.[^.]+$/i.test(file))
    .sort((left, right) => {
      const score = (value) => (value.includes("src/lib/") ? 0 : value.includes("src/") ? 1 : 2);
      return score(left) - score(right) || left.localeCompare(right);
    });
  for (const relativePath of candidates.slice(0, 32)) {
    const file = await optionalFile(root, relativePath);
    if (!file) continue;
    const name = fieldFromSource(file.contents, "legalName") ?? fieldFromSource(file.contents, "brand");
    const description = fieldFromSource(file.contents, "description");
    if (name || description) return { path: relativePath, name, description };
  }
  return {};
}

function inference(value, confidence, evidence) {
  return { value, confidence, evidence };
}

async function inferIdentity(root, sourceNodes) {
  const [site, packageInfo, readme] = await Promise.all([
    structuredSiteEvidence(root, sourceNodes),
    packageEvidence(root),
    optionalFile(root, "README.md")
  ]);
  const readmeName = readme ? productNameFromHeading(readme.contents) : null;
  const readmeDescription = readme
    ? descriptionFromReadme(readme.contents)
    : null;
  const name = site.name
    ? inference(site.name.value, "high", [`${site.path}:${site.name.line}#legalName`])
    : readmeName
      ? inference(readmeName.value, "medium", [`README.md:${readmeName.line}#heading`])
      : packageInfo.name
        ? inference(humanizePackageName(packageInfo.name), "medium", ["package.json#name"])
        : null;
  const description = site.description
    ? inference(site.description.value, "high", [`${site.path}:${site.description.line}#description`])
    : packageInfo.description
      ? inference(packageInfo.description, "high", ["package.json#description"])
      : readmeDescription
        ? inference(readmeDescription.value, "medium", [`README.md:${readmeDescription.line}#paragraph`])
        : null;
  return { name, description, frameworks: packageInfo.framework ?? [] };
}

function entrypointReason(file, frameworks) {
  if (new RegExp(`(^|/)app/(?:.+/)?(?:page|layout|route)\\.${SOURCE_EXTENSIONS}$`).test(file)) {
    return "Next.js App Router boundary";
  }
  if (new RegExp(`(^|/)app/(?:robots|sitemap|manifest)\\.${SOURCE_EXTENSIONS}$`).test(file)) {
    return "framework metadata endpoint";
  }
  if (new RegExp(`(^|/)(?:middleware|instrumentation)\\.${SOURCE_EXTENSIONS}$`).test(file)) {
    return "framework runtime boundary";
  }
  if (
    frameworks.includes("next") &&
    new RegExp(`(^|/)pages/(?!.*\\.(?:test|spec)\\.)[^/]+\\.${SOURCE_EXTENSIONS}$`).test(file)
  ) {
    return "Next.js Pages Router boundary";
  }
  return null;
}

function inferEntrypoints(sourceNodes, frameworks) {
  const inferred = [];
  for (const node of sourceNodes) {
    const reason = entrypointReason(node.path, frameworks);
    if (node.entrypoint || reason) {
      inferred.push({
        path: node.path,
        confidence: reason ? "high" : "medium",
        reason: reason ?? "language entrypoint convention",
        evidence: [`${node.path}#source`]
      });
    }
  }
  return inferred
    .sort((left, right) => left.path.localeCompare(right.path))
    .slice(0, 10_000);
}

function githubOwner(remote) {
  const match = /github\.com[/:]([^/]+)\/[^/]+?(?:\.git)?$/.exec(remote.trim());
  return /^[A-Za-z0-9_.-]+$/.test(match?.[1] ?? "") ? `@${match[1]}` : null;
}

async function inferOwnership(root, sourceNodes) {
  const existing = [...new Set(sourceNodes.map((node) => node.owner).filter(Boolean))];
  if (existing.length > 0) {
    return inference(existing.sort().join(" "), "high", ["CODEOWNERS/configured ownership"]);
  }
  try {
    const { stdout } = await executeFile("git", ["-C", root, "remote", "get-url", "origin"], {
      encoding: "utf8",
      timeout: 10_000,
      windowsHide: true
    });
    const owner = githubOwner(stdout);
    return owner ? inference(owner, "high", ["git:origin#repository-owner"]) : null;
  } catch {
    return null;
  }
}

export async function inferAdoption(root, graph) {
  const sourceNodes = graph.nodes.filter((node) => node.type === "file");
  const identity = await inferIdentity(root, sourceNodes);
  return {
    productName: identity.name,
    oneLineDescription: identity.description,
    entrypoints: inferEntrypoints(sourceNodes, identity.frameworks),
    ownership: await inferOwnership(root, sourceNodes),
    sourceFiles: sourceNodes.length,
    sourceHash: graph.sourceHash,
    repositoryRoot: toPosix(path.relative(root, root)) || "."
  };
}
