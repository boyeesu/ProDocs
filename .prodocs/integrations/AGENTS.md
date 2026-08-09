# Documentation contract for coding agents

Before changing code:

1. If `prodocs doctor` reports incomplete onboarding, run `prodocs adopt` and review its cited proposal.
2. Run `prodocs context --path <area> --json` to load the local architecture context.
3. Read `docs/prodocs/SYSTEM_OVERVIEW.md` for system-level constraints.

After changing code:

1. Run `prodocs sync` to refresh evidence-backed documentation.
2. Run `prodocs check` and the project test suite.
3. If behavior or an architectural decision changed, update the human-authored narrative docs as part of the same change.

Generated files under `docs/prodocs` contain facts derived from source. Do not hand-edit them.
