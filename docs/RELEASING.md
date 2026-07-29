# Releasing ProDocs

Releases are intentionally manual during the public alpha. This keeps registry
publication separate from ordinary repository pushes and makes the release
boundary explicit.

## Prerequisites

- Maintainer access to `boyeesu/prodocs`.
- npm account with permission to publish the `prodocs` package.
- npm two-factor authentication enabled.
- Clean `main` branch with passing CI and CodeQL.

## Release checklist

1. Confirm the version follows Semantic Versioning.
2. Move relevant entries from `Unreleased` in `CHANGELOG.md` into a dated
   release section.
3. Refresh and validate generated documentation:

   ```bash
   npm ci
   npm run docs:sync
   npm run verify
   npm run test:coverage
   npm audit --omit=dev
   npm publish --dry-run --access public
   ```

4. Confirm the packed artifact exposes the `prodocs` executable.
5. Commit the release metadata.
6. Create an annotated `vX.Y.Z` tag and push it.
7. Create a GitHub release from the changelog.
8. Publish with provenance:

   ```bash
   npm publish --access public --provenance
   ```

9. Install the published package in a clean directory and run:

   ```bash
   prodocs --version
   prodocs init
   prodocs sync
   prodocs check
   ```

## Rollback

npm releases cannot be silently replaced. If a release is defective, deprecate
that version with a clear message, fix forward with a new patch version, and
document the incident in the changelog.
