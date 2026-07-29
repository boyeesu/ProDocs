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
