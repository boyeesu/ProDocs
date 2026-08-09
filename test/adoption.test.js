import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { DEFAULT_CONFIG } from "../src/constants.js";
import { diagnoseProject } from "../src/doctor.js";
import { createTutorial } from "../src/tutorial.js";

async function temporaryProject(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "prodocs-adoption-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}

test("doctor explains an invalid first-run project", async (t) => {
  const root = await temporaryProject(t);
  await fs.writeFile(
    path.join(root, "prodocs.config.json"),
    '{"schemaVersion":2}\n'
  );
  const report = await diagnoseProject(root);

  assert.equal(report.ready, false);
  assert.equal(report.counts.error, 1);
  assert.equal(report.checks.find((item) => item.id === "repository.git").status, "warning");
  assert.match(
    report.checks.find((item) => item.id === "configuration").remediation,
    /prodocs init/
  );
});

test("doctor turns indexing failures into actionable diagnostics", async (t) => {
  const root = await temporaryProject(t);
  const config = structuredClone(DEFAULT_CONFIG);
  config.source = ["missing"];
  await fs.writeFile(
    path.join(root, "prodocs.config.json"),
    `${JSON.stringify(config)}\n`
  );

  const report = await diagnoseProject(root);
  assert.equal(report.ready, false);
  assert.equal(report.checks.find((item) => item.id === "configuration").status, "pass");
  assert.equal(report.checks.find((item) => item.id === "evidence.index").status, "error");
});

test("doctor reports missing generated evidence without hiding usable source", async (t) => {
  const root = await temporaryProject(t);
  await fs.mkdir(path.join(root, "src"));
  await fs.writeFile(path.join(root, "src", "main.js"), "export const ready = true;\n");
  await fs.writeFile(
    path.join(root, "prodocs.config.json"),
    `${JSON.stringify(DEFAULT_CONFIG)}\n`
  );

  const report = await diagnoseProject(root);
  assert.equal(report.ready, false);
  assert.equal(report.checks.find((item) => item.id === "evidence.index").status, "pass");
  assert.equal(
    report.checks.find((item) => item.id === "documentation.freshness").status,
    "error"
  );
  assert.equal(
    report.checks.find((item) => item.id === "agents.integrations").status,
    "warning"
  );
  assert.equal(report.checks.find((item) => item.id === "knowledge.health").status, "pass");
});

test("doctor reports an invalid manifest as stale documentation", async (t) => {
  const root = await temporaryProject(t);
  await fs.mkdir(path.join(root, "src"));
  await fs.mkdir(path.join(root, "docs", "prodocs"), { recursive: true });
  await fs.writeFile(path.join(root, "src", "main.js"), "export const ready = true;\n");
  await fs.writeFile(path.join(root, "docs", "prodocs", "manifest.json"), "not json\n");
  await fs.writeFile(
    path.join(root, "prodocs.config.json"),
    `${JSON.stringify(DEFAULT_CONFIG)}\n`
  );

  const report = await diagnoseProject(root);
  assert.equal(report.ready, false);
  assert.match(
    report.checks.find((item) => item.id === "documentation.freshness").message,
    /Manifest unavailable/
  );
});

test("tutorial refuses a symlinked output parent", async (t) => {
  const root = await temporaryProject(t);
  const outside = await temporaryProject(t);
  await fs.symlink(outside, path.join(root, "linked"));

  await assert.rejects(
    createTutorial(root, "linked/tutorial"),
    /resolves outside the project root/
  );
});
