import fs from "node:fs";
import path from "node:path";

// Enumerate explicitly instead of relying on shell globs or Node's recursive
// repository discovery, which can execute tests in nested worktree copies.
export function testFiles(root = process.cwd()) {
  function visit(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) return visit(target);
      return entry.isFile() && entry.name.endsWith(".test.js") ? [target] : [];
    });
  }
  return [
    ...visit(path.join(root, "test")),
    ...visit(path.join(root, "examples", "getting-started", "test"))
  ].sort();
}
