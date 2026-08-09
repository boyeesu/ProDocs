import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import {
  applyAdoptionProposal,
  createAdoptionProposal,
  validateAdoptionProposal
} from "../src/adoption.js";
import { inferAdoption } from "../src/adoption-inference.js";
import { runAdoptionCommand } from "../src/adoption-command.js";
import { loadConfig, writeDefaultConfig } from "../src/config.js";
import { evaluatePolicies } from "../src/policy.js";
import { scanProject } from "../src/scanner.js";

const executeFile = promisify(execFile);
const cli = path.resolve("bin/prodocs.js");

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "prodocs-adopt-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, "src", "app", "api", "send"), {
    recursive: true
  });
  await fs.mkdir(path.join(root, "src", "lib"), { recursive: true });
  await fs.writeFile(
    path.join(root, "src", "lib", "site.ts"),
    `export const site = {
  brand: "Navigi",
  legalName: "Navigi Technologies",
  description: "Evidence-backed AI products and services for enterprise teams."
};
`
  );
  await fs.writeFile(
    path.join(root, "src", "app", "layout.tsx"),
    "export default function Layout({ children }) { return children; }\n"
  );
  await fs.writeFile(
    path.join(root, "src", "app", "page.tsx"),
    'import { site } from "../lib/site";\nexport default function Page() { return site.brand; }\n'
  );
  await fs.writeFile(
    path.join(root, "src", "app", "api", "send", "route.ts"),
    'import { site } from "../../../lib/site";\nexport function POST() { return site.brand; }\n'
  );
  await fs.writeFile(
    path.join(root, "package.json"),
    `${JSON.stringify({
      name: "navigi-site",
      private: true,
      dependencies: { next: "14.2.0" }
    })}\n`
  );
  await fs.writeFile(
    path.join(root, "README.md"),
    "# Navigi — Enterprise site\n\nThe public product and services website.\n"
  );
  await executeFile("git", ["init", "-q"], { cwd: root });
  await executeFile(
    "git",
    ["remote", "add", "origin", "https://github.com/boyeesu/navigi.git"],
    { cwd: root }
  );
  await writeDefaultConfig(root);
  return root;
}

test("adoption infers identity, framework entrypoints, owner, and knowledge", async (t) => {
  const root = await fixture(t);
  const config = await loadConfig(root);
  const graph = await scanProject(root, config, { indexMode: "read" });
  const proposal = await createAdoptionProposal(root, config, graph);

  assert.equal(proposal.inference.productName.value, "Navigi Technologies");
  assert.equal(proposal.inference.productName.confidence, "high");
  assert.equal(
    proposal.inference.oneLineDescription.value,
    "Evidence-backed AI products and services for enterprise teams."
  );
  assert.deepEqual(
    proposal.inference.entrypoints.map((item) => item.path),
    [
      "src/app/api/send/route.ts",
      "src/app/layout.tsx",
      "src/app/page.tsx"
    ]
  );
  assert.equal(proposal.inference.ownership.value, "@boyeesu");
  assert.deepEqual(
    proposal.operations.map((item) => item.path),
    [
      "prodocs.config.json",
      "CODEOWNERS",
      "docs/knowledge/features/product-overview.md"
    ]
  );
  assert.equal(validateAdoptionProposal(proposal), proposal);

  const tampered = structuredClone(proposal);
  tampered.inference.productName.value = "Tampered";
  assert.throws(
    () => validateAdoptionProposal(tampered),
    /approvalHash does not match/
  );
  await assert.rejects(
    applyAdoptionProposal(root, config, graph, proposal, "wrong"),
    /Explicit --approve/
  );
});

