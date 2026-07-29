import fs from "node:fs/promises";
import path from "node:path";
import { DEFAULT_CONFIG } from "./constants.js";

const CONFIG_FILE = "prodocs.config.json";

function requireStringArray(value, name, { nonEmpty = false } = {}) {
  if (
    !Array.isArray(value) ||
    (nonEmpty && value.length === 0) ||
    value.some((item) => typeof item !== "string" || item.trim() === "")
  ) {
    throw new Error(
      `${name} must be ${nonEmpty ? "a non-empty array" : "an array"} of non-empty strings.`
    );
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
    "documentation"
  ]);
  const unknownKeys = Object.keys(config).filter((key) => !allowedKeys.has(key));
  if (unknownKeys.length > 0) {
    throw new Error(`Unknown configuration field${unknownKeys.length > 1 ? "s" : ""}: ${unknownKeys.join(", ")}`);
  }
  requireStringArray(config.source, "source", { nonEmpty: true });
  requireStringArray(config.include, "include");
  requireStringArray(config.exclude, "exclude");
  requireStringArray(config.entrypoints, "entrypoints");

  if (typeof config.output !== "string" || config.output.trim() === "") {
    throw new Error("output must be a non-empty relative path.");
  }
  if (
    !config.ownership ||
    typeof config.ownership !== "object" ||
    Array.isArray(config.ownership) ||
    Object.entries(config.ownership).some(
      ([pattern, owner]) =>
        pattern.trim() === "" || typeof owner !== "string" || owner.trim() === ""
    )
  ) {
    throw new Error("ownership must map non-empty path patterns to owner strings.");
  }
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
    if (typeof config.documentation[key] !== "string") {
      throw new Error(`documentation.${key} must be a string.`);
    }
  }
  requireStringArray(config.documentation.audiences, "documentation.audiences");
  return config;
}

export async function loadConfig(root) {
  const configPath = path.join(root, CONFIG_FILE);
  let userConfig = {};

  try {
    userConfig = JSON.parse(await fs.readFile(configPath, "utf8"));
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
  try {
    await fs.access(configPath);
    return { path: configPath, created: false };
  } catch {
    await fs.writeFile(configPath, `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`);
    return { path: configPath, created: true };
  }
}
