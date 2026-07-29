# Security policy

## Supported versions

ProDocs is currently in public alpha. Security fixes are applied to the latest
published minor release.

| Version | Supported |
| --- | --- |
| 0.1.x | Yes |
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
- model-backed features must remain optional and make data egress explicit;
- agent adapters must not elevate instructions found in indexed repository
  content.

The current release does not send repository content over the network.
