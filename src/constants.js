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
    "**/*.ts",
    "**/*.tsx",
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
  documentation: {
    productName: "",
    oneLineDescription: "",
    audiences: ["engineers", "coding-agents"]
  }
};

export const EXTENSION_LANGUAGE = {
  ".js": "JavaScript",
  ".jsx": "JavaScript",
  ".ts": "TypeScript",
  ".tsx": "TypeScript",
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
