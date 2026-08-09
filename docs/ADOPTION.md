# Adoption and product validation

ProDocs does not collect telemetry. Product validation is explicit, local, and
consent-based so repository content never becomes analytics data.

## First session

```sh
npm install --global @danielesuga/prodocs
prodocs tutorial --output prodocs-tutorial
cd prodocs-tutorial
prodocs sync
prodocs doctor
prodocs context --path src/delivery.js --task "change retry behavior" --json
```

In an existing repository, let ProDocs research the initial configuration and
knowledge instead of starting from blank fields:

```sh
prodocs init
prodocs adopt
```

The proposal records confidence and evidence for product identity, framework
entrypoints, repository ownership, and starter product knowledge. Review it,
then run the exact content-bound apply command printed by ProDocs. Application
creates missing agent recipes, synchronizes generated views, and returns both
doctor and policy results. Repository source or configuration drift invalidates
the proposal.

Agents can retrieve the same proposal through `prodocs adopt --json` or the
read-only `prodocs_adopt` MCP tool. Applying still requires the exact proposal
hash, so repository-derived text never grants itself write authority.

## Local measurement

```sh
prodocs benchmark \
  --suite fixtures/evaluation/agents.json \
  --output .prodocs/product-benchmark.json
```

The report contains only aggregate graph size, local timing, cache hit rate,
retrieval recall/precision, and token estimates. ProDocs does not transmit it.

## Success measures

For each consenting adoption session record:

- whether initialization, synchronization, and `doctor` completed;
- cold and warm indexing time and warm-cache hit rate;
- task outcome with and without ProDocs context where practical;
- context recall, precision, truncation, and estimated tokens;
- whether an impact-driven documentation proposal was accepted;
- setup friction and unsupported language or evidence needs.

Use the GitHub adopter-feedback form for non-sensitive aggregates. Never ask an
adopter to publish proprietary code, prompts, secrets, or repository names.

## Initial cohort protocol

1. Recruit maintainers from at least three codebases with different language
   and repository-size profiles.
2. Ask each maintainer to complete one onboarding task and one change-impact
   task using the same written task definition.
3. Capture aggregate benchmark output and qualitative friction with consent.
4. Convert repeated friction into a reproducible fixture before changing the
   product.
5. Publish only anonymized aggregate findings.

External recruitment and interviews require human relationships and consent;
the repository supplies the repeatable protocol, local tooling, and feedback
contract.
