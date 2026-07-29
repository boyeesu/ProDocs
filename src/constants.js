export const VERSION = "0.1.0";

export const DEFAULT_CONFIG = {
  $schema:
    "https://raw.githubusercontent.com/boyeesu/prodocs/main/schemas/prodocs-config.schema.json",
  schemaVersion: 1,
  source: ["."],
  output: "docs/prodocs",
  include: [
    "**/*.js",
    "**/*.jsx",
    "**/*.mjs",
    "**/*.cjs",
    "**/*.ts",
    "**/*.tsx",
    "**/*.mts",
    "**/*.cts",
    "**/*.py",
    "**/*.go",
    "**/*.rs",
    "**/*.java",
    "**/*.rb",
    "**/*.php",
    "**/*.cs",
    "**/*.swift",
    "**/*.kt",
    "**/*.kts"
  ],
  exclude: [
    ".git",
    ".prodocs",
    "node_modules",
    "vendor",
    "dist",
    "build",
    "coverage",
    ".next",
    ".turbo",
    ".venv",
    "venv",
    "__pycache__",
    "docs/prodocs"
  ],
  entrypoints: [],
  ownership: {},
  limits: {
    maxFiles: 50000,
    maxFileSizeBytes: 10485760,
    maxTotalBytes: 1073741824
  },
  documentation: {
    productName: "",
    oneLineDescription: "",
    audiences: ["engineers", "coding-agents"]
  }
};

export const EXTENSION_LANGUAGE = {
  ".js": "JavaScript",
  ".jsx": "JavaScript",
  ".mjs": "JavaScript",
  ".cjs": "JavaScript",
  ".ts": "TypeScript",
  ".tsx": "TypeScript",
  ".mts": "TypeScript",
  ".cts": "TypeScript",
  ".py": "Python",
  ".go": "Go",
  ".rs": "Rust",
  ".java": "Java",
  ".rb": "Ruby",
  ".php": "PHP",
  ".cs": "C#",
  ".swift": "Swift",
  ".kt": "Kotlin",
  ".kts": "Kotlin"
};

export const SUPPORTED_EXTENSIONS = new Set(Object.keys(EXTENSION_LANGUAGE));
