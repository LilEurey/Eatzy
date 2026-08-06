---
allowed-tools: Bash(npx tsc --noEmit), Bash(npm run lint)
description: Run typecheck and lint before committing (required by CLAUDE.md)
---

## Task

Run these two checks, in order:

1. `npx tsc --noEmit`
2. `npm run lint`

Report the result of each. If either fails, show the errors and stop — do not proceed to commit.
Per CLAUDE.md's Git Workflow, never commit with TypeScript errors.
