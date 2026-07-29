import fs from "node:fs/promises";
import path from "node:path";

export function isInside(root, target) {
  const relative = path.relative(root, target);
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== ".." &&
      !path.isAbsolute(relative))
  );
}

function requireRelativePath(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a non-empty relative path.`);
  }
  if (path.isAbsolute(value)) {
    throw new Error(`${label} must be relative to the project root: ${value}`);
  }
}

export async function resolveSourcePath(root, value) {
  requireRelativePath(value, "Configured source");
  const absoluteRoot = path.resolve(root);
  const absoluteTarget = path.resolve(absoluteRoot, value);
  if (!isInside(absoluteRoot, absoluteTarget)) {
    throw new Error(`Configured source escapes the project root: ${value}`);
  }

  let realRoot;
  let realTarget;
  try {
    [realRoot, realTarget] = await Promise.all([
      fs.realpath(absoluteRoot),
      fs.realpath(absoluteTarget)
    ]);
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(`Configured source does not exist: ${value}`);
    }
    throw error;
  }

  if (!isInside(realRoot, realTarget)) {
    throw new Error(`Configured source resolves outside the project root: ${value}`);
  }
  return realTarget;
}

export async function resolveOutputPath(root, value) {
  requireRelativePath(value, "Configured output");
  const absoluteRoot = path.resolve(root);
  const absoluteTarget = path.resolve(absoluteRoot, value);
  if (absoluteTarget === absoluteRoot || !isInside(absoluteRoot, absoluteTarget)) {
    throw new Error(`Configured output must be a directory inside the project root: ${value}`);
  }

  const realRoot = await fs.realpath(absoluteRoot);
  let existingAncestor = absoluteTarget;
  while (existingAncestor !== absoluteRoot) {
    try {
      await fs.lstat(existingAncestor);
      break;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      existingAncestor = path.dirname(existingAncestor);
    }
  }

  const realAncestor = await fs.realpath(existingAncestor);
  if (!isInside(realRoot, realAncestor)) {
    throw new Error(`Configured output resolves outside the project root: ${value}`);
  }
  return absoluteTarget;
}
