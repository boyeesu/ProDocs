import fs from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { matchesGlob } from "./scanner.js";
import {
  detectPromptInjection,
  normalizeRepositoryPath,
  sha256,
  stableJson,
  toPosix
} from "./security.js";
import { readRegularFile } from "./safe-fs.js";
import { resolveSourcePath } from "./paths.js";

const KNOWLEDGE_KINDS = new Set([
  "claim",
  "decision",
  "invariant",
  "feature",
  "runbook"
]);
const IDENTIFIER = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;

function strings(value, field, { required = false, maximum = 256 } = {}) {
  if (value === undefined && !required) return [];
  const list = typeof value === "string" ? [value] : value;
  if (
    !Array.isArray(list) ||
    (required && list.length === 0) ||
    list.length > maximum ||
    list.some(
      (item) =>
        typeof item !== "string" ||
        item.trim() === "" ||
        item.length > 2048 ||
        item.includes("\0")
    )
  ) {
    throw new Error(
      `${field} must contain at most ${maximum} non-empty strings.`
    );
  }
  return [...new Set(list.map((item) => item.trim()))].sort();
}

function parseFrontMatter(contents, filePath) {
  const normalized = contents.replace(/\r\n?/g, "\n");
  if (!normalized.startsWith("---\n")) {
    throw new Error(`${filePath} must start with YAML front matter.`);
  }
  const end = normalized.indexOf("\n---\n", 4);
  if (end === -1) {
    throw new Error(`${filePath} has unterminated YAML front matter.`);
  }
  const source = normalized.slice(4, end);
  const document = YAML.parseDocument(source, {
    maxAliasCount: 0,
    prettyErrors: false,
    strict: true,
    uniqueKeys: true
  });
  if (document.errors.length > 0) {
    throw new Error(
      `${filePath} has invalid front matter: ${document.errors[0].message}`
    );
  }
  const metadata = document.toJS({ maxAliasCount: 0 });
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    throw new Error(`${filePath} front matter must be an object.`);
  }
  return {
    metadata,
    body: normalized.slice(end + 5).trim()
  };
}

function normalizeEvidenceReference(reference, field) {
  const [rawPath, ...fragments] = reference.replace(/^file:/, "").split("#");
  const evidencePath = normalizeRepositoryPath(rawPath, field);
  return {
    path: evidencePath,
    symbol: fragments.length > 0 ? fragments.join("#").trim() || null : null
  };
}

function verification(value, filePath) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 32) {
    throw new Error(`${filePath} verify must be an array with at most 32 steps.`);
  }
  return value.map((step, index) => {
    if (
      !step ||
      typeof step !== "object" ||
      Array.isArray(step) ||
      typeof step.command !== "string" ||
      step.command.trim() === "" ||
      step.command.includes("\0")
    ) {
      throw new Error(`${filePath} verify[${index}] needs a command string.`);
    }
    const args = step.args ?? [];
    if (
      !Array.isArray(args) ||
      args.length > 128 ||
      args.some(
        (argument) =>
          typeof argument !== "string" ||
          argument.length > 2048 ||
          argument.includes("\0")
      )
    ) {
      throw new Error(`${filePath} verify[${index}].args is invalid.`);
    }
    return {
      command: step.command,
      args,
      cwd: normalizeRepositoryPath(
        step.cwd ?? ".",
        `${filePath} verify[${index}].cwd`
      ),
      timeoutMs:
        Number.isSafeInteger(step.timeoutMs) &&
        step.timeoutMs >= 100 &&
        step.timeoutMs <= 300_000
          ? step.timeoutMs
          : 30_000,
      expectedExitCode:
        Number.isSafeInteger(step.expectedExitCode) &&
        step.expectedExitCode >= 0 &&
        step.expectedExitCode <= 255
          ? step.expectedExitCode
          : 0
    };
  });
}