test("approved adoption applies complete policy-backed onboarding", async (t) => {
  const root = await fixture(t);
  const config = await loadConfig(root);
  const graph = await scanProject(root, config, { indexMode: "read" });
  const proposal = await createAdoptionProposal(root, config, graph);

  const applied = await applyAdoptionProposal(
    root,
    config,
    graph,
    proposal,
    proposal.approvalHash
  );
  assert.deepEqual(applied.applied, [
    "prodocs.config.json",
    "CODEOWNERS",
    "docs/knowledge/features/product-overview.md"
  ]);
  const nextConfig = await loadConfig(root);
  const nextGraph = await scanProject(root, nextConfig);
  assert.equal(nextConfig.documentation.productName, "Navigi Technologies");
  assert.equal(nextGraph.stats.knowledge.total, 1);
  assert.equal(nextGraph.stats.knowledge.unsupported, 0);
  assert.equal(evaluatePolicies(nextGraph, nextConfig).passed, true);
  assert.match(await fs.readFile(path.join(root, "CODEOWNERS"), "utf8"), /@boyeesu/);

  const completeProposal = await createAdoptionProposal(
    root,
    nextConfig,
    nextGraph
  );
  assert.deepEqual(completeProposal.operations, []);
});

test("adoption refuses stale source and completes the CLI review loop", async (t) => {
  const staleRoot = await fixture(t);
  const staleConfig = await loadConfig(staleRoot);
  const staleGraph = await scanProject(staleRoot, staleConfig, {
    indexMode: "read"
  });
  const staleProposal = await createAdoptionProposal(
    staleRoot,
    staleConfig,
    staleGraph
  );
  await fs.appendFile(
    path.join(staleRoot, "src", "app", "page.tsx"),
    "export const changed = true;\n"
  );
  const changedGraph = await scanProject(staleRoot, staleConfig, {
    indexMode: "read"
  });
  await assert.rejects(
    applyAdoptionProposal(
      staleRoot,
      staleConfig,
      changedGraph,
      staleProposal,
      staleProposal.approvalHash
    ),
    /source changed/
  );

  const evidenceRoot = await fixture(t);
  const evidenceConfig = await loadConfig(evidenceRoot);
  const evidenceGraph = await scanProject(evidenceRoot, evidenceConfig, {
    indexMode: "read"
  });
  const evidenceProposal = await createAdoptionProposal(
    evidenceRoot,
    evidenceConfig,
    evidenceGraph
  );
  await executeFile(
    "git",
    ["remote", "set-url", "origin", "https://github.com/changed/navigi.git"],
    { cwd: evidenceRoot }
  );
  await assert.rejects(
    applyAdoptionProposal(
      evidenceRoot,
      evidenceConfig,
      evidenceGraph,
      evidenceProposal,
      evidenceProposal.approvalHash
    ),
    /Adoption evidence changed/
  );

  const root = await fixture(t);
  const proposed = await executeFile(
    process.execPath,
    [cli, "adopt", "--json"],
    { cwd: root, encoding: "utf8" }
  );
  const output = JSON.parse(proposed.stdout);
  const applied = await executeFile(
    process.execPath,
    [
      cli,
      "adopt",
      "--apply",
      output.proposalPath,
      "--approve",
      output.proposal.approvalHash,
      "--json"
    ],
    { cwd: root, encoding: "utf8" }
  );
  const result = JSON.parse(applied.stdout);
  assert.equal(result.diagnostics.ready, true);
  assert.equal(result.policy.passed, true);
  assert.equal(result.applied.length, 3);
});

test("adoption refuses symbolic-link escapes before applying any operation", async (t) => {
  const root = await fixture(t);
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), "prodocs-adopt-outside-"));
  t.after(() => fs.rm(outside, { recursive: true, force: true }));
  await fs.symlink(outside, path.join(root, "docs"));
  const config = await loadConfig(root);
  const graph = await scanProject(root, config, { indexMode: "read" });
  const proposal = await createAdoptionProposal(root, config, graph);
  const before = await fs.readFile(path.join(root, "prodocs.config.json"), "utf8");

  await assert.rejects(
    applyAdoptionProposal(
      root,
      config,
      graph,
      proposal,
      proposal.approvalHash
    ),
    /resolves outside the project root/
  );
  assert.equal(
    await fs.readFile(path.join(root, "prodocs.config.json"), "utf8"),
    before
  );
  assert.equal(await fs.readdir(outside).then((items) => items.length), 0);
});

test("published adoption schema identifies the runtime contract", async () => {
  const schema = JSON.parse(
    await fs.readFile(
      path.resolve("schemas", "adoption-proposal.schema.json"),
      "utf8"
    )
  );
  assert.equal(schema.properties.kind.const, "prodocs.adoption-proposal");
  assert.deepEqual(schema.required, [
    "schemaVersion",
    "kind",
    "source",
    "inference",
    "operations",
    "approvalHash"
  ]);
});

