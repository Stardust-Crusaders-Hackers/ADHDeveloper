# mcpServer

Overview

`mcpServer` is the core Node.js implementation of ADHDeveloper. It provides a set of named agents, tools, and the MCP transport logic used by clients over HTTP. The server is distributed as a Docker image for easy usage, and also runs locally for development.

HTTP API reference: [`API.md`](./API.md)

Docker (recommended)

The official image is published on Docker Hub as `imaandrw/mcp-app`.

```bash
docker pull imaandrw/mcp-app:latest
docker run --rm -p 3001:3001 imaandrw/mcp-app:latest
```

Notes:
- The container exposes an HTTP server on port `3001`.
- `--rm` removes the container when it exits.

Client configuration examples

Clients should connect over HTTP. The server exposes:

- `ALL /mcp` for MCP over Streamable HTTP.
- `GET /agents` to list agent templates.
- `GET /events` for server-sent events.
- `GET /health` for health checks.

Legacy stdio client snippets below are no longer applicable and should be replaced with HTTP-based client configuration.

Claude Code (`.claude/mcp.json`):

```json
{
  "servers": {
    "adhd-developer": {
      "type": "stdio",
      "command": "docker",
      "args": ["run", "-i", "--rm", "imaandrw/mcp-app:latest"]
    }
  }
}
```

VS Code (`.vscode/mcp.json`):

```json
{
  "servers": {
    "adhd-developer": {
      "type": "stdio",
      "command": "docker",
      "args": ["run", "-i", "--rm", "imaandrw/mcp-app:latest"]
    }
  }
}
```

