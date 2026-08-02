# Releasing ProDocs

Only maintainers should perform a release. Releases are built from protected
`main`; source code and generated documentation must be clean and fresh.

The `1.0.0` codebase completes all product-roadmap phases. Publishing remains a
separate maintainer-controlled operation: merge the verified release PR, tag
the exact protected `main` commit, verify its artifacts, and then approve npm
publication.

## One-time npm setup

1. Claim the `prodocs` package name on npm.
2. Configure npm trusted publishing for
   `boyeesu/ProDocs` and workflow `publish-npm.yml`.
3. Protect the GitHub `npm` environment with a required maintainer approval.
4. Require two-factor authentication on maintainer GitHub and npm accounts.

The publishing workflow intentionally contains no long-lived npm token.

## Prepare

1. Update `package.json`, `package-lock.json`, and `src/constants.js` to the
   same version.
2. Move user-visible changes from `Unreleased` into a dated changelog section.
3. Run:

   ```sh
   npm ci
   node ./bin/prodocs.js sync
   npm run verify:production
   npm run release:check -- v<version>
   ```

4. Review `prodocs impact --base origin/main --json`, `prodocs policy --json`,
   and the generated audience views.
5. Merge the release preparation through the protected pull-request workflow.
6. Confirm post-merge CI and CodeQL are green.

## Create the release

Create an annotated tag from the verified `main` commit:

```sh
git switch main
git pull --ff-only
git tag -a v<version> -m "ProDocs v<version>"
git push origin v<version>
```

The `Release` workflow rebuilds and verifies the package, generates a CycloneDX
SBOM and SHA-256 checksums, creates a GitHub artifact attestation, and publishes
an immutable GitHub release. The repository tag ruleset prevents updating or
deleting matching `v*` tags after creation.

Verify the downloaded package before publishing:

```sh
gh attestation verify prodocs-<version>.tgz --repo boyeesu/ProDocs
shasum -a 256 -c SHA256SUMS
```

Then dispatch `Publish npm` from protected `main` for the same tag. The `npm`
environment approval is the final human gate. npm receives provenance through
trusted publishing.

## Confirm

- install the exact npm version in an empty directory;
- run `prodocs --version`, `init`, `sync`, `check`, and `status --json`;
- verify the npm provenance statement and GitHub attestation;
- confirm the release notes and compatibility changes are accurate;
- announce the supported version in `SECURITY.md`.

## Failed release

Never move or recreate a published tag. If GitHub artifact creation fails, fix
the workflow and rerun the failed job before npm publication. If npm publication
succeeds with a defect, deprecate the affected version, publish a fixed patch,
and follow the incident process in [`OPERATIONS.md`](OPERATIONS.md).
