# Roadmap

The roadmap is organized around proving user value, not accumulating
integrations.

## Phase 0 — executable thesis

Status: working prototype.

- minimal-dependency CLI;
- multi-language file and symbol indexing;
- local import relationships;
- entrypoint and owner metadata;
- human system overview and code map;
- machine-readable graph and scoped agent context;
- freshness check suitable for CI;
- non-destructive integration guides.

Exit test: a maintainer can run ProDocs on a small repository and use the output
to orient themselves or an agent.

## Phase 1 — trustworthy knowledge kernel

- formal graph and context-packet JSON Schemas;
- parser-backed collectors for precise symbols and references;
- first-class authored claims, invariants, and architecture decisions;
- evidence coverage and contradiction reporting;
- incremental SQLite index and diff-aware updates;
- CODEOWNERS, test, OpenAPI, and database-schema collectors;
- plugin SDK and conformance fixtures.

Exit test: ProDocs detects meaningful stale or unsupported claims with high
precision on three real open-source codebases.

## Phase 2 — change intelligence

- `prodocs impact <git-range>`;
- affected documents, decisions, public behavior, tests, and owners;
- reviewable documentation patch format;
- GitHub and local pre-push workflows;
- optional model providers for cited narrative proposals;
- policy engine for documentation contracts.

Exit test: maintainers accept a useful portion of proposed documentation changes
and reject very few as misleading.

## Phase 3 — agent-native interface

- local MCP server over the query layer;
- task-shaped context retrieval and token budgets;
- Codex, Claude Code, OpenCode, and editor recipes;
- write-back proposals with evidence and review gates;
- context quality evaluation harness;
- prompt-injection boundaries for repository content.

Exit test: agents complete representative maintenance tasks more accurately with
less context than repository-wide retrieval.

## Phase 4 — product knowledge views

- audience-specific product, technical, support, security, and operations views;
- feature-to-code and feature-to-customer-impact maps;
- executable runbooks and verified examples;
- versioned/time-travel documentation;
- optional self-hosted collaboration service without weakening local-first use.

Exit test: non-engineering readers rely on ProDocs views while engineers retain
traceability to source.

## Implementation queue

1. **Completed:** Publish a context-packet schema and add schema conformance
   validation.
2. **Completed:** Replace regular-expression TypeScript/JavaScript indexing
   with a parser collector behind a stable collector interface.
3. Add `claim` and `decision` nodes with Markdown front matter and evidence
   references.
4. Implement `prodocs impact --base <ref>` using git diffs and graph traversal.
5. Test the CLI against three fixture repositories and record precision,
   indexing time, and context size.