function normalizeKnowledgeDocument(filePath, contents) {
  const { metadata, body } = parseFrontMatter(contents, filePath);
  const allowed = new Set([
    "kind",
    "id",
    "title",
    "status",
    "evidence",
    "audiences",
    "affects",
    "contradicts",
    "supersedes",
    "customerImpact",
    "verify"
  ]);
  const unknown = Object.keys(metadata).filter((key) => !allowed.has(key));
  if (unknown.length > 0) {
    throw new Error(`${filePath} has unknown front matter: ${unknown.join(", ")}.`);
  }
  if (!KNOWLEDGE_KINDS.has(metadata.kind)) {
    throw new Error(
      `${filePath} kind must be one of ${[...KNOWLEDGE_KINDS].join(", ")}.`
    );
  }
  if (typeof metadata.id !== "string" || !IDENTIFIER.test(metadata.id)) {
    throw new Error(`${filePath} id must be a stable lowercase identifier.`);
  }
  if (
    typeof metadata.title !== "string" ||
    metadata.title.trim() === "" ||
    metadata.title.length > 512
  ) {
    throw new Error(`${filePath} title must be a non-empty string.`);
  }
  if (body === "") throw new Error(`${filePath} must have an authored body.`);
  const evidence = strings(
    metadata.evidence,
    `${filePath} evidence`,
    { maximum: 512 }
  ).map((reference) =>
    normalizeEvidenceReference(reference, `${filePath} evidence`)
  );
  const verify = verification(metadata.verify, filePath);
  if (metadata.kind === "runbook" && verify.length === 0) {
    throw new Error(`${filePath} runbooks require at least one verify step.`);
  }
  const status = metadata.status ?? "active";
  if (!["active", "proposed", "deprecated", "superseded"].includes(status)) {
    throw new Error(`${filePath} has unsupported status ${status}.`);
  }
  return {
    id: `${metadata.kind}:${metadata.id}`,
    key: metadata.id,
    type: metadata.kind,
    path: filePath,
    line: 1,
    title: metadata.title.trim(),
    status,
    bodyHash: sha256(body),
    evidence,
    audiences: strings(metadata.audiences ?? [], `${filePath} audiences`),
    affects: strings(metadata.affects ?? [], `${filePath} affects`).map((value) =>
      normalizeRepositoryPath(value, `${filePath} affects`)
    ),
    contradicts: strings(
      metadata.contradicts ?? [],
      `${filePath} contradicts`
    ),
    supersedes: strings(
      metadata.supersedes ?? [],
      `${filePath} supersedes`
    ),
    customerImpact:
      typeof metadata.customerImpact === "string"
        ? metadata.customerImpact.slice(0, 10_000)
        : "",
    verification: verify,
    trust: {
      authored: true,
      repositoryContent: "untrusted",
      instructionSignals: detectPromptInjection(body)
    },
    _body: body
  };
}

export function validateKnowledgeDocument(filePath, contents) {
  return normalizeKnowledgeDocument(filePath, contents);
}

async function walkMarkdown(directory, root, limits, files = []) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    const relative = toPosix(path.relative(root, absolute));
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      await walkMarkdown(absolute, root, limits, files);
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push({ absolute, relative });
      if (files.length > limits.maxFiles) {
        throw new Error(
          `Knowledge discovery exceeded limits.maxFiles (${limits.maxFiles}).`
        );
      }
    }
  }
  return files;
}

async function discoverKnowledgeFiles(root, config) {
  const files = [];
  for (const configuredPath of config.knowledge.paths) {
    let absolute;
    try {
      absolute = await resolveSourcePath(root, configuredPath);
    } catch (error) {
      if (/does not exist/.test(error.message)) continue;
      throw error;
    }
    const stat = await fs.stat(absolute);
    if (stat.isDirectory()) {
      await walkMarkdown(absolute, root, config.limits, files);
    } else if (stat.isFile() && absolute.endsWith(".md")) {
      files.push({
        absolute,
        relative: toPosix(path.relative(root, absolute))
      });
    }
  }
  return files
    .filter(({ relative }) =>
      config.include.length === 0 ||
      relative.endsWith(".md") ||
      config.include.some((glob) => matchesGlob(glob, relative))
    )
    .sort((left, right) => left.relative.localeCompare(right.relative));
}

