import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_CONFIG } from "../src/constants.js";
import { validateConfig } from "../src/config.js";

test("validateConfig accepts the default configuration", () => {
  assert.equal(validateConfig(structuredClone(DEFAULT_CONFIG)).schemaVersion, 1);
});

test("validateConfig rejects unsupported schema versions", () => {
  assert.throws(
    () => validateConfig({ ...structuredClone(DEFAULT_CONFIG), schemaVersion: 2 }),
    /Unsupported configuration schemaVersion/
  );
});

test("validateConfig rejects malformed collection fields", () => {
  assert.throws(
    () => validateConfig({ ...structuredClone(DEFAULT_CONFIG), source: [] }),
    /source must be a non-empty array/
  );
  assert.throws(
    () => validateConfig({ ...structuredClone(DEFAULT_CONFIG), exclude: "dist" }),
    /exclude must be an array/
  );
});

test("validateConfig rejects invalid ownership", () => {
  assert.throws(
    () =>
      validateConfig({
        ...structuredClone(DEFAULT_CONFIG),
        ownership: { "src/": "" }
      }),
    /ownership must map/
  );
});

test("validateConfig rejects unknown fields", () => {
  assert.throws(
    () => validateConfig({ ...structuredClone(DEFAULT_CONFIG), typo: true }),
    /Unknown configuration field: typo/
  );
  assert.throws(
    () =>
      validateConfig({
        ...structuredClone(DEFAULT_CONFIG),
        documentation: {
          ...DEFAULT_CONFIG.documentation,
          unexpected: true
        }
      }),
    /Unknown documentation field: unexpected/
  );
});

test("validateConfig enforces bounded resource limits", () => {
  assert.throws(
    () =>
      validateConfig({
        ...structuredClone(DEFAULT_CONFIG),
        limits: {
          ...DEFAULT_CONFIG.limits,
          maxFiles: 0
        }
      }),
    /limits.maxFiles must be an integer/
  );
  assert.throws(
    () =>
      validateConfig({
        ...structuredClone(DEFAULT_CONFIG),
        include: ["a".repeat(257)]
      }),
    /no longer than 256 characters/
  );
});

test("validateConfig fails closed for knowledge, index, plugin, and policy settings", () => {
  assert.throws(
    () =>
      validateConfig({
        ...structuredClone(DEFAULT_CONFIG),
        limits: { ...DEFAULT_CONFIG.limits, unexpected: 1 }
      }),
    /Unknown limits field/
  );
  assert.throws(
    () =>
      validateConfig({
        ...structuredClone(DEFAULT_CONFIG),
        knowledge: "docs"
      }),
    /knowledge must be an object/
  );
  assert.throws(
    () =>
      validateConfig({
        ...structuredClone(DEFAULT_CONFIG),
        knowledge: { ...DEFAULT_CONFIG.knowledge, unexpected: true }
      }),
    /Unknown knowledge field/
  );
  assert.throws(
    () =>
      validateConfig({
        ...structuredClone(DEFAULT_CONFIG),
        knowledge: {
          ...DEFAULT_CONFIG.knowledge,
          requireEvidence: "yes"
        }
      }),
    /requireEvidence must be a boolean/
  );
  assert.throws(
    () =>
      validateConfig({
        ...structuredClone(DEFAULT_CONFIG),
        index: { enabled: "yes", path: "" }
      }),
    /index requires/
  );
  assert.throws(
    () =>
      validateConfig({
        ...structuredClone(DEFAULT_CONFIG),
        plugins: { paths: "plugin.json" }
      }),
    /plugins.paths must be an array/
  );
  assert.throws(
    () =>
      validateConfig({
        ...structuredClone(DEFAULT_CONFIG),
        policies: { ...DEFAULT_CONFIG.policies, unexpected: true }
      }),
    /policies must contain boolean fields/
  );
  assert.throws(
    () =>
      validateConfig({
        ...structuredClone(DEFAULT_CONFIG),
        policies: {
          ...DEFAULT_CONFIG.policies,
          claimRequiresEvidence: "yes"
        }
      }),
    /policies must contain boolean fields/
  );
});
