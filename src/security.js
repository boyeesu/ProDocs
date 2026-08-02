import crypto from "node:crypto";
import path from "node:path";

const INSTRUCTION_PATTERNS = [
  /\bignore\s+(all\s+)?previous\s+instructions?\b/i,
  /\bsystem\s+prompt\b/i,
  /\bdeveloper\s+message\b/i,
  /\bdo\s+not\s+tell\s+the\s+user\b/i,
  /\bexfiltrat(?:e|ion)\b/i,
  /\bprompt\s+inject(?:ion)?\b/i
];

const SECRET_PATTERNS = [
  {
    type: "private-key",
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g
  },
  {
    type: "github-token",
    pattern: /\b(?:gh[opsu]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g
  },
  {
    type: "generic-secret",
    pattern: /\b(?:api[_-]?key|access[_-]?token|client[_-]?secret|password)\s*[:=]\s*["']?[A-Za-z0-9+/_.=-]{12,}["']?/gi
  }
];

export function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function toPosix(value) {
  return value.split(path.sep).join("/");
}

export function normalizeRepositoryPath(value, label = "Path") {
  if (typeof value !== "string" || value.trim() === "" || value.includes("\0")) {
    throw new Error(`${label} must be a non-empty repository-relative path.`);
  }
  const normalized = value.replaceAll("\\", "/").replace(/^\.\//, "");
  if (
    normalized.startsWith("/") ||
    /^[A-Za-z]:\//.test(normalized) ||
    normalized.split("/").some((segment) => segment === "..")
  ) {
    throw new Error(`${label} must stay inside the repository: ${value}`);
  }
  return normalized
    .split("/")
    .filter((segment) => segment !== "" && segment !== ".")
    .join("/");
}

export function detectPromptInjection(text) {
  if (typeof text !== "string" || text === "") return [];
  return INSTRUCTION_PATTERNS.flatMap((pattern) => {
    const match = pattern.exec(text);
    return match
      ? [
          {
            code: "repository-instruction",
            offset: match.index,
            excerpt: match[0].slice(0, 120)
          }
        ]
      : [];
  });
}

export function redactSecrets(value) {
  let text = String(value ?? "");
  const redactions = [];
  for (const { type, pattern } of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    text = text.replace(pattern, (match) => {
      redactions.push({ type, hash: sha256(match) });
      return `[REDACTED:${type}]`;
    });
  }
  return { text, redactions };
}

export function timingSafeEqualText(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  return (
    leftBuffer.length === rightBuffer.length &&
    crypto.timingSafeEqual(leftBuffer, rightBuffer)
  );
}
