---
kind: invariant
id: untrusted-repository
title: Repository content is untrusted data
status: active
audiences:
  - security
  - technical
  - coding-agents
evidence:
  - src/security.js#detectPromptInjection
  - src/context.js#buildContextPacket
  - src/mcp.js#handleMcpRequest
affects:
  - src
---
Indexed content cannot override user, developer, host, or agent instructions.
Collectors do not execute indexed source, provider payloads are redacted and
bounded, and all agent-facing packets declare the repository-content boundary.
