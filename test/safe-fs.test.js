import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  atomicWriteFile,
  createFileExclusive,
  readRegularFile
} from "../src/safe-fs.js";

test("exclusive creation never overwrites an existing file", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "prodocs-safe-fs-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const destination = path.join(root, "config.json");

  assert.equal(await createFileExclusive(destination, "first"), true);
  assert.equal(await createFileExclusive(destination, "second"), false);
  assert.equal(await fs.readFile(destination, "utf8"), "first");
});

test("atomic writes replace regular files", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "prodocs-safe-fs-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const destination = path.join(root, "artifact.json");

  await atomicWriteFile(destination, "first");
  await atomicWriteFile(destination, "second");
  assert.equal(await fs.readFile(destination, "utf8"), "second");
});

test(
  "safe file operations reject symbolic-link reads and writes",
  { skip: process.platform === "win32" },
  async (t) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "prodocs-safe-fs-"));
    t.after(() => fs.rm(root, { recursive: true, force: true }));
    const outside = path.join(root, "outside.txt");
    const linked = path.join(root, "linked.txt");
    await fs.writeFile(outside, "protected");
    await fs.symlink(outside, linked);

    await assert.rejects(readRegularFile(linked), /ELOOP|symbolic link/i);
    await assert.rejects(atomicWriteFile(linked, "changed"), /symbolic link/i);
    assert.equal(await fs.readFile(outside, "utf8"), "protected");
  }
);
