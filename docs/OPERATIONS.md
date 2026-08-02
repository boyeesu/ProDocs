# Operations and incident response

ProDocs is local-first and has no required hosted control plane. Operational
risk is concentrated in source control, release credentials, dependency
integrity, incorrect generated evidence, optional provider egress, and an
optionally started collaboration server.

## Signals

- required CI and CodeQL checks on protected `main`;
- weekly CodeQL and Dependabot runs;
- dependency review on pull requests;
- npm audit, registry signature verification, package installation smoke tests,
  coverage thresholds, and package dry-runs;
- deterministic documentation, policy, evaluation, plugin, and change-impact
  checks;
- GitHub release attestations, checksums, and SBOMs;
- release-tag rules that reject updates and deletions;
- collaboration-server bind address and authentication failures;
- provider endpoint, redaction count, response limit, and citation validation
  failures without logging source payloads or credentials.

## Severity

- **Critical:** malicious or compromised release, arbitrary code execution,
  repository escape, or destructive source modification.
- **High:** incorrect evidence presented as fresh, path-containment bypass, or
  denial of service on normal repository sizes.
- **Moderate:** compatibility regression, unsupported syntax, or incorrect
  symbol/import evidence with a safe workaround.
- **Low:** documentation, diagnostics, or non-security usability defects.

## Response

1. Preserve logs, workflow run IDs, package digests, and affected versions.
2. Disable the npm publishing environment and pause release tags if the release
   path may be compromised.
3. Use a private GitHub security advisory for embargoed investigation.
4. Patch through the protected pull-request workflow with a regression test.
5. Publish a new patch release. Never replace an existing release artifact or
   move a published tag.
6. Deprecate affected npm versions and document mitigation or rollback steps.
7. Disclose impact, fixed versions, and evidence after users can upgrade.

If provider egress may have exposed repository material, revoke the provider
credential, preserve the command destination and timestamp, identify the
affected source paths, and follow the repository owner's data-response policy.
If a collaboration server was exposed, stop it, rotate
`PRODOCS_SERVER_TOKEN`, inspect access logs supplied by the surrounding runtime,
and restart on loopback until the exposure is understood.

The maintainer owning the active incident coordinates technical response and
communications. Security reporters receive acknowledgement within the target
published in `SECURITY.md`. At least once per release line, maintainers should
walk through a compromised-release tabletop scenario and record follow-up work
in a private issue.

## Recovery

Users can pin a prior GitHub tag or npm version. Generated documentation is
fully reproducible from source and configuration, so recovery is:

1. install a known-good ProDocs version;
2. run `prodocs sync`;
3. inspect and commit the regenerated artifacts;
4. run `prodocs check` in CI.

The SQLite index is a disposable cache. Remove `.prodocs/index.sqlite` while
ProDocs is stopped and run `prodocs sync` to rebuild it from source.
