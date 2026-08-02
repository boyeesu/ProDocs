---
kind: feature
id: evidence-kernel
title: Evidence-backed knowledge kernel
status: active
audiences:
  - product
  - technical
  - coding-agents
evidence:
  - src/scanner.js#scanProject
  - src/knowledge.js#collectAuthoredKnowledge
  - src/collectors/index.js#collectSourceEvidence
affects:
  - src
customerImpact: Teams get documentation that remains traceable to code and explicitly reports unsupported knowledge.
---
ProDocs combines deterministic source evidence with reviewed human intent.
Generated facts never overwrite authored claims, decisions, invariants, features,
or runbooks.