test("adoption uses package and README fallbacks without fabricating ownership", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "prodocs-adopt-fallback-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(
    path.join(root, "package.json"),
    JSON.stringify({
      name: "@example/quiet-product",
      description: "A structured package description.",
      dependencies: { next: "14.0.0" }
    })
  );
  await fs.writeFile(
    path.join(root, "README.md"),
    "# README Product — Site\n\nA sufficiently descriptive README paragraph for fallback inference.\n"
  );
  const graph = {
    sourceHash: "a".repeat(64),
    nodes: [
      { type: "file", path: "middleware.ts", entrypoint: false, owner: null },
      { type: "file", path: "pages/index.tsx", entrypoint: false, owner: null },
      { type: "file", path: "src/main.ts", entrypoint: true, owner: null }
    ]
  };
  const packageResult = await inferAdoption(root, graph);
  assert.equal(packageResult.productName.value, "README Product");
  assert.equal(
    packageResult.oneLineDescription.value,
    "A structured package description."
  );
  assert.equal(packageResult.ownership, null);
  assert.deepEqual(
    packageResult.entrypoints.map((item) => item.path),
    ["middleware.ts", "pages/index.tsx", "src/main.ts"]
  );

  await fs.rm(path.join(root, "package.json"));
  const readmeResult = await inferAdoption(root, graph);
  assert.equal(
    readmeResult.oneLineDescription.value,
    "A sufficiently descriptive README paragraph for fallback inference."
  );

  await fs.writeFile(path.join(root, "package.json"), "not json");
  await assert.rejects(inferAdoption(root, graph), /Could not parse package.json/);
});

test("adoption validates malformed proposals and configuration drift", async (t) => {
  const root = await fixture(t);
  const config = await loadConfig(root);
  const graph = await scanProject(root, config, { indexMode: "read" });
  const proposal = await createAdoptionProposal(root, config, graph);
  const invalidValues = [
    null,
    { ...proposal, unexpected: true },
    { ...proposal, source: { ...proposal.source, sourceHash: "bad" } },
    { ...proposal, inference: { ...proposal.inference, repositoryRoot: ".." } },
    { ...proposal, operations: Array.from({ length: 65 }, () => ({})) },
    {
      ...proposal,
      operations: [{ op: "replace", path: "CODEOWNERS", content: "* @owner\n", reason: "bad", evidence: [] }]
    }
  ];
  for (const value of invalidValues) {
    assert.throws(() => validateAdoptionProposal(value), /Invalid|expectedHash/);
  }

  const duplicate = structuredClone(proposal);
  duplicate.operations.push(structuredClone(duplicate.operations[0]));
  duplicate.approvalHash = "0".repeat(64);
  assert.throws(
    () => validateAdoptionProposal(duplicate),
    /Duplicate adoption operation path/
  );

  const changedConfig = structuredClone(config);
  changedConfig.documentation.productName = "Changed after proposal";
  await assert.rejects(
    applyAdoptionProposal(
      root,
      changedConfig,
      graph,
      proposal,
      proposal.approvalHash
    ),
    /configuration changed/
  );
  await assert.rejects(
    runAdoptionCommand(root, ["adopt", "--apply"], true),
    /requires a proposal file/
  );
});

test("adoption can create a missing configuration from indexed evidence", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "prodocs-adopt-config-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, "src"));
  await fs.writeFile(
    path.join(root, "src", "main.ts"),
    "export function main() { return true; }\n"
  );
  await fs.writeFile(
    path.join(root, "package.json"),
    JSON.stringify({ name: "new-product", description: "A new product." })
  );
  const config = await loadConfig(root);
  const graph = await scanProject(root, config, { indexMode: "read" });
  const proposal = await createAdoptionProposal(root, config, graph);
  assert.equal(
    proposal.operations.find((item) => item.path === "prodocs.config.json").op,
    "create"
  );
  await applyAdoptionProposal(
    root,
    config,
    graph,
    proposal,
    proposal.approvalHash
  );
  assert.equal((await loadConfig(root)).documentation.productName, "New Product");
});