Cursor (`.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "adhd-developer": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "imaandrw/mcp-app:latest"]
    }
  }
}
```

Windsurf / Codeium (`.windsurf/mcp.json`):

```json
{
  "mcpServers": {
    "adhd-developer": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "imaandrw/mcp-app:latest"]
    }
  }
}
```

Installation helpers (npx)

Project-level automated setup configures supported clients and places minimal config files in the project:

```bash
npx -y adhdeveloper enable
# To remove
npx -y adhdeveloper disable
```

User-level manual configuration

If you prefer manual setup, add an entry to your client configuration as shown above. Example: adding an `npx` launcher entry for Claude Desktop.

Claude Desktop configuration file locations:
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`

Example config for Claude Desktop (call `npx -y adhdeveloper`):

```json
{
  "mcpServers": {
    "adhd-developer": {
      "command": "npx",
      "args": ["-y", "adhdeveloper"]
    }
  }
}
```

Cursor (IDE settings):
- Settings > Cursor Settings > Features > MCP Servers: add `adhd-developer` (command: `npx -y adhdeveloper`).

JetBrains IDEs (IntelliJ, WebStorm, etc.):
- Install the `intelliJPlugin` from this repository or configure a compatible plugin such as Junie.

Usage overview

The server exposes a set of tools and named agents. Key features:

- MCP management: `mcp_enable`, `mcp_disable` (add/remove project integration files for supported clients).
- Planning / Orchestration: `orchestrate`, `planner` — break goals into manageable steps and generate `plan.md`.
- Execution: `execute_agent` — run specific agents (`planner`, `documenter`, `securityAuditor`, etc.).
- Focus helpers: `focus-timer` — Pomodoro-style focus sessions.
- Security: `securityAuditor` — SAST, dependency audits, and secrets detection.
- Sandbox: `sandbox_execute` — run JS/TS/Python/Bash safely in an isolated environment.

Flow & multi-agent execution

`execute_agent` supports explicit multi-agent flows and an automatic explainer when flows close. Flows let you group several agent calls under a single `flowId` so that the system can produce a consolidated explanation at the end.

Flow metadata (example fields inside `metadata`):
- `flowId?: string` — Optional identifier to group calls.
- `flowCompleted?: boolean` — Set to `true` on the final step to trigger the explainer summary.

Flow rules (summary):
- Calls with the same `flowId` accumulate into the same flow.
- Setting `flowCompleted: true` triggers the explainer and closes the flow.
- Omitted `flowId` values create implicit single-call flows that close immediately.
- The explainer runs only once per closed flow and is not triggered by direct calls to the `explainer` agent.

Explainer summary output (at flow close) contains:
- Ordered participant list and per-step excerpts.
- A short human-friendly summary appended to the final agent response under an `Explainer:` block.

Example: explicit multi-agent flow

```json
{ "agentName": "planner", "query": "Plan backend refactor", "metadata": { "flowId": "flow-123" } }
```

```json
{ "agentName": "documenter", "query": "Document README changes", "metadata": { "flowId": "flow-123", "flowCompleted": true } }
```

Flow monitoring (IDE integrations)

- `flow_state`: Snapshot of active flows, participants, and step history.
- `flow_get`: Inspect a specific flow by ID.

Sample `flow_state` response:

```json
{
  "activeFlows": 2,
  "flows": [
    {
      "id": "flow-123",
      "createdAt": 1713097200000,
      "updatedAt": 1713097250000,
      "ageMs": 50000,
      "participants": ["planner", "documenter"],
      "stepsCount": 2,
      "steps": [
        { "agentName": "planner", "success": true, "messageExcerpt": "Created plan..." },
        { "agentName": "documenter", "success": true, "messageExcerpt": "Updated README..." }
      ]
    }
  ],
  "timestamp": 1713097250000
}
```

IntelliJ Plugin integration example (Kotlin):

```kotlin
// MCPBridgeService.kt
fun getActiveFlows(): FlowStateResponse {
    return mcp.call("flow_state")
}

fun getFlowDetails(flowId: String): FlowMetadata? {
    return mcp.call("flow_get", mapOf("flowId" to flowId))
}
```

Security & code quality

- `securityAuditor`: Comprehensive security scanning across languages. Detects SAST issues, dependency vulnerabilities, hardcoded secrets, and configuration problems. Produces prioritized reports with suggested fixes.

Security auditor capabilities:
- Static code analysis (SAST) for common classes of bugs and insecure patterns.
- Dependency audits for npm, pip, Maven/Gradle, and Go modules.
- Secrets detection (API keys, tokens, private keys).
- Configuration checks (exposed files, CORS, insecure headers).

Security auditor usage example:

```json
{
  "agentName": "securityAuditor",
  "query": "Audit security vulnerabilities in this codebase",
  "metadata": { "projectRoot": "/path/to/project" }
}
```

Response format (Markdown report):
- Summary statistics (counts by severity and type).
- Detailed findings grouped by vulnerability type.
- Each finding includes: title, severity, file/line, description, suggested fix, and CVE (if applicable).

Example finding:

```
#### ⚠️ SQL Injection Risk `CRITICAL`

**File**: src/database/queries.ts:42

**Description**: Potential SQL injection via string concatenation

**Code**: `const query = "SELECT * FROM users WHERE id = " + userId;`

**Suggested Fix**: Use parameterized queries: `db.query('SELECT * FROM users WHERE id = ?', [userId])`
```

Tools and agents reference (short)

| Tool | Description |
|------|-------------|
| `orchestrate` | Route a task to the best-fit agent |
| `execute_agent` | Run a specific agent by name |
| `list_agents` | List all registered agents and capabilities |
| `sandbox_execute` | Run code in an isolated sandbox (JS/TS/Python/Bash) |
| `load_balance` | Plan parallel/sequential execution for multi-agent workflows |
| `benchmark_versions` | Compare agent versions across multiple runs |
| `repo_bootstrap` | Scaffold a new repo from structured requirements |
| `explain_subdirectories` | Generate per-directory architecture docs |
| `test_playbook` | Analyze and document the project test structure |

Agents (examples):
- `planner`, `documenter`, `securityAuditor`, `focus-timer`, `smoke-tester`, `debugger`, `git-maintainer`, `code-reviewer`, `explainer`, `mood`, `database-expert`, `repo-initializer`, `docker`, `kubernetes`.

Development (local)

To run the server locally for development:

```bash
cd mcpServer
npm install
npm run build
node dist/index.js
```

Requirements: Node.js >= 22

License

MIT
