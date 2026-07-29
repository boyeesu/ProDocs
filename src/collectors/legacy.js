import { defineCollector } from "./contract.js";

function lineNumberAt(source, offset) {
  return source.slice(0, offset).split("\n").length;
}

const SYMBOL_PATTERNS = {
  Python: [
    { kind: "function", regex: /^(?:async\s+)?def\s+([A-Za-z_]\w*)/gm },
    { kind: "class", regex: /^class\s+([A-Za-z_]\w*)/gm }
  ],
  Go: [
    { kind: "function", regex: /^func\s+(?:\([^)]*\)\s*)?([A-Za-z_]\w*)/gm },
    { kind: "type", regex: /^type\s+([A-Za-z_]\w*)/gm }
  ],
  Rust: [
    {
      kind: "function",
      regex: /^(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?fn\s+([A-Za-z_]\w*)/gm
    },
    {
      kind: "type",
      regex: /^(?:pub(?:\([^)]*\))?\s+)?(?:struct|enum|trait)\s+([A-Za-z_]\w*)/gm
    }
  ],
  Java: [
    {
      kind: "type",
      regex: /(?:public\s+)?(?:class|interface|enum|record)\s+([A-Za-z_]\w*)/g
    }
  ],
  "C#": [
    {
      kind: "type",
      regex: /(?:public\s+)?(?:class|interface|enum|record|struct)\s+([A-Za-z_]\w*)/g
    }
  ],
  Ruby: [
    { kind: "class", regex: /^class\s+([A-Za-z_]\w*)/gm },
    { kind: "function", regex: /^\s*def\s+([A-Za-z_]\w*[!?=]?)/gm }
  ],
  PHP: [
    {
      kind: "class",
      regex: /(?:class|interface|trait|enum)\s+([A-Za-z_]\w*)/g
    },
    { kind: "function", regex: /function\s+([A-Za-z_]\w*)/g }
  ],
  Swift: [
    {
      kind: "type",
      regex: /(?:class|struct|enum|protocol)\s+([A-Za-z_]\w*)/g
    },
    { kind: "function", regex: /func\s+([A-Za-z_]\w*)/g }
  ],
  Kotlin: [
    {
      kind: "type",
      regex: /(?:class|interface|object|enum\s+class)\s+([A-Za-z_]\w*)/g
    },
    { kind: "function", regex: /fun\s+([A-Za-z_]\w*)/g }
  ]
};

function extractSymbols(source, language) {
  const symbols = [];
  for (const pattern of SYMBOL_PATTERNS[language] ?? []) {
    for (const match of source.matchAll(pattern.regex)) {
      symbols.push({
        name: match[1],
        kind: pattern.kind,
        line: lineNumberAt(source, match.index)
      });
    }
  }
  return symbols;
}

function extractImports(source, language) {
  const imports = [];
  if (language === "Python") {
    for (const match of source.matchAll(
      /^(?:from\s+([.\w]+)\s+import|import\s+([.\w]+))/gm
    )) {
      imports.push({
        specifier: match[1] ?? match[2],
        line: lineNumberAt(source, match.index)
      });
    }
  } else if (language === "Rust") {
    for (const match of source.matchAll(
      /^(?:pub\s+)?mod\s+([A-Za-z_]\w*)\s*;/gm
    )) {
      imports.push({
        specifier: `./${match[1]}`,
        line: lineNumberAt(source, match.index)
      });
    }
  }
  return imports;
}

export const legacyLanguageCollector = defineCollector({
  id: "legacy-language-patterns",
  version: 1,
  languages: [
    "C#",
    "Go",
    "Java",
    "Kotlin",
    "PHP",
    "Python",
    "Ruby",
    "Rust",
    "Swift"
  ],
  extensions: [".cs", ".go", ".java", ".kt", ".kts", ".php", ".py", ".rb", ".rs", ".swift"],
  collect({ source, language }) {
    return {
      symbols: extractSymbols(source, language),
      imports: extractImports(source, language),
      diagnostics: []
    };
  }
});
