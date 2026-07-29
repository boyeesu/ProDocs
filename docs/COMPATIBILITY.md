# Compatibility policy

ProDocs separates CLI/package compatibility from its versioned data contracts.
This policy applies from `0.2.0`.

## Runtime support

The supported runtime is Node.js 20 or newer. CI verifies the oldest supported
major, the current active LTS line, the current release line, macOS, and Windows.
Linux is covered by every Node.js matrix job.

When a Node.js major reaches end of life, ProDocs may remove it in a minor
release while the project is below `1.0`. The change must be announced in the
changelog before release.

## CLI and package

ProDocs follows Semantic Versioning:

- patch releases fix defects without intentionally changing accepted commands
  or versioned JSON shapes;
- minor releases may add commands, fields behind a new schema version, or
  collector capabilities;
- before `1.0`, a necessary CLI or JavaScript API break may occur in a minor
  release, but it must be documented with a migration path;
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

## Generated documentation

Generated Markdown is a review artifact, not a parsing API. Consumers that need
stable automation should use `knowledge.json`, context packets, or their
published JSON Schemas.

## Deprecation and support

Deprecations are announced in the changelog and retained for at least one minor
release where practical. Security fixes are applied according to
[`SECURITY.md`](../SECURITY.md); general support expectations are in
[`SUPPORT.md`](../SUPPORT.md).
