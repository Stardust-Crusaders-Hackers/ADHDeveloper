# MCP Agent Tests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Full test pyramid (unit + integration + benchmark) for all 16 agents in mcpServer, using Vitest at repo root.

**Architecture:** One `.test.ts` per agent in `tests/` at repo root. Shared `tests/helpers.ts` spawns the built MCP server via stdio and wraps JSON-RPC. Each test file has three `describe` blocks: unit (direct import of agent handler), integration (stdio `execute_agent` tool call), benchmark (`benchmark_versions` tool call).

**Tech Stack:** Vitest 2.x, TypeScript, Node.js `child_process` for MCP stdio client, `mcpServer/dist/index.js` as integration target.

---

## File Map

| File | Purpose |
|---|---|
| `package.json` (root, new) | `test` script + vitest devDep |
| `tests/vitest.config.ts` (new) | 60s timeout, include glob |
| `tests/helpers.ts` (new) | `McpStdioClient` — spawn server, JSON-RPC over stdio |
| `tests/planner.test.ts` | planner agent |
| `tests/debugger.test.ts` | debugger agent |
| `tests/mood.test.ts` | mood-detector agent |
| `tests/cicd.test.ts` | cicd agent |
| `tests/claude.test.ts` | claude agent |
| `tests/codeReviewer.test.ts` | codeReviewer agent |
| `tests/databaseExpert.test.ts` | database-expert agent |
| `tests/docker.test.ts` | docker agent |
| `tests/documenter.test.ts` | documenter agent |
| `tests/explainer.test.ts` | explainer agent |
| `tests/focusTimer.test.ts` | focus-timer agent |
| `tests/gitMaintainer.test.ts` | gitMaintainer agent |
| `tests/kubernetes.test.ts` | kubernetes agent |
| `tests/repoInitializer.test.ts` | repo-initializer agent |
| `tests/securityAuditor.test.ts` | securityAuditor agent |
| `tests/smokeTester.test.ts` | smoke-tester agent |

---

## Task 1: Root package.json + vitest config

**Files:**
- Create: `package.json` (repo root)
- Create: `tests/vitest.config.ts`

- [ ] **Step 1: Write failing smoke — verify vitest not installed**

```bash
npx vitest --version
```
Expected: error or "not found"

- [ ] **Step 2: Create root `package.json`**

```json
{
  "type": "module",
  "scripts": {
    "build:mcp": "cd mcpServer && npm run build",
    "test": "npm run build:mcp && vitest run --config tests/vitest.config.ts",
    "test:unit": "vitest run --config tests/vitest.config.ts -t unit",
    "test:watch": "vitest --config tests/vitest.config.ts"
  },
  "devDependencies": {
    "vitest": "^2.0.0",
    "typescript": "^5.0.0"
  }
}
```

- [ ] **Step 3: Install deps**

```bash
npm install
```
Expected: `node_modules/vitest` created

- [ ] **Step 4: Create `tests/vitest.config.ts`**

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

- [ ] **Step 5: Verify vitest can be invoked**

```bash
npx vitest --version --config tests/vitest.config.ts
```
Expected: prints vitest version like `2.x.x`

- [ ] **Step 6: Commit**

```bash
git add package.json tests/vitest.config.ts
git commit -m "test: bootstrap vitest at repo root"
```

---

## Task 2: tests/helpers.ts — McpStdioClient

**Files:**
- Create: `tests/helpers.ts`

- [ ] **Step 1: Create `tests/helpers.ts`**

```typescript
import { spawn, ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import * as path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_PATH = path.resolve(__dirname, "../mcpServer/dist/index.js");

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
  error?: { code: number; message: string };
}

export interface ToolResult {
  content: Array<{ type: string; text: string }>;
}

export class McpStdioClient {
  private proc: ChildProcess;
  private idCounter = 0;
  private pending = new Map<number, { resolve: (r: ToolResult) => void; reject: (e: Error) => void }>();

  private constructor(proc: ChildProcess) {
    this.proc = proc;
    const rl = createInterface({ input: proc.stdout! });
    rl.on("line", (line) => {
      if (!line.trim()) return;
      let msg: JsonRpcResponse;
      try { msg = JSON.parse(line); } catch { return; }
      if (msg.id == null) return;
      const handler = this.pending.get(msg.id);
      if (!handler) return;
      this.pending.delete(msg.id);
      if (msg.error) {
        handler.reject(new Error(`MCP error ${msg.error.code}: ${msg.error.message}`));
      } else {
        handler.resolve(msg.result as ToolResult);
      }
    });
  }

  private send(msg: object): void {
    this.proc.stdin!.write(JSON.stringify(msg) + "\n");
  }

  private request(method: string, params: object): Promise<unknown> {
    const id = ++this.idCounter;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (r: ToolResult) => void, reject });
      this.send({ jsonrpc: "2.0", id, method, params });
    });
  }

  async call(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
    const result = await this.request("tools/call", { name: toolName, arguments: args });
    return result as ToolResult;
  }

  async close(): Promise<void> {
    this.proc.kill("SIGTERM");
    await new Promise<void>((resolve) => this.proc.on("exit", () => resolve()));
  }

  static async connect(): Promise<McpStdioClient> {
    const proc = spawn(process.execPath, [SERVER_PATH], {
      stdio: ["pipe", "pipe", "inherit"],
      shell: false,
    });

    const client = new McpStdioClient(proc);

    // MCP handshake
    await client.request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "test-client", version: "1.0.0" },
    });
    client.send({ jsonrpc: "2.0", method: "notifications/initialized" });

    return client;
  }
}

export async function spawnMcpServer(): Promise<McpStdioClient> {
  return McpStdioClient.connect();
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit --strict --target ES2022 --module NodeNext --moduleResolution NodeNext tests/helpers.ts
```
Expected: no errors (or add `--skipLibCheck` if needed)

