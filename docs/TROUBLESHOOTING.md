# Troubleshooting

Start with `prodocs doctor --json`. It checks the runtime, Git availability,
configuration, evidence index, documentation freshness, agent recipes, and
knowledge health without sending data anywhere.

## `prodocs` is not found

Install globally with `npm install --global prodocs`, or use
`npx prodocs@<version>`. Node.js 20 or newer is required.

## No files are indexed

Review `source`, `include`, and `exclude` in `prodocs.config.json`. ProDocs does
not follow symbolic links and rejects sources outside the repository.

## Documentation is stale

Run `prodocs sync`, inspect the generated diff under `docs/prodocs`, then run
`prodocs check`. Do not hand-edit generated artifacts.

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
