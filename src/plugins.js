import path from "node:path";
import { defineCollector } from "./collectors/contract.js";
import { readRegularFile } from "./safe-fs.js";

const IDENTIFIER = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;

function stringArray(value, label, maximum = 128) {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > maximum ||
    value.some(
      (item) =>
        typeof item !== "string" ||
        item.trim() === "" ||
        item.length > 256 ||
        item.includes("\0")
    )
  ) {
    throw new Error(`${label} must be a non-empty bounded string array.`);
  }
  return [...new Set(value)].sort();
}

function rules(value, label) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 128) {
    throw new Error(`${label} must contain at most 128 rules.`);
  }
  return value.map((rule, index) => {
    if (
      !rule ||
      typeof rule !== "object" ||
      Array.isArray(rule) ||
      typeof rule.prefix !== "string" ||
      rule.prefix === "" ||
      rule.prefix.length > 128 ||
      rule.prefix.includes("\0")
    ) {
      throw new Error(`${label}[${index}] needs a bounded prefix.`);
    }
    if (
      label === "symbols" &&
      (typeof rule.kind !== "string" ||
        rule.kind.trim() === "" ||
        rule.kind.length > 64)
    ) {
      throw new Error(`${label}[${index}] needs a symbol kind.`);
    }
    return {
      prefix: rule.prefix,
      ...(label === "symbols" ? { kind: rule.kind } : {})
    };
  });
}

function nameAfterPrefix(line, prefix) {
  const remainder = line.slice(prefix.length).trim();
  return remainder.split(/[\s([{:=,]/, 1)[0]?.trim() ?? "";
}

export function defineDeclarativePlugin(definition) {
  if (
    !definition ||
    typeof definition !== "object" ||
    Array.isArray(definition) ||
    definition.schemaVersion !== 1 ||
    definition.kind !== "prodocs.collector-plugin" ||
    typeof definition.id !== "string" ||
    !IDENTIFIER.test(definition.id) ||
    !Number.isSafeInteger(definition.version) ||
    definition.version < 1
  ) {
    throw new Error("Invalid declarative ProDocs collector plugin.");
  }
  const capabilities = stringArray(
    definition.capabilities,
    "capabilities",
    8
  );
  if (
    capabilities.length !== 1 ||
    capabilities[0] !== "collect:source-text"
  ) {
    throw new Error(
      "Declarative plugins may only request collect:source-text."
    );
  }
  const symbolRules = rules(definition.rules?.symbols, "symbols");
  const importRules = rules(definition.rules?.imports, "imports");
  const collector = defineCollector({
    id: `plugin.${definition.id}`,
    version: definition.version,
    languages: stringArray(definition.languages, "languages"),
    extensions: stringArray(definition.extensions, "extensions").map(
      (extension) => {
        if (!extension.startsWith(".") || extension.includes("/")) {
          throw new Error(`Invalid plugin extension: ${extension}`);
        }
        return extension.toLowerCase();
      }
    ),
    collect({ source }) {
      const symbols = [];
      const imports = [];
      for (const [index, rawLine] of source.split(/\r?\n/).entries()) {
        const line = rawLine.trim();
        if (line.length > 10_000) continue;
        for (const rule of symbolRules) {
          if (!line.startsWith(rule.prefix)) continue;
          const name = nameAfterPrefix(line, rule.prefix);
          if (name) symbols.push({ name, kind: rule.kind, line: index + 1 });
        }
        for (const rule of importRules) {
          if (!line.startsWith(rule.prefix)) continue;
          const specifier = nameAfterPrefix(line, rule.prefix).replace(
            /^["']|["'];?$/g,
            ""
          );
          if (specifier) imports.push({ specifier, line: index + 1 });
        }
      }
      return { symbols, imports, diagnostics: [] };
    }
  });
  return {
    collector,
    definition: {
      ...definition,
      capabilities,
      fixtures: Array.isArray(definition.fixtures) ? definition.fixtures : []
    }
  };
}

export async function loadDeclarativePlugin(filePath) {
  const { contents } = await readRegularFile(filePath, {
    maxBytes: 1024 * 1024
  });
  let definition;
  try {
    definition = JSON.parse(contents);
  } catch (error) {
    throw new Error(`Invalid plugin JSON at ${filePath}: ${error.message}`);
  }
  return defineDeclarativePlugin(definition);
}

export async function verifyDeclarativePlugin(filePath) {
  const plugin = await loadDeclarativePlugin(filePath);
  const failures = [];
  for (const [index, fixture] of plugin.definition.fixtures.entries()) {
    if (
      !fixture ||
      typeof fixture.source !== "string" ||
      typeof fixture.filePath !== "string" ||
      typeof fixture.language !== "string" ||
      !Array.isArray(fixture.symbols)
    ) {
      failures.push(`fixtures[${index}] is invalid`);
      continue;
    }
    const result = await plugin.collector.collect({
      source: fixture.source,
      filePath: fixture.filePath,
      language: fixture.language
    });
    const actual = result.symbols ?? [];
    if (JSON.stringify(actual) !== JSON.stringify(fixture.symbols)) {
      failures.push(`fixtures[${index}] symbols do not match`);
    }
  }
  return {
    plugin: plugin.definition.id,
    path: path.resolve(filePath),
    passed: failures.length === 0,
    fixtures: plugin.definition.fixtures.length,
    failures,
    capabilities: plugin.definition.capabilities
  };
}
