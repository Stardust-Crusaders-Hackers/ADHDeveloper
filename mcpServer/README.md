# ADHDeveloper MCP Server

MCP server designed to assist developers with ADHD through concise planning, focus management, and mood-aware workflows.

## Installation

```bash
npm install -g adhdeveloper
```

## Usage with Claude Desktop

Add this to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "adhdeveloper": {
      "command": "npx",
      "args": ["-y", "adhdeveloper"]
    }
  }
}
```

## Tools

- `orchestrate`: Route tasks to specific agents.
- `execute_agent`: Run a specific agent (planner, focus-timer, mood-detector, repo-initializer, documenter, smoke-tester, explainer).
- `list_agents`: See available agents.
- `setup_project`: Configure MCP for Claude Code, OpenAI Codex, Gemini CLI, Junie, GitHub Copilot CLI, Copilot VS Code, and Cursor.
- `repo_bootstrap`: Scaffold a repository from structured requirements (multi-stack, architecture, Docker/Nginx optional, safe conflict policy).
- `explain_subdirectories`: Generate stack-aware per-subdirectory conceptual/architectural docs with content inventory and recommended workflow notes.

## Development

1. `npm install`
2. `npm run build`
3. `npm start` (Stdio transport)

License: MIT
