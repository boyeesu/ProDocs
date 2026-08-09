import fs from "node:fs/promises";
import path from "node:path";
import { inferAdoption } from "./adoption-inference.js";
import { validateConfig } from "./config.js";
import { validateKnowledgeDocument } from "./knowledge.js";
import { resolveOutputPath } from "./paths.js";
import {
  atomicWriteFile,
  createFileExclusive,
  readRegularFile
} from "./safe-fs.js";
import {
  normalizeRepositoryPath,
  sha256,
  stableJson,
  timingSafeEqualText
} from "./security.js";

const CONFIG_PATH = "prodocs.config.json";
const CODEOWNERS_PATHS = [
  ".github/CODEOWNERS",
  "CODEOWNERS",
  "docs/CODEOWNERS"
];

function adoptionHash(proposal) {
  const copy = structuredClone(proposal);
  delete copy.approvalHash;
  return sha256(stableJson(copy));
}

function quoteYaml(value) {
  return JSON.stringify(String(value));
}

function slug(value) {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  return normalized || "adopted-product";
}

function featureDocument(productName, description, entrypoints) {
  const evidence = entrypoints.map((item) => item.path);
  const evidenceLines = evidence
    .map((item) => `  - ${quoteYaml(item)}`)
    .join("\n");
  return `---
kind: feature
id: ${slug(productName)}-overview
title: ${quoteYaml(`${productName} product overview`)}
status: active
audiences:
  - product
  - technical
  - support
evidence:
${evidenceLines}
customerImpact: ${quoteYaml(description)}
---
${description}

This initial product overview was proposed deterministically from repository
metadata and framework entrypoints. Review and extend it as product intent
evolves.
`;
}

async function existingFile(root, relativePath) {
  try {
    return await readRegularFile(path.join(root, relativePath), {
      maxBytes: 2 * 1024 * 1024
    });
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw new Error(`Could not safely inspect ${relativePath}: ${error.message}`);
  }
}

async function configOperation(root, config, inference) {
  const next = structuredClone(config);
  const evidence = [];
  if (!next.documentation.productName && inference.productName) {
    next.documentation.productName = inference.productName.value;
    evidence.push(...inference.productName.evidence);
  }
  if (!next.documentation.oneLineDescription && inference.oneLineDescription) {
    next.documentation.oneLineDescription = inference.oneLineDescription.value;
    evidence.push(...inference.oneLineDescription.evidence);
  }
  const inferredEntrypoints = inference.entrypoints.map((item) => item.path);
  next.entrypoints = [...new Set([...next.entrypoints, ...inferredEntrypoints])].sort();
  evidence.push(...inference.entrypoints.flatMap((item) => item.evidence));
  validateConfig(next);
  if (stableJson(next) === stableJson(config)) return null;
  const existing = await existingFile(root, CONFIG_PATH);
  return {
    op: existing ? "replace" : "create",
    path: CONFIG_PATH,
    ...(existing ? { expectedHash: sha256(existing.contents) } : {}),
    reason: "Apply high-confidence product identity and framework entrypoints.",
    evidence: [...new Set(evidence)].sort(),
    content: `${JSON.stringify(next, null, 2)}\n`
  };
}

async function ownershipOperation(root, inference, hasOwners) {
  if (hasOwners || !inference.ownership) return null;
  for (const candidate of CODEOWNERS_PATHS) {
    if (await existingFile(root, candidate)) return null;
  }
  return {
    op: "create",
    path: "CODEOWNERS",
    reason: "Assign repository-wide ownership from the GitHub origin owner.",
    evidence: inference.ownership.evidence,
    content: `* ${inference.ownership.value}\n`
  };
}

async function knowledgeOperation(root, config, graph, inference) {
  if (
    graph.stats.knowledge.total > 0 ||
    !inference.productName ||
    !inference.oneLineDescription ||
    inference.entrypoints.length === 0 ||
    config.knowledge.paths.length === 0
  ) {
    return null;
  }
  const base = normalizeRepositoryPath(config.knowledge.paths[0], "knowledge.paths[0]");
  const relative = `${base}/features/product-overview.md`;
  if (await existingFile(root, relative)) return null;
  return {
    op: "create",
    path: relative,
    reason: "Seed evidence-backed product knowledge from structured identity and entrypoints.",
    evidence: [
      ...inference.productName.evidence,
      ...inference.oneLineDescription.evidence,
      ...inference.entrypoints.flatMap((item) => item.evidence)
    ].filter((item, index, values) => values.indexOf(item) === index).sort(),
    content: featureDocument(
      inference.productName.value,
      inference.oneLineDescription.value,
      inference.entrypoints
    )
  };
}

