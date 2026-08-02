---
kind: feature
id: product-views
title: Audience-specific product knowledge
status: active
audiences:
  - product
  - support
  - security
  - operations
  - technical
evidence:
  - src/render.js#renderAudienceView
  - src/server.js#createCollaborationServer
  - src/history.js#readHistoricalGraph
affects:
  - src/render.js
  - src/server.js
customerImpact: Product, support, security, operations, and engineering readers share the same traceable knowledge while seeing language suited to their work.
---
ProDocs renders audience-specific views, feature-to-code maps, knowledge health,
and time-travel snapshots from the same versioned graph.
