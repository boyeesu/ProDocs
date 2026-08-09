import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const workflowDirectory = path.join(".github", "workflows");

test("workflow actions are GitHub-owned and pinned to immutable commits", async () => {
  const workflowNames = (await fs.readdir(workflowDirectory))
    .filter((name) => name.endsWith(".yml"))
    .sort();

  for (const workflowName of workflowNames) {
    const workflow = await fs.readFile(
      path.join(workflowDirectory, workflowName),
      "utf8"
    );
    for (const match of workflow.matchAll(/^\s*-\s+uses:\s+([^\s#]+)/gm)) {
      const action = match[1];
      assert.match(
        action,
        /^(?:actions|github)\/[a-z0-9_-]+(?:\/[a-z0-9_-]+)?@[a-f0-9]{40}$/i,
        `${workflowName} has an untrusted or mutable action: ${action}`
      );
    }
  }
});

test("release workflows use attestations and tokenless npm publishing", async () => {
  const [release, publish] = await Promise.all([
    fs.readFile(path.join(workflowDirectory, "release.yml"), "utf8"),
    fs.readFile(path.join(workflowDirectory, "publish-npm.yml"), "utf8")
  ]);

  assert.match(release, /attestations: write/);
  assert.match(release, /id-token: write/);
  assert.match(release, /attest-build-provenance@[a-f0-9]{40}/);
  assert.match(release, /npm sbom/);
  assert.match(release, /sha256sum/);
  assert.match(publish, /environment: npm/);
  assert.match(
    publish,
    /npm publish \.\/release\/\*\.tgz --access public --provenance/,
  );
  assert.match(publish, /sha256sum --check release\/SHA256SUMS --ignore-missing/);
  assert.doesNotMatch(publish, /NPM_TOKEN|NODE_AUTH_TOKEN/);
});
