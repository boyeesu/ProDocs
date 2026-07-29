import path from "node:path";

const COLLECTOR_ID = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;
const SEVERITIES = new Set(["error", "warning", "info"]);

function compareStrings(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function requireNonEmptyString(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${label} must be a non-empty string.`);
  }
  return value;
}

function requireString(value, label) {
  if (typeof value !== "string") {
    throw new TypeError(`${label} must be a string.`);
  }
  return value;
}

function requirePositiveInteger(value, label) {
  if (!Number.isInteger(value) || value < 1) {
    throw new TypeError(`${label} must be a positive integer.`);
  }
  return value;
}

function uniqueSortedStrings(values, label, normalize = (value) => value) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new TypeError(`${label} must be a non-empty array.`);
  }
  return [
    ...new Set(
      values.map((value, index) =>
        normalize(requireNonEmptyString(value, `${label}[${index}]`))
      )
    )
  ].sort();
}

function normalizeSymbol(symbol, index) {
  if (!symbol || typeof symbol !== "object" || Array.isArray(symbol)) {
    throw new TypeError(`collector result symbols[${index}] must be an object.`);
  }
  return {
    name: requireNonEmptyString(
      symbol.name,
      `collector result symbols[${index}].name`
    ),
    kind: requireNonEmptyString(
      symbol.kind,
      `collector result symbols[${index}].kind`
    ),
    line: requirePositiveInteger(
      symbol.line,
      `collector result symbols[${index}].line`
    )
  };
}

function normalizeImport(imported, index) {
  if (!imported || typeof imported !== "object" || Array.isArray(imported)) {
    throw new TypeError(`collector result imports[${index}] must be an object.`);
  }
  return {
    specifier: requireNonEmptyString(
      imported.specifier,
      `collector result imports[${index}].specifier`
    ),
    line: requirePositiveInteger(
      imported.line,
      `collector result imports[${index}].line`
    )
  };
}

function normalizeDiagnostic(diagnostic, index) {
  if (
    !diagnostic ||
    typeof diagnostic !== "object" ||
    Array.isArray(diagnostic)
  ) {
    throw new TypeError(
      `collector result diagnostics[${index}] must be an object.`
    );
  }
  const severity = requireNonEmptyString(
    diagnostic.severity,
    `collector result diagnostics[${index}].severity`
  );
  if (!SEVERITIES.has(severity)) {
    throw new TypeError(
      `collector result diagnostics[${index}].severity must be error, warning, or info.`
    );
  }
  return {
    severity,
    code: requireNonEmptyString(
      diagnostic.code,
      `collector result diagnostics[${index}].code`
    ),
    message: requireNonEmptyString(
      diagnostic.message,
      `collector result diagnostics[${index}].message`
    ),
    line: requirePositiveInteger(
      diagnostic.line,
      `collector result diagnostics[${index}].line`
    ),
    column: requirePositiveInteger(
      diagnostic.column,
      `collector result diagnostics[${index}].column`
    )
  };
}

function normalizeList(items, normalizer, key, compare) {
  if (!Array.isArray(items)) {
    throw new TypeError(`collector result ${key} must be an array.`);
  }
  const seen = new Set();
  return items
    .map(normalizer)
    .filter((item) => {
      const identity = compare.identity(item);
      if (seen.has(identity)) return false;
      seen.add(identity);
      return true;
    })
    .sort(compare.sort);
}

export function defineCollector(definition) {
  if (!definition || typeof definition !== "object") {
    throw new TypeError("Collector definition must be an object.");
  }
  const id = requireNonEmptyString(definition.id, "collector id");
  if (!COLLECTOR_ID.test(id)) {
    throw new TypeError(
      "collector id must contain lowercase letters, numbers, dots, dashes, or underscores."
    );
  }
  const version = requirePositiveInteger(
    definition.version,
    "collector version"
  );
  const languages = uniqueSortedStrings(
    definition.languages,
    "collector languages"
  );
  const extensions = uniqueSortedStrings(
    definition.extensions,
    "collector extensions",
    (extension) => extension.toLowerCase()
  );
  for (const extension of extensions) {
    if (!extension.startsWith(".") || extension.includes("/") || extension.includes("\\")) {
      throw new TypeError(
        `collector extension ${extension} must be a file extension such as .ts.`
      );
    }
  }
  if (typeof definition.collect !== "function") {
    throw new TypeError("collector collect must be a function.");
  }

  return Object.freeze({
    id,
    version,
    languages: Object.freeze(languages),
    extensions: Object.freeze(extensions),
    collect: definition.collect
  });
}

export function createCollectorRegistry(collectors) {
  if (!Array.isArray(collectors) || collectors.length === 0) {
    throw new TypeError("Collector registry requires at least one collector.");
  }
  const byExtension = new Map();
  const byId = new Set();
  for (const collector of collectors) {
    if (!collector || typeof collector !== "object") {
      throw new TypeError("Collector registry entries must be collectors.");
    }
    if (byId.has(collector.id)) {
      throw new TypeError(`Duplicate collector id: ${collector.id}.`);
    }
    byId.add(collector.id);
    for (const extension of collector.extensions) {
      if (byExtension.has(extension)) {
        throw new TypeError(
          `Collector extension ${extension} is claimed by both ${byExtension.get(extension).id} and ${collector.id}.`
        );
      }
      byExtension.set(extension, collector);
    }
  }
  const registeredExtensions = [...byExtension.keys()].sort(
    (left, right) =>
      right.length - left.length || compareStrings(left, right)
  );

  return Object.freeze({
    capabilities() {
      return collectors.map((collector) => ({
        id: collector.id,
        version: collector.version,
        languages: [...collector.languages],
        extensions: [...collector.extensions]
      }));
    },

    async collect(input) {
      if (!input || typeof input !== "object") {
        throw new TypeError("Collector input must be an object.");
      }
      const source = requireString(input.source, "collector input source");
      const filePath = requireNonEmptyString(
        input.filePath,
        "collector input filePath"
      );
      const language = requireNonEmptyString(
        input.language,
        "collector input language"
      );
      const normalizedPath = filePath.toLowerCase();
      const extension = registeredExtensions.find((candidate) =>
        normalizedPath.endsWith(candidate)
      );
      const collector = byExtension.get(extension);
      if (!collector) {
        const detected = path.extname(filePath).toLowerCase();
        throw new Error(`No collector is registered for ${detected || filePath}.`);
      }
      if (!collector.languages.includes(language)) {
        throw new Error(
          `Collector ${collector.id} does not support ${language} for ${extension}.`
        );
      }

      const raw = await collector.collect(
        Object.freeze({
          source,
          filePath,
          language
        })
      );
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        throw new TypeError(`Collector ${collector.id} returned an invalid result.`);
      }

      const symbols = normalizeList(
        raw.symbols,
        normalizeSymbol,
        "symbols",
        {
          identity: (symbol) =>
            `${symbol.line}\u0000${symbol.kind}\u0000${symbol.name}`,
          sort: (left, right) =>
            left.line - right.line ||
            compareStrings(left.name, right.name) ||
            compareStrings(left.kind, right.kind)
        }
      );
      const imports = normalizeList(
        raw.imports,
        normalizeImport,
        "imports",
        {
          identity: (imported) =>
            `${imported.line}\u0000${imported.specifier}`,
          sort: (left, right) =>
            left.line - right.line ||
            compareStrings(left.specifier, right.specifier)
        }
      );
      const diagnostics = normalizeList(
        raw.diagnostics,
        normalizeDiagnostic,
        "diagnostics",
        {
          identity: (diagnostic) =>
            `${diagnostic.severity}\u0000${diagnostic.code}\u0000${diagnostic.line}\u0000${diagnostic.column}\u0000${diagnostic.message}`,
          sort: (left, right) =>
            left.line - right.line ||
            left.column - right.column ||
            compareStrings(left.severity, right.severity) ||
            compareStrings(left.code, right.code)
        }
      );

      return {
        schemaVersion: 1,
        collector: {
          id: collector.id,
          version: collector.version
        },
        source: {
          path: filePath,
          language
        },
        symbols,
        imports,
        diagnostics
      };
    }
  });
}
