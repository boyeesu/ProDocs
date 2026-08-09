# Production validation

ProDocs `1.0.0` combines deterministic self-validation with the external
repository baseline first recorded for `0.2.0`. External scans are read-only:
dependencies are not installed and indexed code is never executed.

## 1.0 release gates

The production gate runs all of the following:

- syntax and repository hygiene checks;
- the complete unit, CLI, security-boundary, and installed-package suite;
- minimum coverage of 85% lines, 80% branches, and 90% functions (the 1.0
  production gate measures 93.15% lines, 80.17% branches, and 95.84%
  functions);
- package metadata, export, schema, and archive verification;
- generated-document freshness and deterministic resynchronization;
- documentation contracts for ownership, public claims, evidence, and runbook
  verification;
- context-retrieval recall, precision, and token-budget evaluation;
- declarative plugin fixture verification;
- dependency advisory and registry-signature audits;
- an npm package dry-run.

## 1.1 adoption and assurance gates

- `prodocs doctor` validates first-run readiness and installed-package setup;
- the packaged tutorial is created without overwriting an existing path;
- Codex, Claude Code, and OpenCode evaluation cases report separate recall,
  precision, and token totals;
- cold/warm indexing benchmarks report cache reuse locally without telemetry;
- the current reproducible measurement is recorded in `docs/BENCHMARKS.md`;
- file and function complexity cannot exceed the reviewed ratchet;
- targeted mutation testing covers containment, proposal approval, and security
  helpers on a weekly or manually dispatched workflow, with the measured
  baseline and survivor policy in `docs/MUTATION_TESTING.md`;
- the complete dependency tree audits with zero known vulnerabilities and the
  direct-dependency ownership review is current;
- compromised-release and provider-egress response procedures have a recorded
  tabletop walkthrough in `docs/TABLETOPS.md`.

## 1.2 automatic-adoption gates

- structured site metadata produces high-confidence identity citations;
- Next.js App Router pages, layouts, route handlers, and metadata endpoints are
  inferred as public entrypoints;
- GitHub origin ownership produces a bounded CODEOWNERS proposal;
- starter product knowledge cites every inferred public surface and passes
  documentation policy after apply;
- exact proposal, source, configuration, and inference-evidence hashes are
  required before writes;
- stale, tampered, unapproved, malformed, and symbolic-link-escaping proposals
  fail before any operation is applied;
- Kourti Tech moves from 8 passes and 4 warnings to 12 passes and no warnings,
  with 20 entrypoints, 46/46 owned files, and supported starter knowledge.

CI repeats compatible gates across Node.js 20, 22, and 24, with Linux, macOS,
and Windows coverage. Pull requests also generate a machine-readable impact
report before merge.

## External repository baseline

The following pinned revisions were scanned on 2026-07-29:

| Repository | Revision | Languages | Files | Lines | Symbols | Relationships | Index time |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| [yocto-queue](https://github.com/sindresorhus/yocto-queue) | `b07eac0` | JavaScript, TypeScript | 4 | 257 | 18 | 2 | 16.04 ms |
| [type-fest](https://github.com/sindresorhus/type-fest) | `48ddc4b` | TypeScript, JavaScript | 453 | 38,729 | 2,843 | 1,010 | 192.19 ms |
| [Express](https://github.com/expressjs/express) | `a371447` | JavaScript | 141 | 21,619 | 600 | 153 | 86.87 ms |
| [ItsDangerous](https://github.com/pallets/itsdangerous) | `672971d` | Python | 15 | 1,726 | 43 | 21 | 11.14 ms |

Times are single local macOS measurements on Node.js 26 and are directional,
not performance guarantees. Source hashes and structural counts are the
reproducible baseline.

## Bounded context

Every 1.0 context request has explicit file and estimated-token budgets.
Truncation is deterministic and visible in the packet rather than silently
expanding through a large barrel entrypoint.

Historical pre-budget measurements remain useful as a stress baseline:

| Repository | Requested path | Files | Relationships | Bytes | Estimated tokens |
| --- | --- | ---: | ---: | ---: | ---: |
| yocto-queue | `index.js` | 3 | 2 | 1,748 | 437 |
| type-fest | `source/merge-deep.d.ts` | 12 | 27 | 11,279 | 2,820 |
| Express | `lib/application.js` | 4 | 3 | 3,872 | 968 |
| ItsDangerous | `src/itsdangerous/serializer.py` | 7 | 20 | 7,353 | 1,839 |

The type-fest `index.d.ts` stress case previously expanded to 356 files and
approximately 89,840 tokens. In 1.0 it is constrained by
`limits.maxContextFiles` and `limits.maxContextTokens`, with omitted counts and
reasons returned to the caller.

## Precision evidence

- JavaScript and TypeScript imports come from syntax nodes, excluding
  import-like comments and strings.
- Local relationships resolve to indexed files; unresolved package imports are
  not promoted into graph edges.
- OpenAPI, SQL, CODEOWNERS, tests, and declarative plugin results have typed
  provenance.
- Every authored knowledge item resolves its evidence or fails synchronization
  according to configuration.
- Context packets report source, knowledge, and combined-input freshness.
- SQLite is a content-hash cache only; generated output remains byte-stable
  with the cache disabled.

## Reproduce

Run the complete release gate:

```sh
npm ci
node ./bin/prodocs.js sync
npm run verify:production
```

Reproduce an external scan:

```sh
node scripts/validate-repository.js <repository-path> <context-path>
```

Expected external source hashes are:

| Repository | Source hash |
| --- | --- |
| yocto-queue | `aa5b81798cff33b90816e97dd23e338ca7489715828206c531da33851691b2d8` |
| type-fest | `58b0b4324dc8a3a31b9751069de65d29cd27e77c687801270d65733443cff644` |
| Express | `5f1114054336e1bf697737108627a7878d567df2feb4a108940a127b3b94e3eb` |
| ItsDangerous | `5824028edd3ce0e7d7bb9e0d7767a025672680cb58cacf312a6fb33e9d78da89` |
