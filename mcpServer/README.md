# ADHDeveloper MCP Server

MCP server designed to assist developers with ADHD through concise planning, focus management, and mood-aware workflows.

---

## Docker (Recommended)

The server is published on Docker Hub as [`imaandrw/mcp-app`](https://hub.docker.com/r/imaandrw/mcp-app).

No Node.js or local install needed — pull and run.

```bash
docker pull imaandrw/mcp-app:latest
```

ADHDeveloper runs as a **stdio MCP server** inside the container. Your MCP client starts the container, communicates over stdin/stdout, and the container exits when the client disconnects.

```bash
docker run -i --rm imaandrw/mcp-app:latest
```

- `-i` keeps stdin open (required for stdio transport)
- `--rm` removes the container on exit

### Client Configuration (Docker)

#### Claude Code

Add to `.claude/mcp.json` (project) or `~/.claude/mcp.json` (global):

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

#### VS Code (Copilot / MCP extension)

Add to `.vscode/mcp.json`:

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

#### Cursor

Add to `.cursor/mcp.json`:

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

#### Windsurf / Codeium

Add to `.windsurf/mcp.json`:

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

---

## Installation (npx)

### Project-Level (Automated)
If you are inside a project and using an agent that supports the `mcp_enable` (or legacy `setup_project`) tool:
1. Run `npx -y adhdeveloper enable`
This will automatically configure:
- **Claude Code** (`.mcp.json`)
- **Cursor** (`.cursor/mcp.json`)
- **VS Code Copilot** (`.vscode/mcp.json`)
- **Gemini CLI** (`.gemini/settings.json`)
- **OpenAI Codex** (`.codex/config.toml`)
- **Junie** (`.junie/mcp/mcp.json`)
- **GitHub Copilot CLI** (Global `~/.copilot/mcp-config.json`)

To remove the integration:
- Run `npx -y adhdeveloper disable`

---

### User-Level (Manual Configuration)

#### 1. Claude Desktop
Add to `claude_desktop_config.json`:

- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Linux:** `~/.config/Claude/claude_desktop_config.json`

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

#### 2. Cursor (IDE Settings)
Go to **Settings > Cursor Settings > Features > MCP Servers** and add:
- **Name:** `adhd-developer`
- **Type:** `command`
- **Command:** `npx -y adhdeveloper`

#### 3. JetBrains (IntelliJ, WebStorm, etc.)
Install the `intelliJPlugin` located in this repository or use **Junie** plugin with the project-level config.

---

## Usage

Once installed, your AI agent will have access to specialized "ADHD-friendly" tools:

### MCP Management
- `mcp_enable`: Enable adhd-developer MCP configuration in supported clients.
- `mcp_disable`: Disable adhd-developer MCP configuration in supported clients.
- `setup_project`: Backward-compatible alias of `mcp_enable`.

### Focus & Planning
- `orchestrate`: Best for starting a task. The orchestrator breaks down goals into manageable steps.
- `execute_agent`: Run specific sub-agents:
  - `planner`: Creates structured `plan.md`.
  - `focus-timer`: Sets up pomodoro/focus sessions.
  - `mood-detector`: Adjusts response tone based on your current state.

#### `execute_agent` Flow Mode (Auto-Explainer at Flow Close)

`execute_agent` now supports explicit and implicit multi-agent flows.  
When a flow closes, `explainer` runs automatically and its summary is appended inline in the same response.

Flow metadata (inside `metadata`):
- `flowId?: string`: Optional flow identifier to group multiple `execute_agent` calls.
- `flowCompleted?: boolean`: Marks current flow as finished and triggers final summary.

Flow rules:
- If `flowId` is present, calls accumulate into that flow until a call sets `flowCompleted: true`.
- If `flowId` is omitted, the call is treated as an implicit single-step flow and closes automatically.
- Auto-explainer only triggers at flow close, and only when executed agent is not `explainer`.
- Chat turn boundaries alone do not trigger explainer; only `execute_agent` does.

Summary content at close:
- Includes all agents executed before explainer, in execution order.
- Includes both successful and failed steps.
- Generates approximately two lines per participant agent.
- Returned inline in `message` after the final agent result under an `Explainer:` block.

Structured response payload:
- `data.flow.flowId`: Closed flow identifier.
- `data.flow.completed`: Always `true` when close happens.
- `data.flow.implicit`: Whether flow was implicit single-call fallback.
- `data.flow.participants`: Ordered participant list.
- `data.flow.steps`: Per-step records (`agentName`, `success`, `messageExcerpt`).
- `data.flow.explainer`: Raw `explainer` agent result.

Example: explicit multi-agent flow

```json
{
  "agentName": "planner",
  "query": "Plan backend refactor",
  "metadata": { "flowId": "flow-123" }
}
```

```json
{
  "agentName": "documenter",
  "query": "Document README.md changes",
  "metadata": {
    "flowId": "flow-123",
    "flowCompleted": true,
    "filePath": "README.md",
    "mode": "summary"
  }
}
```

Example: implicit single-call flow (auto-close)

```json
{
  "agentName": "planner",
  "query": "Create a quick test strategy"
}
```

Notes:
- Direct calls to `agentName: "explainer"` keep normal behavior and do not chain another explainer.
- Flow state is in-memory only and has TTL cleanup for orphaned flows.

### Flow Monitoring (IDE Plugin Integration)
- `flow_state`: Get snapshot of all active flows, agents running, step history, and timestamps.
- `flow_get`: Inspect a specific flow by ID (useful for real-time status updates in IDEs).

#### Monitoring Response Format

`flow_state` returns:
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

`flow_get` with valid flowId returns same structure as single flow object.  
`flow_get` with expired/invalid flowId returns `{ "error": "Flow not found or expired" }`.

**IntelliJ Plugin Usage:**
```kotlin
// MCPBridgeService.kt
fun getActiveFlows(): FlowStateResponse {
    return mcp.call("flow_state")
}

fun getFlowDetails(flowId: String): FlowMetadata? {
    return mcp.call("flow_get", mapOf("flowId" to flowId))
}

// Render in AgentStage ToolWindow:
// - Show active agents per flow
// - Track execution timeline (createdAt → updatedAt)
// - Display step history with success/failure status
```

### Security & Code Quality
- `securityAuditor`: Comprehensive security scanning across all languages. Detects SAST vulnerabilities, dependency issues, hardcoded secrets, and configuration problems. Reports with severity levels and suggested fixes.

### Codebase Mastery
- `repo_bootstrap`: Scaffolds new projects with best practices.
- `explain_subdirectories`: Generates architectural summaries of your folders.
- `smoke_tester`: Runs quick checks to ensure nothing is broken.

## Security Auditor Agent

The `securityAuditor` performs comprehensive vulnerability scanning:

### Capabilities
- **Static Code Analysis (SAST)**: Detects injection attacks, XSS, weak crypto, eval usage, insecure randomness across all languages
- **Dependency Audits**: Checks npm, Python pip, Maven, Gradle, and Go module vulnerabilities
- **Secrets Detection**: Finds hardcoded credentials, API keys, AWS keys, JWT tokens, private keys
- **Configuration Audit**: Scans for exposed sensitive files, bad permissions, CORS misconfigurations, missing security headers

### Usage Example

```json
{
  "agentName": "securityAuditor",
  "query": "Audit security vulnerabilities in this codebase",
  "metadata": { "projectRoot": "/path/to/project" }
}
```

### Response Format

The agent returns a Markdown report with:
- Summary statistics (total vulnerabilities, by severity and type)
- Detailed findings grouped by vulnerability type
- Each finding includes: title, severity, file/line, description, suggested fix, and CVE ID (if applicable)
- Actionable recommendations prioritized by severity

Example vulnerability entry in report:
```
#### ⚠️ SQL Injection Risk `CRITICAL`

**File**: src/database/queries.ts:42

**Description**: Potential SQL injection via string concatenation

**Code**: `const query = "SELECT * FROM users WHERE id = " + userId;`

**Suggested Fix**: Use parameterized queries: `db.query('SELECT * FROM users WHERE id = ?', [userId])`
```

### Example Workflow
1. **User:** "I need to build a login page."
2. **Agent:** Uses `orchestrate` to plan.
3. **Agent:** Uses `planner` to write `plan.md`.
4. **Agent:** Uses `focus-timer` to start a 25-minute sprint.
5. **Agent:** Implements code.
6. **Agent:** Uses `securityAuditor` to scan for vulnerabilities.
7. **Agent:** Uses `smoke_tester` to verify.

## Tools Reference

| Tool | Description |
|------|-------------|
| `orchestrate` | Route a task to the best-fit agent |
| `execute_agent` | Run a specific agent by name |
| `list_agents` | List all registered agents and capabilities |
| `sandbox_execute` | Run code in an isolated sandbox (JS, TS, Python, Bash) |
| `load_balance` | Plan parallel/sequential execution for multi-agent workflows |
| `benchmark_versions` | Compare agent versions across multiple runs |
| `repo_bootstrap` | Scaffold a new repo from structured requirements |
| `explain_subdirectories` | Generate per-directory architecture docs |
| `test_playbook` | Analyze and document the project test structure |
| `read_file_cached` | Read files with in-session cache to avoid redundant I/O |
| `cache_info` / `cache_invalidate` / `cache_clear` | Manage the context cache |
| `mcp_enable` / `mcp_disable` | Add or remove MCP config from a project |
| `flow_state` / `flow_get` | Inspect active multi-agent flow state |

## Agents Reference

| Agent | Role |
|-------|------|
| `debugger` | Root-cause analysis and fix suggestions |
| `smoke-tester` | Quick sanity checks on code or endpoints |
| `security-auditor` | Static analysis, secrets scanning, dependency audit |
| `git-maintainer` | PR analysis, merge strategy, conflict resolution |
| `code-reviewer` | Code quality and best-practice review |
| `planner` | Break tasks into structured execution plans |
| `focus-timer` | ADHD-friendly time-boxing and focus sessions |
| `mood` | Developer mood tracking and encouragement |
| `documenter` | Generate and update project documentation |
| `explainer` | Plain-language code and concept explanations |
| `database-expert` | Query optimization and schema advice |
| `repo-initializer` | Bootstrap new projects |
| `cicd` | CI/CD pipeline guidance |
| `docker` | Dockerfile and Compose advice |
| `kubernetes` | K8s manifest and deployment help |
| `claude` | General-purpose Claude agent |

---

## Development

1. `npm install`
2. `npm run build`
3. `npm start` (Stdio transport)

License: MIT
