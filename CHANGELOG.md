# Changelog

## [1.1.1] - 2026-08-09

### Fixed

- publish under the collision-safe npm name `@danielesuga/prodocs` while
  retaining the `prodocs` command;
- document the scoped global-install and `npx` commands.

All notable changes to ProDocs are documented here. The project follows
[Semantic Versioning](https://semver.org/) and
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [1.1.0] - 2026-08-09

### Added

- Added `prodocs doctor` for local production-readiness diagnostics.
- Added `prodocs tutorial` and a packaged getting-started project.
- Added local cold/warm indexing benchmarks and per-agent Codex, Claude Code,
  and OpenCode retrieval evaluation.
- Added an adopter-feedback protocol, troubleshooting guide, and supply-chain
  ownership/risk assessment.
- Added complexity ratchets and targeted weekly mutation testing for security
  boundaries.

### Changed

- Added exact, audited development tooling with a patched transitive override.
- Extended production verification with complexity and multi-agent context
  quality gates.
- Fixed npm release-artifact checksum verification to validate paths from the
  workspace root.

### Security

- Added mutation coverage for repository containment, approval hashes, and
  secret/instruction handling.
- Documented elevated dependency ownership and parser/runtime risks with
  compensating controls and migration criteria.

## [1.0.0] - 2026-08-02

### Added

- Added first-class authored claims, decisions, invariants, features, and
  executable runbooks with strict YAML front matter and evidence references.
- Added evidence coverage, unsupported-knowledge, contradiction, supersession,
  feature-to-code, and customer-impact reporting.
- Added an incremental SQLite evidence cache with content-hash invalidation and
  deterministic portable graph exports.
- Added OpenAPI, SQL schema, CODEOWNERS, and test-relationship collectors.
- Added a declarative, capability-bounded plugin SDK with conformance fixtures
  and no third-party code execution.
- Added `prodocs impact` for git-diff traversal across code, claims, decisions,
  features, runbooks, tests, and owners.
- Added documentation-contract policies, content-addressed review/write
  proposals, safe proposal application, and an installable pre-push gate.
- Added deterministic and explicitly network-approved OpenAI-compatible cited
  narrative providers with secret redaction and citation validation.
- Added an MCP `2025-11-25` stdio server with bounded context, impact, policy,
  graph, and policy resources.
- Added task, file, and token context budgets with visible truncation and a
  context quality evaluation harness.
- Added product, technical, support, security, operations, and coding-agent
  views, feature maps, and knowledge health output.
- Added content-bound runbook execution, git time-travel views, and an optional
  self-hosted collaboration API with authenticated writes.

### Changed

- Promoted ProDocs from a production-ready beta to the production-ready 1.0
  product contract.
- Upgraded knowledge graphs and context packets to schema version 2.
- Expanded the public package exports to collectors, plugins, providers,
  impact, proposal, context, and knowledge Schemas.
- Expanded the production gate with 66+ tests, policy enforcement, context
  evaluation, plugin conformance, and pull-request impact evidence.

### Security

- Repository-derived instructions are explicitly untrusted in context and MCP
  output.
- Provider egress requires explicit approval, bounded HTTPS or loopback
  endpoints, secret redaction, response limits, timeouts, and supplied-evidence
  citations.
- Runbook execution is shell-free, repository-contained, time-bounded,
  output-bounded, secret-minimized, and tied to an exact approval hash.
- Proposal writes reject generated paths, repository escapes, symbolic-link
  destinations, stale expected hashes, and mismatched approvals.

## [0.2.0] - 2026-08-02

### Added

- Published a versioned context-packet JSON Schema with zero-dependency runtime
  validation.
- Added deterministic request normalization, one-hop relevance reasons,
  documentation freshness, and context size/token estimates to agent packets.
- Added a versioned collector interface and public collector-result JSON Schema.
- Added parser-backed JavaScript and TypeScript evidence collection with
  declarations, class/interface methods, static module relationships, parse
  diagnostics, and conformance fixtures.
- Added `.mjs`, `.cjs`, `.mts`, and `.cts` source discovery.
- Added packaged-install smoke testing and enforced coverage minimums.
- Added compatibility, support, release, and incident-response policies.
- Added tag-driven GitHub releases with SBOMs, checksums, and build provenance
  attestations.
- Added approval-gated npm trusted publishing with package provenance.
- Added a README visual showing the code-to-evidence-to-agent-context flow.

### Changed

- Scoped context selection now uses a deterministic one-hop dependency
  neighborhood instead of order-sensitive graph expansion.
- JavaScript and TypeScript indexing now uses Babel syntax trees rather than
  regular-expression matching; parser errors stop incomplete graph generation.
- The supported CLI is now classified as a production-ready beta with explicit
  pre-`1.0` compatibility rules.
- Recoverable JavaScript/TypeScript parser diagnostics are retained as warnings
  so intentional negative type tests do not block repository indexing.
- Package installation tests invoke npm portably on Windows and use isolated,
  locally populated package state instead of a developer's global cache.

## [0.1.0] - 2026-07-29

### Added

- Deterministic, local-first source indexing for JavaScript, TypeScript, Python,
  Go, Rust, Java, Ruby, PHP, C#, Swift, and Kotlin.
- Evidence-backed knowledge graph with file, symbol, entrypoint, ownership, and
  local import relationships.
- Human-readable system overview and code map.
- Machine-readable scoped context packets for coding agents.
- Documentation freshness and configuration-drift checks.
- Agent integration guides for Codex, Claude Code, and OpenCode.
- Project-root containment for configured sources and generated output.
- Versioned JSON Schemas for configuration and knowledge graph artifacts.

[Unreleased]: https://github.com/boyeesu/prodocs/compare/v1.1.1...HEAD
[1.1.1]: https://github.com/boyeesu/prodocs/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/boyeesu/prodocs/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/boyeesu/prodocs/compare/v0.2.0...v1.0.0
[0.2.0]: https://github.com/boyeesu/prodocs/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/boyeesu/prodocs/releases/tag/v0.1.0
