# MCP Agent Tests Design

**Date:** 2026-04-25  
**Scope:** Full test pyramid (unit + integration + benchmark) for all 15 agents in `mcpServer`

---

## Approach

Flat test files per agent — one `.test.ts` per agent in `tests/` at repo root. No monolithic harness. One shared `tests/helpers.ts` for MCP stdio spawn/client only.

## Structure

```
tests/
  vitest.config.ts
  helpers.ts                ← spawnMcpServer + McpStdioClient
  cicd.test.ts
  claude.test.ts
  codeReviewer.test.ts
  databaseExpert.test.ts
  debugger.test.ts
  docker.test.ts
  documenter.test.ts
  explainer.test.ts
  focusTimer.test.ts
  gitMaintainer.test.ts
  kubernetes.test.ts
  mood.test.ts
  planner.test.ts
  repoInitializer.test.ts
  securityAuditor.test.ts
  smokeTester.test.ts
```

## Each Test File

Three `describe` blocks per file:

### unit
- Imports agent module directly from `../mcpServer/src/agents/<agent>.ts`
- Mocks filesystem / child_process where needed
- No server spawn — fast, isolated

### integration
- Calls `spawnMcpServer()` in `beforeAll`, `close()` in `afterAll`
- Sends `execute_agent` tool call with agent name + minimal query
- Asserts response has `content[0].text` with non-empty string

### benchmark
- Uses same spawned server
- Calls `benchmark_versions` tool with 2 runs
- Asserts `report.versions[0].avgMs > 0` — confirms metrics are produced

## helpers.ts Contract

```typescript
spawnMcpServer(): Promise<McpStdioClient>
// Spawns mcpServer/dist/index.js via stdio
// Line-buffers stdout, parses JSON-RPC responses by id

McpStdioClient.call(toolName: string, params: object): Promise<ToolResult>
// Sends: {"jsonrpc":"2.0","id":N,"method":"tools/call","params":{"name":toolName,"arguments":params}}
// Resolves when matching id response arrives

McpStdioClient.close(): Promise<void>
// Kills child process cleanly
```

## Config

**`tests/vitest.config.ts`:**
```typescript
import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    testTimeout: 60_000,
    hookTimeout: 15_000,
    include: ["tests/**/*.test.ts"],
  },
});
```

**Repo root `package.json`** (new):
```json
{
  "scripts": {
    "build:mcp": "cd mcpServer && npm run build",
    "test": "npm run build:mcp && vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "vitest": "^2.0.0"
  }
}
```

## Build Dependency

Integration and benchmark tests require `mcpServer/dist/index.js` to exist. The `test` script builds first. Unit tests only need TypeScript source — they can run without the build step via `vitest` direct import resolution with `tsx`.

## Agents Covered

| Agent | File |
|---|---|
| cicd | cicd.test.ts |
| claude | claude.test.ts |
| codeReviewer | codeReviewer.test.ts |
| databaseExpert | databaseExpert.test.ts |
| debugger | debugger.test.ts |
| docker | docker.test.ts |
| documenter | documenter.test.ts |
| explainer | explainer.test.ts |
| focusTimer | focusTimer.test.ts |
| gitMaintainer | gitMaintainer.test.ts |
| kubernetes | kubernetes.test.ts |
| mood | mood.test.ts |
| planner | planner.test.ts |
| repoInitializer | repoInitializer.test.ts |
| securityAuditor | securityAuditor.test.ts |
| smokeTester | smokeTester.test.ts |

## Out of Scope

- Schema snapshot tests (add later once API stabilizes)
- CI pipeline integration (separate task)
- Coverage thresholds (set after baseline established)