function resolveEvidence(node, fileNodes) {
  return node.evidence.map((reference) => {
    const fileNode = fileNodes.get(reference.path);
    const symbolMatches =
      !reference.symbol ||
      fileNode?.symbols.some((symbol) => symbol.name === reference.symbol);
    return {
      ...reference,
      supported: Boolean(fileNode && symbolMatches),
      contentHash: fileNode?.contentHash ?? null
    };
  });
}

export async function collectAuthoredKnowledge(root, config, sourceGraph) {
  const files = await discoverKnowledgeFiles(root, config);
  const fileNodes = new Map(
    sourceGraph.nodes
      .filter((node) => node.type === "file")
      .map((node) => [node.path, node])
  );
  const nodes = [];
  let bytes = 0;
  for (const file of files) {
    const source = await readRegularFile(file.absolute, {
      maxBytes: config.limits.maxFileSizeBytes
    });
    bytes += source.size;
    if (bytes > config.limits.maxTotalBytes) {
      throw new Error("Authored knowledge exceeds limits.maxTotalBytes.");
    }
    const node = normalizeKnowledgeDocument(file.relative, source.contents);
    node.evidence = resolveEvidence(node, fileNodes);
    nodes.push(node);
  }
  const ids = new Set();
  for (const node of nodes) {
    if (ids.has(node.id)) throw new Error(`Duplicate knowledge id: ${node.id}.`);
    ids.add(node.id);
  }

  const edges = [];
  for (const node of nodes) {
    for (const evidence of node.evidence) {
      if (!evidence.supported) continue;
      edges.push({
        type: "supported-by",
        from: node.id,
        to: `file:${evidence.path}`,
        evidence: {
          source: node.path,
          reference: `${evidence.path}${evidence.symbol ? `#${evidence.symbol}` : ""}`
        }
      });
    }
    for (const target of node.contradicts) {
      const targetId = target.includes(":") ? target : `claim:${target}`;
      if (ids.has(targetId)) {
        edges.push({
          type: "contradicts",
          from: node.id,
          to: targetId,
          evidence: { source: node.path, reference: target }
        });
      }
    }
    for (const target of node.supersedes) {
      const targetId = target.includes(":") ? target : `${node.type}:${target}`;
      if (ids.has(targetId)) {
        edges.push({
          type: "supersedes",
          from: node.id,
          to: targetId,
          evidence: { source: node.path, reference: target }
        });
      }
    }
    for (const affectedPath of node.affects) {
      const candidates = sourceGraph.nodes.filter(
        (candidate) =>
          candidate.type === "file" &&
          (candidate.path === affectedPath ||
            candidate.path.startsWith(`${affectedPath}/`))
      );
      for (const candidate of candidates) {
        edges.push({
          type: "affects",
          from: node.id,
          to: candidate.id,
          evidence: { source: node.path, reference: affectedPath }
        });
      }
    }
    delete node._body;
  }

  const unsupported = nodes.filter(
    (node) =>
      config.knowledge.requireEvidence &&
      node.evidence.some((reference) => !reference.supported)
  );
  const unsupportedWithoutEvidence = nodes.filter(
    (node) =>
      config.knowledge.requireEvidence &&
      ["claim", "invariant", "feature"].includes(node.type) &&
      node.evidence.length === 0
  );
  const contradictionEdges = edges.filter(
    (edge) => edge.type === "contradicts"
  );
  const knowledgeHash = sha256(
    stableJson(
      nodes.map((node) => ({
        id: node.id,
        bodyHash: node.bodyHash,
        evidence: node.evidence
      }))
    )
  );
  return {
    nodes,
    edges: edges.sort((left, right) =>
      `${left.type}:${left.from}:${left.to}`.localeCompare(
        `${right.type}:${right.from}:${right.to}`
      )
    ),
    knowledgeHash,
    coverage: {
      total: nodes.length,
      supported:
        nodes.length - unsupported.length - unsupportedWithoutEvidence.length,
      unsupported: unsupported.length + unsupportedWithoutEvidence.length,
      contradictions: contradictionEdges.length,
      instructionSignals: nodes.reduce(
        (total, node) => total + node.trust.instructionSignals.length,
        0
      )
    }
  };
}
