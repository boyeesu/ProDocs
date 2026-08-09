import path from "node:path";
import { isInside, resolveOutputPath, resolveSourcePath } from "./paths.js";
import { readRegularFile } from "./safe-fs.js";

const ROOT_MARKDOWN = [
  "SYSTEM_OVERVIEW.md",
  "CODE_MAP.md",
  "FEATURE_MAP.md",
  "KNOWLEDGE_HEALTH.md"
];

function audiencePath(audience) {
  return `views/${audience.toLowerCase().replace(/[^a-z0-9_-]+/g, "-")}.md`;
}

export function generatedMarkdownPaths(config) {
  return [
    ...ROOT_MARKDOWN,
    ...config.documentation.audiences.map(audiencePath)
  ];
}

function localTargets(markdown) {
  return [...markdown.matchAll(/\]\(([^)\n]+)\)/g)]
    .map((match) => match[1].trim())
    .filter(
      (target) =>
        target &&
        !target.startsWith("#") &&
        !/^[a-z][a-z0-9+.-]*:/i.test(target)
    );
}

function decodedPath(target) {
  const withoutFragment = target.split(/[?#]/, 1)[0];
  try {
    return decodeURIComponent(withoutFragment);
  } catch {
    throw new Error("invalid percent encoding");
  }
}

export async function validateGeneratedLinks(root, config) {
  const absoluteRoot = path.resolve(root);
  const output = await resolveOutputPath(root, config.output);
  const issues = [];
  for (const artifact of generatedMarkdownPaths(config)) {
    const file = path.join(output, artifact);
    let markdown;
    try {
      markdown = (await readRegularFile(file, { maxBytes: 4 * 1024 * 1024 }))
        .contents;
    } catch (error) {
      issues.push({ artifact, target: artifact, reason: error.message });
      continue;
    }
    for (const target of localTargets(markdown)) {
      try {
        const absoluteTarget = path.resolve(path.dirname(file), decodedPath(target));
        if (!isInside(absoluteRoot, absoluteTarget)) {
          throw new Error("target escapes the project root");
        }
        const repositoryPath = path.relative(absoluteRoot, absoluteTarget);
        await resolveSourcePath(root, repositoryPath);
      } catch (error) {
        issues.push({ artifact, target, reason: error.message });
      }
    }
  }
  return issues;
}

export function documentationCheckState(fresh, hasManifest, issues) {
  if (!fresh) {
    return {
      ready: false,
      message: hasManifest
        ? "Documentation is stale. Run `prodocs sync` and commit the result."
        : "Documentation has not been generated. Run `prodocs sync`."
    };
  }
  if (issues.length > 0) {
    return {
      ready: false,
      message: `Generated documentation contains ${issues.length} broken local link(s). Run \`prodocs sync\` and check again.`
    };
  }
  return { ready: true, message: null };
}
