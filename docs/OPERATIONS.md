# Operations and incident response

ProDocs has no hosted runtime. Operational risk is concentrated in source
control, release credentials, dependency integrity, and incorrect generated
evidence.

## Signals

- required CI and CodeQL checks on protected `main`;
- weekly CodeQL and Dependabot runs;
- dependency review on pull requests;
- npm audit, registry signature verification, package installation smoke tests,
  coverage thresholds, and package dry-runs;
- GitHub release attestations, checksums, and SBOMs.
- release-tag rules that reject updates and deletions.

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
