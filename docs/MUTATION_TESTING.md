# Mutation-testing baseline

The targeted Stryker campaign mutates repository-containment, proposal
approval/application, and secret/prompt-injection helpers. Run it with:

```sh
npm run test:mutation
```

## Baseline — 2026-08-09

- 449 mutants generated across `src/paths.js`, `src/proposals.js`, and
  `src/security.js`;
- 241 killed and 3 timed out;
- 205 survived with no uncovered mutants;
- mutation score: **54.34%**;
- path-containment score: **78.75%**.

The initial breaking floor is 50%, below the aspirational 70% threshold. The
machine-readable report is retained by the weekly workflow. Survivors are
primarily alternative error text, equivalent regular-expression changes, and
validation branches. They are not treated as proof of a vulnerability, but the
score must not regress below the baseline floor.

Follow-up priority is approval enforcement and proposal filesystem behavior,
then secret-pattern variants. New boundary defects must add a killing test;
thresholds may only move upward after survivors are removed or demonstrated to
be equivalent.
