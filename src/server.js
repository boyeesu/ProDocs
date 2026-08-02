import http from "node:http";
import path from "node:path";
import { URL } from "node:url";
import { loadConfig } from "./config.js";
import { buildContextPacket } from "./context.js";
import { evaluatePolicies } from "./policy.js";
import { applyProposal, validateProposal } from "./proposals.js";
import { renderAudienceView } from "./render.js";
import { readRegularFile } from "./safe-fs.js";
import { scanProject } from "./scanner.js";
import { timingSafeEqualText } from "./security.js";

function json(response, status, value) {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
    "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "no-referrer"
  });
  response.end(body);
}

function authorized(request, token) {
  if (!token) return false;
  const header = request.headers.authorization ?? "";
  return (
    header.startsWith("Bearer ") &&
    timingSafeEqualText(header.slice(7), token)
  );
}

async function body(request, maximum = 2 * 1024 * 1024) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > maximum) throw new Error("Request body exceeds 2 MiB.");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function readManifest(root, config) {
  try {
    const { contents } = await readRegularFile(
      path.join(root, config.output, "manifest.json"),
      { maxBytes: 1024 * 1024 }
    );
    return JSON.parse(contents);
  } catch (manifestError) {
    if (manifestError.code === "ENOENT") return null;
    throw new Error(`Could not read generated manifest: ${manifestError.message}`);
  }
}

export function createCollaborationServer(
  root,
  { token = process.env.PRODOCS_SERVER_TOKEN } = {}
) {
  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://localhost");
      if (request.method === "GET" && url.pathname === "/health") {
        return json(response, 200, { status: "ok" });
      }
      const config = await loadConfig(root);
      const [graph, manifest] = await Promise.all([
        scanProject(root, config, { indexMode: "read" }),
        readManifest(root, config)
      ]);
      if (request.method === "GET" && url.pathname === "/api/graph") {
        return json(response, 200, graph);
      }
      if (request.method === "GET" && url.pathname === "/api/policy") {
        return json(response, 200, evaluatePolicies(graph, config));
      }
      if (request.method === "GET" && url.pathname === "/api/context") {
        const paths = url.searchParams.getAll("path");
        return json(
          response,
          200,
          buildContextPacket(graph, paths, manifest, {
            task: url.searchParams.get("task"),
            maxFiles: Math.min(
              Number.parseInt(url.searchParams.get("maxFiles"), 10) ||
                config.limits.maxContextFiles,
              config.limits.maxContextFiles
            ),
            maxTokens: Math.min(
              Number.parseInt(url.searchParams.get("maxTokens"), 10) ||
                config.limits.maxContextTokens,
              config.limits.maxContextTokens
            )
          })
        );
      }
      if (
        request.method === "GET" &&
        url.pathname.startsWith("/api/views/")
      ) {
        const audience = decodeURIComponent(url.pathname.slice(11));
        return json(response, 200, {
          audience,
          markdown: renderAudienceView(graph, config, audience)
        });
      }
      if (
        request.method === "POST" &&
        url.pathname === "/api/proposals/apply"
      ) {
        if (!authorized(request, token)) {
          return json(response, 401, { error: "Bearer authorization required." });
        }
        const payload = await body(request);
        validateProposal(payload.proposal);
        return json(
          response,
          200,
          await applyProposal(
            root,
            config,
            payload.proposal,
            payload.approvalHash
          )
        );
      }
      return json(response, 404, { error: "Not found." });
    } catch (error) {
      return json(response, 400, { error: error.message });
    }
  });
}

export async function listenForCollaboration(
  root,
  {
    host = "127.0.0.1",
    port = 43110,
    token = process.env.PRODOCS_SERVER_TOKEN
  } = {}
) {
  if (
    !["127.0.0.1", "::1", "localhost"].includes(host) &&
    (!token || token.length < 24)
  ) {
    throw new Error(
      "Non-loopback collaboration servers require PRODOCS_SERVER_TOKEN with at least 24 characters."
    );
  }
  const server = createCollaborationServer(root, { token });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolve);
  });
  return server;
}
