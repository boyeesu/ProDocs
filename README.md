<p align="center">
  <img src="assets/prodocs-logo.png" width="150" alt="ProDocs robot logo">
</p>

<p align="center">
  <strong>Your codebase already knows how it works. ProDocs makes it explain itself—with receipts.</strong>
</p>

<p align="center">
  <a href="https://github.com/boyeesu/prodocs/actions/workflows/ci.yml"><img src="https://github.com/boyeesu/prodocs/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/boyeesu/prodocs/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-7c3aed" alt="Apache 2.0 license"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%3E%3D20-3c873a" alt="Node.js 20 or newer"></a>
  <a href="https://github.com/boyeesu/prodocs"><img src="https://img.shields.io/badge/status-production--ready-16a34a" alt="Production-ready"></a>
</p>

<p align="center">
  <a href="#quickstart">Quickstart</a> ·
  <a href="#authored-knowledge">Knowledge</a> ·
  <a href="#change-intelligence">Impact</a> ·
  <a href="#agent-native-interface">Agents</a> ·
  <a href="#commands">Commands</a> ·
  <a href="https://github.com/boyeesu/prodocs/blob/main/docs/PRODUCT_VISION.md">Vision</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/boyeesu/prodocs/main/assets/prodocs-hero.png" width="1200" alt="ProDocs turns source code into an evidence graph, verified documentation, and scoped agent context">
</p>

---

> **Code is evidence. Documentation is a set of claims. ProDocs keeps the
> link between them.**

ProDocs is an open-source, local-first product knowledge system for humans and
coding agents. It connects code, tests, APIs, database schemas, ownership,
claims, decisions, features, runbooks, and customer impact in one versioned
graph.

The deterministic core requires no model and no hosted service. Optional model
providers can propose cited prose only after explicit network approval.

## Why ProDocs

| Conventional documentation | ProDocs |
| --- | --- |
| Pages drift silently | CI checks source, configuration, and authored knowledge freshness |
| Generated prose sounds plausible | Every claim records resolvable evidence |
| Change review starts from guesswork | `prodocs impact` maps a diff to behavior, tests, owners, decisions, and runbooks |
| Agents ingest the repository | Agents request task-shaped context with hard file/token budgets |
| AI can overwrite human intent | Writes require a reviewable proposal and exact approval hash |
| Each tool builds another index | Humans, agents, MCP clients, and views share one graph |
| Knowledge lives in a vendor cloud | SQLite, JSON, Markdown, and history remain in the repository |

## Quickstart

ProDocs supports Node.js 20, 22, and 24 on Linux, macOS, and Windows.

```bash
npm install --global @danielesuga/prodocs

cd /path/to/your/repository
prodocs init
prodocs adopt
# Review the cited proposal, then run the exact apply command it prints.
prodocs doctor
prodocs status
```

`prodocs adopt` does the onboarding research: it infers structured product
identity, framework entrypoints, likely GitHub ownership, and starter product
knowledge with confidence and evidence citations. It writes a content-bound
proposal under `.prodocs`; no inferred intent is applied until the exact
approval hash is supplied:

```bash
prodocs adopt --json
prodocs adopt \
  --apply .prodocs/adoption-proposal.json \
  --approve <approvalHash>
```

Application also creates any missing agent recipes, refreshes generated views,
and returns doctor and policy results. Agents can request the same proposal
without writes through the read-only `prodocs_adopt` MCP tool.

Try the product without modifying an existing repository:

```bash
prodocs tutorial --output prodocs-tutorial
cd prodocs-tutorial
prodocs sync
prodocs doctor
```

Generated output includes:

```text
docs/prodocs/
├── SYSTEM_OVERVIEW.md
├── CODE_MAP.md
├── FEATURE_MAP.md
├── KNOWLEDGE_HEALTH.md
├── views/
│   ├── product.md
│   ├── technical.md
│   ├── support.md
│   ├── security.md
│   ├── operations.md
│   └── coding-agents.md
├── knowledge.json
└── manifest.json
```

The reusable incremental index is stored at `.prodocs/index.sqlite`; portable
JSON remains the interoperability and debugging format.

<p align="center">
  <img src="https://raw.githubusercontent.com/boyeesu/prodocs/main/assets/prodocs-flow.jpg" width="1200" alt="Source files flow through the ProDocs evidence graph into verified documentation and scoped context for coding agents">
</p>