export async function createAdoptionProposal(root, config, graph) {
  const inference = await inferAdoption(root, graph);
  const sourceNodes = graph.nodes.filter((node) => node.type === "file");
  const operations = (
    await Promise.all([
      configOperation(root, config, inference),
      ownershipOperation(root, inference, sourceNodes.some((node) => node.owner)),
      knowledgeOperation(root, config, graph, inference)
    ])
  ).filter(Boolean);
  const proposal = {
    schemaVersion: 1,
    kind: "prodocs.adoption-proposal",
    source: {
      sourceHash: graph.sourceHash,
      configHash: sha256(stableJson(config)),
      inferenceHash: sha256(stableJson(inference))
    },
    inference,
    operations,
    approvalHash: ""
  };
  proposal.approvalHash = adoptionHash(proposal);
  return validateAdoptionProposal(proposal);
}

function validInference(value) {
  return (
    value === null ||
    (value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value).every((key) =>
        ["value", "confidence", "evidence"].includes(key)
      ) &&
      typeof value.value === "string" &&
      value.value.length <= 10_000 &&
      !value.value.includes("\0") &&
      ["high", "medium", "low"].includes(value.confidence) &&
      validEvidence(value.evidence))
  );
}

function validEvidence(value) {
  return (
    Array.isArray(value) &&
    value.length <= 10_000 &&
    value.every(
      (item) =>
        typeof item === "string" &&
        item.length > 0 &&
        item.length <= 2048 &&
        !item.includes("\0")
    )
  );
}

function validEntrypoint(value) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some(
      (key) => !["path", "confidence", "reason", "evidence"].includes(key)
    ) ||
    !["high", "medium", "low"].includes(value.confidence) ||
    typeof value.reason !== "string" ||
    value.reason.length > 2048 ||
    !validEvidence(value.evidence)
  ) {
    return false;
  }
  try {
    normalizeRepositoryPath(value.path, "inference.entrypoints.path");
    return true;
  } catch {
    return false;
  }
}

export function validateAdoptionProposal(proposal) {
  if (
    !proposal ||
    typeof proposal !== "object" ||
    Array.isArray(proposal) ||
    proposal.schemaVersion !== 1 ||
    proposal.kind !== "prodocs.adoption-proposal" ||
    Object.keys(proposal).some(
      (key) =>
        ![
          "schemaVersion",
          "kind",
          "source",
          "inference",
          "operations",
          "approvalHash"
        ].includes(key)
    ) ||
    !proposal.source ||
    Object.keys(proposal.source).some(
      (key) => !["sourceHash", "configHash", "inferenceHash"].includes(key)
    ) ||
    !/^[a-f0-9]{64}$/.test(proposal.source.sourceHash ?? "") ||
    !/^[a-f0-9]{64}$/.test(proposal.source.configHash ?? "") ||
    !/^[a-f0-9]{64}$/.test(proposal.source.inferenceHash ?? "") ||
    !proposal.inference ||
    !validInference(proposal.inference.productName) ||
    !validInference(proposal.inference.oneLineDescription) ||
    !validInference(proposal.inference.ownership) ||
    !Array.isArray(proposal.inference.entrypoints) ||
    proposal.inference.entrypoints.length > 10_000 ||
    proposal.inference.entrypoints.some((item) => !validEntrypoint(item)) ||
    Object.keys(proposal.inference).some(
      (key) =>
        ![
          "productName",
          "oneLineDescription",
          "entrypoints",
          "ownership",
          "sourceFiles",
          "sourceHash",
          "repositoryRoot"
        ].includes(key)
    ) ||
    !Number.isSafeInteger(proposal.inference.sourceFiles) ||
    proposal.inference.sourceFiles < 0 ||
    !/^[a-f0-9]{64}$/.test(proposal.inference.sourceHash ?? "") ||
    proposal.inference.repositoryRoot !== "." ||
    !Array.isArray(proposal.operations) ||
    proposal.operations.length > 64
  ) {
    throw new Error("Invalid ProDocs adoption proposal.");
  }
  const operationPaths = new Set();
  for (const [index, operation] of proposal.operations.entries()) {
    if (
      !operation ||
      !["create", "replace"].includes(operation.op) ||
      typeof operation.content !== "string" ||
      operation.content.length > 2 * 1024 * 1024 ||
      typeof operation.reason !== "string" ||
      operation.reason.length > 2048 ||
      !validEvidence(operation.evidence) ||
      Object.keys(operation).some(
        (key) =>
          ![
            "op",
            "path",
            "expectedHash",
            "reason",
            "evidence",
            "content"
          ].includes(key)
      )
    ) {
      throw new Error(`Invalid adoption operation at index ${index}.`);
    }
    const operationPath = normalizeRepositoryPath(
      operation.path,
      `operations[${index}].path`
    );
    if (operationPaths.has(operationPath)) {
      throw new Error(`Duplicate adoption operation path: ${operationPath}.`);
    }
    operationPaths.add(operationPath);
    if (
      operation.op === "replace" &&
      !/^[a-f0-9]{64}$/.test(operation.expectedHash ?? "")
    ) {
      throw new Error(`operations[${index}].expectedHash is required.`);
    }
  }
  const expected = adoptionHash(proposal);
  if (
    typeof proposal.approvalHash !== "string" ||
    !timingSafeEqualText(proposal.approvalHash, expected)
  ) {
    throw new Error("Adoption proposal approvalHash does not match its contents.");
  }
  return proposal;
}

