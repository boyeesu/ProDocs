import assert from "node:assert/strict";
import { spawn, execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { DEFAULT_CONFIG } from "../src/constants.js";
import { sha256, stableJson } from "../src/security.js";

const executeFile = promisify(execFile);
const cli = path.resolve("bin/prodocs.js");

function execute(args, cwd, input = null) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...args], {
      cwd,
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGTERM"), 30_000);
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
    if (input !== null) child.stdin.end(input);
  });
}

async function fullProject() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "prodocs-cli-roadmap-"));
  await fs.mkdir(path.join(root, "src"));
  await fs.mkdir(path.join(root, "docs", "knowledge"), { recursive: true });
  await fs.writeFile(
    path.join(root, "src", "main.js"),
    "export function main() { return true; }\n"
  );
  await fs.writeFile(path.join(root, "CODEOWNERS"), "* @owner\n");
  await fs.writeFile(
    path.join(root, "docs", "knowledge", "feature.md"),
    `---
kind: feature
id: main
title: Main capability
audiences:
  - product
  - technical
evidence:
  - src/main.js#main
customerImpact: The main capability is available.
---
The main capability is source-backed.
`
  );
  await fs.writeFile(
    path.join(root, "docs", "knowledge", "runbook.md"),
    `---
kind: runbook
id: node
title: Node verification
audiences:
  - operations
evidence:
  - src/main.js
verify:
  - command: node
    args:
      - --version
    cwd: .
    timeoutMs: 5000
    expectedExitCode: 0
---
Verify the Node runtime without a shell.
`
  );
  const configuration = structuredClone(DEFAULT_CONFIG);
  configuration.documentation.productName = "Fixture";
  configuration.documentation.oneLineDescription = "A complete fixture.";
  await fs.writeFile(
    path.join(root, "prodocs.config.json"),
    `${JSON.stringify(configuration, null, 2)}\n`
  );
  await executeFile("git", ["init", "-q"], { cwd: root });
  await executeFile("git", ["config", "user.email", "test@example.com"], {
    cwd: root
  });
  await executeFile("git", ["config", "user.name", "Test"], { cwd: root });
  return root;
}

