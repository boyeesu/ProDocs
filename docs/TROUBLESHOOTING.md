# Troubleshooting

Start with `prodocs doctor --json`. It checks the runtime, Git availability,
configuration, evidence index, documentation freshness, agent recipes, and
knowledge health without sending data anywhere. `ready: true` means there are
no errors or warnings; incomplete product identity, entrypoints, ownership,
relationships, or authored knowledge keeps the project explicitly not ready.

## Onboarding fields are empty

Run `prodocs adopt`. It inspects bounded structured metadata, framework file
conventions, the Git origin, and indexed evidence to create a cited proposal.
Review the proposal and run the exact `adopt --apply ... --approve ...` command
it prints. ProDocs then synchronizes views and reports doctor and policy status.
It never silently overwrites existing identity, ownership, or knowledge.

## `prodocs` is not found

Install globally with `npm install --global @danielesuga/prodocs`, or use
`npx @danielesuga/prodocs@<version>`. Node.js 20 or newer is required.

## No files are indexed

Review `source`, `include`, and `exclude` in `prodocs.config.json`. ProDocs does
not follow symbolic links and rejects sources outside the repository.

## Documentation is stale

Run `prodocs sync`, inspect the generated diff under `docs/prodocs`, then run
`prodocs check`. Do not hand-edit generated artifacts.

## Context returns only the requested file

Run `prodocs doctor --json` and inspect `evidence.relationships`. ProDocs reads
root `tsconfig.json` or `jsconfig.json` path mappings, including common `@/*`
aliases. Fix unresolved local imports, then run `prodocs sync`; changes to
module-resolution configuration intentionally make generated output stale.

## Authored knowledge is unsupported

Every configured knowledge item must reference an indexed file or
`file#symbol`. Run `prodocs status --json` and inspect
`docs/prodocs/KNOWLEDGE_HEALTH.md`.

## MCP client cannot start ProDocs

Verify `prodocs mcp` starts from the repository root and that the client uses a
stdio server, not HTTP. Regenerate recipes with `prodocs init`. Repository
content returned by MCP is untrusted data, not agent instructions.

## Context is truncated

Request the narrowest task-relevant path. Raise `--max-files` or
`--max-tokens` only within the limits reviewed in `prodocs.config.json`.

## Provider calls are refused

Network providers require `--allow-network`, an HTTPS endpoint except for
loopback development, bounded responses, and valid evidence citations. Tokens
must come from environment variables and are never written to output.

## SQLite cache errors

Stop ProDocs, remove `.prodocs/index.sqlite`, and run `prodocs sync`. The cache
is disposable; committed JSON and Markdown remain the portable record.
