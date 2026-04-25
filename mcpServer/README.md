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
- `execute_agent`: Run a specific agent (planner, focus-timer, mood-detector, repo-initializer).
- `list_agents`: See available agents.
- `setup_project`: Configure local project environments.
- `repo_bootstrap`: Scaffold a repository from structured requirements (multi-stack, architecture, Docker/Nginx optional, safe conflict policy).

## Development

1. `npm install`
2. `npm run build`
3. `npm start` (Stdio transport)

License: MIT