test("the complete roadmap CLI works as one reviewed workflow", async (t) => {
  const root = await fullProject();
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  assert.match((await execute(["--help"], root)).stdout, /Change intelligence/);
  assert.equal((await execute(["--version"], root)).stdout.trim(), "1.0.0");
  const unknown = await execute(["unknown"], root);
  assert.equal(unknown.code, 1);
  assert.match(unknown.stderr, /Unknown command/);

  assert.equal((await execute(["init"], root)).code, 0);
  const hooks = await execute(["hooks", "install", "--json"], root);
  assert.equal(hooks.code, 0, hooks.stderr);
  assert.equal(JSON.parse(hooks.stdout).hooksPath, ".prodocs/hooks");
  assert.match(
    await fs.readFile(path.join(root, ".prodocs", "hooks", "pre-push"), "utf8"),
    /prodocs.*impact/s
  );
  assert.equal((await execute(["sync"], root)).code, 0);
  assert.equal((await execute(["check"], root)).code, 0);

  const status = await execute(["status", "--json"], root);
  assert.equal(status.code, 0, status.stderr);
  assert.equal(JSON.parse(status.stdout).stats.knowledge.total, 2);
  assert.match((await execute(["status"], root)).stdout, /Knowledge: 2/);

  const context = await execute(
    [
      "context",
      "--path",
      "src/main.js",
      "--task",
      "change main",
      "--max-files",
      "5",
      "--max-tokens",
      "2000",
      "--json"
    ],
    root
  );
  assert.equal(context.code, 0, context.stderr);
  assert.equal(JSON.parse(context.stdout).request.task, "change main");
  assert.match(
    (await execute(["context", "--path", "src/main.js"], root)).stdout,
    /relationships/
  );
  assert.match(
    (await execute(["context", "--path", "missing"], root)).stdout,
    /No indexed knowledge/
  );

  const policy = await execute(["policy", "--json"], root);
  assert.equal(policy.code, 0, policy.stderr);
  assert.equal(JSON.parse(policy.stdout).passed, true);
  assert.match((await execute(["policy"], root)).stdout, /contracts passed/);

  const capabilities = await execute(["capabilities", "--json"], root);
  assert.equal(capabilities.code, 0);
  assert.equal(JSON.parse(capabilities.stdout).graphSchema, 2);
  assert.match((await execute(["capabilities"], root)).stdout, /"version"/);

  const suite = {
    schemaVersion: 1,
    cases: [
      {
        name: "main",
        paths: ["src/main.js"],
        expectedPaths: ["src/main.js"],
        unwantedPaths: [],
        maxTokens: 2000
      }
    ]
  };
  await fs.writeFile(
    path.join(root, "suite.json"),
    `${JSON.stringify(suite)}\n`
  );
  assert.equal(
    (await execute(["evaluate", "--suite", "suite.json", "--json"], root)).code,
    0
  );
  assert.match(
    (await execute(["evaluate", "--suite", "suite.json"], root)).stdout,
    /context cases passed/
  );

  const pluginSource = await fs.readFile(
    path.resolve("fixtures/plugins/service.prodocs-plugin.json"),
    "utf8"
  );
  await fs.writeFile(path.join(root, "plugin.json"), pluginSource);
  assert.equal(
    (await execute(["plugin", "verify", "plugin.json", "--json"], root)).code,
    0
  );
  assert.match(
    (await execute(["plugin", "verify", "plugin.json"], root)).stdout,
    /Passed/
  );

  const productView = await execute(
    ["view", "--audience", "product"],
    root
  );
  assert.equal(productView.code, 0, productView.stderr);
  assert.match(productView.stdout, /Main capability/);

  const runbookPlanResult = await execute(
    ["runbook", "plan", "node", "--json"],
    root
  );
  const plan = JSON.parse(runbookPlanResult.stdout);
  const verified = await execute(
    [
      "runbook",
      "verify",
      "node",
      "--approve",
      plan.approvalHash,
      "--json"
    ],
    root
  );
  assert.equal(verified.code, 0, verified.stderr);
  assert.equal(JSON.parse(verified.stdout).passed, true);
  assert.match(
    (
      await execute(
        [
          "runbook",
          "verify",
          "node",
          "--approve",
          plan.approvalHash
        ],
        root
      )
    ).stdout,
    /Passed/
  );

  await executeFile("git", ["add", "."], { cwd: root });
  await executeFile("git", ["commit", "-qm", "base"], { cwd: root });
  await fs.appendFile(
    path.join(root, "src", "main.js"),
    "export const changed = true;\n"
  );
  await executeFile("git", ["add", "src/main.js"], { cwd: root });
  await executeFile("git", ["commit", "-qm", "change"], { cwd: root });

  const impact = await execute(
    ["impact", "--base", "HEAD~1", "--json"],
    root
  );
  assert.equal(impact.code, 0, impact.stderr);
  const impactValue = JSON.parse(impact.stdout);
  assert.equal(impactValue.changes[0].path, "src/main.js");
  assert.match(
    (await execute(["impact", "--base", "HEAD~1"], root)).stdout,
    /changed path/
  );
  await fs.writeFile(
    path.join(root, "impact.json"),
    `${JSON.stringify(impactValue)}\n`
  );
  const patch = await execute(
    [
      "impact",
      "--base",
      "HEAD~1",
      "--patch",
      ".prodocs/impact-proposal.json",
      "--json"
    ],
    root
  );
  assert.equal(patch.code, 0, patch.stderr);
  assert.equal(
    JSON.parse(patch.stdout).proposalPath,
    ".prodocs/impact-proposal.json"
  );

  const proposed = await execute(
    [
      "propose",
      "--impact",
      "impact.json",
      "--provider",
      "template",
      "--output",
      ".prodocs/narrative.json",
      "--json"
    ],
    root
  );
  assert.equal(proposed.code, 0, proposed.stderr);
  assert.match(
    (
      await execute(
        [
          "propose",
          "--impact",
          "impact.json",
          "--provider",
          "template",
          "--output",
          ".prodocs/narrative-plain.json"
        ],
        root
      )
    ).stdout,
    /Wrote/
  );

  const proposal = {
    schemaVersion: 1,
    kind: "prodocs.proposal",
    mode: "write",
    source: { impactId: impactValue.id },
    operations: [
      {
        op: "create",
        path: "docs/knowledge/added.md",
        content:
          "---\nkind: claim\nid: added\ntitle: Added\nevidence:\n  - src/main.js\n---\nAdded claim.\n"
      }
    ]
  };
  proposal.approvalHash = sha256(stableJson(proposal));
  await fs.writeFile(
    path.join(root, "proposal.json"),
    `${JSON.stringify(proposal)}\n`
  );
  assert.equal(
    (await execute(["proposal", "validate", "proposal.json"], root)).code,
    0
  );
  assert.equal(
    (
      await execute(
        [
          "proposal",
          "apply",
          "proposal.json",
          "--approve",
          proposal.approvalHash,
          "--json"
        ],
        root
      )
    ).code,
    0
  );
});

test("history and MCP CLI adapters operate without vendor-specific state", async (t) => {
  const root = await fullProject();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await execute(["sync"], root);
  await executeFile("git", ["add", "."], { cwd: root });
  await executeFile("git", ["commit", "-qm", "snapshot"], { cwd: root });

  const history = await execute(["history", "--at", "HEAD", "--json"], root);
  assert.equal(history.code, 0, history.stderr);
  assert.equal(JSON.parse(history.stdout).reference, "HEAD");
  assert.match(
    (await execute(["history", "--at", "HEAD"], root)).stdout,
    /source/
  );

  const historicalView = await execute(
    ["view", "--audience", "technical", "--at", "HEAD"],
    root
  );
  assert.equal(historicalView.code, 0, historicalView.stderr);
  assert.match(historicalView.stdout, /technical view/);

  const messages = [
    {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: { name: "fixture", version: "1" }
      }
    },
    { jsonrpc: "2.0", id: 2, method: "resources/list" }
  ];
  const mcp = await execute(
    ["mcp"],
    root,
    `${messages.map((message) => JSON.stringify(message)).join("\n")}\n`
  );
  assert.equal(mcp.code, 0, mcp.stderr);
  const responses = mcp.stdout.trim().split("\n").map(JSON.parse);
  assert.equal(responses[0].result.protocolVersion, "2025-11-25");
  assert.equal(responses[1].result.resources.length, 2);
});
