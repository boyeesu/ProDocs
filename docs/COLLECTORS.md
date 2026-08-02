# Collector interface

Collectors convert one source file into bounded, normalized evidence. They do
not create graph nodes directly, read other files, execute indexed code, or
write generated documentation.

## Contract

The public collector boundary is available from `prodocs/collectors`:

```js
import {
  createCollectorRegistry,
  defineCollector
} from "prodocs/collectors";

const collector = defineCollector({
  id: "example-language",
  version: 1,
  languages: ["Example"],
  extensions: [".example"],
  async collect({ source, filePath, language }) {
    return {
      symbols: [{ name: "main", kind: "function", line: 1 }],
      imports: [],
      diagnostics: []
    };
  }
});

const registry = createCollectorRegistry([collector]);
const evidence = await registry.collect({
  source: "function main() {}",
  filePath: "src/main.example",
  language: "Example"
});
```

Collector input is immutable and consists only of normalized source text, its
repository-relative path, and the configured language. A collector may perform
asynchronous work, but its returned evidence must contain:

- `symbols`: stable names, kinds, and one-based source lines;
- `imports`: literal module specifiers and one-based source lines;
- `diagnostics`: severity, stable code, message, line, and column.

The registry validates every result, removes exact duplicates, applies a stable
ordering, and adds the collector identity and source provenance. Its normalized
output conforms to
[`schemas/collector-result.schema.json`](../schemas/collector-result.schema.json).
Collector IDs and versions identify extraction behavior independently of the
result schema version.

Duplicate extension claims are rejected when a registry is created. This makes
collector selection deterministic rather than dependent on registration order.

## Built-in collectors

`babel-javascript-typescript` uses a real syntax tree for `.js`, `.jsx`, `.mjs`,
`.cjs`, `.ts`, `.tsx`, `.mts`, and `.cts`. It recognizes declarations, class
and interface methods, static imports, re-exports, CommonJS `require` calls, and
literal dynamic imports. Text inside comments and string literals is not
evidence.

Other supported languages currently use the
`legacy-language-patterns` collector. Those patterns remain behind the same
contract so each language can be replaced without changing the scanner or
knowledge graph.

The default CLI stops with the file and location when a parser cannot produce
an AST. Recoverable parser diagnostics—common in intentional negative type
tests—are retained as warnings while their syntax-tree evidence remains usable.
Direct registry users can inspect all diagnostics and choose their own policy.

## Security boundary

Repository content is untrusted. Built-in collectors parse the supplied string
in-process and never import, evaluate, compile, or run the indexed file. The
scanner applies its existing file-count and byte limits before invoking a
collector.

Third-party collector loading is not enabled by the CLI yet. A future plugin
SDK must add explicit capabilities and isolation before external collector code
can run.
