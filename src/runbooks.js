import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { isInside } from "./paths.js";
import { sha256, stableJson, timingSafeEqualText } from "./security.js";

function publicStep(step) {
  return {
    command: step.command,
    args: step.args,
    cwd: step.cwd,
    timeoutMs: step.timeoutMs,
    expectedExitCode: step.expectedExitCode
  };
}

export function runbookPlan(graph, id) {
  const nodeId = id.startsWith("runbook:") ? id : `runbook:${id}`;
  const runbook = graph.nodes.find(
    (node) => node.id === nodeId && node.type === "runbook"
  );
  if (!runbook) throw new Error(`Unknown runbook: ${id}`);
  const plan = {
    schemaVersion: 1,
    kind: "prodocs.runbook-plan",
    runbook: runbook.id,
    path: runbook.path,
    bodyHash: runbook.bodyHash,
    sourceHash: graph.sourceHash,
    knowledgeHash: graph.knowledgeHash,
    steps: runbook.verification.map(publicStep)
  };
  plan.approvalHash = sha256(stableJson(plan));
  return plan;
}

function execute(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      shell: false,
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 1000).unref();
    }, options.timeoutMs);
    const finish = (callback) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback();
    };
    child.stdout.on("data", (chunk) => {
      if (stdout.length < 1024 * 1024) stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      if (stderr.length < 1024 * 1024) stderr += chunk;
    });
    child.on("error", (error) => finish(() => reject(error)));
    child.on("close", (code, signal) =>
      finish(() => resolve({ code, signal, stdout, stderr }))
    );
  });
}

export async function verifyRunbook(root, graph, id, approval) {
  const plan = runbookPlan(graph, id);
  if (!timingSafeEqualText(approval ?? "", plan.approvalHash)) {
    const error = new Error(
      "Runbook execution requires --approve <approvalHash> from the current plan."
    );
    error.plan = plan;
    throw error;
  }
  const canonicalRoot = await fs.realpath(root);
  const allowedEnvironment = {};
  for (const name of ["PATH", "Path", "SystemRoot", "WINDIR", "TMPDIR", "TMP", "TEMP"]) {
    if (process.env[name]) allowedEnvironment[name] = process.env[name];
  }
  allowedEnvironment.PRODOCS_RUNBOOK = "1";
  const results = [];
  for (const step of plan.steps) {
    const requestedCwd = path.resolve(canonicalRoot, step.cwd);
    const realCwd = await fs.realpath(requestedCwd);
    if (!isInside(canonicalRoot, realCwd)) {
      throw new Error(`Runbook cwd escapes the repository: ${step.cwd}`);
    }
    const result = await execute(step.command, step.args, {
      cwd: realCwd,
      env: allowedEnvironment,
      timeoutMs: step.timeoutMs
    });
    results.push({
      command: step.command,
      args: step.args,
      cwd: step.cwd,
      expectedExitCode: step.expectedExitCode,
      exitCode: result.code,
      signal: result.signal,
      passed: result.code === step.expectedExitCode,
      stdout: result.stdout,
      stderr: result.stderr
    });
    if (result.code !== step.expectedExitCode) break;
  }
  return {
    plan,
    passed:
      results.length === plan.steps.length &&
      results.every((result) => result.passed),
    results
  };
}
