---
kind: feature
id: change-intelligence
title: Change intelligence
status: active
audiences:
  - product
  - technical
  - coding-agents
evidence:
  - src/impact.js#analyzeImpact
  - src/policy.js#evaluatePolicies
  - src/proposals.js#applyProposal
affects:
  - src/impact.js
  - src/policy.js
  - src/proposals.js
customerImpact: Maintainers can see which code, documentation, tests, owners, decisions, and runbooks a change affects before merging it.
---
The impact engine traverses the evidence graph from git changes and produces a
reviewable, content-addressed proposal rather than silently modifying authored
documentation.