## Authored knowledge

Reviewed intent lives in ordinary Markdown under `docs/knowledge`. ProDocs can
draft the initial cited document through `adopt`; thereafter it parses a strict,
safe YAML front matter contract and never rewrites these files during `sync`.

```markdown
---
kind: feature
id: delivery-retries
title: Delivery retry behavior
status: active
audiences:
  - product
  - support
evidence:
  - src/delivery/retry.ts#retryDelivery
  - test/delivery/retry.test.ts
customerImpact: Failed deliveries are retried without manual intervention.
---
Deliveries use the reviewed retry policy.
```

Supported kinds are `claim`, `decision`, `invariant`, `feature`, and `runbook`.
Evidence references may target a file or `file#symbol`. The graph reports:

- supported and unsupported knowledge;
- explicit contradictions and supersession;
- evidence coverage;
- feature-to-code and feature-to-customer-impact relationships;
- applicable owners, tests, and runbooks.

## Change intelligence

```bash
# Compare a branch with main
prodocs impact --base main --json

# Or use an explicit range and write a review proposal
prodocs impact main...HEAD \
  --patch .prodocs/impact-proposal.json \
  --json

# Evaluate documentation contracts
prodocs policy

# Create a deterministic cited narrative
prodocs propose \
  --impact .prodocs/impact.json \
  --provider template \
  --output .prodocs/narrative.json
```

Impact traversal returns affected files, claims, decisions, invariants,
features, runbooks, tests, and owners. Proposal application is separate:

```bash
prodocs proposal validate proposal.json
prodocs proposal apply proposal.json --approve <approvalHash>
```

The approval hash binds authorization to the exact operations and content.
Only authored Markdown paths are writable; generated output, symlinks, stale
files, and repository escapes are rejected.

Install the local pre-push gate:

```bash
prodocs hooks install
```

It configures a repository-owned hook that runs freshness, policy, and impact
checks. CI runs the same production checks and builds pull-request impact
evidence.

## Agent-native interface

Use bounded context from any command-capable agent:

```bash
prodocs context \
  --path src/billing \
  --task "change invoice retry behavior" \
  --max-files 20 \
  --max-tokens 8000 \
  --json
```

Context packets use `schemaVersion: 2`. They include code and applicable
knowledge, deterministic relevance, freshness, truncation metadata, exact byte
measurements, token estimates, and an explicit untrusted-repository boundary.

Start the local MCP server:

```bash
prodocs mcp
```

It implements the current MCP `2025-11-25` stdio protocol with read-only tools:

- `prodocs_adopt`;
- `prodocs_context`;
- `prodocs_impact`;
- `prodocs_policy`;
- graph and policy resources.

`prodocs init` creates recipes for Codex, Claude Code, OpenCode, VS Code/editor
MCP clients, and generic `AGENTS.md` consumers under `.prodocs/integrations`.

Measure context quality instead of guessing:

```bash
prodocs evaluate --suite fixtures/evaluation/core.json
```

Evaluation suites report recall, precision, truncation, and token use for
representative maintenance tasks.

Measure cold/warm indexing, cache reuse, and per-agent context quality locally:

```bash
prodocs benchmark \
  --suite fixtures/evaluation/agents.json \
  --output .prodocs/product-benchmark.json
```

No telemetry or repository content is transmitted.

## Collectors and plugins

Built-in evidence includes:

- parser-backed JavaScript and TypeScript;
- Python, Go, Rust, Java, Ruby, PHP, C#, Swift, and Kotlin;
- OpenAPI endpoints and schemas;
- SQL tables and views;
- CODEOWNERS and owner edges;
- test files and test-to-source relationships.

Third-party extensions use a declarative collector SDK. Plugins declare only
the `collect:source-text` capability; ProDocs does not execute plugin code.

```bash
prodocs plugin verify my-plugin.prodocs-plugin.json
```

See [the collector contract](docs/COLLECTORS.md) and the
[conformance fixture](fixtures/plugins/service.prodocs-plugin.json).

## Product views, runbooks, history, and collaboration

```bash
# Render a view without writing
prodocs view --audience support

# Read the committed graph from another revision
prodocs history --at v1.0.0 --json
prodocs view --audience technical --at v1.0.0

# Review and explicitly approve executable verification
prodocs runbook plan production-verification --json
prodocs runbook verify production-verification --approve <approvalHash>

# Optional loopback collaboration API
prodocs serve --host 127.0.0.1 --port 43110
```

