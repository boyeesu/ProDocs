import YAML from "yaml";
import { defineCollector } from "./contract.js";

const HTTP_METHODS = new Set([
  "get",
  "put",
  "post",
  "delete",
  "options",
  "head",
  "patch",
  "trace"
]);

function lineFor(source, needle) {
  const index = source.indexOf(needle);
  return index === -1 ? 1 : source.slice(0, index).split("\n").length;
}

export const openApiCollector = defineCollector({
  id: "openapi",
  version: 1,
  languages: ["OpenAPI"],
  extensions: [".openapi.json", ".openapi.yaml", ".openapi.yml"],
  collect({ source }) {
    let document;
    try {
      document = YAML.parse(source, {
        maxAliasCount: 0,
        strict: true,
        uniqueKeys: true
      });
    } catch (error) {
      return {
        symbols: [],
        imports: [],
        diagnostics: [
          {
            severity: "error",
            code: "invalid-openapi",
            message: error.message,
            line: error.linePos?.[0]?.line ?? 1,
            column: error.linePos?.[0]?.col ?? 1
          }
        ]
      };
    }
    if (
      !document ||
      typeof document !== "object" ||
      typeof document.openapi !== "string" ||
      !document.paths ||
      typeof document.paths !== "object"
    ) {
      return {
        symbols: [],
        imports: [],
        diagnostics: [
          {
            severity: "error",
            code: "invalid-openapi",
            message: "Expected an OpenAPI document with openapi and paths fields.",
            line: 1,
            column: 1
          }
        ]
      };
    }
    const symbols = [];
    for (const [route, item] of Object.entries(document.paths)) {
      if (!item || typeof item !== "object") continue;
      for (const method of Object.keys(item)) {
        if (!HTTP_METHODS.has(method.toLowerCase())) continue;
        symbols.push({
          name: `${method.toUpperCase()} ${route}`,
          kind: "endpoint",
          line: lineFor(source, route)
        });
      }
    }
    for (const name of Object.keys(document.components?.schemas ?? {})) {
      symbols.push({
        name,
        kind: "schema",
        line: lineFor(source, name)
      });
    }
    return { symbols, imports: [], diagnostics: [] };
  }
});

export const databaseSchemaCollector = defineCollector({
  id: "database-schema",
  version: 1,
  languages: ["SQL"],
  extensions: [".sql"],
  collect({ source }) {
    const symbols = [];
    const pattern =
      /\bCREATE\s+(?:OR\s+REPLACE\s+)?(?:TABLE|VIEW)\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"([^"]+)"|`([^`]+)`|\[([^\]]+)\]|([A-Za-z_][\w.]*))/gi;
    for (const match of source.matchAll(pattern)) {
      const name = match[1] ?? match[2] ?? match[3] ?? match[4];
      symbols.push({
        name,
        kind: /^CREATE\s+(?:OR\s+REPLACE\s+)?VIEW/i.test(match[0])
          ? "view"
          : "table",
        line: source.slice(0, match.index).split("\n").length
      });
    }
    return { symbols, imports: [], diagnostics: [] };
  }
});
