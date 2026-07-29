import {
  createCollectorRegistry,
  defineCollector
} from "./contract.js";
import { javascriptTypeScriptCollector } from "./javascript-typescript.js";
import { legacyLanguageCollector } from "./legacy.js";

export { createCollectorRegistry, defineCollector };
export { javascriptTypeScriptCollector } from "./javascript-typescript.js";
export { legacyLanguageCollector } from "./legacy.js";

export const defaultCollectorRegistry = createCollectorRegistry([
  javascriptTypeScriptCollector,
  legacyLanguageCollector
]);

export function collectSourceEvidence(input) {
  return defaultCollectorRegistry.collect(input);
}
