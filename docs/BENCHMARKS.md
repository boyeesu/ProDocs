# Product benchmark baseline

`prodocs benchmark` measures the deterministic local indexing path and the
agent-context evaluation suite. It emits JSON, transmits no telemetry, and does
not execute indexed repository code.

## ProDocs repository — 2026-08-09

Environment: macOS, Node.js 26.4.0. These are directional local measurements,
not latency guarantees.

| Measure | Result |
| --- | ---: |
| Files | 53 |
| Symbols | 280 |
| Relationships | 392 |
| Cold index | 63.495 ms |
| Warm index | 18.034 ms |
| Warm cache hit rate | 100% |

The Codex, Claude Code, and OpenCode cases each passed with 1.0 recall and 1.0
precision. Together they returned an estimated 16,059 tokens within configured
budgets.

Reproduce with:

```sh
npm run benchmark
```

Larger-repository evidence remains the pinned 453-file TypeScript corpus and
141-file JavaScript corpus recorded in `docs/VALIDATION.md`. Any future scale
claim must add a pinned reproducible fixture and hardware/runtime context.
