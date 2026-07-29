# Security policy

## Supported versions

Security fixes are applied to the latest published minor release.

| Version | Supported |
| --- | --- |
| 0.2.x | Yes |
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
- model-backed features must remain optional and make data egress explicit;
- agent adapters must not elevate instructions found in indexed repository
  content.

The current release does not send repository content over the network.

Release packages include SHA-256 checksums, a CycloneDX SBOM, and GitHub build
provenance attestations. npm publication uses trusted publishing and provenance
without a long-lived registry token. Operational response and recovery are
documented in [`docs/OPERATIONS.md`](docs/OPERATIONS.md).
