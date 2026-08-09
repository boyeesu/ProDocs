# Roadmap

The original product roadmap is complete in ProDocs 1.0. Every phase is backed
by production code, public contracts, tests, and repository-owned examples.
Future work is managed as normal versioned product evolution rather than an
unfinished launch phase.

## Phase 0 — executable thesis

Status: **complete**.

- minimal-dependency CLI;
- multi-language file and symbol indexing;
- local import relationships;
- entrypoint and owner metadata;
- human system overview and code map;
- machine-readable graph and scoped agent context;
- freshness check suitable for CI;
- non-destructive integration guides.

Exit test: maintainers and agents use the generated map and bounded context
packet to orient around a repository.

## Phase 1 — trustworthy knowledge kernel

Status: **complete**.

- formal graph version 2 and context-packet version 2 JSON Schemas;
- parser-backed JavaScript/TypeScript plus versioned collector contracts;
- first-class claims, decisions, invariants, features, and runbooks;
- evidence coverage, unsupported-knowledge, contradiction, and supersession
  reporting;
- incremental SQLite evidence cache with content-hash invalidation;
- CODEOWNERS, test, OpenAPI, and database-schema collection;
- declarative, capability-bounded plugin SDK and conformance fixtures.

Exit evidence:

- repository-owned knowledge under `docs/knowledge` has complete evidence
  coverage;
- structural validation remains recorded across four pinned open-source
  repositories;
- policy and context-quality gates run in `npm run verify`.

## Phase 2 — change intelligence

Status: **complete**.

- `prodocs impact <git-range>` and `prodocs impact --base <ref>`;
- affected documents, decisions, claims, features, public behavior, tests,
  runbooks, and owners;
- content-addressed documentation proposal format;
- pull-request impact evidence and installable local pre-push checks;
- deterministic templates and explicit OpenAI-compatible cited providers;
- documentation-contract policy engine.

Exit evidence:

- impact traversal and reviewed proposal application have end-to-end tests;
- proposal writes reject stale content, generated paths, symlinks, missing
  approvals, and repository escapes;
- provider network egress, payload size, secret redaction, endpoint, and
  citation boundaries are enforced.

## Phase 3 — agent-native interface

Status: **complete**.

- local MCP `2025-11-25` stdio server over the shared query layer;
- task-shaped context retrieval with file/token budgets and visible truncation;
- Codex, Claude Code, OpenCode, generic agent, and editor/MCP recipes;
- evidence-backed write proposals with content-bound review gates;
- context recall, precision, and token evaluation harness;
- prompt-injection signals and explicit untrusted-repository boundaries.

Exit evidence:

- MCP initialization, tools, resources, and errors are protocol-tested;
- representative evaluation fixtures are required by the production gate;
- agent packets never contain executable authority recovered from repository
  content.

## Phase 4 — product knowledge views

Status: **complete**.

- product, technical, support, security, operations, and coding-agent views;
- feature-to-code and feature-to-customer-impact map;
- executable runbooks with no-shell execution and approval hashes;
- versioned/time-travel graph and view retrieval through git;
- optional self-hosted HTTP collaboration API with loopback defaults and
  authenticated writes.

Exit evidence:

- views are generated from the same graph used by agents;
- historical views read committed snapshots without switching the worktree;
- collaboration endpoints and authenticated proposal writes are tested.

## Completed implementation queue

1. **Completed:** Context-packet schema and runtime conformance validation.
2. **Completed:** Parser-backed JavaScript/TypeScript collector interface.
3. **Completed:** Release compatibility, installed-package tests, coverage,
   SBOMs, provenance, and incident procedures.
4. **Completed:** Claims, decisions, invariants, features, and runbooks with
   front matter and evidence references.
5. **Completed:** Git-diff impact traversal and reviewable proposals.
6. **Completed:** Independent pinned-repository validation.
7. **Completed:** Incremental SQLite cache and diff-aware collector reuse.
8. **Completed:** CODEOWNERS, tests, OpenAPI, SQL, and declarative plugins.
9. **Completed:** MCP, context budgets, integration recipes, and evaluation.
10. **Completed:** Audience views, runbooks, history, and collaboration API.

## Continuous improvement after 1.0

These are release-to-release quality investments, not missing roadmap phases:

- expand semantic collectors and evaluation corpora;
- raise retrieval precision and branch coverage as fixtures grow;
- add new provider and renderer adapters through existing public seams;
- measure incremental performance on larger monorepos;
- respond to security research and protocol revisions without weakening
  local-first operation.

## Release 1.1 — adoption and assurance

Status: **complete in the 1.1 release candidate**.

- one-command npm installation and an immutable 1.0 GitHub release;
- `prodocs doctor` readiness diagnostics;
- `prodocs tutorial` plus a checked-in getting-started repository;
- local-only product benchmarks with per-agent evaluation for Codex, Claude
  Code, and OpenCode;
- adopter-feedback contract and consent-preserving validation protocol;
- ratcheting file/function complexity checks;
- targeted mutation testing for path, approval, and security boundaries;
- weekly mutation workflow and retained machine-readable reports;
- direct-dependency ownership and supply-chain risk assessment;
- troubleshooting guidance and repaired npm artifact verification.

Exit evidence:

- the example project completes sync, doctor, context, policy, and tests;
- benchmark fixtures pass for all three named agent interfaces;
- production verification includes complexity and zero-vulnerability gates;
- mutation survivors are either killed by tests or recorded as explicit
  follow-up evidence;
- npm publication verifies the exact attested GitHub artifact.

## Next discovery horizon

New roadmap items require adopter evidence rather than speculative scope. The
candidate themes are deeper language semantics, additional renderer/provider
adapters, and larger monorepo performance, but each must begin with a
reproducible adopter fixture and a measurable success threshold.
