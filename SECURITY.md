# Security policy

## Supported versions

Security fixes are applied to the latest published 1.x minor release.

| Version | Supported |
| --- | --- |
| 1.x | Yes |
| 0.2.x | No |
| 0.1.x | No |
| Earlier | No |

## Reporting a vulnerability

Please do not open a public issue for a suspected vulnerability. Use GitHub's
private vulnerability reporting for this repository:

<https://github.com/boyeesu/prodocs/security/advisories/new>

Include the affected version, reproduction conditions, potential impact, and
any suggested mitigation. You should receive an acknowledgement within seven
days. We will coordinate disclosure after a fix is available.

## Security model

ProDocs treats repository contents and configuration as untrusted input:

- indexed source code is read as data and is never executed;
- configured sources and generated output are constrained to the project root;
- symbolic links are not traversed while discovering source files;
- configuration, manifests, source evidence, and generated artifacts use
  no-follow or atomic filesystem operations;
- configurable file-count and byte limits bound resource consumption;
- declarative plugins receive only named capabilities and do not execute
  third-party plugin code;
- proposal application requires an exact approval hash, rejects stale source
  hashes, and can only modify configured authored-documentation paths;
- adoption proposals additionally bind configuration state, validate inferred
  content, preflight all destinations, and restrict writes to configuration,
  CODEOWNERS, and configured authored-knowledge paths;
- runbook verification executes no shell and only supports built-in,
  time-bounded, output-bounded operations;
- the collaboration API is loopback-only by default, requires a strong bearer
  token when exposed on another interface, and never exposes an unauthenticated
  write route;
- model-backed providers are optional, require `--allow-network`, redact
  common secret formats, enforce HTTPS except for loopback development, and
  validate returned citations;
- MCP and agent adapters expose repository content as explicitly untrusted data
  and provide read-only tools;
- agent adapters must not elevate instructions found in indexed repository
  content.

The deterministic core never sends repository content over the network.
Network egress occurs only when a user explicitly selects a provider and passes
`--allow-network`; the command reports the destination before transmission.

Release packages include SHA-256 checksums, a CycloneDX SBOM, and GitHub build
provenance attestations. npm publication uses trusted publishing and provenance
without a long-lived registry token. Operational response and recovery are
documented in [`docs/OPERATIONS.md`](docs/OPERATIONS.md).
