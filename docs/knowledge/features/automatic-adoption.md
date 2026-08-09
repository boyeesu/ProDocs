---
kind: feature
id: automatic-adoption
title: Evidence-backed automatic repository adoption
status: active
audiences:
  - product
  - technical
  - security
  - coding-agents
evidence:
  - src/adoption-inference.js#inferAdoption
  - src/adoption.js#createAdoptionProposal
  - src/adoption.js#applyAdoptionProposal
  - src/adoption-command.js#runAdoptionCommand
  - src/mcp.js#handleMcpRequest
affects:
  - src/adoption-inference.js
  - src/adoption.js
  - src/adoption-command.js
  - src/doctor.js
  - src/mcp.js
customerImpact: Teams receive a cited, policy-complete onboarding draft instead of manually filling blank product, entrypoint, ownership, and knowledge fields.
---
ProDocs deterministically infers structured identity, framework boundaries, and
repository ownership, then drafts starter product knowledge backed by indexed
source evidence. The proposal is read-only until its exact hash is approved;
source, configuration, inference evidence, or proposal drift invalidates it.
