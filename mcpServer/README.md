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
- `execute_agent`: Run a specific agent (planner, focus-timer, mood-detector).
- `list_agents`: See available agents.
- `setup_project`: Configure local project environments.

## Development

1. `npm install`
2. `npm run build`
3. `npm start` (Stdio transport)

License: MIT
