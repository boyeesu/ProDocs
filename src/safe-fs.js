import crypto from "node:crypto";
import { constants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

const NO_FOLLOW = constants.O_NOFOLLOW ?? 0;

export async function readRegularFile(
  filePath,
  { encoding = "utf8", maxBytes = Number.MAX_SAFE_INTEGER } = {}
) {
  let handle;
  try {
    const beforeOpen = await fs.lstat(filePath);
    if (beforeOpen.isSymbolicLink() || !beforeOpen.isFile()) {
      throw new Error(`Expected a regular file, not a symbolic link: ${filePath}`);
    }

    handle = await fs.open(filePath, constants.O_RDONLY | NO_FOLLOW);
    const stat = await handle.stat();
    const afterOpen = await fs.lstat(filePath);
    if (
      afterOpen.isSymbolicLink() ||
      !stat.isFile() ||
      stat.dev !== afterOpen.dev ||
      stat.ino !== afterOpen.ino
    ) {
      throw new Error(`File changed while it was opened safely: ${filePath}`);
    }
    if (stat.size > maxBytes) {
      throw new Error(
        `File exceeds the configured ${maxBytes}-byte limit: ${filePath}`
      );
    }

    const chunks = [];
    let totalBytes = 0;
    while (true) {
      const remaining = maxBytes - totalBytes;
      const buffer = Buffer.allocUnsafe(Math.min(64 * 1024, remaining + 1));
      const { bytesRead } = await handle.read(
        buffer,
        0,
        buffer.length,
        totalBytes
      );
      if (bytesRead === 0) break;
      totalBytes += bytesRead;
      if (totalBytes > maxBytes) {
        throw new Error(
          `File exceeds the configured ${maxBytes}-byte limit: ${filePath}`
        );
      }
      chunks.push(buffer.subarray(0, bytesRead));
    }

    return {
      contents: Buffer.concat(chunks, totalBytes).toString(encoding),
      size: totalBytes
    };
  } finally {
    await handle?.close();
  }
}

export async function createFileExclusive(filePath, contents) {
  try {
    await fs.writeFile(filePath, contents, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o644
    });
    return true;
  } catch (error) {
    if (error.code === "EEXIST") return false;
    throw error;
  }
}

export async function atomicWriteFile(filePath, contents) {
  const directory = path.dirname(filePath);
  const basename = path.basename(filePath);
  const temporaryPath = path.join(
    directory,
    `.${basename}.${process.pid}.${crypto.randomUUID()}.tmp`
  );

  try {
    try {
      const destination = await fs.lstat(filePath);
      if (destination.isSymbolicLink()) {
        throw new Error(`Refusing to replace a symbolic link: ${filePath}`);
      }
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }

    await fs.writeFile(temporaryPath, contents, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o644
    });
    await fs.rename(temporaryPath, filePath);
  } catch (error) {
    try {
      await fs.unlink(temporaryPath);
    } catch (cleanupError) {
      if (cleanupError.code !== "ENOENT") {
        error.cleanupError = cleanupError;
      }
    }
    throw error;
  }
}
