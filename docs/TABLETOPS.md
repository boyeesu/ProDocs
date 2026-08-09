# Assurance tabletop record

These walkthroughs exercise the response procedures in `docs/OPERATIONS.md`.
They are reproducible checks of repository controls; they do not claim that a
real credential or user repository was exposed.

## Compromised release path — 2026-08-09

Scenario: a release artifact cannot be verified immediately before npm
publication.

Observed result:

1. The npm workflow stopped before authentication or publication when its
   checksum command could not verify the downloaded GitHub release artifact.
2. The GitHub release and immutable tag remained unchanged.
3. Downloading the release assets and checking `release/SHA256SUMS` from the
   workspace root verified every artifact.
4. The workflow was repaired to verify the exact attested artifact from the
   correct directory. No artifact or tag was replaced.

Pass criteria: fail closed before publication, preserve evidence, repair via a
protected pull request, and retain immutable release assets. Result: **pass**.

Follow-up: keep the npm environment approval and artifact-attestation checks
required for every publish.

## Provider egress — 2026-08-09

Scenario: a maintainer suspects repository material was sent to an unintended
model endpoint.

Walkthrough result:

1. Stop provider-backed commands; deterministic local commands remain usable.
2. Revoke the provider credential outside ProDocs.
3. Preserve command time, configured endpoint, affected paths, and redaction
   counts without copying source payloads into incident logs.
4. Compare the endpoint against the explicit allowlist and inspect the bounded,
   redacted request construction and citation validation tests.
5. Notify the repository owner under their data-response policy and rotate the
   credential before explicitly re-enabling provider use.

Pass criteria: provider use is explicit, local operation remains available,
credentials are never persisted by ProDocs, and response steps identify the
affected scope without widening exposure. Result: **pass**.

Follow-up: repeat after any provider contract or redaction-boundary change.
