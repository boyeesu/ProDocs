import fs from "node:fs/promises";
import path from "node:path";
import { isInside } from "./paths.js";
import { atomicWriteFile, createFileExclusive, readRegularFile } from "./safe-fs.js";
import {
  normalizeRepositoryPath,
  sha256,
  stableJson,
  timingSafeEqualText
} from "./security.js";

function proposalHash(proposal) {
  const copy = structuredClone(proposal);
  delete copy.approvalHash;
  return sha256(stableJson(copy));
}

export function validateProposal(proposal) {
  if (
    !proposal ||
    typeof proposal !== "object" ||
    Array.isArray(proposal) ||
    proposal.schemaVersion !== 1 ||
    proposal.kind !== "prodocs.proposal" ||
    !["review", "write"].includes(proposal.mode) ||
    !Array.isArray(proposal.operations) ||
    proposal.operations.length > 256
  ) {
    throw new Error("Invalid ProDocs proposal.");
  }
  for (const [index, operation] of proposal.operations.entries()) {
    if (
      !operation ||
      typeof operation !== "object" ||
      !["review", "create", "replace"].includes(operation.op)
    ) {
      throw new Error(`Invalid proposal operation at index ${index}.`);
    }
    normalizeRepositoryPath(operation.path, `operations[${index}].path`);
    if (["create", "replace"].includes(operation.op)) {
      if (
        typeof operation.content !== "string" ||
        operation.content.length > 2 * 1024 * 1024
      ) {
        throw new Error(`operations[${index}].content is invalid.`);
      }
      if (
        operation.op === "replace" &&
        (typeof operation.expectedHash !== "string" ||
          !/^[a-f0-9]{64}$/.test(operation.expectedHash))
      ) {
        throw new Error(`operations[${index}].expectedHash is required.`);
      }
    }
  }
  const expected = proposalHash(proposal);
  if (
    typeof proposal.approvalHash !== "string" ||
    !timingSafeEqualText(proposal.approvalHash, expected)
  ) {
    throw new Error("Proposal approvalHash does not match its contents.");
  }
  return proposal;
}

function allowedKnowledgePath(relativePath, config) {
  return config.knowledge.paths.some((configured) => {
    const base = normalizeRepositoryPath(configured, "knowledge.paths");
    return relativePath === base || relativePath.startsWith(`${base}/`);
  });
}

export async function applyProposal(root, config, proposal, approval) {
  validateProposal(proposal);
  if (proposal.mode !== "write") {
    throw new Error("Review proposals cannot be applied.");
  }
  if (!timingSafeEqualText(approval ?? "", proposal.approvalHash)) {
    throw new Error("Explicit --approve <approvalHash> is required.");
  }
  const rootPath = path.resolve(root);
  const prepared = [];
  for (const operation of proposal.operations) {
    const relative = normalizeRepositoryPath(operation.path, "proposal path");
    if (
      !relative.endsWith(".md") ||
      !allowedKnowledgePath(relative, config) ||
      relative === config.output ||
      relative.startsWith(`${config.output}/`)
    ) {
      throw new Error(`Proposal path is outside authored knowledge: ${relative}`);
    }
    const absolute = path.resolve(rootPath, relative);
    if (!isInside(rootPath, absolute)) {
      throw new Error(`Proposal path escapes the repository: ${relative}`);
    }
    if (!operation.content.startsWith("---\n")) {
      throw new Error(`${relative} must contain ProDocs YAML front matter.`);
    }
    if (operation.op === "replace") {
      const existing = await readRegularFile(absolute, {
        maxBytes: 2 * 1024 * 1024
      });
      if (!timingSafeEqualText(sha256(existing.contents), operation.expectedHash)) {
        throw new Error(`${relative} changed after the proposal was created.`);
      }
    } else {
      try {
        await fs.lstat(absolute);
        throw new Error(`${relative} already exists.`);
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
    prepared.push({ ...operation, absolute, relative });
  }

  const applied = [];
  for (const operation of prepared) {
    await fs.mkdir(path.dirname(operation.absolute), { recursive: true });
    const directory = await fs.lstat(path.dirname(operation.absolute));
    if (directory.isSymbolicLink() || !directory.isDirectory()) {
      throw new Error(`Unsafe proposal directory: ${operation.relative}`);
    }
    if (operation.op === "create") {
      const created = await createFileExclusive(
        operation.absolute,
        operation.content
      );
      if (!created) throw new Error(`${operation.relative} already exists.`);
    } else {
      await atomicWriteFile(operation.absolute, operation.content);
    }
    applied.push(operation.relative);
  }
  return { applied, approvalHash: proposal.approvalHash };
}

export async function readProposal(filePath) {
  const { contents } = await readRegularFile(filePath, {
    maxBytes: 4 * 1024 * 1024
  });
  return validateProposal(JSON.parse(contents));
}