Runbook commands execute without a shell, inside the repository, with a bounded
timeout and secret-minimized environment. A content-bound approval is mandatory.

The collaboration API is local and read-only by default. Proposal writes require
`PRODOCS_SERVER_TOKEN`. Non-loopback binding is refused unless that token is at
least 24 characters.

## Commands

| Command | Purpose |
| --- | --- |
| `prodocs init` | Create configuration and agent/MCP recipes |
| `prodocs adopt` | Infer and propose cited identity, entrypoints, ownership, and starter knowledge |
| `prodocs doctor` | Require warning-free identity, evidence, freshness, integrations, and knowledge readiness |
| `prodocs tutorial` | Create a safe, complete getting-started project |
| `prodocs sync` | Incrementally index evidence and render all views |
| `prodocs check` | Fail when generated knowledge is stale or contains broken local links |
| `prodocs status` | Show evidence, index, and knowledge health |
| `prodocs context` | Return bounded task-shaped context |
| `prodocs impact` | Map git changes through the knowledge graph |
| `prodocs policy` | Evaluate documentation contracts |
| `prodocs propose` | Produce a cited deterministic or model-backed narrative |
| `prodocs proposal` | Validate or explicitly apply reviewed writes |
| `prodocs mcp` | Run the local stdio MCP server |
| `prodocs evaluate` | Measure context retrieval quality |
| `prodocs benchmark` | Measure indexing, cache reuse, and per-agent context locally |
| `prodocs plugin verify` | Verify declarative collector conformance |
| `prodocs hooks install` | Install the local pre-push gate |
| `prodocs view` | Render an audience-specific view |
| `prodocs history` | Read a versioned graph snapshot |
| `prodocs runbook` | Plan or verify an executable runbook |
| `prodocs serve` | Start the optional collaboration API |
| `prodocs capabilities` | List public capabilities and adapters |

Run `prodocs --help` for every option.

## Security model

Repository content is untrusted input:

- source collectors parse strings and never import, compile, or execute indexed
  code;
- plugin definitions are declarative and capability-bounded;
- source, knowledge, index, proposal, and output paths are repository-contained
  and symlink-safe;
- file count, file size, total bytes, context size, provider payloads, HTTP
  bodies, subprocess output, and execution time are bounded;
- instruction-like repository text is flagged and never promoted into agent
  instructions;
- model data egress requires `--allow-network`, uses HTTPS except on loopback,
  redacts common secrets, and rejects unsupported citations;
- proposal and runbook mutations require exact content-bound approval hashes.

See [SECURITY.md](SECURITY.md) and [docs/OPERATIONS.md](docs/OPERATIONS.md).

## Public contracts

The package exports collectors, declarative plugin helpers, provider helpers,
and these JSON Schemas:

- [knowledge graph](schemas/knowledge.schema.json), version 2;
- [context packet](schemas/context-packet.schema.json), version 2;
- [collector result](schemas/collector-result.schema.json), version 1;
- [impact report](schemas/impact.schema.json), version 1;
- [proposal](schemas/proposal.schema.json), version 1.

ProDocs follows Semantic Versioning. Incompatible public API or CLI changes
require a major release after 1.0; data contracts use their own
`schemaVersion`.

## Development and production verification

```bash
npm ci
npm run verify
npm run test:coverage
npm run verify:production
```

The production gate includes syntax checks, 66+ cross-platform tests, installed
package workflow testing, release consistency, generated-document freshness,
policy checks, context evaluation, plugin conformance, coverage floors, npm
audit, signature verification, and package inspection.

Read the [product vision](docs/PRODUCT_VISION.md),
[architecture](docs/ARCHITECTURE.md), [completed roadmap](docs/ROADMAP.md),
[compatibility policy](docs/COMPATIBILITY.md), and
[production validation](docs/VALIDATION.md). Adoption measurement is documented
in [docs/ADOPTION.md](docs/ADOPTION.md), troubleshooting in
[docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md), and dependency posture in
[docs/SUPPLY_CHAIN.md](docs/SUPPLY_CHAIN.md).

## Contributing, support, and license

See [CONTRIBUTING.md](CONTRIBUTING.md), [SUPPORT.md](SUPPORT.md), and
[SECURITY.md](SECURITY.md).

Licensed under the [Apache License 2.0](LICENSE).
