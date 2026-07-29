# Repository guidance

This repository develops ProDocs, an evidence-backed documentation and context
system for humans and coding agents.

Before editing unfamiliar code, run:

```sh
node ./bin/prodocs.js context --path <area> --json
```

After source changes, run:

```sh
node ./bin/prodocs.js sync
node ./bin/prodocs.js check
npm test
```

Generated files under `docs/prodocs` must not be hand-edited. Product intent in
`docs/PRODUCT_VISION.md`, architectural constraints in `docs/ARCHITECTURE.md`,
and the roadmap are human-authored.

Preserve the local-first, deterministic-core, agent-neutral, evidence-before-
prose principles when proposing changes.
