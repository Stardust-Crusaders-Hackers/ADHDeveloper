# ADHDeveloper MCP Server

MCP server designed to assist developers with ADHD through concise planning, focus management, and mood-aware workflows.

## Installation

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

### Codebase Mastery
- `repo_bootstrap`: Scaffolds new projects with best practices.
- `explain_subdirectories`: Generates architectural summaries of your folders.
- `smoke_tester`: Runs quick checks to ensure nothing is broken.

### Example Workflow
1. **User:** "I need to build a login page."
2. **Agent:** Uses `orchestrate` to plan.
3. **Agent:** Uses `planner` to write `plan.md`.
4. **Agent:** Uses `focus-timer` to start a 25-minute sprint.
5. **Agent:** Implements code.
6. **Agent:** Uses `smoke_tester` to verify.

## Development

1. `npm install`
2. `npm run build`
3. `npm start` (Stdio transport)

License: MIT
