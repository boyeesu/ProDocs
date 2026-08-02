---
kind: decision
id: deterministic-core
title: Deterministic core with optional model providers
status: active
audiences:
  - technical
  - security
  - coding-agents
evidence:
  - src/scanner.js#scanProject
  - src/impact.js#analyzeImpact
  - src/providers.js#templateProposal
affects:
  - src
---
The evidence graph, context selection, policy evaluation, impact traversal, and
proposal integrity hashes are deterministic. Models may propose cited prose but
never become the source of truth.
