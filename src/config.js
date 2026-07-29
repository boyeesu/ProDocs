import path from "node:path";
import { DEFAULT_CONFIG } from "./constants.js";
import { createFileExclusive, readRegularFile } from "./safe-fs.js";

const CONFIG_FILE = "prodocs.config.json";

function requireStringArray(
  value,
  name,
  { nonEmpty = false, maxItems = 256, maxLength = 1024 } = {}
) {
  if (
    !Array.isArray(value) ||
    (nonEmpty && value.length === 0) ||
    value.length > maxItems ||
    value.some(
      (item) =>
        typeof item !== "string" ||
        item.trim() === "" ||
        item.length > maxLength ||
        item.includes("\0")
    )
  ) {
    throw new Error(
      `${name} must be ${nonEmpty ? "a non-empty array" : "an array"} of at most ${maxItems} non-empty strings, each no longer than ${maxLength} characters.`
    );
  }
}

function requirePositiveInteger(value, name, maximum) {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new Error(`${name} must be an integer between 1 and ${maximum}.`);
  }
}

export function validateConfig(config) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new Error("Configuration must be a JSON object.");
  }
  if (config.schemaVersion !== 1) {
    throw new Error(`Unsupported configuration schemaVersion: ${config.schemaVersion}`);
  }
  const allowedKeys = new Set([
    "$schema",
    "schemaVersion",
    "source",
    "output",
    "include",
    "exclude",
    "entrypoints",
    "ownership",
    "limits",
    "documentation"
  ]);
  const unknownKeys = Object.keys(config).filter((key) => !allowedKeys.has(key));
  if (unknownKeys.length > 0) {
    throw new Error(`Unknown configuration field${unknownKeys.length > 1 ? "s" : ""}: ${unknownKeys.join(", ")}`);
  }
  requireStringArray(config.source, "source", {
    nonEmpty: true,
    maxItems: 256
  });
  requireStringArray(config.include, "include", {
    maxItems: 256,
    maxLength: 256
  });
  requireStringArray(config.exclude, "exclude", {
    maxItems: 256,
    maxLength: 256
  });
  requireStringArray(config.entrypoints, "entrypoints", {
    maxItems: 10_000
  });

  if (typeof config.output !== "string" || config.output.trim() === "") {
    throw new Error("output must be a non-empty relative path.");
  }
  if (
    !config.ownership ||
    typeof config.ownership !== "object" ||
    Array.isArray(config.ownership) ||
    Object.keys(config.ownership).length > 10_000 ||
    Object.entries(config.ownership).some(
      ([pattern, owner]) =>
        pattern.trim() === "" ||
        pattern.length > 1024 ||
        pattern.includes("\0") ||
        typeof owner !== "string" ||
        owner.trim() === "" ||
        owner.length > 256 ||
        owner.includes("\0")
    )
  ) {
    throw new Error("ownership must map non-empty path patterns to owner strings.");
  }
  if (!config.limits || typeof config.limits !== "object" || Array.isArray(config.limits)) {
    throw new Error("limits must be an object.");
  }
  const allowedLimitKeys = new Set([
    "maxFiles",
    "maxFileSizeBytes",
    "maxTotalBytes"
  ]);
  const unknownLimitKeys = Object.keys(config.limits).filter(
    (key) => !allowedLimitKeys.has(key)
  );
  if (unknownLimitKeys.length > 0) {
    throw new Error(`Unknown limits field: ${unknownLimitKeys.join(", ")}`);
  }
  requirePositiveInteger(config.limits.maxFiles, "limits.maxFiles", 1_000_000);
  requirePositiveInteger(
    config.limits.maxFileSizeBytes,
    "limits.maxFileSizeBytes",
    100 * 1024 * 1024
  );
  requirePositiveInteger(
    config.limits.maxTotalBytes,
    "limits.maxTotalBytes",
    10 * 1024 * 1024 * 1024
  );
  if (
    !config.documentation ||
    typeof config.documentation !== "object" ||
    Array.isArray(config.documentation)
  ) {
    throw new Error("documentation must be an object.");
  }
  const allowedDocumentationKeys = new Set([
    "productName",
    "oneLineDescription",
    "audiences"
  ]);
  const unknownDocumentationKeys = Object.keys(config.documentation).filter(
    (key) => !allowedDocumentationKeys.has(key)
  );
  if (unknownDocumentationKeys.length > 0) {
    throw new Error(
      `Unknown documentation field${unknownDocumentationKeys.length > 1 ? "s" : ""}: ${unknownDocumentationKeys.join(", ")}`
    );
  }
  for (const key of ["productName", "oneLineDescription"]) {
    if (
      typeof config.documentation[key] !== "string" ||
      config.documentation[key].length > 10_000 ||
      config.documentation[key].includes("\0")
    ) {
      throw new Error(
        `documentation.${key} must be a string no longer than 10000 characters.`
      );
    }
  }
  requireStringArray(config.documentation.audiences, "documentation.audiences", {
    maxItems: 256,
    maxLength: 256
  });
  return config;
}

export async function loadConfig(root) {
  const configPath = path.join(root, CONFIG_FILE);
  let userConfig = {};

  try {
    const { contents } = await readRegularFile(configPath, {
      maxBytes: 1024 * 1024
    });
    userConfig = JSON.parse(contents);
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw new Error(`Could not read ${CONFIG_FILE}: ${error.message}`);
    }
  }

  return validateConfig({
    ...DEFAULT_CONFIG,
    ...userConfig,
    documentation: {
      ...DEFAULT_CONFIG.documentation,
      ...(userConfig.documentation ?? {})
    }
  });
}

export async function writeDefaultConfig(root) {
  const configPath = path.join(root, CONFIG_FILE);
  const created = await createFileExclusive(
    configPath,
    `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`
  );
  return { path: configPath, created };
}
