---
kind: claim
id: local-first
title: Core workflows remain local-first
status: active
audiences:
  - product
  - security
  - technical
evidence:
  - src/cli.js#run
  - src/index-store.js#openIndexStore
  - src/providers.js#openAiCompatibleProposal
affects:
  - src
customerImpact: Repository evidence stays on the user's machine unless they explicitly approve a model-provider network request.
---
Indexing, querying, impact analysis, policies, views, and MCP work without a
hosted service. Model egress is optional and requires an explicit flag.
