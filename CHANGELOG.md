# Changelog

All notable changes to ProDocs are documented here. The project follows
[Semantic Versioning](https://semver.org/) and
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

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

### Changed

- Scoped context selection now uses a deterministic one-hop dependency
  neighborhood instead of order-sensitive graph expansion.
- JavaScript and TypeScript indexing now uses Babel syntax trees rather than
  regular-expression matching; parser errors stop incomplete graph generation.

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

[Unreleased]: https://github.com/boyeesu/prodocs/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/boyeesu/prodocs/releases/tag/v0.1.0
