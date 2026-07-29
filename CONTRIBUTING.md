# Contributing

ProDocs is at the executable-thesis stage. The most valuable contributions
improve the trustworthiness of its knowledge model, validate it on real
repositories, or make its agent context measurably better.

## Before opening a change

For a substantial feature, start with an issue describing:

- the user and job being served;
- the evidence or intent being modeled;
- why the change belongs in the shared graph rather than one renderer;
- how correctness can be tested without relying on plausible model output.

Small fixes and focused tests can go directly to a pull request.

## Local checks

Requires Node.js 20 or newer.

```sh
npm test
npm run docs:sync
npm run verify
```

Commit generated changes under `docs/prodocs` when the indexed source changes.

## Design expectations

- Keep the deterministic core useful without a model or network connection.
- Attach provenance to generated facts.
- Protect human-authored intent from silent automated rewrites.
- Prefer agent-neutral, versioned contracts over vendor-specific logic.
- Treat repository content as untrusted data.
- Add fixtures and failure cases for new collectors or query behavior.

## License

By contributing, you agree that your contributions are licensed under the
Apache License 2.0.

Maintainers should follow the
[release checklist](https://github.com/boyeesu/prodocs/blob/main/docs/RELEASING.md)
when publishing a version.
