import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { normalizeRepositoryPath, sha256, stableJson } from "./security.js";

const executeFile = promisify(execFile);
const REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/@{}~^:+-]{0,511}$/;

async function git(root, args) {
  try {
    const result = await executeFile("git", ["-C", root, ...args], {
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
      timeout: 30_000,
      windowsHide: true
    });
    return result.stdout;
  } catch (error) {
    const detail = error.stderr?.trim() || error.message;
    throw new Error(`Git command failed: ${detail}`);
  }
}

function requireRef(value, label) {
  if (typeof value !== "string" || !REF_PATTERN.test(value)) {
    throw new Error(`${label} is not a safe git reference.`);
  }
  return value;
}

export async function resolveImpactRange(
  root,
  { range = null, base = null } = {}
) {
  let expression;
  if (range) {
    const pieces = range.split("..");
    if (
      pieces.length < 2 ||
      pieces.length > 3 ||
      pieces.some((piece) => piece === "")
    ) {
      throw new Error("Impact range must use <base>..<head> or <base>...<head>.");
    }
    pieces.forEach((piece) => requireRef(piece, "Impact range"));
    expression = range;
  } else {
    expression = `${requireRef(base ?? "HEAD~1", "Impact base")}...HEAD`;
  }
  await git(root, ["rev-parse", "--verify", expression.split("...")[0].split("..")[0]]);
  await git(root, ["rev-parse", "--verify", expression.split("...").at(-1).split("..").at(-1)]);
  return expression;
}

function parseNameStatus(output) {
  const lines = output.replace(/\r\n?/g, "\n").split("\n").filter(Boolean);
  return lines.map((line) => {
    const [statusValue, ...paths] = line.split("\t");
    const status = statusValue[0];
    const normalizedPaths = paths.map((filePath) =>
      normalizeRepositoryPath(filePath, "Changed file")
    );
    return {
      status,
      similarity:
        statusValue.length > 1 ? Number.parseInt(statusValue.slice(1), 10) : null,
      before: ["R", "C"].includes(status) ? normalizedPaths[0] : null,
      path: normalizedPaths.at(-1)
    };
  });
}

function nodeMatchesChange(node, changedPaths) {
  if (node.type === "file") return changedPaths.has(node.path);
  if (node.evidence) {
    return node.evidence.some((reference) => changedPaths.has(reference.path));
  }
  return false;
}

function expandAffected(graph, initialIds, depth = 2) {
  const affected = new Set(initialIds);
  let frontier = new Set(initialIds);
  for (let level = 0; level < depth; level += 1) {
    const next = new Set();
    for (const edge of graph.edges) {
      if (frontier.has(edge.from) && !affected.has(edge.to)) next.add(edge.to);
      if (frontier.has(edge.to) && !affected.has(edge.from)) next.add(edge.from);
    }
    for (const id of next) affected.add(id);
    frontier = next;
  }
  return affected;
}

export async function analyzeImpact(root, graph, options = {}) {
  const range = await resolveImpactRange(root, options);
  const output = await git(root, [
    "diff",
    "--name-status",
    "--find-renames",
    range,
    "--"
  ]);
  const changes = parseNameStatus(output);
  const changedPaths = new Set(
    changes.flatMap((change) => [change.path, change.before].filter(Boolean))
  );
  const initialIds = graph.nodes
    .filter((node) => nodeMatchesChange(node, changedPaths))
    .map((node) => node.id);
  const affectedIds = expandAffected(graph, initialIds);
  const affectedNodes = graph.nodes
    .filter((node) => affectedIds.has(node.id))
    .map((node) => ({
      id: node.id,
      type: node.type,
      path: node.path,
      title: node.title ?? null,
      owner: node.owner ?? null,
      reason: initialIds.includes(node.id) ? "changed" : "graph-neighbor"
    }));
  const result = {
    schemaVersion: 1,
    kind: "prodocs.impact",
    range,
    sourceHash: graph.sourceHash,
    knowledgeHash: graph.knowledgeHash,
    changes,
    affected: {
      files: affectedNodes.filter((node) => node.type === "file"),
      claims: affectedNodes.filter((node) => node.type === "claim"),
      decisions: affectedNodes.filter((node) =>
        ["decision", "invariant"].includes(node.type)
      ),
      features: affectedNodes.filter((node) => node.type === "feature"),
      runbooks: affectedNodes.filter((node) => node.type === "runbook"),
      owners: affectedNodes.filter((node) => node.type === "owner"),
      tests: affectedNodes.filter(
        (node) =>
          node.type === "file" &&
          graph.nodes.find((candidate) => candidate.id === node.id)?.role ===
            "test"
      )
    }
  };
  result.id = sha256(stableJson(result));
  return result;
}

export function createImpactProposal(impact) {
  const knowledge = [
    ...impact.affected.claims,
    ...impact.affected.decisions,
    ...impact.affected.features,
    ...impact.affected.runbooks
  ];
  const proposal = {
    schemaVersion: 1,
    kind: "prodocs.proposal",
    mode: "review",
    source: {
      impactId: impact.id,
      sourceHash: impact.sourceHash,
      knowledgeHash: impact.knowledgeHash
    },
    operations: knowledge.map((node) => ({
      op: "review",
      path: node.path,
      targetId: node.id,
      reason: `${node.id} is connected to ${impact.changes.length} changed path(s).`,
      evidence: impact.changes.map((change) => change.path)
    }))
  };
  proposal.approvalHash = sha256(stableJson(proposal));
  return proposal;
}
