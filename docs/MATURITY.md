# Code maturity assessment

Assessment date: 2026-08-02
Target: ProDocs `1.1.1`, Node.js CLI and JavaScript library

## Executive summary

ProDocs is **Satisfactory (3.1/4.0)** under the Trail of Bits nine-category
framework, excluding the two blockchain-only categories that do not apply. The
1.0 release completes the planned evidence, change-intelligence, agent, and
collaboration phases with deterministic contracts and explicit security
boundaries.

Production strengths include:

1. untrusted repository input is contained, bounded, redacted where egress is
   explicitly enabled, and never executed by the indexing or plugin paths;
2. authored claims, decisions, invariants, features, and runbooks carry
   machine-verifiable source evidence and contradiction/supersession state;
3. context, impact, policy, proposals, plugins, providers, MCP, history,
   collaboration, and runbooks have versioned or validated contracts;
4. release CI covers supported Node.js versions and operating systems, package
   installation, coverage floors, CodeQL, dependency review, audits, SBOMs,
   checksums, and attestations.

Continuous assurance now includes targeted mutation testing, complexity
ratcheting, multi-agent fixtures, and a dependency ownership review. Remaining
work is operational evidence from external adopter sessions and recurring
tabletop exercises rather than an incomplete implementation phase.

## Scorecard

| Category | Rating | Score | Evidence summary |
| --- | --- | ---: | --- |
| Arithmetic | Satisfactory | 3 | File, byte, token, provider, request, and execution limits are validated and tested |
| Auditing | Satisfactory | 3 | Policy, impact, evaluation, CI, CodeQL, release logs, checksums, SBOMs, and incident policy |
| Authentication / access controls | Satisfactory | 3 | Protected GitHub release path; token-gated collaboration writes; exact proposal approval hashes |
| Complexity management | Moderate | 2 | Modules and contracts are separated, but structural parsing and traversal remain branch-heavy |
| Decentralization | Not applicable | — | No required hosted control plane, governance, or custodial state |
| Documentation | Advanced | 4 | Human-authored product/architecture/roadmap plus generated audience, map, health, and agent documentation |
| Transaction ordering risks | Not applicable | — | No transactions, assets, oracle, or ordering-sensitive protocol |
| Low-level manipulation | Satisfactory | 3 | No dynamic evaluation or repository-code execution; filesystem and process boundaries are isolated |
| Testing and verification | Advanced | 4 | Unit, CLI, installed-package, security-boundary, schema, policy, evaluation, coverage, and platform CI gates |

**Overall applicable score: 22 / 28 = 3.1 / 4.0.**

## Security and verification posture

The deterministic core performs no network egress. Optional provider requests
require an explicit network flag, validated endpoints, secret redaction, byte
limits, timeouts, and citation checks. Declarative plugins receive a closed set
of capabilities and do not load third-party executable code. Runbook
verification uses built-in operations instead of a shell. Collaboration writes
require a bearer token and exact proposal approval hash, with authored-path,
source-hash, and symbolic-link protections.

The coverage gate is 85% lines, 80% branches, and 90% functions. The release
workflow additionally verifies deterministic generated documentation,
documentation policies, retrieval evaluation, plugin fixtures, the packed
artifact, dependency advisories, registry signatures, and release metadata.

## Continuous assurance

Implemented after 1.0:

- targeted mutation tests cover path containment, proposal application, and
  security helpers;
- file and function complexity ceilings prevent silent growth;
- the supply-chain report records dependency ownership, parser/runtime risk,
  alternatives, and compensating controls;
- agent fixtures measure Codex, Claude Code, and OpenCode retrieval separately.

Recurring operational work:

- run compromised-release and provider-egress tabletop exercises per release
  line;
- collect consented external adoption evidence using `docs/ADOPTION.md`;
- reassess dependency ownership and alternatives on every minor release.
