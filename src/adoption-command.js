import fs from "node:fs/promises";
import path from "node:path";
import {
  applyAdoptionProposal,
  createAdoptionProposal,
  readAdoptionProposal
} from "./adoption.js";
import { loadConfig } from "./config.js";
import { diagnoseProject } from "./doctor.js";
import { writeIntegrations } from "./integrations.js";
import { resolveOutputPath } from "./paths.js";
import { evaluatePolicies } from "./policy.js";
import { writeArtifacts } from "./render.js";
import { atomicWriteFile } from "./safe-fs.js";
import { scanProject } from "./scanner.js";
import { normalizeRepositoryPath } from "./security.js";

function valueAfter(args, flag, fallback = null) {
  const index = args.indexOf(flag);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

async function writeProposal(root, relativePath, proposal) {
  const relative = normalizeRepositoryPath(relativePath, "Adoption output");
  const absolute = await resolveOutputPath(root, relative);
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  await atomicWriteFile(absolute, `${JSON.stringify(proposal, null, 2)}\n`);
  return relative;
}

async function apply(root, args, json, proposalPath, config, graph) {
  const relative = normalizeRepositoryPath(proposalPath, "Adoption proposal");
  const proposal = await readAdoptionProposal(path.resolve(root, relative));
  const applied = await applyAdoptionProposal(
    root,
    config,
    graph,
    proposal,
    valueAfter(args, "--approve")
  );
  const integrations = await writeIntegrations(root);
  const nextConfig = await loadConfig(root);
  const nextGraph = await scanProject(root, nextConfig, { indexMode: "write" });
  const artifacts = await writeArtifacts(root, nextConfig, nextGraph);
  const diagnostics = await diagnoseProject(root);
  const policy = evaluatePolicies(nextGraph, nextConfig);
  const result = {
    ...applied,
    integrations: integrations
      .filter((item) => item.created)
      .map((item) => path.relative(root, item.path)),
    artifacts: artifacts.map((item) => path.relative(root, item)),
    diagnostics,
    policy
  };
  console.log(
    json
      ? JSON.stringify(result, null, 2)
      : `Applied ${result.applied.length} adoption operation(s). ${diagnostics.ready && policy.passed ? "Repository is ready." : "Review remaining doctor or policy findings."}`
  );
  if (!diagnostics.ready || !policy.passed) process.exitCode = 1;
}

export async function runAdoptionCommand(root, args, json) {
  const applyPath = valueAfter(args, "--apply");
  if (args.includes("--apply") && !applyPath) {
    throw new Error("`adopt --apply` requires a proposal file.");
  }
  const config = await loadConfig(root);
  const graph = await scanProject(root, config, { indexMode: "read" });
  if (applyPath) return apply(root, args, json, applyPath, config, graph);

  const proposal = await createAdoptionProposal(root, config, graph);
  const output = valueAfter(args, "--output", ".prodocs/adoption-proposal.json");
  const written = await writeProposal(root, output, proposal);
  console.log(
    json
      ? JSON.stringify({ proposalPath: written, proposal }, null, 2)
      : `Wrote ${written} with ${proposal.operations.length} operation(s).\nReview it, then run: prodocs adopt --apply ${written} --approve ${proposal.approvalHash}`
  );
}
