import { loadConfig } from "./config.js";
import { scanProject } from "./scanner.js";

const STOP_WORDS = new Set(
  "a an and are as at be by can do does for from has have how i in is it of on or that the their this to use what when where which who why will with would you".split(" ")
);
const EXCERPT_LINES = 24;
const WINDOW_STRIDE = 12;
const MAX_CANDIDATES = 2048;

function words(text) {
  return new Set(
    (text.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase().match(/[a-z][a-z0-9]+/g) ?? [])
      .filter((word) => !STOP_WORDS.has(word))
      .map((word) => word.replace(/aliases$/, "alias").replace(/ies$/, "y")
        .replace(/(?<!ss|us|is|as)(?<=.{3})s$/, ""))
  );
}

function matches(terms, haystack) {
  return terms.filter((term) => haystack.has(term));
}

function byCoverage(left, right) {
  return right.matchedTerms.length - left.matchedTerms.length ||
    right.symbolMatches.length - left.symbolMatches.length ||
    right.pathMatches.length - left.pathMatches.length ||
    left.startLine - right.startLine;
}

function findWindows(source, node, terms, frequency) {
  const lines = source.split("\n");
  const pathMatches = matches(terms, words(node.path));
  const fileMatches = new Set(pathMatches);
  const candidates = [];
  const anchors = new Map();
  for (const symbol of node.symbols) {
    const symbolMatches = matches(terms, words(symbol.name));
    if (symbolMatches.length) anchors.set(Math.max(0, symbol.line - 4), symbolMatches);
  }
  const offsets = new Set(anchors.keys());
  for (let offset = 0; offset < lines.length; offset += WINDOW_STRIDE) offsets.add(offset);
  for (const offset of offsets) {
    const excerpt = lines.slice(offset, offset + EXCERPT_LINES).join("\n");
    const matchedTerms = matches(terms, words(excerpt));
    if (!matchedTerms.length) continue;
    for (const term of matchedTerms) fileMatches.add(term);
    // A single minified line can exceed the entire response budget.
    if (Buffer.byteLength(excerpt) > 8192) continue;
    candidates.push({
      path: node.path, startLine: offset + 1,
      endLine: Math.min(offset + EXCERPT_LINES, lines.length),
      matchedTerms, pathMatches, symbolMatches: anchors.get(offset) ?? [], excerpt
    });
    if (candidates.length > 64) candidates.sort(byCoverage).length = 4;
  }
  for (const term of fileMatches) frequency.set(term, (frequency.get(term) ?? 0) + 1);
  return candidates.sort(byCoverage).slice(0, 4);
}

function overlaps(prior, candidate) {
  const sharedLines = Math.min(prior.endLine, candidate.endLine) -
    Math.max(prior.startLine, candidate.startLine) + 1;
  return prior.path === candidate.path && sharedLines >= WINDOW_STRIDE;
}

function measure(result) {
  result.estimatedTokens = 0;
  let estimated;
  do {
    estimated = Math.ceil(Buffer.byteLength(JSON.stringify(result)) / 4);
    if (estimated === result.estimatedTokens) break;
    result.estimatedTokens = estimated;
  } while (true);
  return estimated;
}

export async function searchSource(root, { task, maxResults = 5, maxTokens } = {}) {
  if (typeof task !== "string" || !task.trim() || task.length > 2048) {
    throw new Error("Source search requires a task with 1–2048 characters.");
  }
  if (!Number.isSafeInteger(maxResults) || maxResults < 1 || maxResults > 20) {
    throw new Error("Source search maxResults must be an integer between 1 and 20.");
  }
  const config = await loadConfig(root);
  const tokenLimit = maxTokens ?? Math.min(2000, config.limits.maxContextTokens);
  if (!Number.isSafeInteger(tokenLimit) || tokenLimit < 128 || tokenLimit > config.limits.maxContextTokens) {
    throw new Error(`Source search maxTokens must be an integer between 128 and ${config.limits.maxContextTokens}.`);
  }
  const terms = [...words(task)].slice(0, 32);
  const frequency = new Map();
  const candidates = [];
  let files = 0;
  let candidatesOmitted = false;
  if (terms.length) {
    await scanProject(root, config, {
      indexMode: "read",
      onSource(source, node) {
        files += 1;
        candidates.push(...findWindows(source, node, terms, frequency));
        // Bound retained excerpts even when the repository contains many matches.
        if (candidates.length > MAX_CANDIDATES * 2) {
          candidates.sort(byCoverage).length = MAX_CANDIDATES;
          candidatesOmitted = true;
        }
      }
    });
  }
  const weight = (term) => 1 + Math.log((files + 1) / (1 + frequency.get(term)));
  const ranked = candidates.map(({ pathMatches, symbolMatches, ...candidate }) => ({
    candidate,
    score: candidate.matchedTerms.reduce((sum, term) => sum + weight(term), 0) +
      pathMatches.reduce((sum, term) => sum + weight(term) / 2, 0) +
      symbolMatches.reduce((sum, term) => sum + weight(term) / 2, 0)
  })).sort((left, right) => right.score - left.score ||
    left.candidate.path.localeCompare(right.candidate.path) ||
    left.candidate.startLine - right.candidate.startLine);

  // Preserve diversity and avoid including overlapping text twice.
  const result = {
    schemaVersion: 1,
    kind: "prodocs.source-search",
    repositoryContent: "untrusted",
    maxTokens: tokenLimit,
    estimatedTokens: 0,
    truncated: candidatesOmitted,
    results: []
  };
  for (const { candidate } of ranked) {
    if (result.results.some((prior) => overlaps(prior, candidate))) continue;
    if (result.results.length >= maxResults) {
      result.truncated = true;
      break;
    }
    result.results.push(candidate);
    if (measure(result) > tokenLimit) {
      result.results.pop();
      result.truncated = true;
    }
  }
  measure(result);
  return result;
}
