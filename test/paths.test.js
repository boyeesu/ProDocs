import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { resolveOutputPath, resolveSourcePath } from "../src/paths.js";

test("project paths accept safe relative locations", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "prodocs-path-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, "src"));
  const realRoot = await fs.realpath(root);

  assert.equal(await resolveSourcePath(root, "src"), path.join(realRoot, "src"));
  assert.equal(
    await resolveOutputPath(root, "docs/prodocs"),
    path.join(root, "docs", "prodocs")
  );
});

test("project paths reject lexical escapes and absolute paths", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "prodocs-path-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  await assert.rejects(resolveSourcePath(root, "../outside"), /escapes/);
  await assert.rejects(resolveOutputPath(root, "../outside"), /inside the project root/);
  await assert.rejects(resolveOutputPath(root, "/tmp/outside"), /relative/);
});

test(
  "project paths reject symbolic-link escapes",
  { skip: process.platform === "win32" },
  async (t) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "prodocs-path-"));
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), "prodocs-outside-"));
    t.after(() => fs.rm(root, { recursive: true, force: true }));
    t.after(() => fs.rm(outside, { recursive: true, force: true }));
    await fs.symlink(outside, path.join(root, "linked"));

    await assert.rejects(resolveSourcePath(root, "linked"), /resolves outside/);
    await assert.rejects(resolveOutputPath(root, "linked/generated"), /resolves outside/);
  }
);