- [ ] **Step 3: Build MCP server so integration tests can spawn it**

```bash
npm run build:mcp
```
Expected: `mcpServer/dist/index.js` exists

- [ ] **Step 4: Commit**

```bash
git add tests/helpers.ts
git commit -m "test: add McpStdioClient helper for MCP integration tests"
```

---

## Task 3: tests/planner.test.ts

**Files:**
- Create: `tests/planner.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import plannerAgent from "../mcpServer/src/agents/planner.js";
import { spawnMcpServer, McpStdioClient } from "./helpers.js";

let server: McpStdioClient;
beforeAll(async () => { server = await spawnMcpServer(); });
afterAll(async () => { await server.close(); });

describe("unit", () => {
  it("returns success with plan content", async () => {
    const result = await plannerAgent.handler({ query: "plan a REST API service" });
    expect(result.success).toBe(true);
    expect(typeof result.message).toBe("string");
    expect(result.message.length).toBeGreaterThan(0);
  });

  it("includes file suggestions for agent-related queries", async () => {
    const result = await plannerAgent.handler({ query: "plan a new agent" });
    expect(result.message).toContain("src/agents/");
  });

  it("includes mcp suggestions for mcp-related queries", async () => {
    const result = await plannerAgent.handler({ query: "plan mcp integration" });
    expect(result.message).toContain("src/index.ts");
  });
});

describe("integration", () => {
  it("execute_agent planner returns content array", async () => {
    const res = await server.call("execute_agent", { agentName: "planner", query: "plan a REST API" });
    expect(Array.isArray(res.content)).toBe(true);
    expect(res.content[0].type).toBe("text");
    expect(res.content[0].text.length).toBeGreaterThan(0);
  });

  it("response contains success field in parsed JSON", async () => {
    const res = await server.call("execute_agent", { agentName: "planner", query: "plan a feature" });
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed).toHaveProperty("success");
  });
});

describe("benchmark", () => {
  it("benchmark_versions returns avgDurationMs > 0", async () => {
    const res = await server.call("benchmark_versions", {
      name: "planner-bench",
      versions: [{ id: "v1", agentName: "planner", query: "plan a REST API" }],
      runs: 2,
      warmupRuns: 0,
    });
    const report = JSON.parse(res.content[0].text);
    expect(report.versions[0].avgDurationMs).toBeGreaterThan(0);
    expect(report.versions[0].successRate).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 2: Run test**

```bash
npx vitest run --config tests/vitest.config.ts tests/planner.test.ts
```
Expected: all 5 tests PASS

- [ ] **Step 3: Commit**

```bash
git add tests/planner.test.ts
git commit -m "test: add planner agent tests (unit + integration + benchmark)"
```

---

## Task 4: tests/debugger.test.ts

**Files:**
- Create: `tests/debugger.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import debuggerAgent from "../mcpServer/src/agents/debugger.js";
import { spawnMcpServer, McpStdioClient } from "./helpers.js";

let server: McpStdioClient;
beforeAll(async () => { server = await spawnMcpServer(); });
afterAll(async () => { await server.close(); });

describe("unit", () => {
  it("classifies module-resolution failure", async () => {
    const result = await debuggerAgent.handler({
      query: "Error: Cannot find module './utils.js'",
      metadata: { refreshTestPlaybook: false },
    });
    expect(result.success).toBe(true);
    expect(result.message).toContain("module-resolution");
  });

  it("classifies type error", async () => {
    const result = await debuggerAgent.handler({
      query: "TypeScript error: Type 'string' is not assignable to type 'number'",
      metadata: { refreshTestPlaybook: false },
    });
    expect(result.success).toBe(true);
    expect(result.message).toContain("type-error");
  });

  it("returns next step", async () => {
    const result = await debuggerAgent.handler({
      query: "ENOENT: no such file or directory, open 'config.json'",
      metadata: { refreshTestPlaybook: false },
    });
    expect(result.success).toBe(true);
    expect(result.message).toContain("Next Step");
  });
});

describe("integration", () => {
  it("execute_agent debugger returns text content", async () => {
    const res = await server.call("execute_agent", {
      agentName: "debugger",
      query: "Cannot find module './missing.js'",
      metadata: { refreshTestPlaybook: false },
    });
    expect(res.content[0].text.length).toBeGreaterThan(0);
  });

  it("result has success field", async () => {
    const res = await server.call("execute_agent", {
      agentName: "debugger",
      query: "npm run test failed",
      metadata: { refreshTestPlaybook: false },
    });
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed).toHaveProperty("success", true);
  });
});

