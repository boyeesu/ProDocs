# Code maturity assessment

Assessment date: 2026-07-29
Target: ProDocs `0.2.0`, Node.js CLI and JavaScript library

## Executive summary

ProDocs is **Moderate (2.4/4.0)** under the Trail of Bits nine-category
framework, excluding two blockchain-only categories that do not apply. The
release is suitable as a production-ready beta because its local security
boundary, versioned contracts, package verification, and release integrity are
stronger than the aggregate score suggests.

Top strengths:

1. repository input is treated as untrusted data with containment, no-follow
   reads, atomic writes, and bounded resource usage;
2. versioned JSON contracts, deterministic output, compatibility rules, and
   evidence provenance are documented and tested;
3. protected multi-platform CI, dependency review, CodeQL, package smoke tests,
   SBOMs, checksums, and build attestations cover the release path.

Priority gaps:

1. branch coverage is above the production floor but below exhaustive coverage;
2. context selection has no hard token budget and barrel entrypoints can expand
   substantially;
3. the incident process and npm environment approval need operational
   table-top verification after the first release.

## Scorecard

| Category | Rating | Score | Evidence summary |
| --- | --- | ---: | --- |
| Arithmetic | Moderate | 2 | Byte/file limits and token estimates are bounded and tested; no financial arithmetic |
| Auditing | Moderate | 2 | CI, CodeQL, audit logs, release checks, and incident policy exist; exercises are not yet recorded |
| Authentication / access controls | Satisfactory | 3 | Local CLI has no privileged runtime; protected GitHub release path uses least privilege and an npm approval environment |
| Complexity management | Moderate | 2 | Modules are separated and inputs validated; context/parser traversal remains non-trivial |
| Decentralization | Not applicable | — | No hosted control plane, user funds, governance, or upgrade mechanism |
| Documentation | Satisfactory | 3 | User, architecture, collector, compatibility, support, release, security, and operations documentation |
| Transaction ordering risks | Not applicable | — | No transactions, assets, oracle, mempool, or ordering-sensitive protocol |
| Low-level manipulation | Satisfactory | 3 | No eval, dynamic execution, native code, or assembly; bounded buffer and filesystem primitives are isolated and tested |
| Testing and verification | Moderate | 2 | Multi-platform CI, installed-package E2E, coverage gates, security scans, and external repository validation; not 100% coverage or mutation tested |

**Overall applicable score: 17 / 28 = 2.4 / 4.0.**

## Detailed analysis

### Arithmetic — Moderate

The critical calculations are file-count and byte bounds in
`src/scanner.js:250-270`, bounded reads in `src/safe-fs.js:8-54`, and a
documented deterministic token estimate in `src/context.js:159-167`. Tests
cover byte limits, line-ending stability, and context measurements. No
balances, fees, precision-sensitive financial formulas, or unchecked integer
arithmetic exist.

Next level: add property-based tests around configuration limits and graph-size
measurements.

### Auditing — Moderate

GitHub preserves required-check and release logs. CI performs dependency audit,
registry-signature verification, package dry-runs, and coverage checks
(`.github/workflows/ci.yml:17-41`). Release artifacts add checksums, an SBOM,
and provenance (`.github/workflows/release.yml:31-61`).
`docs/OPERATIONS.md:13-43` defines severity, evidence preservation, response,
and recovery.

Next level: record a compromised-release tabletop exercise and response timing.

### Authentication and access controls — Satisfactory

The local CLI has no accounts, remote service, or privileged code path.
Repository administrators are subject to protected `main`; force pushes and
deletions are disabled. Workflows use explicit least-privilege permissions
(`.github/workflows/release.yml:8-11` and
`.github/workflows/publish-npm.yml:11-13`). npm publication is manual,
OIDC-based, and routed through the `npm` environment rather than a long-lived
token (`.github/workflows/publish-npm.yml:19-59`).

Next level: verify npm trusted-publisher ownership before the first registry
publication.

### Complexity management — Moderate

The scanner, context builder, collectors, renderer, and safe filesystem layer
are separate modules with validated inputs. Collector selection and output
normalization are deterministic (`src/collectors/contract.js:138-314`). The
context validator and AST traversal are necessarily branch-heavy and do not
yet have an automated cyclomatic-complexity limit.

Next level: add complexity reporting and extract repeated structural validation
helpers without weakening exact-schema checks.

### Decentralization — Not applicable

ProDocs is a local CLI. It has no governance, custodial funds, hosted upgrade
authority, or mandatory service. Users can pin, fork, inspect, or stop using any
release.

### Documentation — Satisfactory

README quickstart and security guidance are backed by architecture, collector,
compatibility, roadmap, release, operations, support, and validation documents.
Generated documentation is freshness-checked by CI. Known parser and context
limitations are explicit.

Next level: add end-user task recipes and a domain glossary as authored claims
and decisions are implemented.

### Transaction ordering — Not applicable

The repository has no blockchain transactions, market operations, oracle data,
or ordering-dependent state transition.

### Low-level manipulation — Satisfactory

No `eval`, dynamic `Function`, shell execution of repository content, assembly,
or native extension is used. Child processes are limited to development and
validation scripts with argument arrays. The only unsafe buffer allocation is
bounded, filled by a file read, and sliced to `bytesRead` before use
(`src/safe-fs.js:36-55`).

Next level: retain security regression coverage whenever filesystem primitives
or parser execution boundaries change.

### Testing and verification — Moderate

The suite covers CLI workflows, malformed input, path and symlink containment,
atomic writes, graph determinism, schema validation, collectors, package
installation (`test/package.test.js:41-177`), and external repositories.
Required CI spans Node.js 20/22/24, Linux, macOS, and Windows
(`.github/workflows/ci.yml:17-60`). Coverage floors are 85% lines, 80% branches,
and 90% functions (`scripts/coverage.js:3-7`).

Next level: mutation-test the containment and collector-contract modules, then
raise branch coverage toward 90%.

## Improvement roadmap

### Critical before first npm publication

- claim the `prodocs` package name and configure npm trusted publishing
  (under one hour);
- run and verify the `v0.2.0` GitHub release artifact before dispatching npm
  publication (under one hour).

### High

- add explicit context token/file budgets with visible truncation metadata
  (three to five days);
- run a release-compromise tabletop and record remediation actions (half day);
- introduce property-based tests for resource limits (one to two days).

### Medium

- add mutation testing for filesystem containment and collector normalization
  (two to four days);
- add automated complexity reporting and a ratcheting threshold (one day);
- expand external validation to Go and Rust repositories (one day).
