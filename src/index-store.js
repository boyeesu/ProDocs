import { createRequire } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";
import initSqlJs from "sql.js";
import { isInside } from "./paths.js";
import { atomicWriteBuffer } from "./safe-fs.js";

const require = createRequire(import.meta.url);
let sqlPromise;

function loadSql() {
  sqlPromise ??= initSqlJs({
    locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm")
  });
  return sqlPromise;
}

function databasePath(root, configuredPath) {
  if (
    typeof configuredPath !== "string" ||
    configuredPath.trim() === "" ||
    path.isAbsolute(configuredPath)
  ) {
    throw new Error("index.path must be a project-relative SQLite file.");
  }
  const absoluteRoot = path.resolve(root);
  const absolute = path.resolve(absoluteRoot, configuredPath);
  if (absolute === absoluteRoot || !isInside(absoluteRoot, absolute)) {
    throw new Error("index.path must stay inside the project root.");
  }
  return absolute;
}

function firstValue(database, sql, parameters) {
  const statement = database.prepare(sql);
  try {
    statement.bind(parameters);
    return statement.step() ? statement.getAsObject() : null;
  } finally {
    statement.free();
  }
}

export async function openIndexStore(
  root,
  config,
  { readOnly = false } = {}
) {
  if (!config.index.enabled) {
    return {
      backend: "disabled",
      get() {
        return null;
      },
      set() {},
      removeMissing() {},
      async close() {}
    };
  }
  const SQL = await loadSql();
  const filePath = databasePath(root, config.index.path);
  let bytes = null;
  try {
    const stat = await fs.lstat(filePath);
    if (stat.isSymbolicLink() || !stat.isFile()) {
      throw new Error(`Refusing unsafe SQLite index path: ${config.index.path}`);
    }
    if (stat.size > 512 * 1024 * 1024) {
      throw new Error("SQLite index exceeds the 512 MiB safety limit.");
    }
    bytes = await fs.readFile(filePath);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const database = bytes ? new SQL.Database(bytes) : new SQL.Database();
  database.run(`
    PRAGMA journal_mode=MEMORY;
    PRAGMA synchronous=FULL;
    CREATE TABLE IF NOT EXISTS evidence (
      path TEXT PRIMARY KEY,
      content_hash TEXT NOT NULL,
      collector_id TEXT NOT NULL,
      collector_version INTEGER NOT NULL,
      result_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  let dirty = !bytes;

  return {
    backend: "sqlite",
    path: filePath,
    get(relativePath, contentHash) {
      const row = firstValue(
        database,
        "SELECT content_hash, result_json FROM evidence WHERE path = ?",
        [relativePath]
      );
      if (!row || row.content_hash !== contentHash) return null;
      try {
        return JSON.parse(row.result_json);
      } catch {
        return null;
      }
    },
    set(relativePath, contentHash, result) {
      if (readOnly) return;
      database.run(
        `INSERT INTO evidence
          (path, content_hash, collector_id, collector_version, result_json, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(path) DO UPDATE SET
          content_hash=excluded.content_hash,
          collector_id=excluded.collector_id,
          collector_version=excluded.collector_version,
          result_json=excluded.result_json,
          updated_at=excluded.updated_at`,
        [
          relativePath,
          contentHash,
          result.collector.id,
          result.collector.version,
          JSON.stringify(result),
          new Date().toISOString()
        ]
      );
      dirty = true;
    },
    removeMissing(currentPaths) {
      if (readOnly) return;
      const paths = new Set(currentPaths);
      const result = database.exec("SELECT path FROM evidence");
      const rows = result[0]?.values ?? [];
      for (const [storedPath] of rows) {
        if (!paths.has(storedPath)) {
          database.run("DELETE FROM evidence WHERE path = ?", [storedPath]);
          dirty = true;
        }
      }
    },
    async close() {
      try {
        if (!readOnly && dirty) {
          await fs.mkdir(path.dirname(filePath), { recursive: true });
          const parent = await fs.lstat(path.dirname(filePath));
          if (parent.isSymbolicLink() || !parent.isDirectory()) {
            throw new Error("Refusing unsafe SQLite index directory.");
          }
          await atomicWriteBuffer(filePath, Buffer.from(database.export()));
        }
      } finally {
        database.close();
      }
    }
  };
}
