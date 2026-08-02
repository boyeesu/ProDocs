---
kind: runbook
id: production-verification
title: Verify ProDocs for production
status: active
audiences:
  - operations
  - technical
evidence:
  - scripts/verify-release.js
  - src/cli.js#run
affects:
  - src
  - schemas
verify:
  - command: node
    args:
      - ./bin/prodocs.js
      - check
    cwd: .
    timeoutMs: 30000
    expectedExitCode: 0
---
Run the content-bound verification plan after syncing generated documentation.
The command runs without a shell and with a secret-minimized environment.
