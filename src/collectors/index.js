import {
  createCollectorRegistry,
  defineCollector
} from "./contract.js";
import { javascriptTypeScriptCollector } from "./javascript-typescript.js";
import { legacyLanguageCollector } from "./legacy.js";
import {
  databaseSchemaCollector,
  openApiCollector
} from "./artifacts.js";

export { createCollectorRegistry, defineCollector };
export { javascriptTypeScriptCollector } from "./javascript-typescript.js";
export { legacyLanguageCollector } from "./legacy.js";
export { databaseSchemaCollector, openApiCollector } from "./artifacts.js";

export const defaultCollectorRegistry = createCollectorRegistry([
  javascriptTypeScriptCollector,
  openApiCollector,
  databaseSchemaCollector,
  legacyLanguageCollector
]);

export function collectSourceEvidence(input) {
  return defaultCollectorRegistry.collect(input);
}