function allowedKnowledgePath(relative, config) {
  return config.knowledge.paths.some((configured) => {
    const base = normalizeRepositoryPath(configured, "knowledge.paths");
    return relative.startsWith(`${base}/`) && relative.endsWith(".md");
  });
}

function validateOperationContent(operation, config) {
  if (operation.path === CONFIG_PATH) {
    validateConfig(JSON.parse(operation.content));
    return;
  }
  if (CODEOWNERS_PATHS.includes(operation.path)) {
    if (operation.op !== "create") {
      throw new Error("Adoption cannot replace existing CODEOWNERS.");
    }
    if (!/^\* @[A-Za-z0-9_.-]+\n$/.test(operation.content)) {
      throw new Error("Adoption CODEOWNERS content is invalid.");
    }
    return;
  }
  if (allowedKnowledgePath(operation.path, config)) {
    if (operation.op !== "create") {
      throw new Error("Adoption cannot replace existing authored knowledge.");
    }
    validateKnowledgeDocument(operation.path, operation.content);
    return;
  }
  throw new Error(`Adoption cannot write ${operation.path}.`);
}

async function prepareOperation(root, config, operation) {
  const relative = normalizeRepositoryPath(operation.path, "adoption path");
  validateOperationContent(operation, config);
  const absolute = await resolveOutputPath(root, relative);
  if (operation.op === "replace") {
    const existing = await readRegularFile(absolute, {
      maxBytes: 2 * 1024 * 1024
    });
    if (!timingSafeEqualText(sha256(existing.contents), operation.expectedHash)) {
      throw new Error(`${relative} changed after adoption was proposed.`);
    }
  } else {
    try {
      await fs.lstat(absolute);
      throw new Error(`${relative} already exists.`);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  return { ...operation, relative, absolute };
}

export async function applyAdoptionProposal(
  root,
  config,
  graph,
  proposal,
  approval
) {
  validateAdoptionProposal(proposal);
  if (!timingSafeEqualText(approval ?? "", proposal.approvalHash)) {
    throw new Error("Explicit --approve <approvalHash> is required.");
  }
  if (!timingSafeEqualText(graph.sourceHash, proposal.source.sourceHash)) {
    throw new Error("Repository source changed after adoption was proposed.");
  }
  if (!timingSafeEqualText(sha256(stableJson(config)), proposal.source.configHash)) {
    throw new Error("ProDocs configuration changed after adoption was proposed.");
  }
  const currentInference = await inferAdoption(root, graph);
  if (
    !timingSafeEqualText(
      sha256(stableJson(currentInference)),
      proposal.source.inferenceHash
    )
  ) {
    throw new Error("Adoption evidence changed after the proposal was created.");
  }
  const prepared = [];
  for (const operation of proposal.operations) {
    prepared.push(await prepareOperation(root, config, operation));
  }
  const applied = [];
  for (const operation of prepared) {
    await fs.mkdir(path.dirname(operation.absolute), { recursive: true });
    if (operation.op === "create") {
      const created = await createFileExclusive(operation.absolute, operation.content);
      if (!created) throw new Error(`${operation.relative} already exists.`);
    } else {
      await atomicWriteFile(operation.absolute, operation.content);
    }
    applied.push(operation.relative);
  }
  return { applied, approvalHash: proposal.approvalHash };
}

export async function readAdoptionProposal(filePath) {
  const { contents } = await readRegularFile(filePath, {
    maxBytes: 4 * 1024 * 1024
  });
  return validateAdoptionProposal(JSON.parse(contents));
}
