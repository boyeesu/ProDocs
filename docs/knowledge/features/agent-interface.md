---
kind: feature
id: agent-interface
title: Agent-neutral context and MCP interface
status: active
audiences:
  - technical
  - coding-agents
evidence:
  - src/context.js#buildContextPacket
  - src/mcp.js#runMcpServer
  - src/integrations.js#writeIntegrations
affects:
  - src/context.js
  - src/mcp.js
customerImpact: Codex, Claude Code, OpenCode, and MCP-compatible editors receive small, current, task-relevant context without vendor lock-in.
---
Context retrieval is deterministically bounded by file and token budgets. MCP
exposes only read-only graph, context, impact, and policy operations.