describe("benchmark", () => {
  it("benchmark_versions returns metrics", async () => {
    const res = await server.call("benchmark_versions", {
      name: "debugger-bench",
      versions: [{ id: "v1", agentName: "debugger", query: "Cannot find module error", metadata: { refreshTestPlaybook: false } }],
      runs: 2,
      warmupRuns: 0,
    });
    const report = JSON.parse(res.content[0].text);
    expect(report.versions[0].avgDurationMs).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test**

```bash
npx vitest run --config tests/vitest.config.ts tests/debugger.test.ts
```
Expected: all 6 tests PASS

- [ ] **Step 3: Commit**

```bash
git add tests/debugger.test.ts
git commit -m "test: add debugger agent tests"
```

---

## Task 5: tests/mood.test.ts

**Files:**
- Create: `tests/mood.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import moodAgent from "../mcpServer/src/agents/mood.js";
import { spawnMcpServer, McpStdioClient } from "./helpers.js";

let server: McpStdioClient;
beforeAll(async () => { server = await spawnMcpServer(); });
afterAll(async () => { await server.close(); });

describe("unit", () => {
  it("detects overwhelmed mood", async () => {
    const result = await moodAgent.handler({ query: "I am overwhelmed with too much work" });
    expect(result.success).toBe(true);
    expect(result.data?.mood).toBe("overwhelmed");
  });

  it("detects stuck mood", async () => {
    const result = await moodAgent.handler({ query: "I am stuck and frustrated" });
    expect(result.success).toBe(true);
    expect(result.data?.mood).toBe("stuck");
  });

  it("defaults to neutral mood", async () => {
    const result = await moodAgent.handler({ query: "focus timer start" });
    expect(result.success).toBe(true);
    expect(result.data?.mood).toBe("neutral");
  });
});

describe("integration", () => {
  it("execute_agent mood-detector returns content", async () => {
    const res = await server.call("execute_agent", {
      agentName: "mood-detector",
      query: "I feel overwhelmed",
    });
    expect(res.content[0].text.length).toBeGreaterThan(0);
  });

  it("result contains success", async () => {
    const res = await server.call("execute_agent", {
      agentName: "mood-detector",
      query: "I am stuck",
    });
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.success).toBe(true);
  });
});

describe("benchmark", () => {
  it("benchmark_versions returns metrics", async () => {
    const res = await server.call("benchmark_versions", {
      name: "mood-bench",
      versions: [{ id: "v1", agentName: "mood-detector", query: "I feel overwhelmed" }],
      runs: 2,
      warmupRuns: 0,
    });
    const report = JSON.parse(res.content[0].text);
    expect(report.versions[0].avgDurationMs).toBeGreaterThanOrEqual(0);
    expect(report.versions[0].successRate).toBe(1);
  });
});
```

- [ ] **Step 2: Run test**

```bash
npx vitest run --config tests/vitest.config.ts tests/mood.test.ts
```
Expected: all 6 tests PASS

- [ ] **Step 3: Commit**

```bash
git add tests/mood.test.ts
git commit -m "test: add mood-detector agent tests"
```

---

## Task 6: tests/cicd.test.ts

**Files:**
- Create: `tests/cicd.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import cicdAgent from "../mcpServer/src/agents/cicd.js";
import { spawnMcpServer, McpStdioClient } from "./helpers.js";

let server: McpStdioClient;
beforeAll(async () => { server = await spawnMcpServer(); });
afterAll(async () => { await server.close(); });

describe("unit", () => {
  it("returns success with CI/CD content", async () => {
    const result = await cicdAgent.handler({ query: "generate github actions pipeline for node" });
    expect(result.success).toBe(true);
    expect(result.message.length).toBeGreaterThan(0);
  });

  it("message is a string", async () => {
    const result = await cicdAgent.handler({ query: "cicd pipeline for python project" });
    expect(typeof result.message).toBe("string");
  });
});

describe("integration", () => {
  it("execute_agent cicd returns text content", async () => {
    const res = await server.call("execute_agent", {
      agentName: "cicd",
      query: "create github actions for node project",
    });
    expect(res.content[0].type).toBe("text");
    expect(res.content[0].text.length).toBeGreaterThan(0);
  });

  it("result has success", async () => {
    const res = await server.call("execute_agent", {
      agentName: "cicd",
      query: "deploy pipeline for docker",
    });
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed).toHaveProperty("success");
  });
});

describe("benchmark", () => {
  it("benchmark_versions returns metrics", async () => {
    const res = await server.call("benchmark_versions", {
      name: "cicd-bench",
      versions: [{ id: "v1", agentName: "cicd", query: "github actions pipeline for node" }],
      runs: 2,
      warmupRuns: 0,
    });
    const report = JSON.parse(res.content[0].text);
    expect(report.versions[0].avgDurationMs).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test**

```bash
npx vitest run --config tests/vitest.config.ts tests/cicd.test.ts
```
Expected: all 5 tests PASS

- [ ] **Step 3: Commit**

```bash
git add tests/cicd.test.ts
git commit -m "test: add cicd agent tests"
```

---

## Task 7: tests/claude.test.ts

**Files:**
- Create: `tests/claude.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import claudeAgent from "../mcpServer/src/agents/claude.js";
import { spawnMcpServer, McpStdioClient } from "./helpers.js";

let server: McpStdioClient;
beforeAll(async () => { server = await spawnMcpServer(); });
afterAll(async () => { await server.close(); });

describe("unit", () => {
  it("returns success with processed query", async () => {
    const result = await claudeAgent.handler({ query: "explain how promises work" });
    expect(result.success).toBe(true);
    expect(result.message).toContain("explain how promises work");
  });

  it("includes word count in data", async () => {
    const result = await claudeAgent.handler({ query: "what is dependency injection" });
    expect(result.data?.wordCount).toBe(4);
  });

  it("handles empty-ish query", async () => {
    const result = await claudeAgent.handler({ query: "help" });
    expect(result.success).toBe(true);
    expect(result.data?.wordCount).toBe(1);
  });
});

describe("integration", () => {
  it("execute_agent claude returns content", async () => {
    const res = await server.call("execute_agent", {
      agentName: "claude",
      query: "explain async await",
    });
    expect(res.content[0].text.length).toBeGreaterThan(0);
  });

  it("result success is true", async () => {
    const res = await server.call("execute_agent", {
      agentName: "claude",
      query: "what is typescript",
    });
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.success).toBe(true);
  });
});

describe("benchmark", () => {
  it("benchmark_versions returns metrics", async () => {
    const res = await server.call("benchmark_versions", {
      name: "claude-bench",
      versions: [{ id: "v1", agentName: "claude", query: "explain async await" }],
      runs: 2,
      warmupRuns: 0,
    });
    const report = JSON.parse(res.content[0].text);
    expect(report.versions[0].avgDurationMs).toBeGreaterThanOrEqual(0);
    expect(report.versions[0].successRate).toBe(1);
  });
});
```

- [ ] **Step 2: Run test**

```bash
npx vitest run --config tests/vitest.config.ts tests/claude.test.ts
```
Expected: all 6 tests PASS

- [ ] **Step 3: Commit**

```bash
git add tests/claude.test.ts
git commit -m "test: add claude agent tests"
```

---

## Task 8: tests/codeReviewer.test.ts

**Files:**
- Create: `tests/codeReviewer.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import codeReviewerAgent from "../mcpServer/src/agents/codeReviewer.js";
import { spawnMcpServer, McpStdioClient } from "./helpers.js";

let server: McpStdioClient;
beforeAll(async () => { server = await spawnMcpServer(); });
afterAll(async () => { await server.close(); });

describe("unit", () => {
  it("returns success for code review query", async () => {
    const result = await codeReviewerAgent.handler({ query: "review this code: function add(a,b){return a+b}" });
    expect(result.success).toBe(true);
    expect(result.message.length).toBeGreaterThan(0);
  });

  it("returns string message", async () => {
    const result = await codeReviewerAgent.handler({ query: "review pull request for auth module" });
    expect(typeof result.message).toBe("string");
  });
});

describe("integration", () => {
  it("execute_agent codeReviewer returns content", async () => {
    const res = await server.call("execute_agent", {
      agentName: "codeReviewer",
      query: "review this function: const sum = (a, b) => a + b",
    });
    expect(res.content[0].type).toBe("text");
    expect(res.content[0].text.length).toBeGreaterThan(0);
  });

  it("result has success field", async () => {
    const res = await server.call("execute_agent", {
      agentName: "codeReviewer",
      query: "code review for login handler",
    });
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed).toHaveProperty("success");
  });
});

describe("benchmark", () => {
  it("benchmark_versions returns metrics", async () => {
    const res = await server.call("benchmark_versions", {
      name: "codeReviewer-bench",
      versions: [{ id: "v1", agentName: "codeReviewer", query: "review: function foo() { return 1; }" }],
      runs: 2,
      warmupRuns: 0,
    });
    const report = JSON.parse(res.content[0].text);
    expect(report.versions[0].avgDurationMs).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test**

```bash
npx vitest run --config tests/vitest.config.ts tests/codeReviewer.test.ts
```
Expected: all 5 tests PASS

- [ ] **Step 3: Commit**

```bash
git add tests/codeReviewer.test.ts
git commit -m "test: add codeReviewer agent tests"
```

---

## Task 9: tests/databaseExpert.test.ts

**Files:**
- Create: `tests/databaseExpert.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import databaseExpertAgent from "../mcpServer/src/agents/databaseExpert.js";
import { spawnMcpServer, McpStdioClient } from "./helpers.js";

let server: McpStdioClient;
beforeAll(async () => { server = await spawnMcpServer(); });
afterAll(async () => { await server.close(); });

describe("unit", () => {
  it("returns success for database query", async () => {
    const result = await databaseExpertAgent.handler({ query: "design a users table schema" });
    expect(result.success).toBe(true);
    expect(result.message.length).toBeGreaterThan(0);
  });

  it("returns string message for sql query", async () => {
    const result = await databaseExpertAgent.handler({ query: "optimize slow SQL query with joins" });
    expect(typeof result.message).toBe("string");
  });
});

describe("integration", () => {
  it("execute_agent database-expert returns content", async () => {
    const res = await server.call("execute_agent", {
      agentName: "database-expert",
      query: "design a users table with email and timestamps",
    });
    expect(res.content[0].type).toBe("text");
    expect(res.content[0].text.length).toBeGreaterThan(0);
  });

  it("result has success field", async () => {
    const res = await server.call("execute_agent", {
      agentName: "database-expert",
      query: "help with database indexing strategy",
    });
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed).toHaveProperty("success");
  });
});

describe("benchmark", () => {
  it("benchmark_versions returns metrics", async () => {
    const res = await server.call("benchmark_versions", {
      name: "database-expert-bench",
      versions: [{ id: "v1", agentName: "database-expert", query: "design users schema" }],
      runs: 2,
      warmupRuns: 0,
    });
    const report = JSON.parse(res.content[0].text);
    expect(report.versions[0].avgDurationMs).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test**

```bash
npx vitest run --config tests/vitest.config.ts tests/databaseExpert.test.ts
```
Expected: all 5 tests PASS

- [ ] **Step 3: Commit**

```bash
git add tests/databaseExpert.test.ts
git commit -m "test: add database-expert agent tests"
```

---

## Task 10: tests/docker.test.ts

**Files:**
- Create: `tests/docker.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import dockerAgent from "../mcpServer/src/agents/docker.js";
import { spawnMcpServer, McpStdioClient } from "./helpers.js";

let server: McpStdioClient;
beforeAll(async () => { server = await spawnMcpServer(); });
afterAll(async () => { await server.close(); });

describe("unit", () => {
  it("returns success for docker query", async () => {
    const result = await dockerAgent.handler({ query: "generate dockerfile for node application" });
    expect(result.success).toBe(true);
    expect(result.message.length).toBeGreaterThan(0);
  });

  it("returns string message", async () => {
    const result = await dockerAgent.handler({ query: "docker compose for web and database" });
    expect(typeof result.message).toBe("string");
  });
});

describe("integration", () => {
  it("execute_agent docker returns content", async () => {
    const res = await server.call("execute_agent", {
      agentName: "docker",
      query: "create dockerfile for node 22 app",
    });
    expect(res.content[0].type).toBe("text");
    expect(res.content[0].text.length).toBeGreaterThan(0);
  });

  it("result has success field", async () => {
    const res = await server.call("execute_agent", {
      agentName: "docker",
      query: "containerize a python flask app",
    });
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed).toHaveProperty("success");
  });
});

describe("benchmark", () => {
  it("benchmark_versions returns metrics", async () => {
    const res = await server.call("benchmark_versions", {
      name: "docker-bench",
      versions: [{ id: "v1", agentName: "docker", query: "dockerfile for node app" }],
      runs: 2,
      warmupRuns: 0,
    });
    const report = JSON.parse(res.content[0].text);
    expect(report.versions[0].avgDurationMs).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test**

```bash
npx vitest run --config tests/vitest.config.ts tests/docker.test.ts
```
Expected: all 5 tests PASS

- [ ] **Step 3: Commit**

```bash
git add tests/docker.test.ts
git commit -m "test: add docker agent tests"
```

---

## Task 11: tests/documenter.test.ts

**Files:**
- Create: `tests/documenter.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import documenterAgent from "../mcpServer/src/agents/documenter.js";
import { spawnMcpServer, McpStdioClient } from "./helpers.js";

let server: McpStdioClient;
beforeAll(async () => { server = await spawnMcpServer(); });
afterAll(async () => { await server.close(); });

describe("unit", () => {
  it("returns success when no files need documenting", async () => {
    const result = await documenterAgent.handler({
      query: "document my code",
      metadata: { files: [] },
    });
    expect(result.success).toBe(true);
    expect(typeof result.message).toBe("string");
  });

  it("returns success for plain query", async () => {
    const result = await documenterAgent.handler({ query: "generate documentation for this project" });
    expect(result.success).toBe(true);
    expect(result.message.length).toBeGreaterThan(0);
  });
});

describe("integration", () => {
  it("execute_agent documenter returns content", async () => {
    const res = await server.call("execute_agent", {
      agentName: "documenter",
      query: "document the codebase",
      metadata: { files: [] },
    });
    expect(res.content[0].type).toBe("text");
    expect(res.content[0].text.length).toBeGreaterThan(0);
  });

  it("result has success field", async () => {
    const res = await server.call("execute_agent", {
      agentName: "documenter",
      query: "generate jsdoc comments",
    });
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed).toHaveProperty("success");
  });
});

describe("benchmark", () => {
  it("benchmark_versions returns metrics", async () => {
    const res = await server.call("benchmark_versions", {
      name: "documenter-bench",
      versions: [{ id: "v1", agentName: "documenter", query: "document the codebase", metadata: { files: [] } }],
      runs: 2,
      warmupRuns: 0,
    });
    const report = JSON.parse(res.content[0].text);
    expect(report.versions[0].avgDurationMs).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test**

```bash
npx vitest run --config tests/vitest.config.ts tests/documenter.test.ts
```
Expected: all 5 tests PASS

- [ ] **Step 3: Commit**

```bash
git add tests/documenter.test.ts
git commit -m "test: add documenter agent tests"
```

---

## Task 12: tests/explainer.test.ts

**Files:**
- Create: `tests/explainer.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import explainerAgent from "../mcpServer/src/agents/explainer.js";
import { spawnMcpServer, McpStdioClient } from "./helpers.js";

let server: McpStdioClient;
beforeAll(async () => { server = await spawnMcpServer(); });
afterAll(async () => { await server.close(); });

describe("unit", () => {
  it("returns success with explanation", async () => {
    const result = await explainerAgent.handler({
      query: "plan a REST API",
      metadata: {
        flowParticipants: ["planner"],
        flowSteps: [{ agentName: "planner", success: true, messageExcerpt: "Phase 1: identify anchor files" }],
        flowOriginalStepsCount: 1,
      },
    });
    expect(result.success).toBe(true);
    expect(result.message.length).toBeGreaterThan(0);
  });

  it("handles empty flow steps", async () => {
    const result = await explainerAgent.handler({
      query: "analyze project",
      metadata: { flowParticipants: [], flowSteps: [], flowOriginalStepsCount: 0 },
    });
    expect(result.success).toBe(true);
    expect(typeof result.message).toBe("string");
  });
});

describe("integration", () => {
  it("execute_agent explainer returns content", async () => {
    const res = await server.call("execute_agent", {
      agentName: "explainer",
      query: "summarize work done",
      metadata: {
        flowParticipants: ["planner"],
        flowSteps: [{ agentName: "planner", success: true, messageExcerpt: "created a plan" }],
        flowOriginalStepsCount: 1,
      },
    });
    expect(res.content[0].type).toBe("text");
    expect(res.content[0].text.length).toBeGreaterThan(0);
  });

  it("result has success", async () => {
    const res = await server.call("execute_agent", {
      agentName: "explainer",
      query: "explain what happened",
      metadata: { flowParticipants: [], flowSteps: [], flowOriginalStepsCount: 0 },
    });
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed).toHaveProperty("success");
  });
});

describe("benchmark", () => {
  it("benchmark_versions returns metrics", async () => {
    const res = await server.call("benchmark_versions", {
      name: "explainer-bench",
      versions: [{
        id: "v1",
        agentName: "explainer",
        query: "explain flow",
        metadata: { flowParticipants: ["planner"], flowSteps: [{ agentName: "planner", success: true, messageExcerpt: "done" }], flowOriginalStepsCount: 1 },
      }],
      runs: 2,
      warmupRuns: 0,
    });
    const report = JSON.parse(res.content[0].text);
    expect(report.versions[0].avgDurationMs).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 2: Run test**

```bash
npx vitest run --config tests/vitest.config.ts tests/explainer.test.ts
```
Expected: all 5 tests PASS

- [ ] **Step 3: Commit**

```bash
git add tests/explainer.test.ts
git commit -m "test: add explainer agent tests"
```

---

## Task 13: tests/focusTimer.test.ts

**Files:**
- Create: `tests/focusTimer.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import focusTimerAgent from "../mcpServer/src/agents/focusTimer.js";
import { spawnMcpServer, McpStdioClient } from "./helpers.js";

let server: McpStdioClient;
beforeAll(async () => { server = await spawnMcpServer(); });
afterAll(async () => { await server.close(); });

describe("unit", () => {
  it("starts a 25-minute focus session by default", async () => {
    const result = await focusTimerAgent.handler({ query: "start focus session" });
    expect(result.success).toBe(true);
    expect(result.message).toContain("25");
  });

  it("detects break request", async () => {
    const result = await focusTimerAgent.handler({ query: "take a break" });
    expect(result.success).toBe(true);
    expect(result.message.length).toBeGreaterThan(0);
  });

  it("returns short session for short query", async () => {
    const result = await focusTimerAgent.handler({ query: "short focus session" });
    expect(result.success).toBe(true);
    expect(result.message).toContain("5");
  });
});

describe("integration", () => {
  it("execute_agent focus-timer returns content", async () => {
    const res = await server.call("execute_agent", {
      agentName: "focus-timer",
      query: "start a pomodoro session",
    });
    expect(res.content[0].type).toBe("text");
    expect(res.content[0].text.length).toBeGreaterThan(0);
  });

  it("result has success", async () => {
    const res = await server.call("execute_agent", {
      agentName: "focus-timer",
      query: "focus timer 25 minutes",
    });
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.success).toBe(true);
  });
});

describe("benchmark", () => {
  it("benchmark_versions returns metrics", async () => {
    const res = await server.call("benchmark_versions", {
      name: "focus-timer-bench",
      versions: [{ id: "v1", agentName: "focus-timer", query: "start focus session" }],
      runs: 2,
      warmupRuns: 0,
    });
    const report = JSON.parse(res.content[0].text);
    expect(report.versions[0].avgDurationMs).toBeGreaterThanOrEqual(0);
    expect(report.versions[0].successRate).toBe(1);
  });
});
```

- [ ] **Step 2: Run test**

```bash
npx vitest run --config tests/vitest.config.ts tests/focusTimer.test.ts
```
Expected: all 6 tests PASS

- [ ] **Step 3: Commit**

```bash
git add tests/focusTimer.test.ts
git commit -m "test: add focus-timer agent tests"
```

---

## Task 14: tests/gitMaintainer.test.ts

**Files:**
- Create: `tests/gitMaintainer.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import gitMaintainerAgent from "../mcpServer/src/agents/gitMaintainer.js";
import { spawnMcpServer, McpStdioClient } from "./helpers.js";

let server: McpStdioClient;
beforeAll(async () => { server = await spawnMcpServer(); });
afterAll(async () => { await server.close(); });

describe("unit", () => {
  it("returns success for git query", async () => {
    const result = await gitMaintainerAgent.handler({ query: "write a commit message for auth feature" });
    expect(result.success).toBe(true);
    expect(result.message.length).toBeGreaterThan(0);
  });

  it("returns string message", async () => {
    const result = await gitMaintainerAgent.handler({ query: "help with git merge conflict" });
    expect(typeof result.message).toBe("string");
  });
});

describe("integration", () => {
  it("execute_agent gitMaintainer returns content", async () => {
    const res = await server.call("execute_agent", {
      agentName: "gitMaintainer",
      query: "create commit message for login feature",
    });
    expect(res.content[0].type).toBe("text");
    expect(res.content[0].text.length).toBeGreaterThan(0);
  });

  it("result has success field", async () => {
    const res = await server.call("execute_agent", {
      agentName: "gitMaintainer",
      query: "git branching strategy for feature work",
    });
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed).toHaveProperty("success");
  });
});

describe("benchmark", () => {
  it("benchmark_versions returns metrics", async () => {
    const res = await server.call("benchmark_versions", {
      name: "gitMaintainer-bench",
      versions: [{ id: "v1", agentName: "gitMaintainer", query: "commit message for auth feature" }],
      runs: 2,
      warmupRuns: 0,
    });
    const report = JSON.parse(res.content[0].text);
    expect(report.versions[0].avgDurationMs).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test**

```bash
npx vitest run --config tests/vitest.config.ts tests/gitMaintainer.test.ts
```
Expected: all 5 tests PASS

- [ ] **Step 3: Commit**

```bash
git add tests/gitMaintainer.test.ts
git commit -m "test: add gitMaintainer agent tests"
```

---

## Task 15: tests/kubernetes.test.ts

**Files:**
- Create: `tests/kubernetes.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import kubernetesAgent from "../mcpServer/src/agents/kubernetes.js";
import { spawnMcpServer, McpStdioClient } from "./helpers.js";

let server: McpStdioClient;
beforeAll(async () => { server = await spawnMcpServer(); });
afterAll(async () => { await server.close(); });

describe("unit", () => {
  it("returns success for kubernetes deploy query", async () => {
    const result = await kubernetesAgent.handler({ query: "deploy my app to kubernetes" });
    expect(result.success).toBe(true);
    expect(result.message.length).toBeGreaterThan(0);
  });

  it("returns string message for service query", async () => {
    const result = await kubernetesAgent.handler({ query: "create kubernetes service and ingress" });
    expect(typeof result.message).toBe("string");
  });
});

describe("integration", () => {
  it("execute_agent kubernetes returns content", async () => {
    const res = await server.call("execute_agent", {
      agentName: "kubernetes",
      query: "generate k8s deployment manifest for my-app",
    });
    expect(res.content[0].type).toBe("text");
    expect(res.content[0].text.length).toBeGreaterThan(0);
  });

  it("result has success field", async () => {
    const res = await server.call("execute_agent", {
      agentName: "kubernetes",
      query: "kubernetes pod scaling configuration",
    });
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed).toHaveProperty("success");
  });
});

describe("benchmark", () => {
  it("benchmark_versions returns metrics", async () => {
    const res = await server.call("benchmark_versions", {
      name: "kubernetes-bench",
      versions: [{ id: "v1", agentName: "kubernetes", query: "deploy app to kubernetes" }],
      runs: 2,
      warmupRuns: 0,
    });
    const report = JSON.parse(res.content[0].text);
    expect(report.versions[0].avgDurationMs).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test**

```bash
npx vitest run --config tests/vitest.config.ts tests/kubernetes.test.ts
```
Expected: all 5 tests PASS

- [ ] **Step 3: Commit**

```bash
git add tests/kubernetes.test.ts
git commit -m "test: add kubernetes agent tests"
```

---

## Task 16: tests/repoInitializer.test.ts

**Files:**
- Create: `tests/repoInitializer.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import repoInitializerAgent from "../mcpServer/src/agents/repoInitializer.js";
import { spawnMcpServer, McpStdioClient } from "./helpers.js";

let server: McpStdioClient;
beforeAll(async () => { server = await spawnMcpServer(); });
afterAll(async () => { await server.close(); });

describe("unit", () => {
  it("returns success for repo init query", async () => {
    const result = await repoInitializerAgent.handler({ query: "initialize a new node project" });
    expect(result.success).toBe(true);
    expect(result.message.length).toBeGreaterThan(0);
  });

  it("returns string message", async () => {
    const result = await repoInitializerAgent.handler({ query: "setup new typescript repository" });
    expect(typeof result.message).toBe("string");
  });
});

describe("integration", () => {
  it("execute_agent repo-initializer returns content", async () => {
    const res = await server.call("execute_agent", {
      agentName: "repo-initializer",
      query: "initialize a new typescript project",
    });
    expect(res.content[0].type).toBe("text");
    expect(res.content[0].text.length).toBeGreaterThan(0);
  });

  it("result has success field", async () => {
    const res = await server.call("execute_agent", {
      agentName: "repo-initializer",
      query: "create project scaffold for python app",
    });
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed).toHaveProperty("success");
  });
});

describe("benchmark", () => {
  it("benchmark_versions returns metrics", async () => {
    const res = await server.call("benchmark_versions", {
      name: "repo-initializer-bench",
      versions: [{ id: "v1", agentName: "repo-initializer", query: "initialize new node project" }],
      runs: 2,
      warmupRuns: 0,
    });
    const report = JSON.parse(res.content[0].text);
    expect(report.versions[0].avgDurationMs).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test**

```bash
npx vitest run --config tests/vitest.config.ts tests/repoInitializer.test.ts
```
Expected: all 5 tests PASS

- [ ] **Step 3: Commit**

```bash
git add tests/repoInitializer.test.ts
git commit -m "test: add repo-initializer agent tests"
```

---

## Task 17: tests/securityAuditor.test.ts

**Files:**
- Create: `tests/securityAuditor.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import securityAuditorAgent from "../mcpServer/src/agents/securityAuditor.js";
import { spawnMcpServer, McpStdioClient } from "./helpers.js";

let server: McpStdioClient;
beforeAll(async () => { server = await spawnMcpServer(); });
afterAll(async () => { await server.close(); });

describe("unit", () => {
  it("returns success for security audit query", async () => {
    const result = await securityAuditorAgent.handler({ query: "audit security of this project" });
    expect(result.success).toBe(true);
    expect(result.message.length).toBeGreaterThan(0);
  });

  it("returns string message for vulnerability query", async () => {
    const result = await securityAuditorAgent.handler({ query: "check for SQL injection vulnerabilities" });
    expect(typeof result.message).toBe("string");
  });
});

describe("integration", () => {
  it("execute_agent securityAuditor returns content", async () => {
    const res = await server.call("execute_agent", {
      agentName: "securityAuditor",
      query: "security audit for node application",
    });
    expect(res.content[0].type).toBe("text");
    expect(res.content[0].text.length).toBeGreaterThan(0);
  });

  it("result has success field", async () => {
    const res = await server.call("execute_agent", {
      agentName: "securityAuditor",
      query: "check for hardcoded secrets",
    });
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed).toHaveProperty("success");
  });
});

describe("benchmark", () => {
  it("benchmark_versions returns metrics", async () => {
    const res = await server.call("benchmark_versions", {
      name: "securityAuditor-bench",
      versions: [{ id: "v1", agentName: "securityAuditor", query: "security audit" }],
      runs: 2,
      warmupRuns: 0,
    });
    const report = JSON.parse(res.content[0].text);
    expect(report.versions[0].avgDurationMs).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test**

```bash
npx vitest run --config tests/vitest.config.ts tests/securityAuditor.test.ts
```
Expected: all 5 tests PASS

- [ ] **Step 3: Commit**

```bash
git add tests/securityAuditor.test.ts
git commit -m "test: add securityAuditor agent tests"
```

---

## Task 18: tests/smokeTester.test.ts

**Files:**
- Create: `tests/smokeTester.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import smokeTesterAgent from "../mcpServer/src/agents/smokeTester.js";
import { spawnMcpServer, McpStdioClient } from "./helpers.js";

let server: McpStdioClient;
beforeAll(async () => { server = await spawnMcpServer(); });
afterAll(async () => { await server.close(); });

describe("unit", () => {
  it("returns success for smoke test query", async () => {
    const result = await smokeTesterAgent.handler({ query: "run smoke tests on http://localhost:3000" });
    expect(result.success).toBe(true);
    expect(result.message.length).toBeGreaterThan(0);
  });

  it("returns string message for endpoint test", async () => {
    const result = await smokeTesterAgent.handler({ query: "smoke test the /health endpoint" });
    expect(typeof result.message).toBe("string");
  });
});

describe("integration", () => {
  it("execute_agent smoke-tester returns content", async () => {
    const res = await server.call("execute_agent", {
      agentName: "smoke-tester",
      query: "smoke test the application endpoints",
    });
    expect(res.content[0].type).toBe("text");
    expect(res.content[0].text.length).toBeGreaterThan(0);
  });

  it("result has success field", async () => {
    const res = await server.call("execute_agent", {
      agentName: "smoke-tester",
      query: "verify API endpoints are responding",
    });
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed).toHaveProperty("success");
  });
});

describe("benchmark", () => {
  it("benchmark_versions returns metrics", async () => {
    const res = await server.call("benchmark_versions", {
      name: "smoke-tester-bench",
      versions: [{ id: "v1", agentName: "smoke-tester", query: "smoke test endpoints" }],
      runs: 2,
      warmupRuns: 0,
    });
    const report = JSON.parse(res.content[0].text);
    expect(report.versions[0].avgDurationMs).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test**

```bash
npx vitest run --config tests/vitest.config.ts tests/smokeTester.test.ts
```
Expected: all 5 tests PASS

- [ ] **Step 3: Commit**

```bash
git add tests/smokeTester.test.ts
git commit -m "test: add smoke-tester agent tests"
```

---

## Task 19: Full suite run

- [ ] **Step 1: Run all tests**

```bash
npm test
```
Expected: all 85+ tests pass across 16 test files, build succeeds first

- [ ] **Step 2: Check test counts per file**

```bash
npx vitest run --config tests/vitest.config.ts --reporter=verbose 2>&1 | tail -30
```
Expected: 16 test suites, 3 describe blocks per suite, all green

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "test: all 16 agent test suites passing"
```
