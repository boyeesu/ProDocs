# Production validation

ProDocs `0.2.0` was exercised against pinned revisions of four independent
open-source repositories on 2026-07-29. These are read-only scans: dependencies
were not installed and indexed code was not executed.

## Results

| Repository | Revision | Languages | Files | Lines | Symbols | Relationships | Index time |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| [yocto-queue](https://github.com/sindresorhus/yocto-queue) | `b07eac0` | JavaScript, TypeScript | 4 | 257 | 18 | 2 | 16.04 ms |
| [type-fest](https://github.com/sindresorhus/type-fest) | `48ddc4b` | TypeScript, JavaScript | 453 | 38,729 | 2,843 | 1,010 | 192.19 ms |
| [Express](https://github.com/expressjs/express) | `a371447` | JavaScript | 141 | 21,619 | 600 | 153 | 86.87 ms |
| [ItsDangerous](https://github.com/pallets/itsdangerous) | `672971d` | Python | 15 | 1,726 | 43 | 21 | 11.14 ms |

Times are single local macOS measurements on Node.js 26 and are directional,
not performance guarantees. Source hashes and structural counts are the
reproducible baseline.

## Context measurements

| Repository | Requested path | Files | Relationships | Bytes | Estimated tokens |
| --- | --- | ---: | ---: | ---: | ---: |
| yocto-queue | `index.js` | 3 | 2 | 1,748 | 437 |
| type-fest | `source/merge-deep.d.ts` | 12 | 27 | 11,279 | 2,820 |
| Express | `lib/application.js` | 4 | 3 | 3,872 | 968 |
| ItsDangerous | `src/itsdangerous/serializer.py` | 7 | 20 | 7,353 | 1,839 |

Barrel files are intentionally called out as a limitation. Requesting
type-fest's `index.d.ts` selects 356 directly related files and approximately
89,840 tokens. Users should request the narrowest task-relevant path until
explicit context budgets ship.

## Precision evidence

- JavaScript and TypeScript import evidence comes from syntax nodes, so
  import-like comments and strings are excluded by conformance fixtures.
- Every emitted local relationship resolved to an indexed file at the pinned
  revision; unresolved package imports are not promoted into graph edges.
- All 613 scanned files across the JavaScript, TypeScript, and Python
  repositories completed without an unrecoverable parse failure.
- type-fest exposed intentional negative TypeScript tests that Babel reports as
  recoverable redeclarations. Production policy now retains those diagnostics
  as warnings while preserving their AST evidence.

This is structural precision evidence, not a semantic recall benchmark for
calls or types that ProDocs does not yet claim to extract.

## Reproduce

Clone a repository at the recorded revision and run:

```sh
node scripts/validate-repository.js <repository-path> <context-path>
```

The command prints the revision, source hash, graph statistics, elapsed index
time, and context size as JSON. Expected source hashes are:

| Repository | Source hash |
| --- | --- |
| yocto-queue | `aa5b81798cff33b90816e97dd23e338ca7489715828206c531da33851691b2d8` |
| type-fest | `58b0b4324dc8a3a31b9751069de65d29cd27e77c687801270d65733443cff644` |
| Express | `5f1114054336e1bf697737108627a7878d567df2feb4a108940a127b3b94e3eb` |
| ItsDangerous | `5824028edd3ce0e7d7bb9e0d7767a025672680cb58cacf312a6fb33e9d78da89` |
