# Compatibility policy

ProDocs separates CLI/package compatibility from its versioned data contracts.
This policy applies from `1.0.0`.

## Runtime support

The supported runtime is Node.js 20 or newer. CI verifies the oldest supported
major, the current active LTS line, the current release line, macOS, and Windows.
Linux is covered by every Node.js matrix job.

When a Node.js major reaches end of life, removing it requires the next
semantically appropriate release and advance notice in the changelog.

## CLI and package

ProDocs follows Semantic Versioning:

- patch releases fix defects without intentionally changing accepted commands
  or versioned JSON shapes;
- minor releases may add backwards-compatible commands, fields, or collector
  capabilities;
- after `1.0`, incompatible CLI or public JavaScript API changes require a
  major release.

The public JavaScript surface is limited to subpaths declared in
`package.json#exports`. Files elsewhere under `src/` are internal.

## JSON contracts

`schemaVersion` is the compatibility authority for generated JSON. Within one
schema version:

- required fields are not removed or renamed;
- field meaning and validation are not weakened silently;
- object key ordering is not a contract;
- deterministic ordering of arrays produced by ProDocs is preserved;
- consumers must reject unsupported schema versions rather than guess.

An incompatible shape or semantic change increments `schemaVersion` and ships
with a migration note. Package and schema versions are intentionally
independent.

### 0.2 to 1.0 migration

- knowledge graphs move from schema version 1 to 2 and add authored knowledge,
  typed evidence relationships, trust metadata, knowledge hashes, roles, public
  surfaces, and deterministic index metadata;
- context packets move from schema version 1 to 2 and add authored knowledge,
  task/file/token budgets, truncation, knowledge freshness, and the
  untrusted-repository boundary;
- rerun `prodocs sync` after upgrading; schema version 1 generated artifacts
  remain readable through git history but are not emitted by 1.0;
- update consumers to reject unsupported schema versions and use the published
  version 2 Schemas.

## Generated documentation

Generated Markdown is a review artifact, not a parsing API. Consumers that need
stable automation should use `knowledge.json`, context packets, or their
published JSON Schemas.

## Deprecation and support

Deprecations are announced in the changelog and retained for at least one minor
release where practical. Security fixes are applied according to
[`SECURITY.md`](../SECURITY.md); general support expectations are in
[`SUPPORT.md`](../SUPPORT.md).
