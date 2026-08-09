export const VERSION = "1.2.1";

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
    ,"**/*.sql"
    ,"**/*.openapi.json"
    ,"**/*.openapi.yaml"
    ,"**/*.openapi.yml"
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
    maxTotalBytes: 1073741824,
    maxContextFiles: 50,
    maxContextTokens: 12000,
    maxProviderBytes: 262144
  },
  knowledge: {
    paths: ["docs/knowledge"],
    requireEvidence: true
  },
  index: {
    enabled: true,
    path: ".prodocs/index.sqlite"
  },
  plugins: {
    paths: []
  },
  policies: {
    publicSurfaceRequiresOwner: true,
    publicSurfaceRequiresClaim: true,
    claimRequiresEvidence: true,
    runbookRequiresVerification: true
  },
  documentation: {
    productName: "",
    oneLineDescription: "",
    audiences: [
      "product",
      "technical",
      "support",
      "security",
      "operations",
      "coding-agents"
    ]
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
  ,".sql": "SQL"
  ,".openapi.json": "OpenAPI"
  ,".openapi.yaml": "OpenAPI"
  ,".openapi.yml": "OpenAPI"
};

export const SUPPORTED_EXTENSIONS = new Set(Object.keys(EXTENSION_LANGUAGE));
